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

Copy the returned key into `mcp-server/.env`:

```text
MERLY_API_KEY=returned-key
```

or, for DIF-only verification:

```text
MERLY_DIF_API_KEY=returned-key
```

Then verify:

```powershell
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

From `mcp-server/`, set local environment variables for the current shell or place temporary values in ignored `mcp-server/.env`:

```text
MERLY_EMAIL=you@example.com
MERLY_PASSWORD=your-password
```

Run:

```powershell
npm run debug -- login
```

Use the returned access token as a bearer token, then create an API key:

```powershell
$env:MERLY_BEARER_TOKEN = "access-token-from-login"
npm run debug -- create-api-key "Merly Easy Mode"
```

Store only the returned API key for ongoing MCP use:

```text
MERLY_API_KEY=returned-key
MERLY_BEARER_TOKEN=
MERLY_EMAIL=
MERLY_PASSWORD=
```

Then verify:

```powershell
npm run auth:smoke
npm run debug -- me
npm run debug -- repos
```

After using the advanced path, consider rotating or changing the password you provided to the automation flow.

Do not commit `.env`, tokens, API keys, passwords, or command output containing credentials.
