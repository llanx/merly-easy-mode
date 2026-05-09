# Codex MCP Config Example

Example local Codex config for the Merly MCP server.

Generate a machine-specific proposal from the repository root:

```powershell
npm run setup -- --client codex --dry-run
```

The command prints the detected MCP server path, the expected user-level config path, and the TOML block to add.

Use absolute paths for your checkout:

```toml
[mcp_servers.merly]
command = "node"
args = ["<checkout>/mcp-server/src/server.js"]
cwd = "<checkout>/mcp-server"
startup_timeout_sec = 10
tool_timeout_sec = 60
default_tools_approval_mode = "approve"
```

The MCP server loads credentials from `mcp-server/.env` when started from the MCP server directory or from the server package path. Keep local credentials there instead of putting secrets directly in `config.toml`.

For unauthenticated smoke testing, `merly_auth_status` and `merly_health` work without credentials.

Protected tools such as `merly_list_repositories`, `merly_get_fix_candidates`, `merly_get_issue_bundle`, `merly_verify_snippet`, and `merly_verify_file` require one of:

```text
MERLY_API_KEY
MERLY_BEARER_TOKEN
```

`merly_verify_snippet` and `merly_verify_file` can also use:

```text
MERLY_DIF_API_KEY
```

## Local Validation

After adding the config, verify Codex can see and call the server:

```powershell
codex mcp get merly
codex exec --skip-git-repo-check -C <checkout> "Use the merly MCP server's merly_health tool and report only whether it succeeded."
```

Expected result: `codex mcp get merly` shows the server as configured, and the exec probe reports that the Merly health call succeeded.
