const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCHEMA_VERSION = "merly-easy.spec-report.v1";
const DEFAULT_REPORT_DIR = ".merly-local/spec-reports";

function buildSpecVerificationReport({
  extraction,
  changedFiles = [],
  merlyEvidence = {},
  skippedChecks = [],
  options = {},
  outputs = {},
  generatedAt = new Date().toISOString(),
}) {
  const evidenceChecks = Array.isArray(merlyEvidence.checks) ? merlyEvidence.checks : [];
  const evidenceStatus = merlyEvidence.status || summarizeEvidenceStatus(evidenceChecks);
  const normalizedSkipped = skippedChecks.map((check) => ({
    name: String(check.name || "unnamed_check"),
    reason: String(check.reason || check.detail || "No reason supplied."),
  }));

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    summary: {
      status: "advisory",
      spec_path: extraction.spec_path,
      adapter: extraction.adapter?.id || "unknown",
      adapter_label: extraction.adapter?.label || extraction.adapter?.id || "unknown",
      requirement_count: extraction.requirement_count || 0,
      changed_file_count: changedFiles.length,
      merly_status: evidenceStatus,
      skipped_check_count: normalizedSkipped.length,
    },
    inputs: {
      spec_path: extraction.spec_path,
      changed_only: Boolean(options.changedOnly),
      output_dir: options.outputDir ? normalizePath(options.outputDir) : undefined,
    },
    extraction,
    changed_files: changedFiles.map((file) => ({
      path: normalizePath(file.path),
      status: file.status || "changed",
      original_path: file.original_path ? normalizePath(file.original_path) : undefined,
    })),
    merly_evidence: {
      status: evidenceStatus,
      checks: evidenceChecks.map((check) => ({
        name: String(check.name || "unnamed_check"),
        status: String(check.status || "info"),
        detail: String(check.detail || ""),
      })),
    },
    skipped_checks: normalizedSkipped,
    outputs: {
      markdown: outputs.markdown ? normalizePath(outputs.markdown) : "",
      json: outputs.json ? normalizePath(outputs.json) : "",
    },
  };
}

