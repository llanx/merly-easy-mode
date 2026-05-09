import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function inspectGitWorkspace(workspacePath = process.cwd(), options = {}) {
  const cwd = path.resolve(workspacePath);
  const root = await git(["rev-parse", "--show-toplevel"], cwd);
  const branch = await currentBranch(root);
  const remoteName = await git(["config", "--get", `branch.${branch}.remote`], root).catch(() => "origin");
  const remoteUrl =
    (await git(["config", "--get", `remote.${remoteName}.url`], root).catch(() => "")) ||
    (await firstRemoteUrl(root));
  const head = await git(["rev-parse", "HEAD"], root).catch(() => "");
  const status = options.includeStatus ? await gitStatus(root, options.maxStatusEntries) : undefined;

  return {
    requested_path: cwd,
    root,
    branch,
    remote_name: remoteName || "origin",
    remote_url: remoteUrl,
    normalized_remote: normalizeGitUrl(remoteUrl),
    head,
    ...(status ? { status } : {}),
  };
}

export async function prepareGitVisibility({
  workspacePath = process.cwd(),
  files = [],
  issueId,
  commitMessage,
  branchName,
  createBranch = false,
  commit = false,
  allowUnrelatedDirty = false,
  allowNewFiles = false,
} = {}) {
  const workspace = await inspectGitWorkspace(workspacePath, {
    includeStatus: true,
    maxStatusEntries: Number.MAX_SAFE_INTEGER,
  });
  const targetFiles = normalizeTargetFiles(workspace.root, files);
  const statusEntries = workspace.status.entries || [];
  const targetStatus = statusEntries.filter((entry) => targetFiles.includes(normalizeRelativePath(entry.path)));
  const unrelatedStatus = statusEntries.filter((entry) => !targetFiles.includes(normalizeRelativePath(entry.path)));
  const warnings = [];
  const blocks = [];

  if (targetFiles.length === 0) {
    blocks.push("At least one target file is required.");
  }

  if (targetStatus.length === 0) {
    blocks.push("None of the target files have git changes to commit.");
  }

  const unchangedTargets = targetFiles.filter((file) => !targetStatus.some((entry) => entry.path === file));
  if (unchangedTargets.length > 0) {
    warnings.push("Some target files have no git changes.");
  }

  const newTargetFiles = targetStatus.filter((entry) => entry.code === "??");
  if (newTargetFiles.length > 0 && !allowNewFiles) {
    blocks.push("Target includes untracked files; set allow_new_files=true to include new files.");
  }

  if (unrelatedStatus.length > 0) {
    warnings.push("Workspace has dirty files outside the target file list.");
    if (!allowUnrelatedDirty) {
      blocks.push("Unrelated dirty files are present; set allow_unrelated_dirty=true to proceed with a targeted commit.");
    }
  }

  const resolvedCommitMessage = commitMessage || defaultCommitMessage(issueId);
  if (commit && !resolvedCommitMessage) {
    blocks.push("commit_message or issue_id is required when commit=true.");
  }

  if (createBranch && !branchName) {
    blocks.push("branch_name is required when create_branch=true.");
  }

  const output = {
    workspace: summarizeWorkspace(workspace),
    requested: {
      issue_id: issueId || null,
      commit: Boolean(commit),
      create_branch: Boolean(createBranch),
      branch_name: branchName || null,
      allow_unrelated_dirty: Boolean(allowUnrelatedDirty),
      allow_new_files: Boolean(allowNewFiles),
    },
    target_files: targetFiles,
    target_status: targetStatus,
    unchanged_target_files: unchangedTargets,
    unrelated_status: summarizeStatusEntries(unrelatedStatus),
    warnings,
    blocks,
    can_commit: blocks.length === 0,
    commit_message: resolvedCommitMessage || null,
    committed: false,
    commit_sha: null,
    branch_before: workspace.branch,
    branch_after: workspace.branch,
    head_before: workspace.head,
    head_after: workspace.head,
  };

  if (!commit || blocks.length > 0) {
    output.mode = commit ? "blocked" : "dry_run";
    return output;
  }

  if (createBranch && branchName && branchName !== workspace.branch) {
    output.branch_action = await createVisibilityBranch(workspace.root, branchName);
  }

  await git(["add", "--", ...targetFiles], workspace.root);
  await git(["commit", "--only", "-m", resolvedCommitMessage, "--", ...targetFiles], workspace.root);

  const after = await inspectGitWorkspace(workspace.root, {
    includeStatus: true,
    maxStatusEntries: Number.MAX_SAFE_INTEGER,
  });
  output.mode = "committed";
  output.committed = true;
  output.commit_sha = after.head || null;
  output.branch_after = after.branch;
  output.head_after = after.head;
  output.remaining_status = summarizeStatusEntries(after.status.entries || []);
  return output;
}

