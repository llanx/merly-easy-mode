#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const process = require("node:process");

const repoRoot = path.resolve(__dirname, "..");

const checks = [
  { name: "test suite", args: ["test"] },
  { name: "public clean and MCP smoke", args: ["run", "smoke"] },
  { name: "easy mode dry run", args: ["run", "easy", "--", "--dry-run"] },
  { name: "codex setup dry run", args: ["run", "setup", "--", "--client", "codex", "--dry-run"] },
  { name: "claude setup dry run", args: ["run", "setup", "--", "--client", "claude", "--dry-run"] },
  {
    name: "spec verify dry run",
    args: ["run", "merly", "--", "spec", "verify", "--spec", "fixtures/specs/gherkin-basic.feature", "--changed", "--dry-run", "--fail-on", "merly-failure"],
  },
];

for (const check of checks) {
  console.log(`\n== ${check.name} ==`);
  const command = npmInvocation(check.args);
  const result = spawnSync(command.command, command.args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`\nRelease check could not start ${check.name}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nRelease check failed: ${check.name}`);
    process.exit(result.status || 1);
  }
}

console.log("\nRelease check passed.");

function npmInvocation(args) {
  if (process.platform !== "win32") {
    return { command: "npm", args };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", quoteCommand(["npm", ...args])],
  };
}

function quoteCommand(args) {
  return args.map((arg) => {
    const value = String(arg);
    return /\s/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(" ");
}
