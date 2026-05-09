#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig, hasCredentials, hasDifCredentials, hasMentorCredentials } from "./config.js";
import { verifyFileWithDif } from "./fileVerification.js";
import { MerlyClient } from "./merlyClient.js";

const client = new MerlyClient();
const pathPrefixListSchema = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .describe("Path prefix list as an array or comma/semicolon-separated string.");

export const server = new McpServer({
  name: "merly-mentor",
  version: "0.1.0",
});

server.registerTool(
  "merly_auth_status",
  {
    title: "Merly Auth Status",
    description: "Return Merly base URL and credential availability without exposing credential values.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
    },
  },
  async () => jsonToolResponse(authStatus()),
);

server.registerTool(
  "merly_health",
  {
    title: "Merly Health",
    description: "Return Merly bridge status and API v2 health details.",
    inputSchema: {},
  },
  async () =>
    jsonToolResponse({
      status: await client.status(),
      health: await client.health(),
    }),
);

server.registerTool(
  "merly_list_repositories",
  {
    title: "List Merly Repositories",
    description: "List repositories registered in Merly Mentor.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().default(50),
      status: z.enum(["active", "cloning", "error", "deleted"]).optional(),
      sort: z.string().optional(),
    },
  },
  async ({ limit, status, sort }) => jsonToolResponse(await client.listRepositories({ limit, status, sort })),
);

server.registerTool(
  "merly_create_repository",
  {
    title: "Create Merly Repository",
    description: "Register a local or remote Git repository with Merly Mentor for analysis.",
    inputSchema: {
      name: z.string().min(1).describe("Repository display name in Merly."),
      git_url: z.string().min(1).describe("Git URL or local repository path, for example https://github.com/org/repo.git or <checkout>."),
      git_branch: z.string().optional().describe("Initial branch to analyze, for example master or main."),
      git_remote: z.string().optional().describe("Git remote name for legacy/local repository registration. Defaults to origin."),
      description: z.string().optional().describe("Optional repository description."),
      source_root: z.string().optional().describe("Optional source root override accepted by Merly."),
      git_root: z.string().optional().describe("Optional git root override accepted by Merly."),
      run_infer_after_add: z.boolean().optional().describe("For legacy/local repository registration, start initial inference after adding the repo. Defaults to true."),
      report_after_infer: z.boolean().optional().describe("For legacy/local repository registration, request the follow-up report after inference. Defaults to the inference setting."),
      language: z.string().optional().describe("Optional language hint for legacy/local repository registration."),
    },
  },
  async ({
    name,
    git_url,
    git_branch,
    git_remote,
    description,
    source_root,
    git_root,
    run_infer_after_add,
    report_after_infer,
    language,
  }) =>
    jsonToolResponse(
      await client.createRepository({
        name,
        git_url,
        git_branch,
        git_remote,
        description,
        source_root,
        git_root,
        run_infer_after_add,
        report_after_infer,
        language,
      }),
    ),
);

server.registerTool(
  "merly_get_fix_candidates",
  {
    title: "Get Merly Fix Candidates",
    description: "Return ranked open issues with repair-readiness signals so Codex can choose a small automated fix.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      limit: z.number().int().min(1).max(100).optional().default(50),
      fetch_limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Number of raw Merly issues to scan before returning the top ranked candidates."),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      status: z.enum(["open", "acknowledged", "resolved", "ignored"]).optional().default("open"),
      sort: z.string().optional(),
      include_path_prefixes: pathPrefixListSchema.describe(
        "Only return issues under these normalized path prefixes, for example src/app.",
      ),
      exclude_path_prefixes: pathPrefixListSchema.describe(
        "Skip issues under these normalized path prefixes, for example Tools/Unreal_mcp.",
      ),
      workspace_path: z.string().optional().describe("Local git workspace path used when avoid_dirty_files is true."),
      avoid_dirty_files: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true, skip issues whose file has local git changes in workspace_path."),
    },
  },
  async ({
    rbl_id,
    limit,
    fetch_limit,
    severity,
    status,
    sort,
    include_path_prefixes,
    exclude_path_prefixes,
    workspace_path,
    avoid_dirty_files,
  }) =>
    jsonToolResponse(
      await client.getFixCandidates({
        rbl_id,
        limit,
        fetch_limit,
        severity,
        status,
        sort,
        include_path_prefixes,
        exclude_path_prefixes,
        workspace_path,
        avoid_dirty_files,
      }),
    ),
);