export async function prepareMerlyRefVisibility({
  workspacePath = process.cwd(),
  repository,
  merlyGitRoot,
  merlyWorkDir,
  ref,
  sourceRef,
  targetRef,
  fetch = false,
} = {}) {
  const workspace = await inspectGitWorkspace(workspacePath, {
    includeStatus: true,
    maxStatusEntries: Number.MAX_SAFE_INTEGER,
  });
  const resolvedRef = String(ref || workspace.head || "").trim();
  const resolvedSourceRef = String(sourceRef || workspace.branch || "").trim();
  const resolvedTargetRef = String(targetRef || defaultRemoteTrackingRef(resolvedSourceRef)).trim();
  const cloneResolution = resolveMerlyGitRoot({
    repository,
    merlyGitRoot,
    merlyWorkDir,
  });
  const warnings = [...cloneResolution.warnings];
  const blocks = [...cloneResolution.blocks];

  if (!resolvedRef) {
    blocks.push("A commit ref is required. Pass ref or use a workspace with a valid HEAD.");
  }

  if (!isSafeFetchSourceRef(resolvedSourceRef)) {
    blocks.push(`Unsafe source ref for git fetch: ${resolvedSourceRef || "(empty)"}`);
  }

  if (!isSafeTargetRef(resolvedTargetRef)) {
    blocks.push(`Unsafe target ref for Merly clone fetch: ${resolvedTargetRef || "(empty)"}`);
  }

  const visibleInWorkspace = resolvedRef ? await canResolveCommit(workspace.root, resolvedRef) : false;
  const sourceContainsRef =
    visibleInWorkspace && resolvedSourceRef ? await isAncestorOrSame(workspace.root, resolvedRef, resolvedSourceRef) : false;

  if (resolvedRef && !visibleInWorkspace) {
    blocks.push(`Target ref is not resolvable in the local workspace: ${resolvedRef}`);
  }

  if (visibleInWorkspace && resolvedSourceRef && !sourceContainsRef) {
    blocks.push(`Source ref ${resolvedSourceRef} does not contain target ref ${resolvedRef}.`);
  }

  let clone = null;
  let cloneError = null;
  if (cloneResolution.path) {
    try {
      clone = await inspectGitClone(cloneResolution.path);
    } catch (error) {
      cloneError = {
        name: error?.name || "Error",
        message: error?.message || String(error),
      };
      blocks.push(`Could not inspect Merly git clone at ${cloneResolution.path}.`);
    }
  }

  if (clone && !remoteLooksCompatibleWithWorkspace(clone, workspace)) {
    warnings.push("Merly clone origin does not appear to match the local workspace remote/root.");
  }

  const visibleBefore = clone && resolvedRef ? await canResolveCommit(clone.root, resolvedRef) : false;
  const output = {
    workspace: summarizeWorkspace(workspace),
    repository: summarizeRepositoryForVisibility(repository),
    merly_clone: {
      requested_path: cloneResolution.path || null,
      source: cloneResolution.source,
      candidates: cloneResolution.candidates,
      clone,
      error: cloneError,
    },
    requested: {
      ref: resolvedRef || null,
      source_ref: resolvedSourceRef || null,
      target_ref: resolvedTargetRef || null,
      fetch: Boolean(fetch),
    },
    warnings,
    blocks,
    can_fetch: blocks.length === 0 && !visibleBefore,
    fetched: false,
    visible_in_workspace: Boolean(visibleInWorkspace),
    source_contains_ref: Boolean(sourceContainsRef),
    visible_before: Boolean(visibleBefore),
    visible_after: Boolean(visibleBefore),
  };

  if (blocks.length > 0) {
    output.mode = fetch ? "blocked" : "dry_run_blocked";
    return output;
  }

  if (visibleBefore) {
    output.mode = "already_visible";
    return output;
  }

  if (!fetch) {
    output.mode = "dry_run";
    output.next_action = "Run again with fetch=true to fetch the local branch into Merly's clone.";
    return output;
  }

  const refspec = `${resolvedSourceRef}:${resolvedTargetRef}`;
  await git(["fetch", workspace.root, refspec], clone.root);
  const visibleAfter = await canResolveCommit(clone.root, resolvedRef);

  output.mode = visibleAfter ? "fetched" : "fetch_incomplete";
  output.fetched = true;
  output.fetch = {
    source_repository: workspace.root,
    source_ref: resolvedSourceRef,
    target_ref: resolvedTargetRef,
    refspec,
  };
  output.visible_after = Boolean(visibleAfter);
  output.can_fetch = false;

  if (!visibleAfter) {
    output.warnings.push("Fetch completed, but the requested commit still is not resolvable in Merly's clone.");
  }

  return output;
}

