#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { getConfig, hasCredentials, hasDifCredentials, hasMentorCredentials } from "../src/config.js";
import { summarizeDifResult } from "../src/difSummary.js";
import { verifyFileWithDif } from "../src/fileVerification.js";
import { MerlyClient } from "../src/merlyClient.js";

const client = new MerlyClient();
const [command, ...args] = process.argv.slice(2);

try {
  const result = await run(command, args);
  if (result !== undefined) {
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(formatError(error));
  process.exitCode = 1;
}

async function run(name, args) {
  switch (name) {
    case "status":
      return client.status();
    case "health":
      return {
        status: await client.status(),
        health: await client.health(),
      };
    case "auth-status": {
      const config = getConfig();
      return {
        base_url: config.baseUrl,
        has_credentials: hasCredentials(config),
        has_mentor_credentials: hasMentorCredentials(config),
        has_dif_credentials: hasDifCredentials(config),
        mentor_auth_mode: config.apiKey ? "api_key" : config.bearerToken ? "bearer_token" : "none",
        dif_auth_mode: config.difApiKey
          ? "dif_api_key"
          : config.apiKey
            ? "api_key"
            : config.bearerToken
              ? "bearer_token"
              : "none",
      };
    }
    case "auth-smoke":
      return {
        auth: await run("auth-status", []),
        identity: await client.getCurrentIdentity(),
        repositories: await client.listRepositories({ limit: Number(args[0] || 10) }),
      };
    case "dif-smoke":
      return {
        auth: await run("auth-status", []),
        verify: await client.verifySnippet({
          language: args[0] || "c",
          code: args[1] || "int main(){return 0;}",
          response_mode: "script",
        }),
      };
    case "me":
      return client.getCurrentIdentity();
    case "login":
      return client.login({
        email: args[0] || process.env.MERLY_EMAIL,
        password: args[1] || process.env.MERLY_PASSWORD,
      });
    case "refresh":
      return client.refreshToken(args[0] || process.env.MERLY_REFRESH_TOKEN);
    case "api-keys":
      return client.listApiKeys();
    case "create-api-key":
      return client.createApiKey({
        name: args[0] || "Codex MCP Prototype",
      });
    case "repos":
    case "repositories":
      return client.listRepositories({ limit: Number(args[0] || 50) });
    case "create-repository":
    case "create-repo":
      return client.createRepository({
        name: required(args[0], "name"),
        git_url: required(args[1], "git_url"),
        git_branch: args[2],
        description: args[3],
        source_root: args[4],
        git_root: args[5],
        git_remote: args[6],
        run_infer_after_add: optionalBoolean(args[7]),
        report_after_infer: optionalBoolean(args[8]),
        language: args[9],
      });
    case "branches":
      return client.listBranches(required(args[0], "repository_id"), { limit: Number(args[1] || 50) });
    case "create-branch":
      return client.createBranch(required(args[0], "repository_id"), {
        name: required(args[1], "name"),
      });
    case "branch-rbls":
      return client.listBranchRbls(required(args[0], "branch_id"), { limit: Number(args[1] || 50) });
    case "rbls":
      return client.listRbls({ repository_id: args[0], language: args[1], limit: Number(args[2] || 50) });
    case "snapshots":
      return client.listSnapshots(required(args[0], "rbl_id"), {
        limit: Number(args[1] || 10),
        sort: args[2] || "-id",
      });
    case "issues":
      return client.listIssues(required(args[0], "rbl_id"), {
        status: args[1] || "open",
        limit: Number(args[2] || 50),
      });
    case "snapshot-issues":
      return client.listSnapshotIssues(required(args[0], "rbl_id"), required(args[1], "snapshot_id"), {
        limit: Number(args[2] || 50),
        status: args[3] || undefined,
        file_path: args[4],
      });
    case "candidates":
      return client.getFixCandidates({
        rbl_id: required(args[0], "rbl_id"),
        limit: Number(args[1] || 50),
        fetch_limit: optionalNumber(args[2]),
        include_path_prefixes: parseCsv(args[3]),
        exclude_path_prefixes: parseCsv(args[4]),
        workspace_path: args[5],
        avoid_dirty_files: optionalBoolean(args[6]),
      });
    case "batch-plan":
      return client.planBatchFixes({
        rbl_id: required(args[0], "rbl_id"),
        max_batch_size: optionalNumber(args[1]),
        fetch_limit: optionalNumber(args[2]),
        readiness: parseCsv(args[3]),
        exclude_issue_ids: parseCsv(args[4]),
        include_path_prefixes: parseCsv(args[5]),
        exclude_path_prefixes: parseCsv(args[6]),
        workspace_path: args[7],
        avoid_dirty_files: optionalBoolean(args[8]),
      });
    case "batch-progress":
      return client.assessBatchProgress({
        planned_issue_ids: parseCsv(required(args[0], "planned_issue_ids_csv")),
        outcomes: readJsonFile(args[1]) || [],
        max_batch_size: optionalNumber(args[2]),
      });
    case "resolve":
      return client.resolveWorkspace({
        workspace_path: args[0] || process.cwd(),
        language: args[1],
      });
    case "context":
      return client.getRepoAnalysisContext({
        repository_id: args[0],
        branch_id: args[1],
        rbl_id: args[2],
        language: args[3],
      });
    case "issue":
      return client.getIssueBundle({
        rbl_id: required(args[0], "rbl_id"),
        issue_id: required(args[1], "issue_id"),
      });
    case "wait-insights":
      return client.waitForIssueInsights({
        rbl_id: required(args[0], "rbl_id"),
        issue_id: required(args[1], "issue_id"),
        timeout_ms: optionalNumber(args[2]),
        poll_interval_ms: optionalNumber(args[3]),
      });
    case "check-reanalysis":
      return client.checkReanalysisReadiness({
        rbl_id: required(args[0], "rbl_id"),
        workspace_path: args[1],
        require_clean: optionalBoolean(args[2]),
      });
    case "git-visibility":
      return client.prepareGitVisibility({
        workspacePath: required(args[0], "workspace_path"),
        issueId: args[1],
        files: parseFiles(required(args[2], "files_csv")),
        commit: optionalBoolean(args[3]) || false,
        commitMessage: args[4],
        branchName: args[5],
        createBranch: optionalBoolean(args[6]) || false,
        allowUnrelatedDirty: optionalBoolean(args[7]) || false,
        allowNewFiles: optionalBoolean(args[8]) || false,
      });
    case "ref-visibility":
      return client.prepareRefVisibility({
        workspace_path: required(args[0], "workspace_path"),
        rbl_id: args[1],
        ref: args[2],
        fetch: optionalBoolean(args[3]) || false,
        source_ref: args[4],
        target_ref: args[5],
        merly_git_root: args[6],
      });
    case "start-snapshot":
      return client.startSnapshot(snapshotOptions(args));
    case "poll-job":
      return client.pollJob({
        job_key: required(args[0], "job_key"),
        timeout_ms: optionalNumber(args[1]),
        poll_interval_ms: optionalNumber(args[2]),
      });
    case "compare-issue":
      return client.compareIssueState({
        rbl_id: required(args[0], "rbl_id"),
        issue_id: required(args[1], "issue_id"),
      });
    case "compare-snapshot-issue":
      return client.compareIssueAtSnapshot({
        rbl_id: required(args[0], "rbl_id"),
        snapshot_id: required(args[1], "snapshot_id"),
        issue_id: required(args[2], "issue_id"),
        limit: optionalNumber(args[3]),
        max_pages: optionalNumber(args[4]),
      });
    case "reanalyze-compare":
      return client.reanalyzeAndCompareIssue({
        rbl_id: required(args[0], "rbl_id"),
        issue_id: required(args[1], "issue_id"),
        timeout_ms: optionalNumber(args[2]),
        poll_interval_ms: optionalNumber(args[3]),
        workspace_path: args[4],
        require_clean: optionalBoolean(args[5]),
        method: args[6] || "single",
        ref: args[7],
      });
    case "verify": {
      const language = required(args[0], "language");
      const path = args[1];
      const code = path ? fs.readFileSync(path, "utf8") : fs.readFileSync(0, "utf8");
      return client.verifySnippet({ language, code, response_mode: "script" });
    }
    case "verify-summary": {
      const language = required(args[0], "language");
      const path = args[1];
      const code = path ? fs.readFileSync(path, "utf8") : fs.readFileSync(0, "utf8");
      return summarizeDifResult(await client.verifySnippet({ language, code, response_mode: "script" }));
    }
    case "verify-file":
      return verifyFileWithDif(client, {
        language: required(args[0], "language"),
        file_path: required(args[1], "file_path"),
        start_line: optionalNumber(args[2]),
        end_line: optionalNumber(args[3]),
      });
    default:
      usage();
      return undefined;
  }
}

function required(value, name) {
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

function usage() {
  console.log(`Usage:
  npm run debug -- health
  npm run debug -- status
  npm run debug -- auth-status
  npm run debug -- auth-smoke [repo_limit]
  npm run debug -- dif-smoke [language] [inline_code]
  npm run debug -- me
  npm run debug -- login [email] [password]
  npm run debug -- refresh [refresh_token]
  npm run debug -- api-keys
  npm run debug -- create-api-key [name]
  npm run debug -- repos [limit]
  npm run debug -- create-repository <name> <git_url> [git_branch] [description] [source_root] [git_root] [git_remote] [run_infer_after_add] [report_after_infer] [language]
  npm run debug -- branches <repository_id> [limit]
  npm run debug -- create-branch <repository_id> <name>
  npm run debug -- branch-rbls <branch_id> [limit]
  npm run debug -- rbls [repository_id] [language] [limit]
  npm run debug -- snapshots <rbl_id> [limit] [sort]
  npm run debug -- issues <rbl_id> [status] [limit]
  npm run debug -- snapshot-issues <rbl_id> <snapshot_id> [limit] [status] [file_path]
  npm run debug -- candidates <rbl_id> [limit] [fetch_limit] [include_path_prefixes_csv] [exclude_path_prefixes_csv] [workspace_path] [avoid_dirty_files]
  npm run debug -- batch-plan <rbl_id> [max_batch_size] [fetch_limit] [readiness_csv] [exclude_issue_ids_csv] [include_path_prefixes_csv] [exclude_path_prefixes_csv] [workspace_path] [avoid_dirty_files]
  npm run debug -- batch-progress <planned_issue_ids_csv> [outcomes_json_file] [max_batch_size]
  npm run debug -- resolve [workspace_path] [language]
  npm run debug -- context [repository_id] [branch_id] [rbl_id] [language]
  npm run debug -- issue <rbl_id> <issue_id>
  npm run debug -- wait-insights <rbl_id> <issue_id> [timeout_ms] [poll_interval_ms]
  npm run debug -- check-reanalysis <rbl_id> [workspace_path] [require_clean]
  npm run debug -- git-visibility <workspace_path> <issue_id> <files_csv> [commit] [commit_message] [branch_name] [create_branch] [allow_unrelated_dirty] [allow_new_files]
  npm run debug -- ref-visibility <workspace_path> <rbl_id> [ref] [fetch] [source_ref] [target_ref] [merly_git_root]
  npm run debug -- start-snapshot <rbl_id> [method] [value] [ref]
  npm run debug -- poll-job <job_key> [timeout_ms] [poll_interval_ms]
  npm run debug -- compare-issue <rbl_id> <issue_id>
  npm run debug -- compare-snapshot-issue <rbl_id> <snapshot_id> <issue_id> [limit] [max_pages]
  npm run debug -- reanalyze-compare <rbl_id> <issue_id> [timeout_ms] [poll_interval_ms] [workspace_path] [require_clean] [method] [ref]
  npm run debug -- verify <language> [file]
  npm run debug -- verify-summary <language> [file]
  npm run debug -- verify-file <language> <file> [start_line] [end_line]
`);
}

function optionalNumber(value) {
  if (value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function optionalBoolean(value) {
  if (value === undefined || value === "") return undefined;
  return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
}

function parseFiles(value) {
  return parseCsv(value);
}

function parseCsv(value) {
  if (value === undefined || value === "") return [];
  if (value === "-") return [];
  return String(value || "")
    .split(/[;,]/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function readJsonFile(path) {
  if (!path) return undefined;
  const trimmed = String(path).trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function snapshotOptions(args) {
  const method = args[1] || "single";
  const options = {
    rbl_id: required(args[0], "rbl_id"),
    method,
  };

  if (method === "ref") {
    options.ref = required(args[2], "ref");
  } else {
    options.value = optionalNumber(args[2]);
    options.ref = args[3];
  }

  return options;
}

function formatError(error) {
  if (error?.details) {
    return `${error.name}: ${error.message}\n${JSON.stringify(error.details, null, 2)}`;
  }
  return `${error.name || "Error"}: ${error.message}`;
}
