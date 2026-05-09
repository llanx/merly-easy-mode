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

## Standard Repair Loop

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

Do not register Merly runtime folders, generated build outputs, vendored dependencies, API keys, logs, model files, or installed binaries as target source repositories.

Do not create broad commits for Merly repairs. If Merly needs git visibility, use targeted files only and leave unrelated dirty files untouched unless the user explicitly permits including them.
