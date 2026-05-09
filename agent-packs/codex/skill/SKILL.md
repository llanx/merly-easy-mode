---
name: merly-mentor
description: Use when the user wants Codex to use Merly Mentor, Mentor Score, Merly issues, Merly DIF verification, Merly repository registration/initialization, or Merly-guided automated code repair through MCP tools.
---

# Merly Mentor

Use this skill to guide code repair with Merly Mentor analysis.

Prefer MCP tools when available:

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

Detailed endpoint notes live in `docs/merly-openapi-summary.md` when the skill is used from this repository.

## Repository Initialization Workflow

Use this when repository-level Merly analysis or re-analysis is desired and `merly_resolve_workspace` does not return a repository, branch, and RBL.

1. Call `merly_auth_status` and `merly_health`.
2. Inspect the current git workspace path, branch, remote, and HEAD. Prefer the git root as the workspace path.
3. Call `merly_resolve_workspace` with the current workspace path and preferred language when known.
4. If the workspace still does not resolve and initialization is in scope, call `merly_create_repository` with the repository name, the local workspace path or stable remote URL as `git_url`, the current branch as `git_branch`, and a language hint when useful. Keep `run_infer_after_add` and `report_after_infer` enabled unless the user asks otherwise.
5. Poll any returned async job with `merly_poll_job`, then call `merly_resolve_workspace` and `merly_get_repo_analysis_context` again.
6. If the repository exists but the active branch is missing, call `merly_create_branch` and poll any returned fetch job before retrying context lookup.
7. Record repository id, branch id, RBL id, latest snapshot id, language, branch, and commit when those ids are needed for later review.
8. If initialization or resolution remains blocked, fall back to the DIF-only workflow and report that repository-level Merly evidence was skipped.

Do not register Merly runtime folders, generated build outputs, vendored dependencies, API keys, logs, model files, or installed binaries as target source repositories.

## Repair Workflow

1. Call `merly_health` and confirm bridge health, API health, and daemon state.
2. Call `merly_resolve_workspace` with the current repository path and preferred language when known.
3. If workspace resolution is ambiguous, call `merly_list_repositories` and `merly_get_repo_analysis_context`, then choose the closest repository, branch, and RBL.
4. Call `merly_get_fix_candidates` with `status=open` and a small limit.
5. Prefer candidates with `auto_fix_readiness: "candidate"`; treat `inspect_only`, `defer_until_insights_ready`, and `skip_early_prototype` as reasons to inspect or skip rather than patch automatically.
6. Call `merly_get_issue_bundle` for the selected issue.
7. If the bundle has pending expression insights, call `merly_wait_for_issue_insights` with a bounded timeout before deciding whether to edit.
8. Confirm the bundle `repair_readiness.auto_fix_readiness` is still suitable before editing. Missing or failed expression insights should lower confidence unless the local bug is obvious and testable.
9. Read the local source file before editing.
10. Make a focused code change that addresses the Merly issue without broad refactoring.
11. Run the repository's relevant tests, type checks, or linters.
12. Call `merly_verify_file` on the changed line range, or `merly_verify_snippet` on the changed function or smallest meaningful code block.
13. When a repository-level recheck is requested, call `merly_check_reanalysis_readiness` first with the target workspace path. If the workspace is dirty, report that Merly may not see the local patch; use `require_clean: true` when the user expects the recheck to prove the local fix.
14. If Merly needs a commit to see the patch, call `merly_prepare_git_visibility` in dry-run mode first. Only commit when the user explicitly asks or the current task explicitly requires a commit, and only include the intended target files.
15. Before method=`ref` re-analysis, call `merly_prepare_ref_visibility` in dry-run mode for the target commit. If it reports the commit is not visible but `can_fetch=true`, call it again with `fetch=true` instead of manually fetching Merly's clone.
16. If the patch is on a new branch, call `merly_create_branch` so Merly can fetch/register that branch; poll any returned fetch job before retrying or rechecking.
17. Call `merly_reanalyze_and_compare_issue` after local validation and readiness checks. Prefer its snapshot-specific comparison when present; use `merly_compare_issue_at_snapshot` if you need to inspect a specific snapshot directly.
18. Read `repair_outcome` from the comparison. If it is `failed_unchanged`, stop the automated repair path for that issue and either refine from insights or mark the candidate failed. If it is `resolved`, report success with the snapshot id/ref.
19. Report whether the issue disappeared, changed, or remains, and include whether the result came from a specific snapshot or the latest issue endpoint.
20. Report files changed, validation results, Merly verification result, re-analysis result when used, and remaining uncertainty.

Repository-level re-analysis may only see the branch/ref Merly analyzes. If the local target repository has uncommitted edits, say that the recheck may not include those edits unless the changed code is committed or otherwise made visible to Merly.

Prefer snapshot-specific repair outcomes over the latest issue endpoint when they disagree. The latest issue endpoint can lag or return stale issue data after a successful snapshot recheck.

Never create a broad commit for a Merly repair. Use targeted files only, never `git add .`, and leave unrelated dirty files untouched unless the user explicitly permits a targeted commit with unrelated dirt present.

## Candidate Selection

Prefer issues with:

- `status=open`
- high or critical severity
- clear `file_path`
- clear `file_line`
- short, non-empty `snippet`
- `action=fix` or `action=simplify`
- `auto_fix_readiness: "candidate"`
- local scope inside one file or function

Avoid automated fixes for:

- `auto_fix_readiness: "skip_early_prototype"`
- `auto_fix_readiness: "defer_until_insights_ready"`
- generated or vendored code
- test fixtures unless the user explicitly wants test-only cleanup
- generic guard-condition snippets without available expression insights
- migrations
- broad architecture changes
- auth/session/security logic unless the user explicitly asks
- changes that cannot be validated locally

## Batch Workflow

Use batch mode only for small guarded runs:

1. Call `merly_plan_batch_fixes` with `max_batch_size` no greater than 3 unless the user explicitly asks for more. The tool enforces a hard maximum of 5.
2. Repair only the first planned issue.
3. Validate locally, commit only the intended files if Merly needs git visibility, reanalyze, and read `repair_outcome`.
4. Call `merly_assess_batch_progress` with the planned issue ids and completed outcome.
5. Continue only when `should_continue` is true and `next_issue_id` is set.
6. Stop immediately on `failed_unchanged`, `needs_review`, `not_checked`, validation failure, dirty-worktree ambiguity, or any outcome with `should_continue_batch: false`.

Batch mode never means editing multiple issues before validation and reanalysis.

## DIF-Only Workflow

When repository issue discovery is blocked by missing full Mentor API credentials, use the DIF-only path:

1. Read the file or changed function.
2. Make the requested edit.
3. Run the repository's normal validation.
4. Call `merly_verify_file` with a narrow `start_line` and `end_line` around the changed code.
5. Report the DIF stream, verdict, scores, top finding, and event id.

## Output Expectations

Keep the final report short and concrete:

- issue id and file
- edit summary
- tests or validation run
- Merly verification result
- skipped work or blockers

Do not commit local Merly runtime data, API keys, logs, model files, or installed binaries.
