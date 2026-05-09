# Engineering Plan

## Objective

Make Merly Mentor available to AI coding agents through one local MCP server and a lightweight public onboarding layer.

The intended workflow is:

```text
Merly Mentor local API -> Merly MCP server -> AI coding agent -> local edits/tests -> Merly verification
```

## Current Architecture

Merly Mentor exposes a local web UI and API:

- UI: `http://localhost:4202`
- Bridge API: `http://localhost:4201`
- Daemon/status API: `http://localhost:4200`

The MCP server connects to `MERLY_BASE_URL`, defaults to `http://127.0.0.1:4201`, and exposes high-level tools instead of raw endpoint details.

Responsibilities:

- Report Merly health and credential status.
- Resolve local Git workspaces to Merly repository, branch, language, and snapshot context.
- Rank fix candidates with repair-readiness signals.
- Return compact issue bundles for agent-guided repairs.
- Verify snippets or local file ranges through Merly DIF.
- Start snapshot re-analysis and compare issue state.
- Help make a local repair commit/ref visible to Merly when repository-level proof is required.

The MCP server does not edit source files directly. The connected coding agent owns local source-code edits, test execution, and final reporting.

## Product Direction

Merly Easy Mode should support:

- Adapter Mode for users who already have Merly running and want MCP wiring.
- Easy Mode for first-time setup, including Merly install/start guidance, credentials, agent config, and smoke validation.
- Agent packs for Codex and Claude that use the same MCP server.
- Optional specification-driven hooks that generate Merly-backed evidence without requiring a specific workflow framework.

## Safety Rules

- Keep credentials in ignored local files such as `mcp-server/.env`.
- Do not commit Merly installers, app binaries, models, logs, runtime state, or analysis databases.
- Ask before writing user-level Codex or Claude config files.
- Treat Merly findings as analysis evidence, not automatic proof that a change should be made.
- Prefer small, validated repairs and snapshot-specific comparison when claiming a Merly issue was resolved.

## First Useful Agent Prompt

```text
Use Merly to inspect this repository, choose one safe issue, fix it, run validation, and verify the change.
```
