# MCP Server

MCP server for exposing local Merly Mentor analysis to AI coding agents.

The server uses the local Merly Bridge API and provides high-level tools for health checks, repository resolution, issue discovery, DIF verification, snapshot re-analysis, and guarded Git visibility checks.

## Setup

From this folder:

```powershell
npm install
Copy-Item .env.example .env
```

On macOS or Linux shells:

```sh
npm install
cp .env.example .env
```

Set one of these before calling protected endpoints:

```text
MERLY_API_KEY=<key>
MERLY_BEARER_TOKEN=<token>
MERLY_DIF_API_KEY=<dif-key>
```

`MERLY_BASE_URL` defaults to:

```text
http://127.0.0.1:4201
```

## Debug Commands

On Windows, use `npm.cmd` instead of `npm` if PowerShell blocks `npm.ps1` with an execution-policy error.

```powershell
npm run debug -- health
npm run debug -- auth-status
npm run auth:smoke
npm run dif:smoke
npm run open:keys
npm run debug -- login
npm run debug -- create-api-key "Merly Easy Mode"
npm run debug -- repos
npm run debug -- create-repository <name> <git-url-or-path> <branch>
npm run debug -- resolve <workspace-path> <language>
npm run debug -- candidates <rbl_id> <limit> <fetch_limit>
npm run debug -- issue <rbl_id> <issue_id>
npm run debug -- verify-file javascript .\src\server.js 1 80
```

Advanced debugging commands are available through `scripts/merly-debug.js`; run an unknown command to print usage.

## MCP Server

```powershell
npm start
```

Core tools:

```text
merly_auth_status
merly_health
merly_list_repositories
merly_create_repository
merly_resolve_workspace
merly_get_repo_analysis_context
merly_get_fix_candidates
merly_plan_batch_fixes
merly_get_issue_bundle
merly_wait_for_issue_insights
merly_verify_snippet
merly_verify_file
merly_start_snapshot
merly_reanalyze_and_compare_issue
```

Repository-level re-analysis starts a Merly snapshot job and compares the target issue after the job completes. It analyzes the branch or ref visible to Merly, so uncommitted local edits may not change the reported issue state. Use `merly_check_reanalysis_readiness`, `merly_prepare_git_visibility`, and `merly_prepare_ref_visibility` when a recheck must prove a local patch.

Batch mode is guarded. `merly_plan_batch_fixes` selects a small batch, and `merly_assess_batch_progress` stops the run when validation or Merly comparison says to stop.
