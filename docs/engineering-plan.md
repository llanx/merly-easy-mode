# Engineering Plan: Merly Mentor + Codex Integration

## Objective

Build a prototype that lets Codex use Merly Mentor as a local analysis engine, then apply automated code fixes in the active repository.

The intended workflow is:

```text
Merly Mentor local API -> Merly MCP server -> Codex skill -> Codex edits repo -> tests -> Merly re-check
```

## Current Findings

Merly Mentor exposes a local web UI and API:

- UI: `http://localhost:4202`
- Bridge API: `http://localhost:4201`
- Daemon/status API: `http://localhost:4200`
- OpenAPI specs:
  - `http://localhost:4201/swagger-v2.yaml`
  - `http://localhost:4202/api/v2/swagger-v2.yaml`

The useful control surface is the local HTTP/OpenAPI API, not the console commands. Observed console commands are mainly service lifecycle and install operations.

Important API areas found in the Swagger spec:

- Authentication: `/auth/login`, `/auth/token`, `/auth/logout`
- API keys/current identity: `/me`, `/me/api-keys`, usage, limits, funding
- Repositories: `/repositories`, `/repositories/{repository_id}`
- Branches: `/repositories/{repository_id}/branches`, `/branches/{branch_id}`
- RBLs: `/rbls`, `/branches/{branch_id}/rbls`, `/rbls/{rbl_id}`
- Snapshots: `/rbls/{rbl_id}/snapshots`
- Issues: `/rbls/{rbl_id}/issues`, snapshot issue endpoints
- Files and versions: `/rbls/{rbl_id}/files`
- Expressions and insights: expression and issue insight endpoints
- Jobs: `/jobs/{job_key}`
- Reports and search
- DIF verification: `/dif/verify`, `/dif/languages`, feedback and usage endpoints

## Architecture

### 1. MCP Server

The MCP server should be the live integration layer between Codex and Merly.

Responsibilities:

- Connect to `MERLY_BASE_URL`, initially `http://127.0.0.1:4201`.
- Authenticate using `MERLY_API_KEY` or a bearer token.
- Hide raw endpoint complexity behind high-level tools.
- Return small, structured results Codex can act on.
- Avoid direct file edits. Codex should edit the repository itself.

Initial read-oriented tools:

```text
merly_auth_status
merly_status
merly_health
merly_resolve_workspace
merly_list_repositories
merly_get_repo_analysis_context
merly_list_rbls
merly_get_rbl
merly_get_fix_candidates
merly_get_issue_bundle
merly_list_files
merly_get_expression_insights
merly_verify_snippet
merly_start_snapshot
merly_poll_job
merly_compare_issue_state
```

Later write-oriented tools:

```text
merly_create_repository
merly_create_snapshot
merly_update_issue_status
merly_create_watch_config
merly_cancel_job
```

Tools to defer until the prototype is proven:

```text
merly_delete_repository
merly_manage_users
merly_rotate_api_keys
merly_update_global_settings
```

### 2. Codex Skill

The skill should define the repair loop and tell Codex how to use the MCP tools.

Skill trigger examples:

- "Use Merly to fix this repo"
- "Run Merly Mentor and repair issues"
- "Fix the top Merly issue"
- "Use Mentor score to guide cleanup"
- "Verify this code with Merly DIF"

Skill workflow:

1. Check Merly status.
2. Resolve the current git workspace to a Merly repository, branch, and RBL.
3. Request fix candidates.
4. Select a small batch, usually 1 to 3 issues.
5. Read the relevant source files locally.
6. Make focused code edits.
7. Run the repository's tests, type checks, or linters.
8. Use Merly verification or snapshot creation to re-check the changed area.
9. Compare issue state before and after.
10. Report files changed, validation results, Merly results, and remaining issues.

### 3. Codex Responsibilities

Codex should:

