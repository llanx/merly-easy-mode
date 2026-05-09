import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function getConfig(env = process.env) {
  loadLocalEnv(env);

  return {
    baseUrl: normalizeBaseUrl(env.MERLY_BASE_URL || "http://127.0.0.1:4201"),
    apiKey: env.MERLY_API_KEY || "",
    difApiKey: env.MERLY_DIF_API_KEY || "",
    bearerToken: env.MERLY_BEARER_TOKEN || "",
    merlyWorkDir: env.MERLY_WORK_DIR || env.MERLY_AWD || "",
  };
}

export function hasCredentials(config = getConfig()) {
  return Boolean(config.apiKey || config.bearerToken || config.difApiKey);
}

export function hasMentorCredentials(config = getConfig()) {
  return Boolean(config.apiKey || config.bearerToken);
}

export function hasDifCredentials(config = getConfig()) {
  return Boolean(config.difApiKey || config.apiKey || config.bearerToken);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function loadLocalEnv(env) {
  if (env.MERLY_SKIP_LOCAL_ENV === "1") return;

  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(sourceDir, "..", ".env"),
  ];

  for (const envPath of [...new Set(envPaths)]) {
    loadEnvFile(env, envPath);
  }
}

function loadEnvFile(env, envPath) {
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    const value = unquote(line.slice(equalsIndex + 1).trim());
    if (!env[key]) env[key] = value;
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
