# Codex Agent Pack

Workflow-neutral files for connecting Codex to the shared Merly MCP server.

## Files

- `config.example.toml`: Codex MCP config snippet using `<checkout>` placeholders.
- `skill/SKILL.md`: optional Codex skill instructions for Merly-guided repair work.
- `skill/agents/openai.yaml`: optional Codex skill metadata.

## Setup

From the repository root:

```powershell
npm run setup -- --client codex --dry-run
```

The dry run prints the detected MCP server path, the target Codex config path, and the exact proposed TOML without writing files.

After reviewing the target path and proposed config, apply it with:

```powershell
npm run setup -- --client codex --write --confirm-write
```

The write path backs up an existing config file and updates only the `[mcp_servers.merly]` entry. It does not write credentials.

After wiring the config, run:

```powershell
codex mcp get merly
```

When Codex starts in the repository, the root `AGENTS.md` file tells it to check bootstrap status and offer guided setup if needed.
