# Merly Easy Mode

Connect Merly Mentor to AI coding agents through MCP so Codex, Claude, and compatible clients can inspect Merly findings, make focused local fixes, run validation, and verify the result.

This repository is the lightweight public integration layer around a local Merly Mentor install. It provides a Merly MCP server, guided first-run setup, Codex and Claude agent instructions, Merly-guided repair workflows, and optional spec verification helpers.

## What It Does

Merly Easy Mode helps you move from "Merly is running locally" to "my coding agent can use Merly evidence while editing code."

1. Start the local Merly Mentor app.
2. Run the Merly MCP server from this repository.
3. Connect an agent such as Codex or Claude.
4. Ask the agent to inspect live Merly issues, choose a safe repair, edit locally, run tests, and verify with Merly.

## Features

- **Guided onboarding:** `merly-easy` checks local setup, credentials, MCP configuration, and agent readiness.
- **MCP server for Merly Mentor:** exposes Merly health, auth status, repository discovery, issue lookup, candidate ranking, DIF verification, snapshot re-analysis, and repair outcome checks.
- **Codex and Claude setup:** includes root agent instructions plus optional agent packs and config examples for both clients.
- **Merly-guided repair workflows:** supports single-issue repairs, guarded batch repairs, and report-driven repair campaigns.
- **DIF verification:** lets agents verify snippets or files through Merly without hand-copying code into a separate flow.
- **Git visibility guardrails:** helps agents avoid misleading re-analysis when local edits are uncommitted or invisible to Merly.
- **Spec hooks:** extracts requirement-like items from supported spec formats and writes advisory verification reports.
- **Public release checks:** includes scripts to keep binaries, credentials, logs, local state, and user data out of the public repo.

## Quickstart

Prerequisites:

- Node.js 20 or newer.
- A local Merly Mentor install running on `http://127.0.0.1:4201`.
- A Merly API key, bearer token, or DIF-only key for the tools you want to use.

Install the MCP server dependencies:

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

Set at least one credential in `mcp-server/.env`:

```text
MERLY_API_KEY=your-key
# or
MERLY_DIF_API_KEY=your-dif-key
```

Then run the guided setup from the repository root:

```powershell
cd <checkout>
npm run easy -- --client codex
npm run merly -- doctor
npm run mcp:smoke
```

For Claude, use:

```powershell
npm run easy -- --client claude
```

If you want to review MCP config before writing it, generate a dry-run proposal first:

```powershell
npm run setup -- --client codex --dry-run
npm run setup -- --client claude --dry-run
```

Apply the proposed config only after reviewing the target path:

```powershell
npm run setup -- --client codex --write --confirm-write
npm run setup -- --client claude --write --confirm-write
```

## Example Agent Request

After your agent can see the `merly` MCP server, ask it something like:

```text
Use Merly to inspect this repository, pick one safe fix candidate, make the local code edit, run the relevant validation, and verify whether the issue is resolved.
```

The agent should use live Merly MCP state for current issues and verification. Exported reports are useful planning context, but they do not prove an issue is still open.

## Common Commands

```powershell
npm run easy -- --client codex
npm run easy -- --client claude
npm run merly -- bootstrap status --client codex --json
npm run merly -- bootstrap status --client claude --json
npm run merly -- doctor
npm run merly -- auth --flow ui --dry-run
npm run setup -- --client codex --dry-run
npm run setup -- --client codex --write --confirm-write
npm run merly -- spec preflight --spec fixtures/specs/markdown-basic.md
npm run merly -- spec verify --spec fixtures/specs/markdown-basic.md --changed
npm run mcp:smoke
npm run release:check
```

## Project Layout

```text
merly-easy-mode/
  AGENTS.md                  Codex first-run and repair instructions
  CLAUDE.md                  Claude first-run and repair instructions
  QUICKSTART.md              Shortest clone-to-smoke setup path
  agent-packs/               Optional Codex and Claude agent pack files
  bin/merly-easy.js          Public CLI entrypoint
  docs/                      Setup, auth, workflow, and release docs
  lib/                       Spec adapter and report helpers
  mcp-server/                Merly MCP server
  scripts/                   Smoke, release, and public hygiene checks
  skill/                     Codex skill instructions for Merly repair work
```

## Documentation

- [QUICKSTART.md](QUICKSTART.md) for the shortest setup path.
- [docs/agent-bootstrap.md](docs/agent-bootstrap.md) for the agent-assisted first-run flow.
- [docs/agent-repair-workflows.md](docs/agent-repair-workflows.md) for supported Merly repair modes.
- [mcp-server/README.md](mcp-server/README.md) for MCP server setup and debug commands.
- [docs/auth-setup.md](docs/auth-setup.md) for Merly API credential setup.
- [docs/codex-config-example.md](docs/codex-config-example.md) for Codex MCP wiring.
- [docs/claude-config-example.md](docs/claude-config-example.md) for Claude MCP wiring.
- [docs/spec-adapters.md](docs/spec-adapters.md) for optional requirement extraction and advisory reports.
- [docs/troubleshooting.md](docs/troubleshooting.md) for common setup issues.
- [docs/release-checklist.md](docs/release-checklist.md) for public release verification.

## Public Repo Hygiene

This repository should contain integration code, documentation, and local development helpers only. Do not commit Merly binaries, runtime state, API keys, logs, user data, generated reports, model files, or user-level agent config files.

Before publishing or opening a pull request, run:

```powershell
npm test
npm run smoke
npm run release:check
```

`npm run smoke` and `npm run release:check` expect the local Merly bridge to be running for MCP smoke validation.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
