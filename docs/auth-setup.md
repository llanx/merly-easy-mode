# Merly Auth Setup

Protected Merly API endpoints require one of:

```text
MERLY_API_KEY
MERLY_BEARER_TOKEN
```

DIF verification can also use:

```text
MERLY_DIF_API_KEY
```

`merly_health` works without credentials. Repository, issue, and re-analysis tools require full Mentor credentials.

A Merly license key is not the same thing as an API credential. If you keep a license value locally, store it separately:

```text
MERLY_LICENSE_KEY
```

The MCP server does not send `MERLY_LICENSE_KEY` to API v2 endpoints.

## Default Path: Create A Key In The UI

Open the local Merly UI and create an API key from the account/API-key area. For DIF-only usage, the local key page is:

```text
http://127.0.0.1:4202/dif-api-keys
```

From `mcp-server/`, you can open that page with:

```powershell
npm run open:keys
```

From the repository root, Merly Easy Mode can store the key in the ignored `mcp-server/.env` file and verify it without printing the key.

On PowerShell:

```powershell
$env:MERLY_API_KEY = "<returned-key>"
npm run merly -- auth --flow ui --from-env --write
Remove-Item Env:\MERLY_API_KEY
```

For DIF-only verification:

```powershell
$env:MERLY_DIF_API_KEY = "<returned-key>"
npm run merly -- auth --flow ui --from-env --write
Remove-Item Env:\MERLY_DIF_API_KEY
```

If you prefer to edit the file yourself, copy the returned key into `mcp-server/.env`:

```text
MERLY_API_KEY=returned-key
```

or, for DIF-only verification:

```text
MERLY_DIF_API_KEY=returned-key
```

Then verify:

```powershell
npm run merly -- auth
npm run debug -- auth-status
npm run auth:smoke
```

For DIF-only credentials:

```powershell
npm run dif:smoke
```

## Advanced Path: Login And Create A Key

Use this only when you understand the tradeoff of letting a local automation flow handle your Merly account credentials. Prefer the UI-created key path when possible.

Do not put account credentials in tracked files. If you use temporary values, clear them immediately after creating the API key.

From the repository root, run a dry run first:

```powershell
npm run merly -- auth --flow advanced --dry-run
```

Set local environment variables for the current shell. Do not put these values in tracked files:

```powershell
$env:MERLY_EMAIL = "you@example.com"
$env:MERLY_PASSWORD = "<password>"
```

Then create and store the final API key:

```powershell
npm run merly -- auth --flow advanced --confirm-advanced --write
Remove-Item Env:\MERLY_EMAIL
Remove-Item Env:\MERLY_PASSWORD
```

Then verify:

```powershell
npm run merly -- auth
```

The advanced flow does not print login tokens or the created API key. It writes only the final API key to the ignored env file and removes temporary account credential fields if they are present in that file.

After using the advanced path, rotate or change the password you provided to the automation flow.

Do not commit `.env`, tokens, API keys, passwords, or command output containing credentials.
