#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const path = require("node:path");
const process = require("node:process");

const repoRoot = path.resolve(__dirname, "..");
const cli = path.join(repoRoot, "bin", "merly-easy.js");

const cases = [
  {
    name: "global help",
    args: ["--help"],
    includes: ["merly-easy", "setup --client <codex|claude>", "spec <preflight|verify|report>"],
  },
  {
    name: "easy dry-run",
    args: ["easy", "--dry-run"],
    includes: ["Merly Easy Mode (dry run)", "Check Node", "official sources", "Dry run complete"],
  },
  {
    name: "codex setup dry-run",
    args: ["setup", "--client", "codex", "--dry-run"],
    env: { MERLY_EASY_CODEX_CONFIG: path.join(repoRoot, ".tmp", "codex.toml") },
    includes: ["Codex Setup (dry run)", "Agent pack: agent-packs/codex", "[mcp_servers.merly]", "Target config:", "No files were written"],
  },
  {
    name: "claude setup dry-run",
    args: ["setup", "--client", "claude", "--dry-run"],
    env: { MERLY_EASY_CLAUDE_CONFIG: path.join(repoRoot, ".tmp", "claude.json") },
    includes: ["Claude Setup (dry run)", "Agent pack: agent-packs/claude", "\"mcpServers\"", "\"merly\"", "Target config:", "No files were written"],
  },
  {
    name: "doctor dry-run",
    args: ["doctor", "--dry-run"],
    includes: ["Merly Doctor (dry run)", "node:", "mcp_server_entrypoint", "Dry run skipped"],
  },
  {
    name: "doctor healthy mock",
    args: ["doctor"],
    env: { MERLY_EASY_DOCTOR_MOCK: "healthy" },
    includes: ["Merly Doctor", "merly_health: api=ok", "mcp_tool_smoke: tools=23", "Doctor completed without blockers"],
  },
  {
    name: "doctor missing mock windows",
    args: ["doctor", "--platform", "win32"],
    env: { MERLY_EASY_DOCTOR_MOCK: "missing" },
    status: 1,
    includes: [
      "Merly Doctor",
      "merly_health: Merly Bridge API is not reachable",
      "Doctor found blockers",
      "Merly Install/Start Guidance",
      "Official source: https://www.merly.ai/mentor",
      "Windows Start menu",
      "Resume with: npm run merly -- doctor",
    ],
  },
  {
    name: "doctor missing mock macos",
    args: ["doctor", "--platform", "darwin"],
    env: { MERLY_EASY_DOCTOR_MOCK: "missing" },
    status: 1,
    includes: [
      "Merly Doctor",
      "Merly Install/Start Guidance",
      "macOS",
      "Applications",
      "Resume with: npm run merly -- doctor",
    ],
  },
  {
    name: "auth dry-run",
    args: ["auth", "--dry-run"],
    includes: ["Merly Auth (dry run)", "API-key creation"],
  },
  {
    name: "spec preflight dry-run",
    args: ["spec", "preflight", "--spec", "fixtures/specs/markdown-basic.md", "--dry-run"],
    includes: ["Spec Preflight (dry run)", "Spec input: fixtures/specs/markdown-basic.md"],
  },
  {
    name: "spec verify dry-run",
    args: ["spec", "verify", "--spec", "fixtures/specs/gherkin-basic.feature", "--changed", "--dry-run"],
    includes: ["Spec Verify (dry run)", "Extract requirements"],
  },
  {
    name: "spec report dry-run",
    args: ["spec", "report", "--input", ".merly-local/spec-report.json", "--dry-run"],
    includes: ["Spec Report (dry run)", "Read a prior spec verification result"],
  },
];

for (const testCase of cases) {
  const result = runCli(testCase.args, testCase.env);
  assert.equal(result.status, testCase.status ?? 0, `${testCase.name} exited ${result.status}\n${result.stderr}`);
  for (const text of testCase.includes) {
    assert.match(result.stdout, literalPattern(text), `${testCase.name} missing ${text}\n${result.stdout}`);
  }
}

const invalidClient = runCli(["setup", "--client", "other", "--dry-run"]);
assert.equal(invalidClient.status, 1, "invalid client should fail");
assert.match(invalidClient.stderr, /Unsupported client: other/);

console.log(`CLI smoke passed (${cases.length + 1} cases).`);

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function literalPattern(text) {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
