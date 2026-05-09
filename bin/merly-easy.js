#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const { spawnSync } = require("node:child_process");

const VERSION = "0.1.0";
const CLIENTS = new Set(["codex", "claude"]);
const MERLY_MENTOR_URL = "https://www.merly.ai/mentor";
const DEFAULT_MERLY_BASE_URL = "http://127.0.0.1:4201";

function main(argv) {
  try {
    const command = argv[0];
    const rest = argv.slice(1);

    if (!command || command === "help" || command === "--help" || command === "-h") {
      printGlobalHelp();
      return;
    }

    if (command === "--version" || command === "-v") {
      console.log(VERSION);
      return;
    }

    switch (command) {
      case "easy":
        return runEasy(rest);
      case "setup":
        return runSetup(rest);
      case "doctor":
        return runDoctor(rest);
      case "auth":
        return runAuth(rest);
      case "spec":
        return runSpec(rest);
      default:
        throw new CliError(`Unknown command: ${command}`, 1, "Run `merly-easy --help` for available commands.");
    }
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`Error: ${error.message}`);
      if (error.hint) console.error(error.hint);
      process.exitCode = error.exitCode;
      return;
    }

    console.error(`${error.name || "Error"}: ${error.message}`);
    process.exitCode = 1;
  }
}

function runEasy(argv) {
  const options = parseOptions(argv);
  if (options.help) return printEasyHelp();

  printPlan({
    title: "Merly Easy Mode",
    dryRun: options.dryRun,
    steps: [
      "Check Node, platform, Git workspace, and local dependencies.",
      "Check whether the Merly Bridge API is reachable.",
      "Guide Merly install/start from official sources if the bridge is unavailable.",
      "Guide API key setup and write credentials only to ignored local env files.",
      "Configure Codex or Claude after showing the proposed config change.",
      "Run MCP smoke checks.",
      "Optionally resolve or register the current Git repository in Merly.",
      "Print the first useful AI-agent prompt.",
    ],
    next: options.dryRun
      ? "Dry run complete. Later slices will connect these steps to diagnostics and setup actions."
      : "Interactive Easy Mode implementation is planned for a later slice. Run with --dry-run today.",
  });
}

function runSetup(argv) {
  const options = parseOptions(argv);
  if (options.help) return printSetupHelp();

  const client = requireOption(options, "client", "--client is required. Use codex or claude.");
  if (!CLIENTS.has(client)) {
    throw new CliError(`Unsupported client: ${client}`, 1, "Supported clients: codex, claude.");
  }

  printSetupProposal(buildSetupProposal(client, options), options);
}

function runDoctor(argv) {
  const options = parseOptions(argv);
  if (options.help) return printDoctorHelp();

  const diagnostics = collectDoctorDiagnostics({
    dryRun: options.dryRun,
    mock: process.env.MERLY_EASY_DOCTOR_MOCK || "",
    platform: options.platform || process.env.MERLY_EASY_PLATFORM_MOCK || process.platform,
  });
  const failed = diagnostics.checks.filter((check) => check.status === "fail");
  const warned = diagnostics.checks.filter((check) => check.status === "warn");

  printDoctorReport(diagnostics);

  if (!options.dryRun && failed.length > 0) {
    process.exitCode = 1;
  } else if (!options.dryRun && warned.length > 0) {
    process.exitCode = 0;
  }
}

function runAuth(argv) {
  const options = parseOptions(argv);
  if (options.help) return printAuthHelp();

  printPlan({
    title: "Merly Auth",
    dryRun: options.dryRun,
    steps: [
      "Prefer API-key creation through the local Merly UI.",
      "Offer advanced login/key creation only after an explicit security warning.",
      "Store final credentials only in ignored local env files.",
      "Verify credentials with auth smoke checks.",
    ],
    next: "Current auth helpers live under mcp-server: npm run open:keys, npm run auth:smoke, npm run dif:smoke.",
  });
}

