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

The setup command prints the detected MCP server path, the target Claude config path, and the exact proposed JSON. It does not write user-level config files.

After wiring the config, restart the client and try:

```text
Use Merly to inspect this repository, choose one safe issue, fix it, run validation, and verify the change.
```
