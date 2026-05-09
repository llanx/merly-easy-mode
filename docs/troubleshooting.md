# Troubleshooting

## Merly Health Fails

Check that the Merly app is running and that the bridge URL is reachable:

```text
http://127.0.0.1:4201/api/v2/health
```

If your bridge runs on a different URL, set:

```text
MERLY_BASE_URL=http://host:port
```

in `mcp-server/.env`.

Use [merly-install-start.md](merly-install-start.md) for Windows and macOS install/start guidance.

## CLI Help

The CLI scaffold should run without Merly:

```powershell
npm run merly -- --help
npm run easy -- --dry-run
npm run setup -- --client codex --dry-run
npm run merly -- doctor
```

## Credentials Are Missing

`merly_auth_status` and `merly_health` can run without credentials. Repository, issue, and verification tools need one of:

```text
MERLY_API_KEY
MERLY_BEARER_TOKEN
MERLY_DIF_API_KEY
```

Use [auth-setup.md](auth-setup.md) for setup paths.

The preferred CLI path is:

```powershell
$env:MERLY_API_KEY = "<returned-key>"
npm run merly -- auth --flow ui --from-env --write
Remove-Item Env:\MERLY_API_KEY
```

## PowerShell Blocks npm

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd run mcp:smoke
```

or run commands from another shell.

## Codex Cannot Find The MCP Server

Check that the Codex config uses absolute paths for your checkout:

```toml
args = ["<checkout>/mcp-server/src/server.js"]
cwd = "<checkout>/mcp-server"
```

Then run:

```powershell
codex mcp get merly
```

## Private Local Files Appear In Git

The following paths must stay ignored:

```text
.codex-private/
Specs-private/
.merly-local/
mcp-server/.env
mcp-server/node_modules/
```

Run:

```powershell
npm run check:public-clean
git status --short --ignored
```
