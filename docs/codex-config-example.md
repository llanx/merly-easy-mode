# Codex MCP Config Example

Example local Codex config for the Merly Mentor MCP prototype.

Use the absolute path for your checkout:

```toml
[mcp_servers.merly]
command = "node"
args = ["C:/Users/matts/merly/merly-codex-integration/mcp-server/src/server.js"]
cwd = "C:/Users/matts/merly/merly-codex-integration/mcp-server"
startup_timeout_sec = 10
tool_timeout_sec = 60
default_tools_approval_mode = "approve"
```

The MCP server loads `mcp-server/.env` from its `cwd`, so keep local credentials there instead of putting secrets directly in `config.toml`.

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
codex exec --skip-git-repo-check -C C:\Users\matts\merly\merly-codex-integration "Use the merly MCP server's merly_health tool and report only whether it succeeded."
```

Expected result: `codex mcp get merly` shows `default_tools_approval_mode: approve`, and the exec probe reports `Succeeded`.
