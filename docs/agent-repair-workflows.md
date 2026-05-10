# Agent Repair Workflows

This guide describes how Codex or Claude should use Merly findings after setup is complete and the local `merly` MCP server is available.

Merly Easy Mode is workflow-neutral. The agent should not assume a single repair style. When the user asks to repair Merly findings but does not name a mode, the agent asks which mode to use:

```text
Which Merly repair mode should I use: single issue, guarded batch, or report-driven campaign?
```

## Source Of Truth

Live Merly MCP queries are the primary source for current issue state, candidate selection, and verification. Use exported reports only as optional context, historical evidence, or handoff material. A report can explain why a user cares about a finding, but it does not prove the finding is still open.

Start repair work by checking live state with the available MCP tools, usually `merly_health`, `merly_resolve_workspace`, candidate or bundle queries, and then Merly verification or re-analysis after local validation.

## Mode 1: Single-Issue Repair Loop

Use this mode for focused repairs, especially when the user names one issue or asks for the safest small fix.

1. Check Merly health and resolve the workspace.
2. Select one issue from a user-provided id or a live candidate query.
3. Read the issue bundle and any available expression insights.
4. Read the local source before editing.
5. Make the smallest focused source change that addresses the issue.
6. Run the relevant local tests, type checks, linters, or app-specific validation.
7. Verify the changed code with `merly_verify_file` or `merly_verify_snippet`.
8. If repository-level proof is needed, re-analyze and compare the issue after local validation.
9. Report the edit, local validation, Merly evidence, skipped checks, and remaining uncertainty.

## Mode 2: Guarded Batch Loop

Use this mode for small batches when the user explicitly wants the agent to continue through multiple fix candidates. Batch mode is still one issue at a time.

1. Plan the batch with live Merly state, using `merly_plan_batch_fixes` when available.
2. Keep the batch small. Use no more than three issues unless the user explicitly asks for a larger guarded batch.
3. Repair only the first planned issue.
4. Run local validation.
5. Verify or re-analyze the issue before continuing.
6. Assess the batch outcome with `merly_assess_batch_progress` when available.
7. Continue only when the completed issue is resolved or otherwise safe to continue, and the next issue is still suitable.

Stop the batch on validation failure, dirty-worktree ambiguity, a failed or unchanged Merly outcome, a needs-review outcome, missing verification, or any batch assessment that says not to continue.

## Mode 3: Report-Driven Campaign

Use this mode when the user wants to work through a larger Merly output, a saved report, a team milestone, or a subsystem/owner slice.

The report or slice is planning context, not current truth. The agent starts by drafting a repair campaign plan before editing. The plan should name the slice, intended order, candidate selection criteria, validation strategy, expected Merly evidence, and stop conditions.

The agent asks before editing any slice. After approval, each repair inside the campaign still follows either the single-issue loop or the guarded batch loop, using live Merly MCP state to confirm the issue is current before editing.

Useful campaign slices include:

- Subsystem or path.
- Severity.
- Owner or team.
- Milestone or release goal.
- Report context or exported analysis theme.

## Commit And Registration Policy

Agents ask before repository registration, Git commits, user-level config writes, or broad edits. Local validation comes before any commit request.

If Merly needs Git visibility for repository-level re-analysis, first run a dry-run visibility check such as `merly_prepare_git_visibility`. Commit only after the user approves, and include only the intended target files. Never use broad staging for Merly repair work.

## Final Report

Every repair result should include:

- Repair mode used.
- Issue id or campaign slice.
- Files changed.
- Local validation run and result.
- Merly verification or re-analysis evidence.
- Checks skipped and why.
- Remaining uncertainty or follow-up needed.
