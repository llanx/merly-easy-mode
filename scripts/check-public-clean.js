#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const allowlistedFiles = new Set([".gitignore", "scripts/check-public-clean.js"]);

const privatePathPatterns = [
  { name: ".codex-private", regex: /(^|[\\/])\.codex-private([\\/]|$)/i },
  { name: "Specs-private", regex: /(^|[\\/])Specs-private([\\/]|$)/i },
  { name: ".merly-local", regex: /(^|[\\/])\.merly-local([\\/]|$)/i },
];

const privateTermPatterns = [
  { name: "grill-me", regex: /\bgrill[- ]me\b/i },
  { name: "GSD", regex: /\bGSD\b/ },
  { name: "gsd-roadmapper", regex: /\bgsd-roadmapper\b/i },
  { name: "spec-hardener", regex: /\bspec[- ]hardener\b/i },
  { name: "context-gate", regex: /\bcontext-gate\b/i },
  { name: "fresh-reviewer", regex: /\bfresh-reviewer\b/i },
  { name: "spec-auditor", regex: /\bspec-auditor\b/i },
  { name: "spec-drift-checker", regex: /\bspec-drift-checker\b/i },
  { name: "local Windows user path", regex: /C:[\\/]+Users[\\/]+/i },
  { name: "local Unix user path", regex: /\/Users\/[^/\s]+/i },
  { name: "DwarfIncremental", regex: /\bDwarfIncremental\b/i },
  { name: "VillageDwarves", regex: /\bVillageDwarves\b/i },
  { name: "Codex MCP Prototype", regex: /\bCodex MCP Prototype\b/i },
];

const { files, source } = getPublicFileList();
const violations = [];

for (const file of files) {
  const normalized = normalizePath(file);
  for (const pattern of privatePathPatterns) {
    if (pattern.regex.test(normalized)) {
      violations.push(`${normalized} is under private workflow path ${pattern.name}`);
    }
  }

  if (allowlistedFiles.has(normalized) || !isReadableTextFile(file)) continue;

  const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
  for (const pattern of privateTermPatterns) {
    if (pattern.regex.test(content)) {
      violations.push(`${normalized} contains private workflow term ${pattern.name}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Public clean check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Public clean check passed (${source}).`);

function getPublicFileList() {
  try {
    const output = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = output
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    return { files, source: "git tracked files" };
  } catch {
    return { files: listFiles(repoRoot), source: "filesystem fallback; git metadata not found" };
  }
}

function listFiles(root) {
  const excludedDirs = new Set([
    ".git",
    "node_modules",
    ".codex-private",
    "Specs-private",
    ".merly-local",
    "dist",
    "build",
    "coverage",
  ]);
  const files = [];
  walk(root);
  return files;

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedDirs.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(path.relative(repoRoot, fullPath));
      }
    }
  }
}

function isReadableTextFile(file) {
  const fullPath = path.join(repoRoot, file);
  const stat = fs.statSync(fullPath);
  if (stat.size > 1024 * 1024) return false;
  const buffer = fs.readFileSync(fullPath);
  return !buffer.includes(0);
}

function normalizePath(file) {
  return file.split(path.sep).join("/");
}
