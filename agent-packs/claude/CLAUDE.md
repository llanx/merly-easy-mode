# Merly Mentor Project Instructions

Use the local `merly` MCP server when the user asks for Merly Mentor, Mentor Score, Merly issues, Merly DIF verification, repository registration, repository analysis, or Merly-guided repair.

Prefer these MCP tools when available:

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

## Repair Modes

When the user asks for Merly repair work but does not specify a mode, ask them to choose: single issue, guarded batch, or report-driven campaign.

- **Single issue:** repair one live Merly issue through local validation and Merly verification or re-analysis.
- **Guarded batch:** plan a small live batch, then validate and verify or re-analyze after each issue before continuing.
- **Report-driven campaign:** use a report, subsystem, severity, owner, or milestone as planning context; draft a campaign plan and ask before editing any slice.

Prefer live Merly MCP state for current candidates, issue bundles, verification, and re-analysis. Treat exported reports as optional context or handoff evidence, not authoritative current state.

## Single-Issue Repair Loop

1. Check `merly_auth_status` and `merly_health`.
2. Resolve the current workspace with `merly_resolve_workspace`.
3. If repository-level analysis is not available, use DIF-only verification on the changed code.
4. Choose a small, local issue from `merly_get_fix_candidates`.
5. Read the issue bundle before editing.
6. Make focused source changes only.
7. Run the repository's normal tests, type checks, or linters.
8. Verify the changed code with `merly_verify_file` or `merly_verify_snippet`.
9. Use repository-level re-analysis only when the user asks for it or when the task requires it.
10. Report changed files, validation results, Merly evidence, and skipped checks.

## Guarded Batch Loop

Use guarded batch mode only when the user explicitly asks for it:

1. Plan a small live batch with `merly_plan_batch_fixes` when available.
2. Keep the batch to three issues or fewer unless the user explicitly asks for more.
3. Repair only the first planned issue.
4. Validate locally, verify or re-analyze with Merly, and assess whether to continue.
5. Stop on validation failure, failed or unchanged Merly outcome, needs-review outcome, missing verification, dirty-worktree ambiguity, or any `should_continue_batch: false` result.

Batch mode never means editing multiple issues before validation and Merly verification or re-analysis.

## Report-Driven Campaign

Use report-driven campaign mode when the user wants to work through a larger report, subsystem, severity, owner, milestone, or other slice. Draft a repair campaign plan first and ask before editing any slice.

Reports are planning context rather than current truth. Confirm each issue against live Merly MCP state before editing, then repair it through the single-issue or guarded-batch loop.

Do not register Merly runtime folders, generated build outputs, vendored dependencies, API keys, logs, model files, or installed binaries as target source repositories.

Ask before repository registration, Git commits, user-level config writes, or broad edits. Do not create broad commits for Merly repairs. If Merly needs git visibility, use targeted files only and leave unrelated dirty files untouched unless the user explicitly permits including them. Report local validation, Merly evidence, skipped checks, and remaining uncertainty for every repair.
