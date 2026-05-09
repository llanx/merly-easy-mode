# Merly Auth Setup

Protected Merly API endpoints require either:

```text
MERLY_API_KEY
MERLY_BEARER_TOKEN
```

`merly_health` works without credentials. Repository and issue tools require full Mentor credentials. DIF verification can use a DIF-only key:

```text
MERLY_DIF_API_KEY
```

A Merly license key is not the same thing as an API key. Keep license-shaped values in:

```text
MERLY_LICENSE_KEY
```

The MCP server does not send `MERLY_LICENSE_KEY` to API v2 endpoints.

## Fast Path: Create A DIF Key In The UI

The installed UI includes a DIF API key page:

```text
http://127.0.0.1:4202/dif-api-keys
```

Open it from the project:

```powershell
cd C:\Users\matts\merly\merly-codex-integration\mcp-server
npm run open:keys
```

Sign in, create a key, copy the raw key, and put it in `.env`:

```text
MERLY_DIF_API_KEY=returned-key
```

Then verify:

```powershell
npm run debug -- auth-status
npm run dif:smoke
```

This unlocks `merly_verify_snippet`. It may not unlock repository and issue endpoints.

Expected successful auth status:

```json
{
  "has_mentor_credentials": false,
  "has_dif_credentials": true,
  "mentor_auth_mode": "none",
  "dif_auth_mode": "dif_api_key"
}
```

## Option A: Use An Existing API Key

Create a local `.env` file:

```powershell
cd C:\Users\matts\merly\merly-codex-integration\mcp-server
Copy-Item .env.example .env
notepad .env
```

Set:

```text
MERLY_API_KEY=your-key
```

Then verify:

```powershell
npm run debug -- auth-status
npm run auth:smoke
npm run debug -- me
npm run debug -- repos
```

## Option B: Log In And Use A Bearer Token

Use Merly credentials to obtain a short-lived bearer token:

```powershell
cd C:\Users\matts\merly\merly-codex-integration\mcp-server
notepad .env
```

Set:

```text
MERLY_EMAIL=you@example.com
MERLY_PASSWORD=your-password
```

Then run:

```powershell
npm run debug -- login
```

The login response contains:

```text
access_token
refresh_token
expires_in
```

Set the access token for the current session:

```text
MERLY_BEARER_TOKEN=access-token-from-login
```

Then verify:

```powershell
npm run debug -- auth-status
npm run debug -- me
npm run debug -- repos
```

If your account uses Google or GitHub sign-in, browser login does not automatically authenticate the MCP server. The local UI may not expose a full Mentor API-key page even though `/api/v2/me/api-keys` exists in the OpenAPI spec. In that case, use a Merly password only for one-time CLI login/API-key creation, then clear `MERLY_EMAIL`, `MERLY_PASSWORD`, and `MERLY_BEARER_TOKEN` from `.env`.

## Option C: Create An API Key After Login

After setting `MERLY_BEARER_TOKEN`, create an API key:

```powershell
$env:MERLY_BEARER_TOKEN = "access-token-from-login"
npm run debug -- create-api-key "Codex MCP Prototype"
```

The raw key is returned once. Set it for MCP use:

```text
MERLY_API_KEY=returned-key
MERLY_BEARER_TOKEN=
```

Then verify:

```powershell
npm run auth:smoke
npm run debug -- me
npm run debug -- repos
```

Do not commit `.env`, tokens, API keys, or command output containing credentials.
