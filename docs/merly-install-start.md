# Merly Install And Start Guidance

Merly Easy Mode does not bundle Merly binaries, installers, models, runtime data, or license files. Install and update Merly Mentor from the official Merly source:

```text
https://www.merly.ai/mentor
```

Use this guide when `npm run merly -- doctor` reports that the Merly bridge API is missing or unreachable.

## What Must Be Running

The MCP server talks to the local Merly bridge API. The default bridge health URL is:

```text
http://127.0.0.1:4201/api/v2/health
```

When Merly is running, opening that URL in a browser should return a health response. If your bridge uses another host or port, set `MERLY_BASE_URL` in `mcp-server/.env`.

## Windows

1. Install Merly Mentor from the official Merly source.
2. Start Merly Mentor from the Windows Start menu or the installed application shortcut.
3. Wait for the app or service to finish starting.
4. Open `http://127.0.0.1:4201/api/v2/health` in a browser.
5. Return to this repository and run:

```powershell
npm run merly -- doctor
npm run mcp:smoke
```

## macOS

1. Install Merly Mentor from the official Merly source and follow the current OS requirements listed there.
2. Open Merly Mentor from Applications.
3. Wait for the app or service to finish starting.
4. Open `http://127.0.0.1:4201/api/v2/health` in a browser.
5. Return to this repository and run:

```sh
npm run merly -- doctor
npm run mcp:smoke
```

## If The Bridge Still Fails

- Confirm Merly Mentor is still running.
- Confirm no firewall or local security tool is blocking the bridge port.
- Confirm `MERLY_BASE_URL` matches your bridge host and port if you changed the default.
- Run `npm run merly -- doctor` again and follow the printed platform-specific guidance.
