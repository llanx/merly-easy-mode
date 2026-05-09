#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const { spawnSync } = require("node:child_process");
const { extractSpecRequirements, formatSpecSummary } = require("../lib/spec-adapters");

const VERSION = "0.1.0";
const CLIENTS = new Set(["codex", "claude"]);
const MERLY_MENTOR_URL = "https://www.merly.ai/mentor";
const DEFAULT_MERLY_BASE_URL = "http://127.0.0.1:4201";
const MERLY_UI_KEYS_URL = "http://127.0.0.1:4202/dif-api-keys";
const AUTH_FLOWS = new Set(["ui", "advanced"]);

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

  const client = String(options.client || "codex").toLowerCase();
  if (!CLIENTS.has(client)) {
    throw new CliError(`Unsupported client: ${client}`, 1, "Supported clients: codex, claude.");
  }

  const context = buildEasyContext(options, client);
  if (options.dryRun) {
    return runEasyDryRun(context);
  }

  return runEasyWizard(context);
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

  const flow = String(options.flow || options._[0] || "ui").toLowerCase();
  if (!AUTH_FLOWS.has(flow)) {
    throw new CliError(`Unsupported auth flow: ${flow}`, 1, "Supported flows: ui, advanced.");
  }

  const context = buildAuthContext(options);
  if (flow === "advanced") {
    return runAdvancedAuth(options, context);
  }

  return runUiAuth(options, context);
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

  const result = extractSpecFromOptions(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(formatSpecSummary(result, { title: "Spec Preflight", dryRun: options.dryRun }));
}

