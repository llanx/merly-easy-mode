# Quickstart

This is the shortest path for using the current Merly Easy Mode repository as an adapter.

## Prerequisites

- Node.js 20 or newer.
- A local Merly Mentor install running on the default bridge URL: `http://127.0.0.1:4201`. See [docs/merly-install-start.md](docs/merly-install-start.md) if Merly is not installed or running.
- A Merly API key, bearer token, or DIF-only key for the tools you want to use.

## Install

```powershell
git clone <this-repository-url>
cd <checkout>\mcp-server
npm install
Copy-Item .env.example .env
```

On macOS or Linux shells:

```sh
git clone <this-repository-url>
cd <checkout>/mcp-server
npm install
cp .env.example .env
```

Edit `mcp-server/.env` and set at least one credential:

```text
MERLY_API_KEY=your-key
# or
MERLY_DIF_API_KEY=your-dif-key
```

Or let the root CLI write a UI-created key to the ignored env file:

```powershell
$env:MERLY_API_KEY = "<returned-key>"
npm run merly -- auth --flow ui --from-env --write
Remove-Item Env:\MERLY_API_KEY
```

## Smoke Test

From the repository root:

```powershell
npm run easy -- --client codex
npm run merly -- doctor
npm run mcp:smoke
```

Expected result:

- The command lists Merly MCP tools.
- `api_health` is `ok`.
- Credential status reflects the keys you configured.

## Connect An Agent

If you open Codex or Claude in the repository first, the root agent instruction files ask the agent to run a read-only bootstrap check and offer guided setup when the checkout is not ready.

You can run the same check directly:

```powershell
npm run merly -- bootstrap status --client codex --json
npm run merly -- bootstrap status --client claude --json
```

Easy Mode prints a config proposal and verification guidance:

```powershell
npm run easy -- --client codex
npm run easy -- --client claude
```

Generate a dry-run config proposal for your preferred agent:

```powershell
npm run setup -- --client codex --dry-run
npm run setup -- --client claude --dry-run
```

After reviewing the target path and proposed config, apply it with an explicit confirmation flag:

```powershell
npm run setup -- --client codex --write --confirm-write
npm run setup -- --client claude --write --confirm-write
```

The setup command backs up an existing config file before it changes the `merly` MCP entry. It does not write credentials.

Use [docs/codex-config-example.md](docs/codex-config-example.md) for Codex or [docs/claude-config-example.md](docs/claude-config-example.md) for Claude. Replace `<checkout>` with your local repository path when using the static examples.

After the agent can see the MCP server, ask it to inspect the repository with Merly, choose one safe issue, run validation, and verify the change.

See [docs/agent-bootstrap.md](docs/agent-bootstrap.md) for the agent-assisted first-run flow.

## Useful Commands

```powershell
npm run easy -- --client codex
npm run easy -- --client claude --dry-run
npm run merly -- bootstrap status --client codex --json
npm run setup -- --client codex --dry-run
npm run setup -- --client codex --write --confirm-write
npm run setup -- --client claude --dry-run
npm run merly -- doctor
npm run merly -- auth
npm run merly -- spec preflight --spec fixtures/specs/markdown-basic.md
npm run merly -- spec verify --spec fixtures/specs/markdown-basic.md --changed
npm run merly -- spec verify --spec fixtures/specs/markdown-basic.md --changed --fail-on merly-failure
npm run merly -- spec report --input .merly-local/spec-reports/markdown-basic-spec-report.json
npm run mcp:smoke
npm run check:public-clean
npm run release:check
```

`npm run release:check` runs the public release gate. It expects Merly to be running because it includes MCP smoke validation.
