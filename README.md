# Merly Easy Mode

Lightweight integration layer for using Merly Mentor with AI coding agents.

The goal is to make Merly easy to connect without forcing a specific development workflow. The repo provides one MCP server, setup guidance for Codex and Claude, and the `merly-easy` onboarding CLI.

1. Run the local Merly Mentor app.
2. Start the Merly MCP server.
3. Connect an AI coding agent such as Codex or Claude.
4. Let the agent read Merly issues, make focused code edits, run validation, and verify the result.

This repository should contain only integration code, documentation, and local development helpers. Do not commit Merly binaries, local runtime state, API keys, logs, user data, or model files.

## Project Shape

```text
merly-codex-integration/
  AGENTS.md
  CLAUDE.md
  QUICKSTART.md
  agent-packs/
    claude/
    codex/
  bin/
    merly-easy.js
  docs/
    auth-setup.md
    agent-bootstrap.md
    claude-config-example.md
    codex-config-example.md
    merly-install-start.md
    release-checklist.md
    spec-adapters.md
    troubleshooting.md
  lib/
    spec-adapters.js
    spec-policies.js
    spec-reports.js
  mcp-server/
    README.md
  scripts/
    check-public-clean.js
    release-check.js
  skill/
    README.md
```

## Modes

- **Adapter Mode:** for users who already have Merly running and want to wire an AI coding agent to the MCP server.
- **Easy Mode:** the guided path for first-time users to check Merly, verify credentials, connect an agent, and reach a first useful Merly prompt.
- **Spec Hooks:** optional commands for teams that want extracted requirements, advisory Merly evidence, reports, and opt-in CI policy flags.

## Commands

The public CLI entrypoint is `merly-easy`. During local development, use npm wrappers:

```powershell
npm run easy -- --dry-run
npm run merly -- bootstrap status --client codex --json
npm run easy -- --client codex
npm run setup -- --client codex --dry-run
npm run setup -- --client codex --write --confirm-write
npm run setup -- --client claude --dry-run
npm run merly -- doctor
npm run merly -- auth --flow ui --dry-run
npm run merly -- spec preflight --spec <spec-file> --dry-run
npm run merly -- spec verify --spec <spec-file> --changed --dry-run
npm run merly -- spec report --input <report-json>
npm run release:check
```

## Integration Pieces

- The MCP server exposes typed tools backed by the local Merly Mentor API.
- Root `AGENTS.md` and `CLAUDE.md` files let Codex and Claude detect first-run state and offer guided bootstrap.
- The Codex and Claude agent packs describe the repeatable automated-fix workflow.
- The connected AI agent owns local source-code edits and test execution.
- Merly provides issue discovery, code insight, and post-fix verification.

Start with:

- [QUICKSTART.md](QUICKSTART.md) for the shortest clone-to-smoke path.
- [docs/agent-bootstrap.md](docs/agent-bootstrap.md) for the agent-assisted first-run flow.
- [mcp-server/README.md](mcp-server/README.md) for MCP setup and smoke commands.
- [docs/merly-openapi-summary.md](docs/merly-openapi-summary.md) for the sanitized Merly API subset the MCP server wraps.
- [docs/codex-config-example.md](docs/codex-config-example.md) for local Codex MCP wiring.
- [docs/claude-config-example.md](docs/claude-config-example.md) for local Claude MCP wiring.
- [agent-packs/](agent-packs/) for optional agent instructions and config examples.
- [docs/merly-install-start.md](docs/merly-install-start.md) for installing or starting Merly when the local bridge is unavailable.
- [docs/auth-setup.md](docs/auth-setup.md) for configuring Merly API credentials.
- [docs/spec-adapters.md](docs/spec-adapters.md) for optional requirement extraction from common spec formats.
- [docs/troubleshooting.md](docs/troubleshooting.md) for common setup issues.
- [docs/release-checklist.md](docs/release-checklist.md) for public release verification.
- [docs/unreal-validation.md](docs/unreal-validation.md) for optional Unreal validation helpers.

## Public Repo Checks

Before publishing or opening a pull request, run:

```powershell
npm test
npm run smoke
npm run release:check
```

`npm run smoke` and `npm run release:check` expect the local Merly bridge to be running for MCP smoke validation.
