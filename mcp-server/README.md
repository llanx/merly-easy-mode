# MCP Server

Prototype MCP server for Merly Mentor.

The server exposes high-level tools backed by the local Merly Bridge API.

## Setup

```powershell
cd C:\Users\matts\merly\merly-codex-integration\mcp-server
npm install
Copy-Item .env.example .env
```

Set one of these before calling protected endpoints:

```text
MERLY_API_KEY=<key>
MERLY_BEARER_TOKEN=<token>
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
npm run debug -- create-api-key "Codex MCP Prototype"
npm run debug -- repos
npm run debug -- create-repository VillageDwarves C:\Users\matts\VillageDwarves master
npm run debug -- branches <repository_id> [limit]
npm run debug -- create-branch <repository_id> <name>
npm run debug -- branch-rbls <branch_id> [limit]
npm run debug -- resolve C:\path\to\repo PYTHON
npm run debug -- context <repository_id> [branch_id] [rbl_id] [language]
npm run debug -- snapshots <rbl_id> [limit] [sort]
npm run debug -- candidates <rbl_id> [limit] [fetch_limit] [include_path_prefixes_csv] [exclude_path_prefixes_csv] [workspace_path] [avoid_dirty_files]
npm run debug -- batch-plan <rbl_id> [max_batch_size] [fetch_limit] [readiness_csv] [exclude_issue_ids_csv] [include_path_prefixes_csv] [exclude_path_prefixes_csv] [workspace_path] [avoid_dirty_files]
npm run debug -- batch-progress <planned_issue_ids_csv> [outcomes_json_file_or_inline_json] [max_batch_size]
npm run debug -- issue <rbl_id> <issue_id>
npm run debug -- snapshot-issues <rbl_id> <snapshot_id> [limit] [status] [file_path]
npm run debug -- check-reanalysis <rbl_id> [workspace_path] [require_clean]
npm run debug -- git-visibility <workspace_path> <issue_id> <files_csv> [commit] [commit_message] [branch_name] [create_branch] [allow_unrelated_dirty] [allow_new_files]
npm run debug -- ref-visibility <workspace_path> <rbl_id> [ref] [fetch] [source_ref] [target_ref] [merly_git_root]
npm run debug -- start-snapshot <rbl_id> [method] [value] [ref]
npm run debug -- poll-job <job_key> [timeout_ms] [poll_interval_ms]
npm run debug -- compare-issue <rbl_id> <issue_id>
npm run debug -- compare-snapshot-issue <rbl_id> <snapshot_id> <issue_id> [limit] [max_pages]
npm run debug -- reanalyze-compare <rbl_id> <issue_id> [timeout_ms] [poll_interval_ms] [workspace_path] [require_clean]
npm run debug -- verify python .\path\to\file.py
npm run debug -- verify-file javascript .\src\server.js 1 80
npm run unreal:automation -- --dry-run
npm run unreal:automation
```

`unreal:automation` defaults to `C:\Users\matts\DwarfIncremental\DwarfIncremental.uproject` and `DwarfIncremental.GridNav.NavigationSubsystemSmoke`. Set `UNREAL_EDITOR_CMD` when `UnrealEditor-Cmd.exe` is not discoverable.

## MCP Server

```powershell
npm start
```

Initial tools:

```text
merly_auth_status
merly_health
merly_list_repositories
merly_create_repository
merly_resolve_workspace
merly_get_repo_analysis_context
merly_create_branch
merly_get_fix_candidates
merly_plan_batch_fixes
merly_assess_batch_progress
merly_get_issue_bundle
merly_wait_for_issue_insights
merly_check_reanalysis_readiness
merly_prepare_git_visibility
merly_prepare_ref_visibility
merly_list_snapshots
merly_compare_issue_at_snapshot
merly_start_snapshot
merly_poll_job
merly_compare_issue_state
merly_reanalyze_and_compare_issue
merly_verify_snippet
merly_verify_file
```

Repository-level re-analysis starts a Merly snapshot job and compares the target issue after the job completes. It appears to analyze Merly's configured branch/ref, so uncommitted local edits in a target repository may not change the reported issue state. Use `check-reanalysis` or pass `require_clean=true` to `reanalyze-compare` when the recheck must prove the local patch.

`git-visibility` is dry-run by default. It can create a targeted commit only when `commit=true`, and it blocks by default if dirty files exist outside the target file list.

`ref-visibility` is also dry-run by default. It checks whether Merly's local clone can resolve a target commit, and with `fetch=true` it fetches the current local branch into Merly's clone using a narrow refspec. Use it before method=`ref` re-analysis so the snapshot job can see a newly committed local repair without manually fetching `Merly\.git-root`.

`reanalyze-compare` returns both `latest_endpoint_comparison` and `snapshot_comparison` when a snapshot can be selected after the job. Prefer the snapshot comparison because it is tied to a specific analysis run. Comparison payloads include `repair_outcome`, which classifies results such as `resolved`, `failed_unchanged`, `needs_review`, and `not_checked`.

Batch mode is planned, not blind. `batch-plan` selects up to 3 candidates by default, enforces a hard maximum of 5, and `batch-progress` stops the run when a repair outcome has `should_continue_batch=false`.

Candidate and batch planning can scan up to 1000 issues, de-duplicate repeated issue rows, and apply local path filters before ranking. Use `include_path_prefixes_csv` to focus on project source, `exclude_path_prefixes_csv` to skip generated or tool code, and `avoid_dirty_files=true` with `workspace_path` to avoid planning fixes against files that already have local edits.
Use `-` for an intentionally empty CSV argument when later positional arguments are needed.

`create-repository` registers a local or remote Git repository with Merly. HTTPS URLs use the v2 repository endpoint. Local Windows paths use Merly's legacy `POST /api/r` form endpoint, default to `origin`, and start initial inference unless `run_infer_after_add` is set false through the MCP tool. Poll the returned `job_key` when one is available, then use `resolve`, `context`, `snapshots`, and `candidates` to inspect analysis results. For an analysis-only VillageDwarves run:

```powershell
npm run debug -- create-repository VillageDwarves C:\Users\matts\VillageDwarves master
npm run debug -- poll-job <job_key> 600000 5000
npm run debug -- resolve C:\Users\matts\VillageDwarves CPP
npm run debug -- candidates 2 10 1000 Source/VillageDwarves Tools/Unreal_mcp C:\Users\matts\VillageDwarves true
```
