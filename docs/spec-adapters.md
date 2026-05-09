# Spec Adapters

Merly Easy Mode includes optional, workflow-neutral spec adapters. They read a spec file and extract requirement-like items with source references so later verification steps can connect Merly evidence to a task.

Adapters do not prove that an implementation satisfies a spec. They only produce structured requirement items from known formats.

## Supported Inputs

- Markdown
- ADR-style Markdown
- Gherkin feature files
- OpenAPI JSON, with lightweight YAML detection
- AsyncAPI JSON, with lightweight YAML detection
- GraphQL SDL
- JSON Schema

## Commands

Preview extraction:

```powershell
npm run merly -- spec preflight --spec fixtures/specs/markdown-basic.md
```

Return structured JSON:

```powershell
npm run merly -- spec preflight --spec fixtures/specs/openapi-basic.json --json
```

Write verification reports with extracted requirements, changed-file scope, Merly health/auth evidence, and skipped-check notes:

```powershell
npm run merly -- spec verify --spec fixtures/specs/gherkin-basic.feature --changed
```

By default, `spec verify` writes:

- JSON report: `.merly-local/spec-reports/<spec-name>-spec-report.json`
- Markdown report: `.merly-local/spec-reports/<spec-name>-spec-report.md`

Use `--output-dir <path>` and `--output-name <name>` to choose a different report location. Use `--dry-run` to preview the report paths without writing files.

Render a prior JSON report as Markdown:

```powershell
npm run merly -- spec report --input .merly-local/spec-reports/gherkin-basic-spec-report.json
```

`spec verify` is intentionally advisory. It records extracted requirements, changed files when `--changed` is supplied, Merly health/auth evidence when available, and skipped checks for verification work that is not yet automated.

## Output Shape

Each extracted item includes:

- stable local id
- source file path
- source line
- adapter kind
- extracted text
- optional section and metadata

Example:

```json
{
  "id": "markdown-001",
  "source": {
    "path": "fixtures/specs/markdown-basic.md",
    "line": 5
  },
  "kind": "requirement",
  "text": "REQ-001: The cart MUST preserve item quantity when a user refreshes the page.",
  "section": "Cart",
  "metadata": {}
}
```

## Report Shape

The JSON report includes:

- `schema_version`
- `summary`
- `inputs`
- `extraction`
- `changed_files`
- `merly_evidence`
- `skipped_checks`
- `outputs`

The Markdown report includes the same information in a human-readable format for task handoffs and review.
