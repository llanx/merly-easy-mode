# ADR 0001: Use Local MCP For Merly Agent Access

Status: Accepted

## Context

Teams need agent access to local Merly evidence without adopting a mandated process.

## Decision

- The integration MUST expose Merly through one local MCP server.
- Agent-specific setup SHOULD be provided as optional packs.

## Consequences

- Users MAY bring their own task workflow.
- The repository MUST NOT bundle Merly runtime data or credentials.
