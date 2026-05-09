#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";

const DEFAULT_PROJECT_PATH = "";
const DEFAULT_TEST_FILTER = "";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exit(0);
  }

  const requestedProjectPath = options.project || process.env.UNREAL_PROJECT_PATH || DEFAULT_PROJECT_PATH;
  const testFilter = options.test || process.env.UNREAL_AUTOMATION_TEST || DEFAULT_TEST_FILTER;
  if (!requestedProjectPath) {
    throw new Error("Unreal project path is required. Pass --project or set UNREAL_PROJECT_PATH.");
  }
  if (!testFilter) {
    throw new Error("Unreal automation test filter is required. Pass --test or set UNREAL_AUTOMATION_TEST.");
  }

  const projectPath = path.resolve(requestedProjectPath);
  const logPath = path.resolve(
    options.log || defaultLogPath(projectPath, testFilter),
  );
  const timeoutMs = clampNumber(options.timeoutMs || process.env.UNREAL_AUTOMATION_TIMEOUT_MS, 1000, 24 * 60 * 60 * 1000, DEFAULT_TIMEOUT_MS);
  const editorResolution = resolveEditorCommand(projectPath, options.editor || process.env.UNREAL_EDITOR_CMD || process.env.UNREAL_EDITOR);
  const args = buildUnrealArgs({ projectPath, testFilter, logPath });
  const commandLine = formatCommandLine(editorResolution.path || "UnrealEditor-Cmd.exe", args);

  const context = {
    project_path: projectPath,
    test_filter: testFilter,
    log_path: logPath,
    timeout_ms: timeoutMs,
    editor_path: editorResolution.path,
    editor_found: Boolean(editorResolution.path),
    searched_paths: editorResolution.searchedPaths,
    dry_run: options.dryRun,
    command_line: commandLine,
  };

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Unreal project file not found: ${projectPath}`);
  }

  if (options.dryRun || !editorResolution.path) {
    console.log(JSON.stringify(context, null, 2));
    process.exit(editorResolution.path || options.dryRun ? 0 : 1);
  }

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const exitCode = await runProcess(editorResolution.path, args, timeoutMs);
  const summary = {
    ...context,
    exit_code: exitCode,
    log_summary: summarizeLog(logPath),
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(exitCode);
} catch (error) {
  console.error(`${error.name || "Error"}: ${error.message}`);
  process.exit(1);
}

function parseArgs(args) {
  const options = {};
  const positional = [];

  for (let index = 0; index < args.length; ++index) {
    const arg = args[index];
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--project":
        options.project = requiredValue(args, ++index, arg);
        break;
      case "--test":
        options.test = requiredValue(args, ++index, arg);
        break;
      case "--log":
        options.log = requiredValue(args, ++index, arg);
        break;
      case "--editor":
        options.editor = requiredValue(args, ++index, arg);
        break;
      case "--timeout-ms":
        options.timeoutMs = requiredValue(args, ++index, arg);
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positional.push(arg);
        break;
    }
  }

  if (!options.project && positional[0]) options.project = positional[0];
  if (!options.test && positional[1]) options.test = positional[1];
  return options;
}

function requiredValue(args, index, optionName) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function buildUnrealArgs({ projectPath, testFilter, logPath }) {
  return [
    projectPath,
    "-unattended",
    "-nop4",
    "-nosplash",
    "-NoSound",
    "-NullRHI",
    `-ExecCmds=Automation RunTests ${testFilter}; Quit`,
    "-TestExit=Automation Test Queue Empty",
    "-stdout",
    "-FullStdOutLogOutput",
    `-AbsLog=${logPath}`,
  ];
}

function resolveEditorCommand(projectPath, explicitPath) {
  const searchedPaths = [];
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    searchedPaths.push(resolved);
    return {
      path: fs.existsSync(resolved) ? resolved : "",
      searchedPaths,
    };
  }

  const candidates = editorCandidates(projectPath);
  for (const candidate of candidates) {
    searchedPaths.push(candidate);
    if (fs.existsSync(candidate)) {
      return { path: candidate, searchedPaths };
    }
  }

  return { path: "", searchedPaths };
}

function editorCandidates(projectPath) {
  const association = readEngineAssociation(projectPath);
  const roots = [
    process.env.EPIC_GAMES_ROOT,
    "C:\\Program Files\\Epic Games",
    "C:\\Program Files (x86)\\Epic Games",
    "D:\\UnrealEngine",
    "D:\\Program Files\\Epic Games",
    "D:\\Epic Games",
  ].filter(Boolean);

  const candidates = [];
  for (const installedDirectory of readKnownEngineInstallDirectories(projectPath)) {
    candidates.push(path.join(installedDirectory, "Engine", "Binaries", "Win64", "UnrealEditor-Cmd.exe"));
  }

  for (const root of roots) {
    if (association) {
      candidates.push(path.join(root, `UE_${association}`, "Engine", "Binaries", "Win64", "UnrealEditor-Cmd.exe"));
    }

    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("UE_")) {
        candidates.push(path.join(root, entry.name, "Engine", "Binaries", "Win64", "UnrealEditor-Cmd.exe"));
      }
    }
  }

  return [...new Set(candidates)];
}

function readKnownEngineInstallDirectories(projectPath) {
  const association = readEngineAssociation(projectPath);
  const directories = [];

  directories.push(...readLauncherInstallDirectories(association));
  directories.push(...readRegistryInstallDirectories(association));

  return [...new Set(directories.filter(Boolean))];
}

function readLauncherInstallDirectories(association) {
  const launcherInstalledPath = "C:\\ProgramData\\Epic\\UnrealEngineLauncher\\LauncherInstalled.dat";
  if (!fs.existsSync(launcherInstalledPath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(launcherInstalledPath, "utf8"));
    return (data.InstallationList || [])
      .filter((entry) => !association || entry.ArtifactId === `UE_${association}` || entry.AppName === `UE_${association}`)
      .map((entry) => entry.InstallLocation);
  } catch {
    return [];
  }
}

function readRegistryInstallDirectories(association) {
  if (process.platform !== "win32" || !association) return [];

  const registryRoots = [
    "HKLM\\SOFTWARE\\EpicGames\\Unreal Engine",
    "HKLM\\SOFTWARE\\WOW6432Node\\EpicGames\\Unreal Engine",
  ];
  const directories = [];

  for (const root of registryRoots) {
    const output = readRegistryValue(`${root}\\${association}`, "InstalledDirectory");
    if (output) directories.push(output);
  }

  return directories;
}

function readRegistryValue(key, valueName) {
  try {
    const result = spawnSync("reg.exe", ["query", key, "/v", valueName], { encoding: "utf8" });
    if (result.status !== 0) return "";
    const match = result.stdout.match(new RegExp(`${valueName}\\s+REG_\\w+\\s+(.+)`, "i"));
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function readEngineAssociation(projectPath) {
  try {
    const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
    return String(project.EngineAssociation || "").trim();
  } catch {
    return "";
  }
}

function defaultLogPath(projectPath, testFilter) {
  const projectRoot = path.dirname(projectPath);
  const name = `${sanitizeFileName(testFilter.split(".").at(-1) || "Automation")}.log`;
  return path.join(projectRoot, "Saved", "Logs", name);
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "_");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Unreal automation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

function summarizeLog(logPath) {
  if (!fs.existsSync(logPath)) {
    return { exists: false };
  }

  const text = fs.readFileSync(logPath, "utf8");
  return {
    exists: true,
    found_tests: findLastMatch(text, /Found \d+ automation tests[^\r\n]*/g),
    completed: findLastMatch(text, /Test Completed[^\r\n]*/g),
    exit: findLastMatch(text, /\*{4} TEST COMPLETE\. EXIT CODE: \d+ \*{4}/g),
  };
}

function findLastMatch(text, pattern) {
  const matches = [...text.matchAll(pattern)];
  return matches.length > 0 ? matches[matches.length - 1][0] : null;
}

function formatCommandLine(command, args) {
  return [command, ...args].map(quoteArg).join(" ");
}

function quoteArg(value) {
  const text = String(value);
  if (!/[\s;]/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function usage() {
  console.log(`Usage:
  npm run unreal:automation -- [project_path] [test_filter]
  npm run unreal:automation -- --project <uproject> --test <filter> --log <log_path>
  npm run unreal:automation -- --dry-run

Environment:
  UNREAL_EDITOR_CMD        Absolute path to UnrealEditor-Cmd.exe
  UNREAL_PROJECT_PATH      Default .uproject path
  UNREAL_AUTOMATION_TEST   Default automation test filter
  UNREAL_AUTOMATION_TIMEOUT_MS

Required:
  Pass --project and --test, or set UNREAL_PROJECT_PATH and UNREAL_AUTOMATION_TEST.
`);
}
