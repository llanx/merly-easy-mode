# Claude Agent Pack

Workflow-neutral files for connecting Claude-compatible MCP clients to the shared Merly MCP server.

## Files

- `mcp-config.example.json`: MCP config snippet using `<checkout>` placeholders.
- `CLAUDE.md`: optional project instructions for Merly-guided repair work.

## Setup

From the repository root:

```powershell
npm run setup -- --client claude --dry-run
```

The dry run prints the detected MCP server path, the target Claude config path, and the exact proposed JSON without writing files.

After reviewing the target path and proposed config, apply it with:

```powershell
npm run setup -- --client claude --write --confirm-write
```

The write path backs up an existing config file and updates only the `mcpServers.merly` entry. It does not write credentials.

After wiring the config, restart the client. When Claude starts in the repository, the root `CLAUDE.md` file tells it to check bootstrap status and offer guided setup if needed.