function runSpec(argv) {
  const subcommand = argv[0];
  const rest = argv.slice(1);

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    return printSpecHelp();
  }

  switch (subcommand) {
    case "preflight":
      return runSpecPreflight(rest);
    case "verify":
      return runSpecVerify(rest);
    case "report":
      return runSpecReport(rest);
    default:
      throw new CliError(`Unknown spec command: ${subcommand}`, 1, "Run `merly-easy spec --help` for available spec commands.");
  }
}

function runSpecPreflight(argv) {
  const options = parseOptions(argv);
  if (options.help) return printSpecPreflightHelp();

  printSpecPlan("Spec Preflight", options, [
    "Check that the spec path exists and detect its adapter format.",
    "Check Git workspace state.",
    "Check Merly health and credential status.",
    "Resolve the current repository in Merly when available.",
  ]);
}

function runSpecVerify(argv) {
  const options = parseOptions(argv);
  if (options.help) return printSpecVerifyHelp();

  printSpecPlan("Spec Verify", options, [
    "Extract requirements from supported spec adapters.",
    "Collect changed-file context when --changed is provided.",
    "Run Merly verification evidence where available.",
    "Write Markdown and JSON reports.",
    "Apply --fail-on policies only when explicitly requested.",
  ]);
}

function runSpecReport(argv) {
  const options = parseOptions(argv);
  if (options.help) return printSpecReportHelp();

  printSpecPlan("Spec Report", options, [
    "Read a prior spec verification result.",
    "Render human-readable Markdown and machine-readable JSON.",
    "Summarize skipped checks and next actions.",
  ]);
}

function printSpecPlan(title, options, steps) {
  printPlan({
    title,
    dryRun: options.dryRun,
    steps: [
      `Spec input: ${options.spec || options.input || "(not supplied in scaffold)"}`,
      ...steps,
    ],
    next: "Spec command implementation is planned for the spec adapter slices.",
  });
}

function printPlan({ title, dryRun, steps, next }) {
  console.log(`${title}${dryRun ? " (dry run)" : ""}`);
  console.log("");
  for (const [index, step] of steps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
  console.log("");
  console.log(next);
}

function parseOptions(argv) {
  const options = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--changed") {
      options.changed = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg.startsWith("--")) {
      const key = toCamelCase(arg.slice(2));
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new CliError(`${arg} requires a value.`);
      }
      options[key] = next;
      index += 1;
    } else {
      options._.push(arg);
    }
  }

  return options;
}

function requireOption(options, key, message) {
  const value = options[key];
  if (!value) throw new CliError(message);
  return String(value).toLowerCase();
}

function printGlobalHelp() {
  console.log(`merly-easy ${VERSION}

Usage:
  merly-easy easy [--dry-run]
  merly-easy setup --client <codex|claude> [--dry-run]
  merly-easy doctor [--platform <win32|darwin|linux>] [--dry-run]
  merly-easy auth [--dry-run]
  merly-easy spec <preflight|verify|report> [options]

Commands:
  easy      Guided first-time onboarding flow.
  setup     Agent setup for Codex or Claude.
  doctor    Local diagnostics scaffold.
  auth      API-key setup scaffold.
  spec      Optional specification-driven verification hooks.
`);
}

function printEasyHelp() {
  console.log("Usage: merly-easy easy [--dry-run]");
}

function printSetupHelp() {
  console.log("Usage: merly-easy setup --client <codex|claude> [--target <path>] [--dry-run]");
}

function printDoctorHelp() {
  console.log("Usage: merly-easy doctor [--platform <win32|darwin|linux>] [--dry-run]");
}

function printAuthHelp() {
  console.log("Usage: merly-easy auth [--dry-run]");
}

function printSpecHelp() {
  console.log(`Usage:
  merly-easy spec preflight --spec <file> [--dry-run]
  merly-easy spec verify --spec <file> [--changed] [--dry-run]
  merly-easy spec report --input <file> [--dry-run]`);
}

function printSpecPreflightHelp() {
  console.log("Usage: merly-easy spec preflight --spec <file> [--dry-run]");
}

function printSpecVerifyHelp() {
  console.log("Usage: merly-easy spec verify --spec <file> [--changed] [--report-format markdown,json] [--dry-run]");
}