server.registerTool(
  "merly_plan_batch_fixes",
  {
    title: "Plan Merly Batch Fixes",
    description:
      "Plan a small guarded batch of Merly fix candidates with strict max size and stop-on-failure policy.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      max_batch_size: z.number().int().min(1).max(5).optional().default(3),
      fetch_limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Number of raw Merly issues to scan before selecting the batch."),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      status: z.enum(["open", "acknowledged", "resolved", "ignored"]).optional().default("open"),
      sort: z.string().optional(),
      readiness: z.array(z.string()).optional().describe("Allowed auto_fix_readiness values; defaults to candidate only."),
      exclude_issue_ids: z.array(z.string()).optional().describe("Issue ids to exclude from the batch plan."),
      include_path_prefixes: pathPrefixListSchema.describe(
        "Only consider issues under these normalized path prefixes, for example src/app.",
      ),
      exclude_path_prefixes: pathPrefixListSchema.describe(
        "Skip issues under these normalized path prefixes, for example Tools/Unreal_mcp.",
      ),
      workspace_path: z.string().optional().describe("Local git workspace path used when avoid_dirty_files is true."),
      avoid_dirty_files: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true, skip issues whose file has local git changes in workspace_path."),
    },
  },
  async ({
    rbl_id,
    max_batch_size,
    fetch_limit,
    severity,
    status,
    sort,
    readiness,
    exclude_issue_ids,
    include_path_prefixes,
    exclude_path_prefixes,
    workspace_path,
    avoid_dirty_files,
  }) =>
    jsonToolResponse(
      await client.planBatchFixes({
        rbl_id,
        max_batch_size,
        fetch_limit,
        severity,
        status,
        sort,
        readiness,
        exclude_issue_ids,
        include_path_prefixes,
        exclude_path_prefixes,
        workspace_path,
        avoid_dirty_files,
      }),
    ),
);

server.registerTool(
  "merly_assess_batch_progress",
  {
    title: "Assess Merly Batch Progress",
    description:
      "Assess batch progress from per-issue repair outcomes and decide whether the batch may continue.",
    inputSchema: {
      planned_issue_ids: z.array(z.string()).describe("Issue ids from merly_plan_batch_fixes in intended order."),
      outcomes: z
        .array(
          z
            .object({
              issue_id: z.string().optional(),
              status: z.string().optional(),
              repair_outcome: z
                .object({
                  status: z.string().optional(),
                  repair_succeeded: z.boolean().nullable().optional(),
                  should_continue_batch: z.boolean().optional(),
                  recommended_action: z.string().optional(),
                  summary: z.string().optional(),
                })
                .passthrough()
                .optional(),
              comparison_state: z.string().optional(),
              snapshot_id: z.union([z.string(), z.number()]).optional(),
              commit_sha: z.string().optional(),
            })
            .passthrough(),
        )
        .optional()
        .default([]),
      max_batch_size: z.number().int().min(1).max(5).optional().default(3),
    },
  },
  async ({ planned_issue_ids, outcomes, max_batch_size }) =>
    jsonToolResponse(await client.assessBatchProgress({ planned_issue_ids, outcomes, max_batch_size })),
);

server.registerTool(
  "merly_resolve_workspace",
  {
    title: "Resolve Workspace To Merly Context",
    description: "Match a local git workspace to a Merly repository, branch, and RBL.",
    inputSchema: {
      workspace_path: z.string().optional().describe("Absolute path to the local git workspace."),
      language: z.string().optional().describe("Preferred RBL language, for example PYTHON."),
    },
  },
  async ({ workspace_path, language }) => jsonToolResponse(await client.resolveWorkspace({ workspace_path, language })),
);

server.registerTool(
  "merly_get_repo_analysis_context",
  {
    title: "Get Merly Repository Analysis Context",
    description: "Return repository, branch, RBL, and latest snapshot context from known Merly IDs.",
    inputSchema: {
      repository_id: z.union([z.string(), z.number()]).optional(),
      branch_id: z.union([z.string(), z.number()]).optional(),
      rbl_id: z.union([z.string(), z.number()]).optional(),
      language: z.string().optional(),
    },
  },
  async ({ repository_id, branch_id, rbl_id, language }) =>
    jsonToolResponse(await client.getRepoAnalysisContext({ repository_id, branch_id, rbl_id, language })),
);

