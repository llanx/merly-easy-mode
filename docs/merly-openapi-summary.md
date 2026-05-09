# Merly OpenAPI Summary

This is a sanitized implementation reference for the prototype MCP server. It is based on the local Merly Mentor Swagger file at:

```text
C:\Users\matts\merly\swagger-v2.yaml
```

Do not commit the full local Swagger file unless it has been reviewed for local paths, examples, credentials, and other runtime-specific data.

## Runtime URLs

Use this base URL for the MCP server:

```text
MERLY_BASE_URL=http://127.0.0.1:4201
```

The running bridge serves API v2 routes under:

```text
/api/v2
```

Examples:

```text
GET  http://127.0.0.1:4201/status
GET  http://127.0.0.1:4201/api/v2/health
GET  http://127.0.0.1:4201/api/v2/repositories
POST http://127.0.0.1:4201/api/v2/dif/verify
```

`/status` is an unversioned bridge status endpoint. OpenAPI paths should be called with the `/api/v2` prefix in the current runtime.

## Local Smoke Checks

Observed on 2026-04-28:

| Request | Result | Notes |
| --- | --- | --- |
| `GET /status` | `200` | Returned bridge `version` and `uptime`. |
| `GET /api/v2/health` | `200` | Returned bridge, daemon, and database health. |
| `GET /api/v2/repositories` | `401` without auth | Protected endpoint. |
| `POST /api/v2/dif/verify` | `401` without auth | Swagger describes anonymous/light usage, but this runtime requires auth. |

## Authentication

The OpenAPI spec defines global auth:

```text
BearerAuth: Authorization: Bearer <token>
ApiKeyAuth: X-API-Key: <key>
```

Use an API key for the MCP prototype if possible. It is simpler than storing user credentials and refreshing JWTs.

Supported auth routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v2/auth/login` | Exchange `{ email, password }` for access and refresh tokens. |
| `POST` | `/api/v2/auth/token` | Exchange `{ refresh_token }` for a new access token. |
| `POST` | `/api/v2/auth/logout` | Invalidate current session. |
| `GET` | `/api/v2/me` | Validate current identity using API key or bearer token. |
| `GET` | `/api/v2/me/api-keys` | List API keys for current identity. |
| `POST` | `/api/v2/me/api-keys` | Create an API key. Defer for prototype unless needed. |

JWT access tokens expire after 15 minutes according to the spec. For the MCP server, prefer:

```text
MERLY_API_KEY=<key>
```

Request header:

```text
X-API-Key: <key>
```

Fallback:

```text
MERLY_BEARER_TOKEN=<token>
Authorization: Bearer <token>
```

## Common Response Patterns

Collection endpoints return paginated results:

```json
{
  "data": [],
  "pagination": {
    "total": 0,
    "limit": 20,
    "has_more": false,
    "next_cursor": null
  },
  "_links": {
    "self": "...",
    "next": null,
    "prev": null
  }
}
```

Common query parameters:

```text
cursor
limit
sort
filter
```

Use small limits for MCP tools. The first prototype should request only enough data to select a repair target, usually `limit=20` or `limit=50`.

## Domain Model

Merly's v2 model is:

```text
Repository -> Branch -> RBL -> Snapshot -> Issues, Files, Expressions, Insights
```

`RBL` means Repository-Branch-Language. Most useful analysis endpoints require an `rbl_id`.

## Endpoint Subset For Prototype

### Service Health

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/status` | Bridge status | No |
| `GET` | `/api/v2/health` | Bridge, daemon, and database health | No |

Important fields:

```text
status
version
uptime
daemon
daemon_status.state
database.is_locked
```

MCP tools:

```text
merly_auth_status
merly_status
merly_health
```

`merly_auth_status` is local MCP config introspection only. It reports base URL, credential availability booleans, and auth modes without returning credential values.

### Repositories

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/repositories` | List repositories | Yes |
| `POST` | `/api/v2/repositories` | Register repo for analysis | Yes |
| `GET` | `/api/v2/repositories/{repository_id}` | Get repository | Yes |

Useful `GET /repositories` query parameters:

```text
status=active|cloning|error|deleted
limit
sort
filter
```

Important `Repository` fields:

```text
id
name
description
git_url
default_branch
status
source_root
git_root
rbl_id
branches
updated_at
_links.branches
_links.issues
```

`POST /repositories` accepts:

```json
{
  "name": "repo-name",
  "git_url": "https://github.com/org/repo.git",
  "description": "optional",
  "git_branch": "main",
  "source_root": "optional local path",
  "git_root": "optional local .git path"
}
```

Creation returns `202` with a job:

```text
job.job_key
job.status
```

Repository creation is now implemented for analysis-only onboarding of local repos such as `VillageDwarves`.

MCP tools:

```text
merly_list_repositories
merly_create_repository
merly_get_repository
```

### Branches

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/repositories/{repository_id}/branches` | List branches for repo | Yes |
| `POST` | `/api/v2/repositories/{repository_id}/branches` | Add branch for analysis | Yes |
| `GET` | `/api/v2/branches/{branch_id}` | Get branch | Yes |