function printSpecReportHelp() {
  console.log("Usage: merly-easy spec report --input <file> [--format markdown,json] [--dry-run]");
}

function existsLabel(filePath) {
  return `${fs.existsSync(filePath) ? "found" : "missing"} (${filePath})`;
}

function buildSetupProposal(client, options) {
  const repoRoot = path.resolve(__dirname, "..");
  const mcpServerRoot = path.join(repoRoot, "mcp-server");
  const serverPath = path.join(mcpServerRoot, "src", "server.js");
  const agentPack = `agent-packs/${client}`;
  const targetPath = resolveSetupTarget(client, options);

  if (client === "codex") {
    return {
      title: "Codex Setup",
      client,
      agentPack,
      targetPath,
      serverPath,
      mcpServerRoot,
      language: "toml",
      config: renderCodexConfig({ serverPath, mcpServerRoot }),
      nextCommand: "codex mcp get merly",
    };
  }

  return {
    title: "Claude Setup",
    client,
    agentPack,
    targetPath,
    serverPath,
    mcpServerRoot,
    language: "json",
    config: renderClaudeConfig({ serverPath, mcpServerRoot }),
    nextCommand: "Restart Claude after updating its MCP config, then ask it to call merly_health.",
  };
}

function printSetupProposal(proposal, options) {
  console.log(`${proposal.title}${options.dryRun ? " (dry run)" : ""}`);
  console.log("");
  console.log(`Agent pack: ${proposal.agentPack}`);
  console.log(`MCP server: ${existsLabel(proposal.serverPath)}`);
  console.log(`MCP working directory: ${existsLabel(proposal.mcpServerRoot)}`);
  console.log(`Target config: ${proposal.targetPath}`);
  console.log("");
  console.log("Proposed config:");
  console.log(`\`\`\`${proposal.language}`);
  console.log(proposal.config);
  console.log("```");
  console.log("");
  console.log("No files were written.");
  console.log("Future interactive setup will ask before writing any user-level agent config file.");
  console.log(`Validation after setup: ${proposal.nextCommand}`);
}

