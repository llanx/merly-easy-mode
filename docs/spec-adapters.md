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

Run the current verification scaffold with extracted requirements:

```powershell
npm run merly -- spec verify --spec fixtures/specs/gherkin-basic.feature --changed --dry-run
```

`spec verify` currently extracts requirements and reports that Merly evidence is not run in this adapter slice. Report generation and Merly evidence mapping are handled by later spec verification work.

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