Important `Branch` fields:

```text
id
repository_id
name
last_commit_sha
is_default
lifetime_mentor_score
languages
_links.rbls
```

MCP tools:

```text
merly_resolve_workspace
merly_get_repo_analysis_context
```

Workspace resolution should compare:

```text
local git remote URL -> Repository.git_url
local branch name -> Branch.name
local language or requested language -> RBL.language
```

### RBLs

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/branches/{branch_id}/rbls` | List RBLs for a branch | Yes |
| `GET` | `/api/v2/rbls` | List accessible RBLs | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}` | Get RBL details | Yes |

Useful `GET /rbls` query parameters:

```text
repository_id
language
limit
sort
filter
```

Important `RBL` fields:

```text
id
repository_id
branch_id
language
status
lifetime_mentor_score
last_score
last_issue_count
last_analyzed_at
snapshot_count
_links.snapshots
_links.issues
```

MCP tools:

```text
merly_list_rbls
merly_get_rbl
merly_get_repo_analysis_context
```

### Snapshots

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/rbls/{rbl_id}/snapshots` | List snapshots | Yes |
| `POST` | `/api/v2/rbls/{rbl_id}/snapshots` | Create analysis snapshot | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}/snapshots/{snapshot_id}` | Get snapshot details | Yes |

For re-analysis, prefer:

```json
{
  "method": "single"
}
```

Snapshot creation returns `202` with:

```text
job_key
status
message
_links.job
```

Important `Snapshot` fields:

```text
id
rbl_id
branch_id
repository_id
point_ref
point_time
language
score
issue_count
anomaly_count
notable_count
expression_count
_links.issues
```

MCP tools:

```text
merly_start_snapshot
merly_compare_issue_state
```

### Issues

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/rbls/{rbl_id}/issues` | List latest RBL issues | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}/issues/{issue_id}` | Get latest issue details | Yes |
| `PATCH` | `/api/v2/rbls/{rbl_id}/issues/{issue_id}` | Update issue metadata | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}/snapshots/{snapshot_id}/issues` | List issues for specific snapshot | Yes |
| `GET` | `/api/v2/repositories/{repository_id}/issues` | List repo-level issues | Yes |

Useful issue query parameters:

```text
status=open
severity=critical|high|medium|low
file_path=<path or wildcard>
limit
sort
```

Important `Issue` fields:

```text
id
repository_id
snapshot_id
expression_instance_id
severity
status
action
file_path
file_line
file_column
snippet
comment
category_id
assignee_id
updated_at
_links.insights
```

URL-encode `issue_id` when it contains `:`:

```text
321:0 -> 321%3A0
```

First fix-candidate request:

```text
GET /api/v2/rbls/{rbl_id}/issues?status=open&limit=50
```

The MCP client can page through up to 1000 latest issues before local ranking. It de-duplicates repeated issue rows before applying local filters and ranking. Candidate planning accepts local filters that are not Merly API filters:

```text
include_path_prefixes
exclude_path_prefixes
workspace_path
avoid_dirty_files
```

Use these when a repository contains generated, tool, or already-dirty files. For `VillageDwarves`, the current prototype filter is `include_path_prefixes=Source/VillageDwarves`, `exclude_path_prefixes=Tools/Unreal_mcp`, and `avoid_dirty_files=true` with `workspace_path=C:\Users\matts\VillageDwarves`.

Candidate scoring should prefer:

```text
open status
critical/high severity
known file_path
known file_line
non-empty snippet
action=simplify or action=fix
small local scope
```

MCP tools:

```text
merly_get_fix_candidates
merly_get_issue_bundle
merly_compare_issue_state
```

### Expression Insights

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/rbls/{rbl_id}/issues/{issue_id}/expression-insights` | Insights for an issue | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}/expressions/{expression_id}/insights` | Insights for an expression | Yes |

The issue insight endpoint returns either:

```text
200 with an array of insight objects
202 with job_key while insight generation is queued/running
```

If `202`, poll `/api/v2/jobs/{job_key}` and retry the insight endpoint.

Important `ExpressionInsight` fields:

```text
id
expression_id
issue_id
html
views
up_votes
down_votes
_links.self
```

The `html` field is analysis content. The MCP server should convert or strip HTML before returning compact text to Codex.

MCP tools:

```text
merly_get_issue_bundle
merly_get_expression_insights
```

### Files

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/rbls/{rbl_id}/files` | List analyzed files | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}/files/{file_id}` | Get file details | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}/files/{file_id}/versions` | File version history | Yes |