function runSpecVerify(argv) {
  const options = parseOptions(argv);
  if (options.help) return printSpecVerifyHelp();

  const result = extractSpecFromOptions(options);
  const payload = {
    ...result,
    changed_only: Boolean(options.changed),
    verification: {
      status: "not_run",
      reason: "Merly evidence and report writing are part of the next spec verification slice.",
    },
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(formatSpecSummary(result, { title: "Spec Verify", dryRun: options.dryRun }));
  console.log("");
  console.log(`Changed-file scope: ${options.changed ? "enabled" : "disabled"}`);
  console.log("Merly evidence: not run in this adapter slice.");
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

function extractSpecFromOptions(options) {
  const specPath = options.spec || options.input;
  if (!specPath) {
    throw new CliError("--spec is required for this spec command.");
  }

  try {
    return extractSpecRequirements(specPath, { baseDir: process.cwd() });
  } catch (error) {
    throw new CliError(`Could not extract spec requirements: ${error.message}`, 1, "Check the spec path and format.");
  }
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
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--open") {
      options.open = true;
    } else if (arg === "--confirm-advanced") {
      options.confirmAdvanced = true;
    } else if (arg === "--skip-verify") {
      options.skipVerify = true;
    } else if (arg === "--from-env") {
      options.fromEnv = true;
    } else if (arg === "--register-repo") {
      options.registerRepo = true;
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
  merly-easy easy [--client <codex|claude>] [--register-repo] [--dry-run]
  merly-easy setup --client <codex|claude> [--dry-run]
  merly-easy doctor [--platform <win32|darwin|linux>] [--dry-run]
  merly-easy auth [--flow <ui|advanced>] [--write] [--dry-run]
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
  console.log("Usage: merly-easy easy [--client <codex|claude>] [--register-repo] [--platform <win32|darwin|linux>] [--dry-run]");
}

function printSetupHelp() {
  console.log("Usage: merly-easy setup --client <codex|claude> [--target <path>] [--dry-run]");
}

function printDoctorHelp() {
  console.log("Usage: merly-easy doctor [--platform <win32|darwin|linux>] [--dry-run]");
}

function printAuthHelp() {
  console.log(`Usage:
  merly-easy auth [--flow ui] [--from-env|--api-key <key>|--dif-api-key <key>] [--write] [--open] [--target-env <path>] [--dry-run]
  merly-easy auth --flow advanced --confirm-advanced --write [--key-name <name>] [--target-env <path>] [--dry-run]

Notes:
  UI flow is preferred. Use --from-env to read MERLY_API_KEY or MERLY_DIF_API_KEY from the current shell.
  It stores only API keys in ignored local env files.
  Advanced flow reads MERLY_EMAIL and MERLY_PASSWORD from the current environment only.`);
}

function printSpecHelp() {
  console.log(`Usage:
  merly-easy spec preflight --spec <file> [--json] [--dry-run]
  merly-easy spec verify --spec <file> [--changed] [--json] [--dry-run]
  merly-easy spec report --input <file> [--dry-run]`);
}

function printSpecPreflightHelp() {
  console.log("Usage: merly-easy spec preflight --spec <file> [--json] [--dry-run]");
}

function printSpecVerifyHelp() {
  console.log("Usage: merly-easy spec verify --spec <file> [--changed] [--json] [--report-format markdown,json] [--dry-run]");
}

function printSpecReportHelp() {
  console.log("Usage: merly-easy spec report --input <file> [--format markdown,json] [--dry-run]");
}

function existsLabel(filePath) {
  return `${fs.existsSync(filePath) ? "found" : "missing"} (${filePath})`;
}

function buildEasyContext(options, client) {
  const repoRoot = path.resolve(__dirname, "..");
  const mcpServerRoot = path.join(repoRoot, "mcp-server");
  return {
    options,
    client,
    repoRoot,
    mcpServerRoot,
    platform: options.platform || process.env.MERLY_EASY_PLATFORM_MOCK || process.platform,
  };
}

function runEasyDryRun(context) {
  console.log("Merly Easy Mode (dry run)");
  console.log("");
  console.log(`Selected agent: ${context.client}`);
  console.log("No files were written.");

  printSection("1. Doctor");
  const diagnostics = collectDoctorDiagnostics({
    dryRun: true,
    mock: process.env.MERLY_EASY_DOCTOR_MOCK || "",
    platform: context.platform,
  });
  printDoctorReport(diagnostics);

  printSection("2. Auth");
  runUiAuth({ dryRun: true }, buildAuthContext({}));

  printSection("3. Agent Setup");
  printSetupProposal(buildSetupProposal(context.client, context.options), { dryRun: true });

  printSection("4. MCP Smoke");
  console.log("SKIP mcp_tool_smoke: Dry run skipped MCP server startup and tool listing.");

  printSection("5. Repository Registration");
  printRepositoryRegistrationGuidance(context);

  printSection("6. First Prompt");
  printFirstPrompt(context);
}

function runEasyWizard(context) {
  console.log("Merly Easy Mode");
  console.log("");
  console.log(`Selected agent: ${context.client}`);

  printSection("1. Doctor");
  const diagnostics = collectDoctorDiagnostics({
    dryRun: false,
    mock: process.env.MERLY_EASY_DOCTOR_MOCK || "",
    platform: context.platform,
  });
  printDoctorReport(diagnostics);
  if (hasFailedChecks(diagnostics.checks)) {
    printEasyResume(context);
    process.exitCode = 1;
    return;
  }

  printSection("2. Auth");
  const authContext = buildAuthContext({});
  const authVerification = runAuthVerification({
    context: authContext,
    envOverrides: {},
  });
  printAuthVerification(authVerification);
  if (!authVerification.ok) {
    console.log("Create a key in the local Merly UI, then run:");
    console.log("npm run merly -- auth --flow ui --from-env --write");
    printEasyResume(context);
    process.exitCode = 1;
    return;
  }

  printSection("3. Agent Setup");
  printSetupProposal(buildSetupProposal(context.client, context.options), { dryRun: true });

  printSection("4. MCP Smoke");
  printMcpSmokeFromDoctor(diagnostics);

  printSection("5. Repository Registration");
  printRepositoryRegistrationGuidance(context);

  printSection("6. First Prompt");
  printFirstPrompt(context);
  console.log("");
  console.log("Easy Mode completed without blockers.");
}

function printSection(title) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
}

function hasFailedChecks(checks) {
  return checks.some((check) => check.status === "fail");
}

function printMcpSmokeFromDoctor(diagnostics) {
  const smoke = diagnostics.checks.find((check) => check.name === "mcp_tool_smoke");
  if (!smoke) {
    console.log("SKIP mcp_tool_smoke: Doctor did not run MCP smoke.");
    return;
  }

  console.log(`${statusIcon(smoke.status)} ${smoke.name}: ${smoke.detail}`);
}

function printRepositoryRegistrationGuidance(context) {
  if (context.options.registerRepo) {
    console.log("Repository registration requested, but Easy Mode will not mutate Merly repository records directly.");
    console.log("Use the first prompt below and require the agent to ask before calling merly_create_repository.");
    return;
  }

  console.log("Repository registration is optional and was not performed.");
  console.log("The agent can resolve the workspace first and ask before registering or initializing a repository in Merly.");
}

function printFirstPrompt(context) {
  console.log("Copy this into the connected agent:");
  console.log("");
  console.log(buildFirstPrompt(context));
}

function buildFirstPrompt(context) {
  const registerClause = context.options.registerRepo
    ? "Resolve or initialize this repository in Merly if needed, but ask before registering a repository or creating commits."
    : "Resolve this repository in Merly if possible; ask before registering a repository or creating commits.";

  return `Use Merly to inspect this repository. ${registerClause} Choose one safe issue, fix it, run validation, and verify the changed code.`;
}

function printEasyResume(context) {
  console.log("");
  console.log(`Resume with: npm run easy -- --client ${context.client}`);
}

function buildAuthContext(options) {
  const repoRoot = path.resolve(__dirname, "..");
  const mcpServerRoot = path.join(repoRoot, "mcp-server");
  const envPath = resolveAuthEnvPath(options, repoRoot);
  return {
    repoRoot,
    mcpServerRoot,
    envPath,
    mock: process.env.MERLY_EASY_AUTH_MOCK || "",
  };
}

function runUiAuth(options, context) {
  const credentials = collectProvidedAuthCredentials(options);
  printAuthHeader("UI-created API key", options, context);
  console.log(`Local key page: ${MERLY_UI_KEYS_URL}`);
  console.log("");

  if (options.dryRun) {
    console.log("1. Open the local Merly UI and create an API key.");
    console.log("2. Set MERLY_API_KEY or MERLY_DIF_API_KEY in the current shell.");
    console.log("3. Rerun this command with --from-env --write.");
    console.log("4. Verify credentials with auth smoke checks.");
    console.log("");
    console.log("No files were written.");
    return;
  }

  if (options.open) {
    const opened = openMerlyUi(context.mcpServerRoot, "dif-api-keys");
    console.log(opened.ok ? `Opened local key page: ${opened.url}` : `Could not open local key page: ${opened.error}`);
    console.log("");
  }

  if (credentials.count > 0) {
    console.log(`Credential input: ${credentials.summary.join(", ")}`);
    if (options.write) {
      assertWritableAuthEnvPath(context.envPath, context.repoRoot);
      writeEnvCredentials(context.envPath, credentials.values);
      console.log(`Updated ignored env file: ${context.envPath}`);
    } else {
      console.log("No files were written. Add --write to store provided keys in the ignored env file.");
    }
    console.log("");
  } else {
    console.log("No API key was supplied on this command.");
    console.log("Verification will use existing local env credentials if present.");
    console.log("Otherwise, create a key in the local Merly UI, set MERLY_API_KEY or MERLY_DIF_API_KEY in the current shell, then rerun with --from-env --write.");
    console.log("");
  }

  if (options.skipVerify) {
    console.log("Verification skipped by --skip-verify.");
    return;
  }

  const verification = runAuthVerification({
    context,
    envOverrides: credentials.values,
  });
  printAuthVerification(verification);
  if (!verification.ok) process.exitCode = 1;
}

function runAdvancedAuth(options, context) {
  printAuthHeader("Advanced login/key creation", options, context);
  printAdvancedAuthWarning();

  if (options.dryRun) {
    console.log("1. Confirm Merly is running and reachable.");
    console.log("2. Set MERLY_EMAIL and MERLY_PASSWORD in the current shell only.");
    console.log("3. Rerun with --confirm-advanced --write to create and store a final API key.");
    console.log("4. Clear temporary account credentials and rotate or change the password after use.");
    console.log("");
    console.log("No files were written. No account credentials were read.");
    return;
  }

  if (!options.confirmAdvanced) {
    throw new CliError(
      "Advanced auth requires --confirm-advanced.",
      1,
      "Prefer `merly-easy auth --flow ui`. If you continue, set MERLY_EMAIL and MERLY_PASSWORD in the current shell only.",
    );
  }

  if (!options.write) {
    throw new CliError(
      "Advanced auth requires --write because the created API key is never printed.",
      1,
      "Use --write to store only the final API key in the ignored env file.",
    );
  }

  const email = process.env.MERLY_EMAIL || "";
  const password = process.env.MERLY_PASSWORD || "";
  if (!email || !password) {
    console.log("Blocked: MERLY_EMAIL and MERLY_PASSWORD must be set in the current shell for advanced auth.");
    console.log("No files were written.");
    process.exitCode = 1;
    return;
  }

  assertWritableAuthEnvPath(context.envPath, context.repoRoot);
  const created = createApiKeyViaAdvancedAuth({
    context,
    email,
    password,
    keyName: options.keyName || "Merly Easy Mode",
  });

  if (!created.ok) {
    console.log(`Blocked: ${created.error}`);
    console.log("No files were written.");
    process.exitCode = 1;
    return;
  }

  writeEnvCredentials(
    context.envPath,
    { MERLY_API_KEY: created.apiKey },
    ["MERLY_BEARER_TOKEN", "MERLY_EMAIL", "MERLY_PASSWORD"],
  );
  console.log(`Created API key: ${maskSecret(created.apiKey)}`);
  console.log(`Updated ignored env file: ${context.envPath}`);
  console.log("Temporary account credentials were not written. Clear MERLY_EMAIL and MERLY_PASSWORD from the current shell.");
  console.log("Recommended next step: rotate or change the password used for the advanced flow.");
  console.log("");

  if (options.skipVerify) {
    console.log("Verification skipped by --skip-verify.");
    return;
  }

  const verification = runAuthVerification({
    context,
    envOverrides: { MERLY_API_KEY: created.apiKey },
  });
  printAuthVerification(verification);
  if (!verification.ok) process.exitCode = 1;
}

function printAuthHeader(flowName, options, context) {
  console.log(`Merly Auth${options.dryRun ? " (dry run)" : ""}`);
  console.log("");
  console.log(`Flow: ${flowName}`);
  console.log(`Target env file: ${context.envPath}`);
  console.log("Credentials are never printed.");
  console.log("");
}

function printAdvancedAuthWarning() {
  console.log("Security warning:");
  console.log("- Prefer creating an API key in the Merly UI whenever possible.");
  console.log("- Advanced auth reads MERLY_EMAIL and MERLY_PASSWORD from the current shell only.");
  console.log("- Login tokens are not printed and are not written to disk.");
  console.log("- Only the final API key is stored, and only after --write is supplied.");
  console.log("- Rotate or change the password after using this flow.");
  console.log("");
}

function collectProvidedAuthCredentials(options) {
  const values = {};
  const summary = [];

  if (options.fromEnv) {
    if (process.env.MERLY_API_KEY) {
      values.MERLY_API_KEY = process.env.MERLY_API_KEY;
      summary.push(`MERLY_API_KEY ${maskSecret(process.env.MERLY_API_KEY)}`);
    }
    if (process.env.MERLY_DIF_API_KEY) {
      values.MERLY_DIF_API_KEY = process.env.MERLY_DIF_API_KEY;
      summary.push(`MERLY_DIF_API_KEY ${maskSecret(process.env.MERLY_DIF_API_KEY)}`);
    }
  }

  if (options.apiKey) {
    values.MERLY_API_KEY = String(options.apiKey);
    summary.push(`MERLY_API_KEY ${maskSecret(options.apiKey)}`);
  }

  if (options.difApiKey) {
    values.MERLY_DIF_API_KEY = String(options.difApiKey);
    summary.push(`MERLY_DIF_API_KEY ${maskSecret(options.difApiKey)}`);
  }

  return {
    values,
    summary,
    count: Object.keys(values).length,
  };
}

function resolveAuthEnvPath(options, repoRoot) {
  const selected = options.targetEnv || process.env.MERLY_EASY_AUTH_ENV_FILE;
  if (selected) return path.resolve(selected);
  return path.join(repoRoot, "mcp-server", ".env");
}

function assertWritableAuthEnvPath(envPath, repoRoot) {
  const resolved = path.resolve(envPath);
  const allowedPaths = [
    path.join(repoRoot, "mcp-server", ".env"),
  ].map((entry) => path.resolve(entry));
  const localDir = path.resolve(repoRoot, ".merly-local");

  if (allowedPaths.includes(resolved) || isPathInside(resolved, localDir)) return;

  throw new CliError(
    `Refusing to write credentials outside ignored local env paths: ${resolved}`,
    1,
    "Use the default mcp-server/.env target or an ignored .merly-local path for tests.",
  );
}

function writeEnvCredentials(envPath, updates, removeKeys = []) {
  for (const [key, value] of Object.entries(updates)) {
    if (/[\r\n]/.test(String(value))) {
      throw new CliError(`Refusing to write multiline value for ${key}.`);
    }
  }

  const directory = path.dirname(envPath);
  fs.mkdirSync(directory, { recursive: true });

  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const updateKeys = new Set(Object.keys(updates));
  const removeKeySet = new Set(removeKeys);
  const seen = new Set();
  const lines = [];

  for (const line of existing) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      if (line !== "" || lines.length > 0) lines.push(line);
      continue;
    }

    const key = match[1];
    if (removeKeySet.has(key)) {
      seen.add(key);
      continue;
    }

    if (updateKeys.has(key)) {
      lines.push(`${key}=${updates[key]}`);
      seen.add(key);
    } else {
      lines.push(line);
    }
  }

  if (lines.length === 0) {
    lines.push(`MERLY_BASE_URL=${DEFAULT_MERLY_BASE_URL}`);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, `${trimTrailingBlankLines(lines).join("\n")}\n`, "utf8");
}

