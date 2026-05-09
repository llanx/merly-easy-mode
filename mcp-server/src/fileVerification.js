import fs from "node:fs";
import path from "node:path";
import { summarizeDifResult } from "./difSummary.js";

export async function verifyFileWithDif(
  client,
  {
    language,
    file_path,
    workspace_path,
    start_line,
    end_line,
    response_mode = "script",
    sensitivity = 0,
    max_bytes = 200000,
    include_raw = false,
  },
) {
  if (!language) throw new Error("verifyFileWithDif requires language.");
  if (!file_path) throw new Error("verifyFileWithDif requires file_path.");

  const file = readFileSlice({
    file_path,
    workspace_path,
    start_line,
    end_line,
    max_bytes,
  });

  const raw = await client.verifySnippet({
    language,
    code: file.code,
    response_mode,
    sensitivity,
  });

  return {
    file: {
      path: file.path,
      relative_path: file.relative_path,
      total_lines: file.total_lines,
      verified_start_line: file.verified_start_line,
      verified_end_line: file.verified_end_line,
      verified_lines: file.verified_lines,
      verified_bytes: Buffer.byteLength(file.code, "utf8"),
    },
    verification: summarizeDifResult(raw),
    raw: include_raw ? raw : undefined,
  };
}

export function readFileSlice({ file_path, workspace_path, start_line, end_line, max_bytes = 200000 }) {
  const basePath = workspace_path ? path.resolve(workspace_path) : process.cwd();
  const resolvedPath = path.isAbsolute(file_path) ? path.resolve(file_path) : path.resolve(basePath, file_path);
  const content = fs.readFileSync(resolvedPath, "utf8");
  const totalBytes = Buffer.byteLength(content, "utf8");

  if (!start_line && !end_line && totalBytes > max_bytes) {
    throw new Error(`File is ${totalBytes} bytes, above max_bytes=${max_bytes}. Provide start_line/end_line.`);
  }

  const lines = content.split(/\r?\n/);
  const startIndex = start_line ? Math.max(0, start_line - 1) : 0;
  const endIndex = end_line ? Math.min(lines.length, end_line) : lines.length;

  if (endIndex < startIndex) {
    throw new Error("end_line must be greater than or equal to start_line.");
  }

  const selectedLines = lines.slice(startIndex, endIndex);
  const code = selectedLines.join("\n");
  const selectedBytes = Buffer.byteLength(code, "utf8");

  if (selectedBytes > max_bytes) {
    throw new Error(`Selected code is ${selectedBytes} bytes, above max_bytes=${max_bytes}. Narrow the line range.`);
  }

  return {
    path: resolvedPath,
    relative_path: path.relative(basePath, resolvedPath) || path.basename(resolvedPath),
    total_lines: lines.length,
    verified_start_line: startIndex + 1,
    verified_end_line: endIndex,
    verified_lines: selectedLines.length,
    code,
  };
}
