# Claude MCP Config Example

Example Claude-compatible MCP config for the Merly MCP server.

Generate a machine-specific proposal from the repository root:

```powershell
npm run setup -- --client claude --dry-run
```

The command prints the detected MCP server path, the expected user-level config path, and the JSON block to add.

Use absolute paths for your checkout:

```json
{
  "mcpServers": {
    "merly": {
      "command": "node",
      "args": ["<checkout>/mcp-server/src/server.js"],
      "cwd": "<checkout>/mcp-server"
    }
  }
}
```

The MCP server loads credentials from `mcp-server/.env` when started from the MCP server directory or from the server package path. Keep local credentials there instead of putting secrets directly in the agent config.

After updating the config, restart the client and ask it to call `merly_health`.
