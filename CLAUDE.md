# Claude Instructions

This repository is Merly Easy Mode: a lightweight adapter for connecting Merly Mentor to AI coding agents through MCP.

## First-Run Bootstrap

At the start of a Claude session in this checkout, run:

```powershell
npm run merly -- bootstrap status --client claude --json
```

If the returned JSON has `needs_bootstrap: true`, ask the user:

```text
Merly Easy Mode is not fully bootstrapped in this checkout. Do you want me to walk through setup now?
```

If the user approves, walk through setup in this order:

1. Install MCP server dependencies if `mcp_dependencies` failed:

```powershell
npm --prefix ./mcp-server install
```

2. Run the Easy Mode wizard:

```powershell
npm run easy -- --client claude
```

3. If credentials are missing, prefer the local UI-created API key flow:

```powershell
npm run merly -- auth --flow ui --open
```

Do not ask the user to paste API keys, account passwords, or bearer tokens into chat. Guide them to set credentials in their shell or use the ignored local env file.

4. Generate the Claude MCP config proposal:

```powershell
npm run setup -- --client claude --dry-run
```

Do not write user-level Claude config without explicit approval. If the user approves the target path and proposed config, apply it with:

```powershell
npm run setup -- --client claude --write --confirm-write
```

The setup command backs up an existing config before changing it. If config changes require a Claude restart, say so and stop at the restart checkpoint.

5. After Claude can see the MCP server, call `merly_health` and report whether it succeeded.

## Safety Rules

- Do not register repositories in Merly unless the user explicitly approves.
- Do not create Git commits unless the user explicitly asks.
- Do not commit local runtime state, credentials, logs, model files, or installed binaries.
- Ask before broad edits that span unrelated files, subsystems, or repair themes.
- Keep edits focused on public integration code, docs, examples, and tests.
- Before proposing a public change as complete, run `npm test` and `npm run check:public-clean`. Run `npm run smoke` when Merly is available.

## Merly Repair Modes

When the user asks Claude to repair Merly findings but does not specify a mode, ask them to choose: single issue, guarded batch, or report-driven campaign.

- **Single issue:** repair one live Merly issue through local validation and Merly verification or re-analysis.
- **Guarded batch:** plan a small live batch, then validate and verify or re-analyze after each issue before continuing.
- **Report-driven campaign:** use a report, subsystem, severity, owner, or milestone as planning context; draft a campaign plan and ask before editing any slice.

Prefer live Merly MCP state for current candidates, issue bundles, verification, and re-analysis. Treat exported reports as optional context or handoff evidence, not authoritative current state.

For every repair, report local validation, Merly verification or re-analysis evidence, skipped checks, and remaining uncertainty. See [docs/agent-repair-workflows.md](docs/agent-repair-workflows.md).
