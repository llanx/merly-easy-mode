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

## MCP Smoke Fails During Release Checks

`npm run smoke` and `npm run release:check` include MCP smoke validation. They need the local Merly bridge to be running.

Run:

```powershell
npm run merly -- doctor
```

If doctor reports a bridge failure, start Merly and rerun:

```powershell
npm run mcp:smoke
```

## CLI Help

The CLI should run without Merly for help and dry-run flows:

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

## Claude Cannot Find The MCP Server

Regenerate the Claude config proposal:

```powershell
npm run setup -- --client claude --dry-run
```

Check that your MCP config uses absolute paths for the same checkout:

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

Restart the client after changing MCP config.

## Spec Verify Exits Nonzero

`spec verify` exits zero by default. A nonzero exit usually means `--fail-on` was supplied and the report matched a selected CI policy.

Run without policy flags to inspect the advisory report:

```powershell
npm run merly -- spec verify --spec fixtures/specs/markdown-basic.md --changed
```

Then read the generated Markdown report or render the JSON report:

```powershell
npm run merly -- spec report --input .merly-local/spec-reports/markdown-basic-spec-report.json
```

Use [spec-adapters.md](spec-adapters.md) for supported `--fail-on` policies.

## Spec Reports Are Missing

`spec verify --dry-run` does not write reports. Run without `--dry-run` or choose an output directory:

```powershell
npm run merly -- spec verify --spec fixtures/specs/markdown-basic.md --changed --output-dir .merly-local/spec-reports
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
