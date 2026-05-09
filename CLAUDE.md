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

Do not write user-level Claude config without explicit approval. If config changes require a Claude restart, say so and stop at the restart checkpoint.

5. After Claude can see the MCP server, call `merly_health` and report whether it succeeded.

## Safety Rules

- Do not register repositories in Merly unless the user explicitly approves.
- Do not create Git commits unless the user explicitly asks.
- Do not commit local runtime state, credentials, logs, model files, or installed binaries.
- Keep edits focused on public integration code, docs, examples, and tests.
- Before proposing a public change as complete, run `npm test` and `npm run check:public-clean`. Run `npm run smoke` when Merly is available.