function runAuthVerification({ context, envOverrides = {} }) {
  if (context.mock) {
    return mockAuthVerification(context.mock, envOverrides);
  }

  const authStatus = runJsonCommand({
    command: process.execPath,
    args: [path.join(context.mcpServerRoot, "scripts", "merly-debug.js"), "auth-status"],
    cwd: context.mcpServerRoot,
    env: buildAuthCommandEnv(context, envOverrides),
  });

  if (!authStatus.ok) {
    return {
      ok: false,
      checks: [{ status: "fail", name: "auth_status", detail: authStatus.error }],
    };
  }

  const checks = [
    { status: "pass", name: "auth_status", detail: summarizeAuthStatus(authStatus.payload) },
  ];

  if (authStatus.payload?.has_mentor_credentials) {
    const smoke = runJsonCommand({
      command: process.execPath,
      args: [path.join(context.mcpServerRoot, "scripts", "merly-debug.js"), "auth-smoke", "1"],
      cwd: context.mcpServerRoot,
      env: buildAuthCommandEnv(context, envOverrides),
    });
    checks.push(smoke.ok
      ? { status: "pass", name: "auth_smoke", detail: summarizeAuthSmoke(smoke.payload) }
      : { status: "fail", name: "auth_smoke", detail: smoke.error });
  } else if (authStatus.payload?.has_dif_credentials) {
    const smoke = runJsonCommand({
      command: process.execPath,
      args: [path.join(context.mcpServerRoot, "scripts", "merly-debug.js"), "dif-smoke", "c", "int main(){return 0;}"],
      cwd: context.mcpServerRoot,
      env: buildAuthCommandEnv(context, envOverrides),
    });
    checks.push(smoke.ok
      ? { status: "pass", name: "dif_smoke", detail: summarizeDifSmoke(smoke.payload) }
      : { status: "fail", name: "dif_smoke", detail: smoke.error });
  } else {
    checks.push({
      status: "fail",
      name: "credentials",
      detail: "No Merly API credentials are available yet.",
    });
  }

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks,
  };
}

