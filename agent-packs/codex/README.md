# Codex Agent Pack

Workflow-neutral files for connecting Codex to the shared Merly MCP server.

## Files

- `config.example.toml`: Codex MCP config snippet using `<checkout>` placeholders.
- `skill/SKILL.md`: optional Codex skill instructions for Merly-guided repair work.
- `skill/agents/openai.yaml`: optional Codex skill metadata.

## Setup

From the repository root:

```powershell
npm run setup -- --client codex --dry-run
```

The setup command prints the detected MCP server path, the target Codex config path, and the exact proposed TOML. It does not write user-level config files.

After wiring the config, run:

```powershell
codex mcp get merly
```

Then try:

```text
Use Merly to inspect this repository, choose one safe issue, fix it, run validation, and verify the change.
```
