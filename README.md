# Merly Easy Mode

Lightweight integration layer for using Merly Mentor with AI coding agents.

The goal is to make Merly easy to connect without forcing a specific development workflow:

1. Run the local Merly Mentor app.
2. Start the Merly MCP server.
3. Connect an AI coding agent such as Codex.
4. Let the agent read Merly issues, make focused code edits, run validation, and verify the result.

This repository should contain only integration code, documentation, and local development helpers. Do not commit Merly binaries, local runtime state, API keys, logs, user data, or model files.

## Project Shape

```text
merly-codex-integration/
  docs/
    engineering-plan.md
    auth-setup.md
    codex-config-example.md
  mcp-server/
    README.md
  skill/
    README.md
```

## Integration Pieces

Use both a Codex skill and an MCP server:

- The MCP server exposes typed tools backed by the local Merly Mentor API.
- The Codex skill describes the repeatable automated-fix workflow.
- Codex owns local source-code edits and test execution.
- Merly provides issue discovery, code insight, and post-fix verification.

Start with:

- [mcp-server/README.md](mcp-server/README.md) for MCP setup and smoke commands.
- [docs/merly-openapi-summary.md](docs/merly-openapi-summary.md) for the sanitized Merly API subset the MCP server should wrap.
- [docs/codex-config-example.md](docs/codex-config-example.md) for local Codex MCP wiring.
- [docs/auth-setup.md](docs/auth-setup.md) for configuring Merly API credentials.
- [docs/unreal-validation.md](docs/unreal-validation.md) for optional Unreal validation helpers used by local repair workflows.

## Public Repo Checks

Before publishing or opening a pull request, run:

```powershell
npm run check:public-clean
```

This checks public files for private workflow artifacts and local-only process references.