server.registerTool(
  "merly_create_branch",
  {
    title: "Create Merly Branch",
    description:
      "Register a repository branch for Merly analysis. May return a fetch job that should be polled before retrying.",
    inputSchema: {
      repository_id: z.union([z.string(), z.number()]).describe("Merly repository id."),
      name: z.string().describe("Branch name to register for analysis."),
    },
  },
  async ({ repository_id, name }) => jsonToolResponse(await client.createBranch(repository_id, { name })),
);

server.registerTool(
  "merly_list_snapshots",
  {
    title: "List Merly Snapshots",
    description: "List recent analysis snapshots for an RBL.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      limit: z.number().int().min(1).max(100).optional().default(10),
      sort: z.string().optional().default("-id"),
    },
  },
  async ({ rbl_id, limit, sort }) => jsonToolResponse(await client.listSnapshots(rbl_id, { limit, sort })),
);

server.registerTool(
  "merly_get_issue_bundle",
  {
    title: "Get Merly Issue Bundle",
    description: "Return one issue plus compact expression insight context and repair-readiness signals for Codex repair work.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      issue_id: z.string().describe("Merly issue id, for example 321:0."),
    },
  },
  async ({ rbl_id, issue_id }) => jsonToolResponse(await client.getIssueBundle({ rbl_id, issue_id })),
);

server.registerTool(
  "merly_wait_for_issue_insights",
  {
    title: "Wait For Merly Issue Insights",
    description:
      "Poll Merly expression insight jobs for one issue and return the issue bundle once insights are ready, timed out, or terminally failed.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      issue_id: z.string().describe("Merly issue id, for example 321:0."),
      timeout_ms: z.number().int().min(1000).max(300000).optional().default(30000),
      poll_interval_ms: z.number().int().min(250).max(10000).optional().default(2000),
    },
  },
  async ({ rbl_id, issue_id, timeout_ms, poll_interval_ms }) =>
    jsonToolResponse(await client.waitForIssueInsights({ rbl_id, issue_id, timeout_ms, poll_interval_ms })),
);

server.registerTool(
  "merly_check_reanalysis_readiness",
  {
    title: "Check Merly Reanalysis Readiness",
    description:
      "Inspect local git state before a Merly repository re-analysis so Codex can warn when local edits are not visible to Merly.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      workspace_path: z.string().optional().describe("Absolute path to the local git workspace to inspect."),
      require_clean: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true, report can_reanalyze=false if the local workspace is dirty or cannot be inspected."),
    },
  },
  async ({ rbl_id, workspace_path, require_clean }) =>
    jsonToolResponse(await client.checkReanalysisReadiness({ rbl_id, workspace_path, require_clean })),
);

server.registerTool(
  "merly_prepare_git_visibility",
  {
    title: "Prepare Git Visibility For Merly",
    description:
      "Dry-run or create a targeted git commit so Merly re-analysis can see exactly the intended local repair.",
    inputSchema: {
      workspace_path: z.string().describe("Absolute path to the local git workspace."),
      files: z.array(z.string()).min(1).describe("Target file paths to include. Wildcards are not allowed."),
      issue_id: z.string().optional().describe("Merly issue id used for the default commit message."),
      commit_message: z.string().optional().describe("Commit message to use when commit=true."),
      branch_name: z.string().optional().describe("Optional new branch name when create_branch=true."),
      create_branch: z.boolean().optional().default(false),
      commit: z.boolean().optional().default(false).describe("When false, only reports what would happen."),
      allow_unrelated_dirty: z
        .boolean()
        .optional()
        .default(false)
        .describe("When false, block commit if dirty files exist outside the target file list."),
      allow_new_files: z
        .boolean()
        .optional()
        .default(false)
        .describe("When false, block commit if target files include untracked files."),
    },
  },
  async ({
    workspace_path,
    files,
    issue_id,
    commit_message,
    branch_name,
    create_branch,
    commit,
    allow_unrelated_dirty,
    allow_new_files,
  }) =>
    jsonToolResponse(
      await client.prepareGitVisibility({
        workspacePath: workspace_path,
        files,
        issueId: issue_id,
        commitMessage: commit_message,
        branchName: branch_name,
        createBranch: create_branch,
        commit,
        allowUnrelatedDirty: allow_unrelated_dirty,
        allowNewFiles: allow_new_files,
      }),
    ),
);

