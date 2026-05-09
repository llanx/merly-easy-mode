#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

const repoRoot = path.resolve(__dirname, "..");
const cli = path.join(repoRoot, "bin", "merly-easy.js");
const authTempDir = path.join(repoRoot, ".merly-local", "cli-smoke");
const uiAuthEnv = path.join(authTempDir, "ui.env");
const advancedAuthEnv = path.join(authTempDir, "advanced.env");

fs.rmSync(authTempDir, { recursive: true, force: true });

const cases = [
  {
    name: "global help",
    args: ["--help"],
    includes: ["merly-easy", "setup --client <codex|claude>", "spec <preflight|verify|report>"],
  },
  {
    name: "easy dry-run",
    args: ["easy", "--dry-run"],
    includes: [
      "Merly Easy Mode (dry run)",
      "Selected agent: codex",
      "Merly Doctor (dry run)",
      "Merly Auth (dry run)",
      "Codex Setup (dry run)",
      "Repository registration is optional",
      "Copy this into the connected agent",
      "No files were written",
    ],
  },
  {
    name: "easy claude dry-run",
    args: ["easy", "--client", "claude", "--dry-run"],
    env: { MERLY_EASY_CLAUDE_CONFIG: path.join(repoRoot, ".tmp", "easy-claude.json") },
    includes: ["Selected agent: claude", "Claude Setup (dry run)", "\"mcpServers\"", "Copy this into the connected agent"],
  },
  {
    name: "easy healthy mock",
    args: ["easy", "--client", "codex"],
    env: {
      MERLY_EASY_DOCTOR_MOCK: "healthy",
      MERLY_EASY_AUTH_MOCK: "existing",
      MERLY_EASY_CODEX_CONFIG: path.join(repoRoot, ".tmp", "easy-codex.toml"),
    },
    includes: [
      "Merly Easy Mode",
      "Doctor completed without blockers",
      "Auth setup completed without blockers",
      "Codex Setup (dry run)",
      "PASS mcp_tool_smoke: tools=23; api=ok; daemon=ok",
      "Easy Mode completed without blockers",
    ],
  },
  {
    name: "easy missing merly mock",
    args: ["easy", "--client", "codex", "--platform", "win32"],
    env: { MERLY_EASY_DOCTOR_MOCK: "missing" },
    status: 1,
    includes: [
      "Merly Install/Start Guidance",
      "Windows Start menu",
      "Resume with: npm run easy -- --client codex",
    ],
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
    includes: ["Merly Auth (dry run)", "Flow: UI-created API key", "No files were written"],
  },
  {
    name: "auth ui write mock",
    args: ["auth", "--flow", "ui", "--from-env", "--write", "--target-env", uiAuthEnv],
    env: { MERLY_EASY_AUTH_MOCK: "ui-ready", MERLY_API_KEY: "ui-test-api-key" },
    includes: ["Credential input: MERLY_API_KEY <redacted:", "Updated ignored env file", "PASS auth_status", "PASS auth_smoke", "Auth setup completed without blockers"],
    notIncludes: ["ui-test-api-key"],
  },
  {
    name: "auth ui missing mock",
    args: ["auth", "--flow", "ui", "--target-env", path.join(authTempDir, "missing.env")],
    env: { MERLY_EASY_AUTH_MOCK: "missing" },
    status: 1,
    includes: ["No API key was supplied", "FAIL credentials", "Auth setup has blockers"],
  },
  {
    name: "auth advanced dry-run",
    args: ["auth", "--flow", "advanced", "--dry-run"],
    includes: ["Flow: Advanced login/key creation", "Security warning", "No files were written. No account credentials were read"],
  },
  {
    name: "auth advanced missing confirmation",
    args: ["auth", "--flow", "advanced", "--write", "--target-env", advancedAuthEnv],
    env: { MERLY_EMAIL: "person@example.test", MERLY_PASSWORD: "secret-for-test" },
    status: 1,
    stderrIncludes: ["Advanced auth requires --confirm-advanced"],
    notIncludes: ["secret-for-test"],
  },
  {
    name: "auth advanced write mock",
    args: ["auth", "--flow", "advanced", "--confirm-advanced", "--write", "--target-env", advancedAuthEnv],
    env: {
      MERLY_EASY_AUTH_MOCK: "advanced-ready",
      MERLY_EMAIL: "person@example.test",
      MERLY_PASSWORD: "secret-for-test",
    },
    includes: ["Created API key: <redacted:", "Updated ignored env file", "Recommended next step", "PASS auth_status", "PASS auth_smoke"],
    notIncludes: ["mock-created-api-key-value", "secret-for-test"],
  },
  {
    name: "spec preflight dry-run",
    args: ["spec", "preflight", "--spec", "fixtures/specs/markdown-basic.md", "--dry-run"],
    includes: ["Spec Preflight (dry run)", "Spec input: fixtures/specs/markdown-basic.md"],
  },
  {
    name: "spec verify dry-run",
    args: ["spec", "verify", "--spec", "fixtures/specs/gherkin-basic.feature", "--changed", "--dry-run"],
    includes: ["Spec Verify (dry run)", "Adapter: Gherkin (gherkin)", "Extracted requirements: 5", "Merly evidence: skipped", "reports were not written"],
  },
  {
    name: "spec report help",
    args: ["spec", "report", "--help"],
    includes: ["Usage: merly-easy spec report --input <file>", "--output <file>", "--json"],
  },
];

for (const testCase of cases) {
  const result = runCli(testCase.args, testCase.env);
  assert.equal(result.status, testCase.status ?? 0, `${testCase.name} exited ${result.status}\n${result.stderr}`);
  for (const text of testCase.includes || []) {
    assert.match(result.stdout, literalPattern(text), `${testCase.name} missing ${text}\n${result.stdout}`);
  }
  for (const text of testCase.stderrIncludes || []) {
    assert.match(result.stderr, literalPattern(text), `${testCase.name} missing stderr ${text}\n${result.stderr}`);
  }
  for (const text of testCase.notIncludes || []) {
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, literalPattern(text), `${testCase.name} leaked ${text}`);
  }
}

const invalidClient = runCli(["setup", "--client", "other", "--dry-run"]);
assert.equal(invalidClient.status, 1, "invalid client should fail");
assert.match(invalidClient.stderr, /Unsupported client: other/);

assert.match(fs.readFileSync(uiAuthEnv, "utf8"), /MERLY_API_KEY=ui-test-api-key/);
const advancedEnvContent = fs.readFileSync(advancedAuthEnv, "utf8");
assert.match(advancedEnvContent, /MERLY_API_KEY=mock-created-api-key-value/);
assert.doesNotMatch(advancedEnvContent, /MERLY_PASSWORD|MERLY_EMAIL|MERLY_BEARER_TOKEN/);
fs.rmSync(authTempDir, { recursive: true, force: true });

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