function printAuthVerification(verification) {
  console.log("Verification:");
  for (const check of verification.checks) {
    console.log(`${statusIcon(check.status)} ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(verification.ok ? "Auth setup completed without blockers." : "Auth setup has blockers.");
}

function createApiKeyViaAdvancedAuth({ context, email, password, keyName }) {
  if (context.mock) {
    if (context.mock === "advanced-ready") {
      return { ok: true, apiKey: "mock-created-api-key-value" };
    }
    return { ok: false, error: `Auth mock did not create an API key: ${context.mock}` };
  }

  const login = runJsonCommand({
    command: process.execPath,
    args: [path.join(context.mcpServerRoot, "scripts", "merly-debug.js"), "login"],
    cwd: context.mcpServerRoot,
    env: {
      ...buildAuthCommandEnv(context),
      MERLY_EMAIL: email,
      MERLY_PASSWORD: password,
    },
    redactions: [email, password],
  });

  if (!login.ok) return { ok: false, error: `login failed: ${login.error}` };

  const accessToken = extractSecretField(login.payload, ["access_token", "accessToken", "token", "jwt", "access"]);
  if (!accessToken) {
    return { ok: false, error: "login succeeded, but no access token was returned." };
  }

  const created = runJsonCommand({
    command: process.execPath,
    args: [path.join(context.mcpServerRoot, "scripts", "merly-debug.js"), "create-api-key", keyName],
    cwd: context.mcpServerRoot,
    env: {
      ...buildAuthCommandEnv(context),
      MERLY_SKIP_LOCAL_ENV: "1",
      MERLY_BEARER_TOKEN: accessToken,
      MERLY_API_KEY: "",
      MERLY_DIF_API_KEY: "",
    },
    redactions: [email, password, accessToken],
  });

  if (!created.ok) return { ok: false, error: `API key creation failed: ${created.error}` };

  const apiKey = extractSecretField(created.payload, ["api_key", "apiKey", "key", "token", "secret", "value"]);
  if (!apiKey) {
    return { ok: false, error: "API key creation succeeded, but no API key field was returned." };
  }

  return { ok: true, apiKey };
}

function buildAuthCommandEnv(context, overrides = {}) {
  return {
    ...process.env,
    MERLY_BASE_URL: process.env.MERLY_BASE_URL || readEnvValue(context.envPath, "MERLY_BASE_URL") || DEFAULT_MERLY_BASE_URL,
    ...overrides,
  };
}

function runJsonCommand({ command, args, cwd, env, redactions = [] }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    windowsHide: true,
  });

  if (result.status !== 0) {
    return {
      ok: false,
      error: sanitizeSecretText(firstUsefulLine(result.stderr || result.stdout) || `Exited with status ${result.status}.`, redactions),
    };
  }

  try {
    return { ok: true, payload: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      ok: false,
      error: `Command succeeded, but JSON output could not be parsed: ${sanitizeSecretText(error.message, redactions)}`,
    };
  }
}

function mockAuthVerification(mock, envOverrides) {
  if (mock === "missing") {
    return {
      ok: false,
      checks: [
        { status: "pass", name: "auth_status", detail: `base_url=${DEFAULT_MERLY_BASE_URL}; mentor=none; dif=none` },
        { status: "fail", name: "credentials", detail: "No Merly API credentials are available yet." },
      ],
    };
  }

  if (mock === "existing" || mock === "healthy") {
    return {
      ok: true,
      checks: [
        { status: "pass", name: "auth_status", detail: `base_url=${DEFAULT_MERLY_BASE_URL}; mentor=api_key; dif=api_key` },
        { status: "pass", name: "auth_smoke", detail: "identity=ok; repositories=checked" },
      ],
    };
  }

  const hasMentor = Boolean(envOverrides.MERLY_API_KEY);
  const hasDif = Boolean(envOverrides.MERLY_DIF_API_KEY || envOverrides.MERLY_API_KEY);
  const checks = [
    {
      status: "pass",
      name: "auth_status",
      detail: `base_url=${DEFAULT_MERLY_BASE_URL}; mentor=${hasMentor ? "api_key" : "none"}; dif=${hasDif ? (envOverrides.MERLY_DIF_API_KEY ? "dif_api_key" : "api_key") : "none"}`,
    },
  ];

  if (hasMentor) {
    checks.push({ status: "pass", name: "auth_smoke", detail: "identity=ok; repositories=checked" });
  } else if (hasDif) {
    checks.push({ status: "pass", name: "dif_smoke", detail: "verify=ok" });
  } else {
    checks.push({ status: "fail", name: "credentials", detail: "No Merly API credentials are available yet." });
  }

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks,
  };
}

function openMerlyUi(mcpServerRoot, page) {
  const result = spawnSync(process.execPath, [path.join(mcpServerRoot, "scripts", "open-ui.js"), page], {
    cwd: mcpServerRoot,
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
  });

  if (result.status !== 0) {
    return { ok: false, error: firstUsefulLine(result.stderr || result.stdout) || `Exited with status ${result.status}.` };
  }

  return { ok: true, url: firstUsefulLine(result.stdout) || MERLY_UI_KEYS_URL };
}

function summarizeAuthSmoke(payload) {
  const repositories = Array.isArray(payload?.repositories?.data)
    ? `${payload.repositories.data.length} repository record(s)`
    : "checked";
  return `identity=${payload?.identity ? "ok" : "unknown"}; repositories=${repositories}`;
}

function summarizeDifSmoke(payload) {
  return `verify=${payload?.verify ? "ok" : "unknown"}`;
}

function readEnvValue(envPath, key) {
  if (!fs.existsSync(envPath)) return "";
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    if (line.slice(0, equalsIndex).trim() === key) {
      return unquoteEnvValue(line.slice(equalsIndex + 1).trim());
    }
  }
  return "";
}

function extractSecretField(value, fieldNames) {
  if (!value || typeof value !== "object") return "";
  for (const fieldName of fieldNames) {
    const direct = value[fieldName];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const nested = extractSecretField(child, fieldNames);
      if (nested) return nested;
    }
  }

  return "";
}

function maskSecret(value) {
  const text = String(value || "");
  return `<redacted:${text.length}>`;
}

function sanitizeSecretText(value, redactions) {
  let text = String(value || "");
  for (const secret of redactions) {
    if (secret) text = text.split(String(secret)).join("<redacted>");
  }
  return text;
}

function trimTrailingBlankLines(lines) {
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  return trimmed;
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
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