export function normalizeGitUrl(value) {
  if (!value) return "";
  let normalized = value.trim().replace(/\\/g, "/");

  const scpLike = normalized.match(/^([^@]+@)?([^:]+):(.+)$/);
  if (scpLike && !normalized.includes("://") && !/^[a-z]:\//i.test(normalized)) {
    normalized = `${scpLike[2]}/${scpLike[3]}`;
  }

  normalized = normalized.replace(/^[a-z]+:\/\//i, "");
  normalized = normalized.replace(/^[^@/]+@/, "");
  normalized = normalized.replace(/:[0-9]+(?=\/)/, "");
  normalized = normalized.replace(/\/+$/, "");
  normalized = normalized.replace(/\.git$/i, "");
  return normalized.toLowerCase();
}

export function normalizeBranchName(value) {
  return String(value || "")
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim()
    .toLowerCase();
}

export function normalizeLocalPath(value) {
  if (!value) return "";
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

export function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
}

async function currentBranch(cwd) {
  const branch = await git(["branch", "--show-current"], cwd).catch(() => "");
  if (branch) return branch;
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

async function firstRemoteUrl(cwd) {
  const remotes = await git(["remote"], cwd);
  const first = remotes
    .split(/\r?\n/)
    .map((remote) => remote.trim())
    .find(Boolean);
  if (!first) return "";
  return git(["config", "--get", `remote.${first}.url`], cwd);
}

async function gitStatus(cwd, maxEntries = 25) {
  const output = await git(["status", "--porcelain=v1", "--branch", "--untracked-files=all"], cwd);
  const lines = output.split(/\r?\n/).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith("## ")) || "";
  const entries = lines
    .filter((line) => !line.startsWith("## "))
    .map(parseStatusLine);

  return {
    clean: entries.length === 0,
    branch: branchLine.replace(/^##\s*/, ""),
    counts: countStatusEntries(entries),
    entries: entries.slice(0, maxEntries),
    total_entries: entries.length,
    truncated: entries.length > maxEntries,
  };
}

function normalizeTargetFiles(root, files) {
  if (!Array.isArray(files)) {
    throw new Error("files must be an array of file paths.");
  }

  const normalized = files
    .map((file) => normalizeTargetFile(root, file))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function normalizeTargetFile(root, file) {
  const text = String(file || "").trim();
  if (!text) return "";
  if (text.includes("*")) {
    throw new Error("Wildcard file paths are not allowed for targeted commits.");
  }

  const absolute = path.isAbsolute(text) ? path.resolve(text) : path.resolve(root, text);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Target file is outside the git workspace: ${file}`);
  }

  return normalizeRelativePath(relative);
}

function summarizeWorkspace(workspace) {
  return {
    requested_path: workspace.requested_path,
    root: workspace.root,
    branch: workspace.branch,
    head: workspace.head,
    status: workspace.status,
  };
}

function summarizeRepositoryForVisibility(repository) {
  if (!repository) return null;
  return {
    id: repository.id,
    name: repository.name,
    git_url: repository.git_url,
    source_root: repository.source_root,
    git_root: repository.git_root,
    default_branch: repository.default_branch,
  };
}

function summarizeStatusEntries(entries, limit = 25) {
  return {
    total_entries: entries.length,
    truncated: entries.length > limit,
    entries: entries.slice(0, limit),
    counts: countStatusEntries(entries),
  };
}

function defaultCommitMessage(issueId) {
  if (!issueId) return "";
  return `Fix Merly issue ${issueId}`;
}

async function createVisibilityBranch(root, branchName) {
  if (!isSafeBranchName(branchName)) {
    throw new Error(`Unsafe branch name: ${branchName}`);
  }

  const existing = await git(["branch", "--list", branchName], root);
  if (existing.trim()) {
    throw new Error(`Branch already exists; switch to it manually before committing: ${branchName}`);
  }

  await git(["switch", "-c", branchName], root);
  return {
    created: true,
    branch_name: branchName,
  };
}

function resolveMerlyGitRoot({ repository, merlyGitRoot, merlyWorkDir }) {
  const warnings = [];
  const blocks = [];
  const candidates = [];
  const resolvedWorkDir = merlyWorkDir || path.join(os.homedir(), "Merly");

  if (merlyGitRoot) {
    candidates.push({ source: "input.merly_git_root", path: path.resolve(merlyGitRoot) });
  }

  for (const field of ["git_root", "source_root"]) {
    const value = repository?.[field];
    if (!value) continue;
    const expanded = expandMerlyRepositoryPath(value, {
      repository,
      merlyWorkDir: resolvedWorkDir,
    });
    if (expanded) {
      candidates.push({ source: `repository.${field}`, path: expanded });
    }
  }

  if (repository?.id) {
    candidates.push({
      source: "default.git_root",
      path: path.resolve(resolvedWorkDir, ".git-root", `repo(${repository.id})`),
    });
  }

  const uniqueCandidates = uniquePaths(candidates);
  const existing = uniqueCandidates.find((candidate) => fs.existsSync(candidate.path));
  const selected = existing || uniqueCandidates[0] || null;

  if (!selected) {
    blocks.push("Could not infer Merly's local git clone path. Pass merly_git_root explicitly.");
  } else if (!fs.existsSync(selected.path)) {
    blocks.push(`Merly git clone path does not exist: ${selected.path}`);
  }

  if (!merlyWorkDir) {
    warnings.push("MERLY_WORK_DIR was not set; using the default Merly work directory location.");
  }

  return {
    path: selected?.path || "",
    source: selected?.source || "none",
    candidates: uniqueCandidates,
    warnings,
    blocks,
  };
}

function expandMerlyRepositoryPath(value, { repository, merlyWorkDir }) {
  const text = String(value || "").trim();
  if (!text) return "";

  const repositoryCloneId = repository?.id ? `repo(${repository.id})` : "";
  const expanded = text
    .replace(/\$\{AWD\}/gi, merlyWorkDir || "")
    .replace(/\$\{ID\}/gi, repositoryCloneId)
    .replace(/\$\{REPOSITORY_ID\}/gi, String(repository?.id || ""))
    .replace(/\$\{REPO_ID\}/gi, String(repository?.id || ""));

  if (expanded.includes("${")) return "";
  return path.resolve(expanded);
}

function uniquePaths(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    const normalized = normalizeLocalPath(candidate.path);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(candidate);
  }
  return unique;
}

async function inspectGitClone(clonePath) {
  const requestedPath = path.resolve(clonePath);
  const root = await git(["rev-parse", "--show-toplevel"], requestedPath);
  const head = await git(["rev-parse", "HEAD"], root).catch(() => "");
  const remoteUrl = await git(["remote", "get-url", "origin"], root).catch(() => "");

  return {
    requested_path: requestedPath,
    root,
    head,
    remote_url: remoteUrl,
    normalized_remote: normalizeGitUrl(remoteUrl),
  };
}

async function canResolveCommit(cwd, ref) {
  if (!ref) return false;
  try {
    await git(["rev-parse", "--verify", `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

async function isAncestorOrSame(cwd, ancestorRef, descendantRef) {
  try {
    await git(["merge-base", "--is-ancestor", ancestorRef, descendantRef], cwd);
    return true;
  } catch {
    return false;
  }
}

function defaultRemoteTrackingRef(sourceRef) {
  const normalized = normalizeBranchNameForRef(sourceRef);
  return normalized ? `refs/remotes/origin/${normalized}` : "";
}

function normalizeBranchNameForRef(value) {
  return String(value || "")
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function remoteLooksCompatibleWithWorkspace(clone, workspace) {
  const cloneRemotePath = normalizeLocalPath(clone.remote_url);
  const workspaceRoot = normalizeLocalPath(workspace.root);
  const workspaceRemote = normalizeGitUrl(workspace.remote_url);
  const cloneRemote = normalizeGitUrl(clone.remote_url);

  return Boolean(
    (cloneRemotePath && workspaceRoot && cloneRemotePath === workspaceRoot) ||
      (cloneRemote && workspaceRemote && cloneRemote === workspaceRemote) ||
      (cloneRemote && workspaceRoot && cloneRemote === normalizeGitUrl(workspace.root)),
  );
}

function isSafeFetchSourceRef(value) {
  const text = String(value || "").trim();
  return Boolean(text && !text.startsWith("-") && !text.includes("..") && !/[\s~^:?*[\]\\{}]/.test(text));
}

function isSafeTargetRef(value) {
  const text = String(value || "").trim();
  return Boolean(
    text.startsWith("refs/") &&
      !text.startsWith("-") &&
      !text.includes("..") &&
      !text.includes("//") &&
      !text.endsWith("/") &&
      !/[\s~^:?*[\]\\{}]/.test(text),
  );
}

function isSafeBranchName(branchName) {
  const text = String(branchName || "").trim();
  return Boolean(text && !text.startsWith("-") && !text.includes("..") && !/[\s~^:?*[\\]/.test(text));
}

function parseStatusLine(line) {
  return {
    code: line.slice(0, 2),
    path: line.slice(3),
  };
}

function countStatusEntries(entries) {
  const counts = {
    total: entries.length,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
    conflicted: 0,
  };

  for (const entry of entries) {
    const [index, worktree] = entry.code;
    const code = entry.code;
    if (code === "??") counts.untracked += 1;
    if (index && index !== " " && index !== "?") counts.staged += 1;
    if (worktree && worktree !== " " && worktree !== "?") counts.unstaged += 1;
    if (code.includes("M")) counts.modified += 1;
    if (code.includes("A")) counts.added += 1;
    if (code.includes("D")) counts.deleted += 1;
    if (code.includes("R")) counts.renamed += 1;
    if (code.includes("C")) counts.copied += 1;
    if (isConflictStatus(code)) counts.conflicted += 1;
  }

  return counts;
}

function isConflictStatus(code) {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(code);
}

async function git(args, cwd) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    timeout: 10000,
  });
  return stdout.trim();
}