server.registerTool(
  "merly_prepare_ref_visibility",
  {
    title: "Prepare Merly Ref Visibility",
    description:
      "Dry-run or fetch a local repair branch into Merly's local clone so method=ref re-analysis can resolve the target commit.",
    inputSchema: {
      workspace_path: z.string().describe("Absolute path to the local git workspace containing the repair commit."),
      rbl_id: z.union([z.string(), z.number()]).optional().describe("Merly RBL id used to find repository metadata."),
      repository_id: z.union([z.string(), z.number()]).optional().describe("Merly repository id when rbl_id is not provided."),
      merly_git_root: z.string().optional().describe("Optional explicit path to Merly's local git clone."),
      merly_work_dir: z.string().optional().describe("Optional Merly app work directory; defaults to MERLY_WORK_DIR or health metadata."),
      ref: z.string().optional().describe("Commit/ref that must be resolvable in Merly's clone; defaults to local HEAD."),
      source_ref: z.string().optional().describe("Local branch/ref to fetch; defaults to the current workspace branch."),
      target_ref: z
        .string()
        .optional()
        .describe("Target ref in Merly's clone; defaults to refs/remotes/origin/<workspace branch>."),
      fetch: z.boolean().optional().default(false).describe("When false, only reports whether a fetch is needed."),
    },
  },
  async ({ workspace_path, rbl_id, repository_id, merly_git_root, merly_work_dir, ref, source_ref, target_ref, fetch }) =>
    jsonToolResponse(
      await client.prepareRefVisibility({
        workspace_path,
        rbl_id,
        repository_id,
        merly_git_root,
        merly_work_dir,
        ref,
        source_ref,
        target_ref,
        fetch,
      }),
    ),
);

server.registerTool(
  "merly_start_snapshot",
  {
    title: "Start Merly Snapshot",
    description: "Start a Merly snapshot/re-analysis job for an RBL.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      method: z.enum(["single", "count", "duration", "ref"]).optional().default("single"),
      value: z.number().optional().describe("Numeric value for count or duration snapshot methods."),
      ref: z.string().optional().describe("Git ref for method=ref."),
    },
  },
  async ({ rbl_id, method, value, ref }) =>
    jsonToolResponse(await client.startSnapshot({ rbl_id, method, value, ref })),
);

server.registerTool(
  "merly_poll_job",
  {
    title: "Poll Merly Job",
    description: "Poll a Merly async job until it reaches completed, failed, canceled, or timeout.",
    inputSchema: {
      job_key: z.string().describe("Merly async job key."),
      timeout_ms: z.number().int().min(1000).max(3600000).optional().default(300000),
      poll_interval_ms: z.number().int().min(250).max(30000).optional().default(5000),
    },
  },
  async ({ job_key, timeout_ms, poll_interval_ms }) =>
    jsonToolResponse(await client.pollJob({ job_key, timeout_ms, poll_interval_ms })),
);

server.registerTool(
  "merly_compare_issue_state",
  {
    title: "Compare Merly Issue State",
    description: "Compare whether an issue currently exists and whether its tracked fields changed.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      issue_id: z.string().describe("Merly issue id, for example 321:0."),
    },
  },
  async ({ rbl_id, issue_id }) => jsonToolResponse(await client.compareIssueState({ rbl_id, issue_id })),
);

server.registerTool(
  "merly_compare_issue_at_snapshot",
  {
    title: "Compare Merly Issue At Snapshot",
    description:
      "Compare whether an issue appears in a specific Merly analysis snapshot instead of relying on the latest issue endpoint.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      snapshot_id: z.union([z.string(), z.number()]).describe("Snapshot id within the RBL."),
      issue_id: z.string().describe("Merly issue id, for example 321:0."),
      limit: z.number().int().min(1).max(100).optional().default(100),
      max_pages: z.number().int().min(1).max(20).optional().default(5),
      status: z.enum(["open", "acknowledged", "resolved", "ignored"]).optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      file_path: z.string().optional().describe("Optional file path filter; defaults to the current issue file path."),
    },
  },
  async ({ rbl_id, snapshot_id, issue_id, limit, max_pages, status, severity, file_path }) =>
    jsonToolResponse(
      await client.compareIssueAtSnapshot({
        rbl_id,
        snapshot_id,
        issue_id,
        limit,
        max_pages,
        status,
        severity,
        file_path,
      }),
    ),
);