function renderSpecReportMarkdown(report) {
  const lines = [
    "# Merly Spec Verification Report",
    "",
    "Advisory report only. It does not prove implementation/spec compliance.",
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Spec: ${inlineCode(report.summary.spec_path)}`,
    `- Adapter: ${report.summary.adapter_label} (${report.summary.adapter})`,
    `- Requirements: ${report.summary.requirement_count}`,
    `- Changed files: ${report.summary.changed_file_count}`,
    `- Merly evidence: ${report.summary.merly_status}`,
    `- Skipped checks: ${report.summary.skipped_check_count}`,
    "",
    "## Requirement Items",
    "",
  ];

  if (!report.extraction.requirements || report.extraction.requirements.length === 0) {
    lines.push("- None extracted.");
  } else {
    for (const item of report.extraction.requirements) {
      const source = `${item.source?.path || report.summary.spec_path}:${item.source?.line || "?"}`;
      const section = item.section ? ` (${item.section})` : "";
      lines.push(`- ${inlineCode(item.id)} ${item.kind}${section} at ${inlineCode(source)}: ${item.text}`);
    }
  }

  lines.push("", "## Changed Files", "");
  if (!report.changed_files || report.changed_files.length === 0) {
    lines.push("- None collected.");
  } else {
    for (const file of report.changed_files) {
      const original = file.original_path ? ` from ${inlineCode(file.original_path)}` : "";
      lines.push(`- ${inlineCode(file.path)}: ${file.status}${original}`);
    }
  }

  lines.push("", "## Merly Evidence", "");
  if (!report.merly_evidence.checks || report.merly_evidence.checks.length === 0) {
    lines.push(`- ${report.merly_evidence.status}: no Merly checks were run.`);
  } else {
    for (const check of report.merly_evidence.checks) {
      lines.push(`- ${check.status.toUpperCase()} ${check.name}: ${check.detail}`);
    }
  }

  lines.push("", "## Skipped Checks", "");
  if (!report.skipped_checks || report.skipped_checks.length === 0) {
    lines.push("- None.");
  } else {
    for (const check of report.skipped_checks) {
      lines.push(`- ${check.name}: ${check.reason}`);
    }
  }

  lines.push("", "## Outputs", "");
  if (report.outputs?.json) lines.push(`- JSON: ${inlineCode(report.outputs.json)}`);
  if (report.outputs?.markdown) lines.push(`- Markdown: ${inlineCode(report.outputs.markdown)}`);
  if (!report.outputs?.json && !report.outputs?.markdown) lines.push("- Not written.");

  return `${lines.join("\n")}\n`;
}

function resolveSpecReportOutput(options, repoRoot, specPath) {
  const outputOption = options.output ? String(options.output) : "";
  const defaultBaseName = `${sanitizeOutputBaseName(path.basename(specPath, path.extname(specPath)))}-spec-report`;

  let outputDir = options.outputDir ? path.resolve(repoRoot, String(options.outputDir)) : path.resolve(repoRoot, DEFAULT_REPORT_DIR);
  let outputBaseName = sanitizeOutputBaseName(options.outputName || defaultBaseName);

  if (outputOption) {
    const resolvedOutput = path.resolve(repoRoot, outputOption);
    const extension = path.extname(resolvedOutput).toLowerCase();
    if (extension === ".json" || extension === ".md") {
      outputDir = path.dirname(resolvedOutput);
      outputBaseName = sanitizeOutputBaseName(path.basename(resolvedOutput, extension));
    } else {
      outputDir = resolvedOutput;
    }
  }

  const jsonPath = path.join(outputDir, `${outputBaseName}.json`);
  const markdownPath = path.join(outputDir, `${outputBaseName}.md`);

  return {
    outputDir,
    outputBaseName,
    jsonPath,
    markdownPath,
    displayJsonPath: displayPath(repoRoot, jsonPath),
    displayMarkdownPath: displayPath(repoRoot, markdownPath),
    displayOutputDir: displayPath(repoRoot, outputDir),
  };
}

function writeSpecReports(report, output) {
  const writableReport = {
    ...report,
    outputs: {
      markdown: output.displayMarkdownPath,
      json: output.displayJsonPath,
    },
  };
  const markdown = renderSpecReportMarkdown(writableReport);

  fs.mkdirSync(output.outputDir, { recursive: true });
  fs.writeFileSync(output.jsonPath, `${JSON.stringify(writableReport, null, 2)}\n`, "utf8");
  fs.writeFileSync(output.markdownPath, markdown, "utf8");

  return {
    report: writableReport,
    markdown,
    paths: {
      json: output.displayJsonPath,
      markdown: output.displayMarkdownPath,
    },
  };
}

function readSpecReport(inputPath, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const fullPath = path.resolve(baseDir, inputPath);
  const extension = path.extname(fullPath).toLowerCase();
  if (extension && extension !== ".json") {
    throw new Error("Only JSON spec reports can be read as report inputs.");
  }

  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function collectChangedFiles(repoRoot, options = {}) {
  if (!options.changedOnly) {
    return {
      files: [],
      skippedChecks: [
        {
          name: "changed_files",
          reason: "Changed-file scope was not requested. Use --changed to include the current Git working tree.",
        },
      ],
    };
  }

  const result = spawnSync("git", ["-C", repoRoot, "status", "--porcelain=v1", "-z"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    return {
      files: [],
      skippedChecks: [
        {
          name: "changed_files",
          reason: firstUsefulLine(result.stderr || result.stdout) || "Git status could not be collected.",
        },
      ],
    };
  }

  const entries = result.stdout.split("\0").filter(Boolean);
  const files = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.length < 4) continue;

    const code = entry.slice(0, 2);
    const filePath = entry.slice(3);
    const file = {
      path: normalizePath(filePath),
      status: describeGitStatus(code),
    };

    if (/^[RC]/.test(code) || /^.[RC]/.test(code)) {
      const originalPath = entries[index + 1];
      if (originalPath) {
        file.original_path = normalizePath(originalPath);
        index += 1;
      }
    }

    files.push(file);
  }

  return { files, skippedChecks: [] };
}

function summarizeEvidenceStatus(checks) {
  if (!checks || checks.length === 0) return "skipped";
  if (checks.some((check) => check.status === "fail")) return "failed";
  return "available";
}

function describeGitStatus(code) {
  if (code === "??") return "untracked";
  if (code === "!!") return "ignored";
  const labels = [];
  const indexStatus = code[0];
  const worktreeStatus = code[1];
  if (indexStatus && indexStatus !== " ") labels.push(gitStatusLabel(indexStatus, "index"));
  if (worktreeStatus && worktreeStatus !== " ") labels.push(gitStatusLabel(worktreeStatus, "worktree"));
  return labels.filter(Boolean).join(", ") || "changed";
}

function gitStatusLabel(status, side) {
  switch (status) {
    case "M":
      return `modified in ${side}`;
    case "A":
      return `added in ${side}`;
    case "D":
      return `deleted in ${side}`;
    case "R":
      return `renamed in ${side}`;
    case "C":
      return `copied in ${side}`;
    case "U":
      return `unmerged in ${side}`;
    default:
      return `${status} in ${side}`;
  }
}

function sanitizeOutputBaseName(value) {
  const sanitized = String(value || "spec-report")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "spec-report";
}

function inlineCode(value) {
  return `\`${String(value || "").replace(/`/g, "'")}\``;
}

function displayPath(repoRoot, targetPath) {
  const relative = path.relative(repoRoot, targetPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return normalizePath(relative);
  }
  return normalizePath(targetPath);
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function firstUsefulLine(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_REPORT_DIR,
  buildSpecVerificationReport,
  collectChangedFiles,
  readSpecReport,
  renderSpecReportMarkdown,
  resolveSpecReportOutput,
  writeSpecReports,
};
