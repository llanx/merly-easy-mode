# Release Checklist

Use this checklist before publishing the repository or cutting a public release.

## Automated Checks

Run from the repository root:

```powershell
npm run release:check
```

This runs:

- CLI and spec smoke tests.
- Public-clean guard.
- MCP tool smoke against the local Merly bridge.
- Easy Mode dry run.
- Codex and Claude setup dry runs.
- Spec verification dry run with an opt-in CI policy.

If Merly is not running locally, `npm run smoke` and `npm run release:check` can fail at the MCP smoke step. Start Merly first, then rerun the command.

## Manual Checks

- Fresh clone on Windows: install dependencies, run Easy Mode dry run, run `npm run merly -- doctor`, and run MCP smoke with Merly started.
- Fresh clone on macOS or Linux: repeat the same flow with shell commands from `QUICKSTART.md`.
- Confirm `npm run setup -- --client codex --dry-run` prints a usable config proposal and does not write user-level config.
- Confirm `npm run setup -- --client claude --dry-run` prints a usable config proposal and does not write user-level config.
- Confirm `npm run merly -- auth --flow ui --dry-run` explains the UI-created key path without reading secrets.
- Confirm `npm run merly -- spec verify --spec fixtures/specs/markdown-basic.md --changed --dry-run` explains planned report paths.

## Public Hygiene

Before publishing, verify only intended public files are tracked:

```powershell
git status --short --ignored
git ls-files | rg "^(\.codex-private|Specs-private|\.merly-local)/"
```

The second command should print nothing.

Do not publish:

- API keys, bearer tokens, passwords, local env files, or command output containing secrets.
- Merly installers, app binaries, model files, runtime state, local databases, or logs.
- Generated reports under `.merly-local/`.
- User-level Codex or Claude config files.

## Release Notes Template

```markdown
## Merly Easy Mode <version>

### Highlights

- Easy Mode onboarding for Codex and Claude.
- Shared Merly MCP server with health, auth, issue, DIF, and re-analysis tools.
- Optional spec adapters and advisory verification reports.
- Opt-in CI policy flags for spec verification.

### Verification

- `npm run release:check`
- Manual fresh-clone pass on <platforms>

### Known Limits

- Merly must be installed and running locally.
- Repository-level Merly re-analysis may need committed or otherwise visible refs.
- Spec verification reports are advisory unless `--fail-on` policies are selected.
```
