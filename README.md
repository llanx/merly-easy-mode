# Merly Easy Mode

Lightweight integration layer for using Merly Mentor with AI coding agents.

The goal is to make Merly easy to connect without forcing a specific development workflow. The repo provides one MCP server, setup guidance for Codex and Claude, and a path toward the `merly-easy` onboarding CLI.

1. Run the local Merly Mentor app.
2. Start the Merly MCP server.
3. Connect an AI coding agent such as Codex or Claude.
4. Let the agent read Merly issues, make focused code edits, run validation, and verify the result.

This repository should contain only integration code, documentation, and local development helpers. Do not commit Merly binaries, local runtime state, API keys, logs, user data, or model files.

## Project Shape

```text
merly-codex-integration/
  QUICKSTART.md
  agent-packs/
    claude/
    codex/
  docs/
    auth-setup.md
    claude-config-example.md
    codex-config-example.md
    troubleshooting.md
  mcp-server/
    README.md
  skill/
    README.md
```

## Modes

- **Adapter Mode:** for users who already have Merly running and want to wire an AI coding agent to the MCP server.
- **Easy Mode:** the planned guided path for first-time users to install/start Merly, configure credentials, connect an agent, and reach a first useful Merly prompt.
- **Spec Hooks:** planned optional commands for teams that want Merly evidence in their own specification-driven process.

## Commands

The public CLI entrypoint is `merly-easy`. During local development, use npm wrappers:

```powershell
npm run easy -- --dry-run
npm run setup -- --client codex --dry-run
npm run setup -- --client claude --dry-run
npm run merly -- doctor
npm run merly -- spec preflight --spec <spec-file> --dry-run
```

## Integration Pieces

- The MCP server exposes typed tools backed by the local Merly Mentor API.
- The Codex and Claude agent packs describe the repeatable automated-fix workflow.
- The connected AI agent owns local source-code edits and test execution.
- Merly provides issue discovery, code insight, and post-fix verification.

Start with:

- [QUICKSTART.md](QUICKSTART.md) for the shortest clone-to-smoke path.
- [mcp-server/README.md](mcp-server/README.md) for MCP setup and smoke commands.
- [docs/merly-openapi-summary.md](docs/merly-openapi-summary.md) for the sanitized Merly API subset the MCP server wraps.
- [docs/codex-config-example.md](docs/codex-config-example.md) for local Codex MCP wiring.
- [docs/claude-config-example.md](docs/claude-config-example.md) for local Claude MCP wiring.
- [agent-packs/](agent-packs/) for optional agent instructions and config examples.
- [docs/auth-setup.md](docs/auth-setup.md) for configuring Merly API credentials.
- [docs/troubleshooting.md](docs/troubleshooting.md) for common setup issues.
- [docs/unreal-validation.md](docs/unreal-validation.md) for optional Unreal validation helpers.

## Public Repo Checks

Before publishing or opening a pull request, run:

```powershell
npm run check:public-clean
```

This checks public files for private workflow artifacts and local-only process references.
