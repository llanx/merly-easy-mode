#!/usr/bin/env node
import process from "node:process";
import { spawn } from "node:child_process";

const page = process.argv[2] || "";
const allowedPages = new Set(["", "sign-in", "dif-api-keys", "dashboard"]);
if (!allowedPages.has(page)) {
  console.error(`Unsupported page: ${page}`);
  process.exit(1);
}

const url = `http://127.0.0.1:4202/${page}`;
const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

spawn(command, args, {
  detached: true,
  stdio: "ignore",
  windowsHide: false,
}).unref();

console.log(url);
