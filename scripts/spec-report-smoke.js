#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

const repoRoot = path.resolve(__dirname, "..");
const cli = path.join(repoRoot, "bin", "merly-easy.js");
const outputDir = path.join(repoRoot, ".merly-local", "spec-report-smoke");
const outputJson = path.join(outputDir, "markdown-basic.json");
const outputMarkdown = path.join(outputDir, "markdown-basic.md");

fs.rmSync(outputDir, { recursive: true, force: true });

const verify = runCli([
  "spec",
  "verify",
  "--spec",
  "fixtures/specs/markdown-basic.md",
  "--changed",
  "--output-dir",
  ".merly-local/spec-report-smoke",
  "--output-name",
  "markdown-basic",
], { MERLY_EASY_SPEC_MOCK: "healthy" });

assert.equal(verify.status, 0, verify.stderr);
assert.match(verify.stdout, /Wrote JSON report: \.merly-local\/spec-report-smoke\/markdown-basic\.json/);
assert.match(verify.stdout, /Wrote Markdown report: \.merly-local\/spec-report-smoke\/markdown-basic\.md/);
assert.equal(fs.existsSync(outputJson), true, "JSON report was not written");
assert.equal(fs.existsSync(outputMarkdown), true, "Markdown report was not written");

const report = JSON.parse(fs.readFileSync(outputJson, "utf8"));
assert.equal(report.schema_version, "merly-easy.spec-report.v1");
assert.equal(report.summary.status, "advisory");
assert.equal(report.summary.spec_path, "fixtures/specs/markdown-basic.md");
assert.equal(report.summary.adapter, "markdown");
assert.equal(report.summary.requirement_count, 3);
assert.equal(report.summary.merly_status, "available");
assert.equal(Array.isArray(report.changed_files), true);
assert.equal(report.merly_evidence.checks.length, 2);
assert.equal(report.outputs.json, ".merly-local/spec-report-smoke/markdown-basic.json");
assert.equal(report.outputs.markdown, ".merly-local/spec-report-smoke/markdown-basic.md");
assert.ok(report.skipped_checks.some((check) => check.name === "semantic_compliance_proof"));

const markdown = fs.readFileSync(outputMarkdown, "utf8");
assert.match(markdown, /# Merly Spec Verification Report/);
assert.match(markdown, /## Requirement Items/);
assert.match(markdown, /## Merly Evidence/);
assert.match(markdown, /## Skipped Checks/);

const rendered = runCli(["spec", "report", "--input", ".merly-local/spec-report-smoke/markdown-basic.json"]);
assert.equal(rendered.status, 0, rendered.stderr);
assert.match(rendered.stdout, /# Merly Spec Verification Report/);
assert.match(rendered.stdout, /PASS merly_auth_status/);

fs.rmSync(outputDir, { recursive: true, force: true });
console.log("Spec report smoke passed.");

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}
