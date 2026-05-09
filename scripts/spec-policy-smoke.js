#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

const repoRoot = path.resolve(__dirname, "..");
const cli = path.join(repoRoot, "bin", "merly-easy.js");
const outputDir = path.join(repoRoot, ".merly-local", "spec-policy-smoke");

fs.rmSync(outputDir, { recursive: true, force: true });

const advisory = runVerify("advisory", [], { MERLY_EASY_SPEC_MOCK: "healthy" });
assert.equal(advisory.status, 0, advisory.stderr);
assert.match(advisory.stdout, /CI policy: advisory/);
assert.equal(readReport("advisory").ci_policy.mode, "advisory");

const merlyPass = runVerify("merly-pass", ["--fail-on", "merly-failure"], { MERLY_EASY_SPEC_MOCK: "healthy" });
assert.equal(merlyPass.status, 0, merlyPass.stderr);
assert.match(merlyPass.stdout, /CI policy: pass \(merly-failure\)/);
assert.equal(readReport("merly-pass").ci_policy.status, "pass");

const missingMappings = runVerify("missing-mappings", ["--fail-on", "missing-mappings"], { MERLY_EASY_SPEC_MOCK: "healthy" });
assert.equal(missingMappings.status, 1, "missing-mappings policy should fail");
assert.match(missingMappings.stdout, /Policy failure: missing-mappings/);
assert.equal(readReport("missing-mappings").ci_policy.status, "fail");

const merlyFailure = runVerify("merly-failure", ["--fail-on", "merly-failure"], { MERLY_EASY_SPEC_MOCK: "missing" });
assert.equal(merlyFailure.status, 1, "merly-failure policy should fail");
assert.match(merlyFailure.stdout, /Merly evidence: failed/);
assert.match(merlyFailure.stdout, /Policy failure: merly-failure/);

const unresolved = runVerify("unresolved", ["--fail-on", "unresolved-blockers"], { MERLY_EASY_SPEC_MOCK: "missing" });
assert.equal(unresolved.status, 1, "unresolved-blockers policy should fail");
assert.match(unresolved.stdout, /Policy failure: unresolved-blockers/);

const unsupported = runVerify("unsupported", ["--spec", "fixtures/specs/unsupported-basic.txt", "--fail-on", "unsupported-spec"], {
  MERLY_EASY_SPEC_MOCK: "healthy",
});
assert.equal(unsupported.status, 1, "unsupported-spec policy should fail");
assert.match(unsupported.stdout, /Policy failure: unsupported-spec/);
assert.ok(readReport("unsupported").skipped_checks.some((check) => check.name === "unsupported_spec_format"));

const unknown = runCli([
  "spec",
  "verify",
  "--spec",
  "fixtures/specs/markdown-basic.md",
  "--fail-on",
  "unknown-policy",
  "--dry-run",
]);
assert.equal(unknown.status, 1, "unknown fail-on policy should fail");
assert.match(unknown.stderr, /Unsupported --fail-on policy: unknown-policy/);

fs.rmSync(outputDir, { recursive: true, force: true });
console.log("Spec policy smoke passed.");

function runVerify(outputName, extraArgs = [], env = {}) {
  const args = [
    "spec",
    "verify",
    "--spec",
    "fixtures/specs/markdown-basic.md",
    "--changed",
    "--output-dir",
    ".merly-local/spec-policy-smoke",
    "--output-name",
    outputName,
    ...extraArgs,
  ];
  return runCli(args, env);
}

function readReport(outputName) {
  return JSON.parse(fs.readFileSync(path.join(outputDir, `${outputName}.json`), "utf8"));
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}
