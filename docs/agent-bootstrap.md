# Agent Bootstrap

Merly Easy Mode supports an agent-assisted first run. A cloned repository cannot safely force Codex or Claude to execute setup before the user starts a session, but repository instruction files can make the first agent turn detect setup state and offer to walk the user through bootstrap.

## Contract

Root instruction files provide the agent entrypoints:

- `AGENTS.md` for Codex.
- `CLAUDE.md` for Claude-compatible clients.

Both files tell the agent to run a read-only status command:

```powershell
npm run merly -- bootstrap status --client codex --json
npm run merly -- bootstrap status --client claude --json
```

If `needs_bootstrap` is `true`, the agent asks whether to walk through setup. If the user approves, the agent runs Easy Mode and stops before writing credentials, user-level config, repository registrations, or commits unless the user explicitly approves that action.

## Status Command

The status command checks local bootstrap state and the files needed for agent setup:

- Node version.
- Git workspace detection.
- MCP server entrypoint.
- MCP server dependencies.
- Local `.env` presence.
- Agent pack presence.
- Root instruction file presence.
- Expected user-level agent config file presence.

The command writes nothing. It exits successfully when setup is incomplete so agents can parse JSON and decide what to offer.

Example fields:

```json
{
  "schema_version": "merly-easy.bootstrap-status.v1",
  "client": "codex",
  "first_run": true,
  "ready": false,
  "needs_bootstrap": true,
  "blockers": [],
  "warnings": ["local_env", "agent_config"],
  "recommended_next_command": "npm run easy -- --client codex"
}
```

## Completion State

When Easy Mode completes without blockers, it records an ignored local state file:

```text
.merly-local/bootstrap-state.json
```

This state file is intentionally local-only. It prevents repeated first-run prompts in the same checkout without adding machine-specific state to the public repository.

## Agent Flow

The intended first-run flow is:

1. User clones the repository.
2. User starts Codex or Claude in the repository.
3. Agent reads the root instruction file.
4. Agent runs `bootstrap status`.
5. Agent offers setup if `needs_bootstrap` is true.
6. User approves.
7. Agent runs Easy Mode, credential setup, config proposal, and smoke checks.
8. User restarts the client if required by MCP config changes.
9. Agent verifies `merly_health` through MCP.

This keeps the repository lightweight while still supporting a guided under-10-minute path for first-time users.