- Inspect source files before editing.
- Make small, reviewable patches.
- Preserve existing project style.
- Run available tests or validation commands.
- Use Merly output as guidance, not as unquestioned truth.
- Explain any issue it skipped.

Codex should not:

- Rely on UI automation.
- Rewrite large unrelated areas.
- Modify Merly installation files.
- Commit local Merly runtime data.
- Store secrets in the repository.

## First Vertical Slice

Target user prompt:

```text
Use Merly to fix the top issue in this repo.
```

Expected flow:

1. MCP calls `merly_status`.
2. MCP resolves the current workspace to a Merly repository and branch.
3. MCP finds the latest RBL/snapshot.
4. MCP returns the highest-value fix candidate.
5. Codex opens the relevant local file.
6. Codex edits the code.
7. Codex runs tests or a targeted validation command.
8. MCP calls `merly_verify_snippet` or starts a new snapshot.
9. Codex reports the result.

Success criteria:

- Codex can obtain at least one actionable Merly issue.
- Codex can map that issue to a local file.
- Codex can make a targeted edit.
- Tests or validation run locally.
- Merly verification or re-analysis runs after the change.
- Final output includes before/after status.

## Suggested MCP Tool Contracts

### `merly_get_fix_candidates`

Returns a ranked list of actionable issues.

Example response:

```json
{
  "candidates": [
    {
      "issue_id": "123:0",
      "repository_id": 12,
      "rbl_id": 45,
      "snapshot_id": 91,
      "branch": "main",
      "language": "PYTHON",
      "file": "src/foo.py",
      "severity": "high",
      "summary": "Complex conditional logic",
      "recommendation": "Split into smaller predicates",
      "confidence": 0.82
    }
  ]
}
```

### `merly_get_issue_bundle`

Returns enough context for Codex to understand and fix one issue.

Example response:

```json
{
  "issue_id": "123:0",
  "file": "src/foo.py",
  "symbol": "calculate_total",
  "snippet": "def calculate_total(...): ...",
  "insights": [
    "The function mixes eligibility checks and price calculation."
  ],
  "suggested_fix_shape": "Extract eligibility predicates and keep pricing logic linear."
}
```

### `merly_compare_issue_state`

Compares the selected issue before and after a fix attempt.

Example response:

```json
{
  "issue_id": "123:0",
  "before": "open",
  "after": "resolved",
  "score_delta": 7.5,
  "notes": "Issue no longer appears in latest snapshot."
}
```

## Implementation Phases

### Phase 1: Documentation and Skeleton

- Create this repository.
- Save OpenAPI summaries under `docs/`.
- Add a placeholder MCP server package.
- Add a placeholder Codex skill.

### Phase 2: Read-Only MCP

- Implement Merly API client.
- Add status and health tools.
- Add repository, branch, RBL, issue, and file lookup tools.
- Add workspace resolution from local git remote and branch.

### Phase 3: Automated Fix Loop

- Add `merly_get_fix_candidates`.
- Add `merly_get_issue_bundle`.
- Add skill instructions for the repair loop.
- Test against one local repository.

### Phase 4: Verification

- Add `merly_verify_snippet`.
- Add snapshot creation and job polling.
- Add before/after comparison.

### Phase 5: Packaging

- Add Codex MCP config examples.
- Add `agents/openai.yaml` for the skill.
- Package as a Codex plugin if the workflow should be shared.

## Open Questions

- Which Merly endpoint provides the best issue ranking for automated fixes?
- What is the most stable way to map a Merly issue back to an exact local file and line range?
- Should the prototype use Mentor API keys, JWT login, or both?
- How expensive or slow is snapshot creation for typical repositories?
- Does DIF verification work better for small snippets or full function bodies?
- Which issue types are safe enough for automated fixing without manual review?

## Prototype Bias

Favor the smallest reliable loop:

```text
one repo -> one issue -> one file edit -> one validation run -> one Merly re-check
```

Once that loop works, expand to batch repair and richer verification.