Useful query parameters:

```text
file_path
extension
limit
sort
```

Important `File` fields:

```text
id
rbl_id
file_path
file_name
extension
size
lines_of_code
language
_links.versions
```

Use issues as the primary file mapping source. Use `/files` to validate paths or enrich metadata.

MCP tools:

```text
merly_list_files
merly_get_issue_bundle
```

### Expressions

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/rbls/{rbl_id}/expressions` | List expressions | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}/expressions/{expression_id}` | Get expression details | Yes |
| `GET` | `/api/v2/rbls/{rbl_id}/snapshots/{snapshot_id}/expressions` | Snapshot expressions | Yes |

Important `Expression` fields:

```text
id
rbl_id
snippet_id
snippet_text
score
cost
expression_class
expression_type
state
_links.insights
```

For issue IDs in `expression_id:index` form, the expression id is the part before `:`.

### DIF Verification

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/dif/languages` | List DIF language states | Yes in current runtime |
| `POST` | `/api/v2/dif/languages/load` | Load DIF language models | Yes |
| `POST` | `/api/v2/dif/verify` | Verify a code block or function body | Yes in current runtime |

Verification request:

```json
{
  "language": "python",
  "response_mode": "script",
  "sensitivity": 0,
  "code": "def f(x):\n    return x == True\n"
}
```

Useful script response fields:

```text
eventId
stream
base_stream
tags
scores.semantic_support
scores.statement_complexity
scores.structural_cost
scores.verification
top_finding
top_semantic_signal
```

MCP tool:

```text
merly_verify_snippet
```

The automated-fix loop should use this on the changed function or snippet before full repository re-analysis is implemented.

### Jobs

| Method | Path | Operation | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/jobs/{job_key}` | Get async job status | Yes |
| `DELETE` | `/api/v2/jobs/{job_key}` | Cancel job | Yes |

Poll cadence from the spec:

```text
2-5 seconds
```

Terminal statuses:

```text
completed
failed
canceled
```

Important `Job` fields:

```text
job_key
status
action
description
progress
error_message
repository_id
branch_id
rbl_id
started_at
finished_at
```

MCP tools:

```text
merly_poll_job
merly_cancel_job later
```

### Re-Analysis Comparison

The MCP server wraps snapshot creation, job polling, and issue comparison into one workflow tool:

```text
merly_check_reanalysis_readiness
merly_prepare_git_visibility
merly_prepare_ref_visibility
merly_list_snapshots
merly_compare_issue_at_snapshot
merly_reanalyze_and_compare_issue
```

Inputs:

```text
rbl_id
issue_id
method=single
value optional
ref optional
timeout_ms optional
poll_interval_ms optional
```

Output includes:

```text
readiness.can_reanalyze
readiness.workspace.status.clean
readiness.warnings
git_visibility.can_commit
git_visibility.target_files
git_visibility.unrelated_status
snapshot_job
poll
before_context
after_context
snapshot_selection
snapshot_comparison
latest_endpoint_comparison
comparison.state = disappeared|changed|unchanged
comparison.repair_outcome.status = resolved|failed_unchanged|needs_review|not_checked
```

Observed limitation: repository-level re-analysis appears to analyze Merly's configured branch/ref. If Codex only patched an uncommitted local working tree, the issue may remain unchanged until the patch is committed or otherwise made visible to Merly. Use `merly_check_reanalysis_readiness` or `require_clean=true` on the combined re-analysis tool to avoid a misleading recheck.

`merly_prepare_git_visibility` is intentionally conservative. It dry-runs by default, accepts an explicit target file list, blocks unrelated dirty files unless `allow_unrelated_dirty=true`, blocks untracked target files unless `allow_new_files=true`, and only creates a commit when `commit=true`.

`merly_prepare_ref_visibility` bridges the remaining local-git gap before method=`ref` snapshot creation. It is dry-run by default, resolves Merly's local clone from repository metadata such as `${AWD}\.git-root\${ID}`, checks whether the target commit is already resolvable there, and with `fetch=true` runs a narrow fetch from the local workspace branch into Merly's clone. This replaces the prototype-only manual fetch against `Merly\.git-root\repo(...)`.

