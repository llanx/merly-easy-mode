#!/usr/bin/env node
const assert = require("node:assert/strict");
const path = require("node:path");
const { extractSpecRequirements } = require("../lib/spec-adapters");

const repoRoot = path.resolve(__dirname, "..");

const cases = [
  {
    file: "fixtures/specs/markdown-basic.md",
    adapter: "markdown",
    count: 3,
    textIncludes: ["cart MUST preserve item quantity", "payment request MUST include an idempotency key"],
  },
  {
    file: "fixtures/specs/adr-basic.md",
    adapter: "adr-markdown",
    count: 5,
    kinds: ["status", "decision", "consequence"],
    textIncludes: ["Status: Accepted", "one local MCP server"],
  },
  {
    file: "fixtures/specs/gherkin-basic.feature",
    adapter: "gherkin",
    count: 5,
    kinds: ["scenario", "gherkin_step"],
    textIncludes: ["Scenario: Successful card payment", "Then the order is created"],
  },
  {
    file: "fixtures/specs/openapi-basic.json",
    adapter: "openapi",
    count: 5,
    kinds: ["operation", "response"],
    textIncludes: ["GET /orders - List orders", "POST /orders response 409"],
  },
  {
    file: "fixtures/specs/asyncapi-basic.json",
    adapter: "asyncapi",
    count: 2,
    kinds: ["message_operation"],
    textIncludes: ["publish orders/created message OrderCreated", "subscribe payments/failed message PaymentFailed"],
  },
  {
    file: "fixtures/specs/graphql-basic.graphql",
    adapter: "graphql-sdl",
    count: 11,
    kinds: ["definition", "field", "enum_value"],
    textIncludes: ["type Query field order(id: ID!): Order", "enum OrderStatus value PAID"],
  },
  {
    file: "fixtures/specs/json-schema-basic.schema.json",
    adapter: "json-schema",
    count: 4,
    kinds: ["required_fields", "property"],
    textIncludes: ["Order requires id, status, totalCents", "Order property status type string; enum created, paid, canceled"],
  },
];

for (const testCase of cases) {
  const result = extractSpecRequirements(testCase.file, { baseDir: repoRoot });
  assert.equal(result.adapter.id, testCase.adapter, `${testCase.file} adapter`);
  assert.equal(result.requirement_count, testCase.count, `${testCase.file} count`);
  assert.equal(result.note, "Extraction only; no semantic proof or Merly verification was performed.");

  for (const kind of testCase.kinds || []) {
    assert.ok(result.requirements.some((item) => item.kind === kind), `${testCase.file} missing kind ${kind}`);
  }

  for (const text of testCase.textIncludes || []) {
    assert.ok(result.requirements.some((item) => item.text.includes(text)), `${testCase.file} missing text ${text}`);
  }

  for (const item of result.requirements) {
    assert.ok(item.id.startsWith(`${testCase.adapter}-`), `${testCase.file} unstable id ${item.id}`);
    assert.ok(Number.isInteger(item.source.line) && item.source.line > 0, `${testCase.file} missing line`);
    assert.equal(item.source.path, testCase.file);
  }
}

console.log(`Spec adapter smoke passed (${cases.length} fixtures).`);