function resolveSetupTarget(client, options) {
  if (options.target) return path.resolve(options.target);

  if (client === "codex") {
    return path.resolve(process.env.MERLY_EASY_CODEX_CONFIG || path.join(os.homedir(), ".codex", "config.toml"));
  }

  if (process.env.MERLY_EASY_CLAUDE_CONFIG) {
    return path.resolve(process.env.MERLY_EASY_CLAUDE_CONFIG);
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }

  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function renderCodexConfig({ serverPath, mcpServerRoot }) {
  return [
    "[mcp_servers.merly]",
    `command = ${tomlString("node")}`,
    `args = [${tomlString(serverPath)}]`,
    `cwd = ${tomlString(mcpServerRoot)}`,
    "startup_timeout_sec = 10",
    "tool_timeout_sec = 60",
    `default_tools_approval_mode = ${tomlString("approve")}`,
  ].join("\n");
}

function renderClaudeConfig({ serverPath, mcpServerRoot }) {
  return JSON.stringify(
    {
      mcpServers: {
        merly: {
          command: "node",
          args: [serverPath],
          cwd: mcpServerRoot,
        },
      },
    },
    null,
    2,
  );
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function collectDoctorDiagnostics({ dryRun, mock, platform }) {
  const repoRoot = path.resolve(__dirname, "..");
  const mcpServerRoot = path.join(repoRoot, "mcp-server");
  const mcpServerPath = path.join(mcpServerRoot, "src", "server.js");
  const envPath = path.join(mcpServerRoot, ".env");
  const checks = [
    {
      name: "node",
      status: satisfiesNodeMajor(20) ? "pass" : "fail",
      detail: `${process.version} on ${process.platform}`,
    },
    {
      name: "git_workspace",
      ...gitWorkspaceCheck(repoRoot),
    },
    {
      name: "mcp_server_entrypoint",
      status: fs.existsSync(mcpServerPath) ? "pass" : "fail",
      detail: mcpServerPath,
    },
    {
      name: "local_env",
      status: fs.existsSync(envPath) ? "pass" : "warn",
      detail: fs.existsSync(envPath) ? envPath : "mcp-server/.env not found; copy .env.example when credentials are needed.",
    },
  ];

  if (dryRun) {
    checks.push({
      name: "external_checks",
      status: "skip",
      detail: "Dry run skipped Merly health, auth-status, and MCP smoke checks.",
    });
    return { repoRoot, dryRun, platform, checks };
  }

  if (mock) {
    checks.push(...mockDoctorChecks(mock));
    return { repoRoot, dryRun, platform, checks };
  }

  checks.push(
    commandCheck({
      name: "merly_auth_status",
      command: process.execPath,
      args: [path.join(mcpServerRoot, "scripts", "merly-debug.js"), "auth-status"],
      cwd: mcpServerRoot,
      summarize: summarizeAuthStatus,
    }),
  );

  checks.push(
    commandCheck({
      name: "merly_health",
      command: process.execPath,
      args: [path.join(mcpServerRoot, "scripts", "merly-debug.js"), "health"],
      cwd: mcpServerRoot,
      summarize: summarizeHealth,
    }),
  );

  checks.push(
    commandCheck({
      name: "mcp_tool_smoke",
      command: process.execPath,
      args: [path.join(mcpServerRoot, "scripts", "mcp-smoke.js")],
      cwd: mcpServerRoot,
      summarize: summarizeMcpSmoke,
    }),
  );

  return { repoRoot, dryRun, platform, checks };
}

function printDoctorReport(diagnostics) {
  console.log(`Merly Doctor${diagnostics.dryRun ? " (dry run)" : ""}`);
  console.log("");
  console.log(`Repository root: ${diagnostics.repoRoot}`);
  console.log("");

  for (const check of diagnostics.checks) {
    console.log(`${statusIcon(check.status)} ${check.name}: ${check.detail}`);
  }

  const failed = diagnostics.checks.filter((check) => check.status === "fail");
  console.log("");
  if (failed.length > 0) {
    console.log("Doctor found blockers. Fix failed checks before running Easy Mode.");
    if (needsMerlyStartGuidance(diagnostics.checks)) {
      console.log("");
      printMerlyStartGuidance(diagnostics.platform);
    }
  } else {
    console.log("Doctor completed without blockers.");
  }
}

function needsMerlyStartGuidance(checks) {
  return checks.some((check) => (
    check.status === "fail" &&
    (check.name === "merly_health" || check.name === "mcp_tool_smoke") &&
    /bridge|health|reachable|fetch|connect|ECONN/i.test(check.detail)
  ));
}

function printMerlyStartGuidance(platform) {
  const guidance = buildMerlyStartGuidance(platform);
  console.log("Merly Install/Start Guidance");
  console.log(`Official source: ${MERLY_MENTOR_URL}`);
  console.log(`Bridge health URL: ${DEFAULT_MERLY_BASE_URL}/api/v2/health`);
  console.log("");

  for (const [index, step] of guidance.steps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
  console.log("");
  console.log(`Resume with: ${guidance.resumeCommand}`);
}

function buildMerlyStartGuidance(platform) {
  const normalized = normalizePlatform(platform);
  const commonSteps = [
    "Install Merly Mentor from the official source if it is not already installed.",
    "Start the Merly Mentor desktop app or service and wait for the local bridge API to become reachable.",
  ];

  if (normalized === "win32") {
    return {
      steps: [
        "Use Windows 10 or Windows 11, then install Merly Mentor from the official source.",
        "If Merly is already installed, start it from the Windows Start menu or the installed application shortcut.",
        `Open ${DEFAULT_MERLY_BASE_URL}/api/v2/health in a browser and confirm the bridge responds.`,
        "Keep the Merly app running while Codex or Claude uses the MCP server.",
      ],
      resumeCommand: "npm run merly -- doctor",
    };
  }

  if (normalized === "darwin") {
    return {
      steps: [
        "Install Merly Mentor for macOS from the official source and follow the current OS requirements listed there.",
        "If Merly is already installed, open it from Applications and allow it to finish starting its local bridge.",
        `Open ${DEFAULT_MERLY_BASE_URL}/api/v2/health in a browser and confirm the bridge responds.`,
        "Keep the Merly app running while Codex or Claude uses the MCP server.",
      ],
      resumeCommand: "npm run merly -- doctor",
    };
  }

  return {
    steps: [
      ...commonSteps,
      `Open ${DEFAULT_MERLY_BASE_URL}/api/v2/health in a browser and confirm the bridge responds.`,
      "Keep Merly running while Codex or Claude uses the MCP server.",
    ],
    resumeCommand: "npm run merly -- doctor",
  };
}

function commandCheck({ name, command, args, cwd, summarize }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
  });

  if (result.status !== 0) {
    return {
      name,
      status: "fail",
      detail: firstUsefulLine(result.stderr || result.stdout) || `Exited with status ${result.status}.`,
    };
  }

  try {
    return {
      name,
      status: "pass",
      detail: summarize(JSON.parse(result.stdout)),
    };
  } catch (error) {
    return {
      name,
      status: "warn",
      detail: `Command succeeded, but output could not be summarized: ${error.message}`,
    };
  }
}

function summarizeAuthStatus(payload) {
  const mentor = payload.mentor_auth_mode || "none";
  const dif = payload.dif_auth_mode || "none";
  return `base_url=${payload.base_url}; mentor=${mentor}; dif=${dif}`;
}

function summarizeHealth(payload) {
  const api = payload.health?.status || "unknown";
  const daemon = payload.health?.daemon || payload.health?.daemon_status?.state || "unknown";
  const version = payload.health?.version || payload.status?.version || "unknown";
  return `api=${api}; daemon=${daemon}; version=${version}`;
}

function summarizeMcpSmoke(payload) {
  const tools = Array.isArray(payload.tools) ? payload.tools.length : 0;
  const api = payload.health?.api_health || "unknown";
  const daemon = payload.health?.daemon || "unknown";
  return `tools=${tools}; api=${api}; daemon=${daemon}`;
}

function mockDoctorChecks(mock) {
  if (mock === "healthy") {
    return [
      { name: "merly_auth_status", status: "pass", detail: "base_url=http://127.0.0.1:4201; mentor=api_key; dif=dif_api_key" },
      { name: "merly_health", status: "pass", detail: "api=ok; daemon=ok; version=mock" },
      { name: "mcp_tool_smoke", status: "pass", detail: "tools=23; api=ok; daemon=ok" },
    ];
  }

  if (mock === "missing") {
    return [
      { name: "merly_auth_status", status: "pass", detail: "base_url=http://127.0.0.1:4201; mentor=none; dif=none" },
      { name: "merly_health", status: "fail", detail: "Merly Bridge API is not reachable." },
      { name: "mcp_tool_smoke", status: "fail", detail: "MCP smoke could not call merly_health." },
    ];
  }

  return [{ name: "doctor_mock", status: "warn", detail: `Unknown mock mode: ${mock}` }];
}

function gitWorkspaceCheck(repoRoot) {
  const result = spawnSync("git", ["-C", repoRoot, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    return { status: "warn", detail: "Not running inside a Git workspace." };
  }

  return { status: "pass", detail: result.stdout.trim() };
}

function satisfiesNodeMajor(minMajor) {
  const major = Number(process.versions.node.split(".")[0]);
  return Number.isFinite(major) && major >= minMajor;
}

function statusIcon(status) {
  switch (status) {
    case "pass":
      return "PASS";
    case "fail":
      return "FAIL";
    case "warn":
      return "WARN";
    case "skip":
      return "SKIP";
    default:
      return "INFO";
  }
}

function firstUsefulLine(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizePlatform(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "macos" || normalized === "mac" || normalized === "darwin") return "darwin";
  if (normalized === "windows" || normalized === "win" || normalized === "win32") return "win32";
  if (normalized === "linux") return "linux";
  return normalized;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

class CliError extends Error {
  constructor(message, exitCode = 1, hint = "") {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

main(process.argv.slice(2));