server.registerTool(
  "merly_reanalyze_and_compare_issue",
  {
    title: "Reanalyze And Compare Merly Issue",
    description: "Start a snapshot re-analysis, poll it, then compare whether a target issue disappeared, changed, or remains.",
    inputSchema: {
      rbl_id: z.union([z.string(), z.number()]).describe("Merly RBL id."),
      issue_id: z.string().describe("Merly issue id, for example 321:0."),
      method: z.enum(["single", "count", "duration", "ref"]).optional().default("single"),
      value: z.number().optional().describe("Numeric value for count or duration snapshot methods."),
      ref: z.string().optional().describe("Git ref for method=ref."),
      timeout_ms: z.number().int().min(1000).max(3600000).optional().default(300000),
      poll_interval_ms: z.number().int().min(250).max(30000).optional().default(5000),
      workspace_path: z.string().optional().describe("Absolute path to the local git workspace to inspect before re-analysis."),
      require_clean: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true, skip re-analysis if the local workspace is dirty or cannot be inspected."),
    },
  },
  async ({ rbl_id, issue_id, method, value, ref, timeout_ms, poll_interval_ms, workspace_path, require_clean }) =>
    jsonToolResponse(
      await client.reanalyzeAndCompareIssue({
        rbl_id,
        issue_id,
        method,
        value,
        ref,
        timeout_ms,
        poll_interval_ms,
        workspace_path,
        require_clean,
      }),
    ),
);

server.registerTool(
  "merly_verify_snippet",
  {
    title: "Verify Snippet With Merly DIF",
    description: "Verify a code snippet or function body using Merly DIF.",
    inputSchema: {
      language: z.string().describe("Language slug, for example python."),
      code: z.string().min(1).describe("Code snippet, function, or code block to verify."),
      response_mode: z.enum(["full", "script"]).optional().default("script"),
      sensitivity: z.number().int().min(0).max(10).optional().default(0),
    },
  },
  async ({ language, code, response_mode, sensitivity }) =>
    jsonToolResponse(await client.verifySnippet({ language, code, response_mode, sensitivity })),
);

server.registerTool(
  "merly_verify_file",
  {
    title: "Verify Local File With Merly DIF",
    description: "Read a local file or line range and verify it with Merly DIF, returning a compact summary.",
    inputSchema: {
      language: z.string().describe("Language slug, for example python, javascript, c, or cpp."),
      file_path: z.string().describe("Absolute path, or path relative to workspace_path when provided."),
      workspace_path: z.string().optional().describe("Base path for resolving relative file_path."),
      start_line: z.number().int().min(1).optional().describe("1-based start line for a smaller verification slice."),
      end_line: z.number().int().min(1).optional().describe("1-based inclusive end line for a smaller verification slice."),
      response_mode: z.enum(["full", "script"]).optional().default("script"),
      sensitivity: z.number().int().min(0).max(10).optional().default(0),
      max_bytes: z.number().int().min(1).max(1000000).optional().default(200000),
      include_raw: z.boolean().optional().default(false),
    },
  },
  async (input) => jsonToolResponse(await verifyFileWithDif(client, input)),
);

if (isMainModule()) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function jsonToolResponse(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function authStatus() {
  const config = getConfig();
  return {
    base_url: config.baseUrl,
    has_credentials: hasCredentials(config),
    has_mentor_credentials: hasMentorCredentials(config),
    has_dif_credentials: hasDifCredentials(config),
    mentor_auth_mode: mentorAuthMode(config),
    dif_auth_mode: difAuthMode(config),
  };
}

function mentorAuthMode(config) {
  if (config.apiKey) return "api_key";
  if (config.bearerToken) return "bearer_token";
  return "none";
}

function difAuthMode(config) {
  if (config.difApiKey) return "dif_api_key";
  return mentorAuthMode(config);
}

function isMainModule() {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint && import.meta.url === pathToFileURL(entryPoint).href);
}