Snapshot-specific comparison uses `GET /api/v2/rbls/{rbl_id}/snapshots/{snapshot_id}/issues` after a snapshot job completes. The runtime may return snapshots in ascending order even when `sort=-id` is requested, so the MCP client sorts returned snapshots locally and prefers a newly observed snapshot id when available. Prefer snapshot-specific `repair_outcome` over the latest issue endpoint when they disagree; the latest endpoint can lag after a successful recheck.

Batch mode uses `merly_plan_batch_fixes` to choose a small candidate list and `merly_assess_batch_progress` between every issue. Batch size defaults to 3 and is capped at 5. `repair_outcome.should_continue_batch=false` stops the batch immediately. The same path and dirty-file filters used by `merly_get_fix_candidates` are available in the batch planner before ranking and readiness selection.

## First MCP Tool Mapping

Implement these first:

| MCP tool | Merly calls | Purpose |
| --- | --- | --- |
| `merly_auth_status` | local config only | Report base URL and credential availability without exposing credential values. |
| `merly_health` | `GET /status`, `GET /api/v2/health` | Confirm bridge and daemon are usable. |
| `merly_list_repositories` | `GET /api/v2/repositories?limit=50` | Discover registered repos. |
| `merly_create_repository` | `POST /api/v2/repositories` for HTTPS, legacy `POST /api/r` form for local paths | Register a local or remote Git repo for analysis. |
| `merly_resolve_workspace` | local git remote/branch plus repo/branch/RBL endpoints | Map current working tree to Merly IDs. |
| `merly_get_repo_analysis_context` | repo, branch, RBL, latest snapshot calls | Return IDs needed for issue discovery. |
| `merly_create_branch` | `POST /api/v2/repositories/{repository_id}/branches` | Register or fetch a branch before re-analysis. |
| `merly_get_fix_candidates` | `GET /api/v2/rbls/{rbl_id}/issues?status=open&limit=50` plus optional local filters | Return ranked actionable issues. |
| `merly_plan_batch_fixes` | `GET /api/v2/rbls/{rbl_id}/issues` plus local filters and ranking | Select a small guarded batch with strict max size. |
| `merly_assess_batch_progress` | local outcome classification | Decide whether a batch can continue after each repair outcome. |
| `merly_get_issue_bundle` | issue detail, insights, optional file metadata | Return compact context for one fix. |
| `merly_verify_snippet` | `POST /api/v2/dif/verify` | Check changed code before full re-analysis. |
| `merly_check_reanalysis_readiness` | local git status plus repo, branch, RBL context | Warn or block when Merly is unlikely to see local uncommitted edits. |
| `merly_prepare_git_visibility` | local git status and optional targeted commit | Make a local repair visible to Merly without staging unrelated files. |
| `merly_prepare_ref_visibility` | local git fetch into Merly's clone | Make the committed repair ref resolvable by Merly before method=`ref` re-analysis. |
| `merly_list_snapshots` | `GET /api/v2/rbls/{rbl_id}/snapshots` | Inspect recent snapshots and choose a deterministic comparison target. |
| `merly_compare_issue_at_snapshot` | `GET /api/v2/rbls/{rbl_id}/snapshots/{snapshot_id}/issues` | Compare one issue against a specific analysis snapshot. |
| `merly_start_snapshot` | `POST /api/v2/rbls/{rbl_id}/snapshots` | Trigger full re-analysis later. |
| `merly_poll_job` | `GET /api/v2/jobs/{job_key}` | Wait for async operations. |
| `merly_compare_issue_state` | before/after issue or snapshot issue calls | Report if an issue disappeared or changed. |
| `merly_reanalyze_and_compare_issue` | snapshot creation, job polling, issue comparison | One-call repository-level re-analysis workflow after a local fix. |

## First Automated Fix Flow

```text
1. merly_health
2. merly_resolve_workspace
3. merly_get_repo_analysis_context
4. merly_get_fix_candidates
5. merly_get_issue_bundle for the selected issue
6. Codex reads and edits the local source file
7. Codex runs tests/validation
8. merly_verify_snippet on the changed function or snippet
9. merly_prepare_ref_visibility when the repair was committed and method=`ref` re-analysis will be used
10. Optional: merly_start_snapshot and merly_poll_job
11. merly_compare_issue_state
```

The preferred one-call form for step 9 and 10 is:

```text
merly_reanalyze_and_compare_issue
```

## Open Questions

- How should the MCP server obtain the first API key without storing user credentials?
- Does the current runtime support anonymous DIF at all, or is auth always required?
- Which issue sort field best approximates auto-fix value?
- Are `file_line` values stable enough after edits for before/after matching?
- Is issue disappearance best checked through latest RBL issues or a specific new snapshot?
- Should HTML insights be stripped to plain text in the MCP server or returned as markdown?
