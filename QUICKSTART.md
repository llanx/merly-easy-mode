# Quickstart

This is the shortest path for using the current Merly Easy Mode repository as an adapter.

## Prerequisites

- Node.js 20 or newer.
- A local Merly Mentor install running on the default bridge URL: `http://127.0.0.1:4201`.
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

## Smoke Test

From the repository root:

```powershell
npm run mcp:smoke
```

Expected result:

- The command lists Merly MCP tools.
- `api_health` is `ok`.
- Credential status reflects the keys you configured.

## Connect An Agent

Generate a dry-run config proposal for your preferred agent:

```powershell
npm run setup -- --client codex --dry-run
npm run setup -- --client claude --dry-run
```

Use [docs/codex-config-example.md](docs/codex-config-example.md) for Codex or [docs/claude-config-example.md](docs/claude-config-example.md) for Claude. Replace `<checkout>` with your local repository path when using the static examples.

After the agent can see the MCP server, try:

```text
Use Merly to inspect this repository, choose one safe issue, fix it, run validation, and verify the change.
```

## Current And Planned Commands

Current:

```powershell
npm run easy -- --dry-run
npm run setup -- --client codex --dry-run
npm run setup -- --client claude --dry-run
npm run merly -- doctor
npm run mcp:smoke
npm run check:public-clean
```

Planned:

```powershell
npm run easy
npm run merly -- spec verify --spec <spec-file> --changed
```

The planned commands are part of the Merly Easy Mode roadmap and should be implemented through the public CLI.
