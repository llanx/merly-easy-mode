#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { server } from "../src/server.js";

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

const client = new Client({
  name: "merly-mcp-smoke",
  version: "0.1.0",
});

try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = await client.listTools();
  const authStatus = await client.callTool({ name: "merly_auth_status", arguments: {} });
  const health = await client.callTool({ name: "merly_health", arguments: {} });
  const authStatusPayload = parseToolText(authStatus);
  const healthPayload = parseToolText(health);

  console.log(
    JSON.stringify(
      {
        tools: tools.tools.map((tool) => tool.name),
        auth_status: authStatusPayload,
        health: {
          bridge_version: healthPayload?.status?.version,
          api_health: healthPayload?.health?.status,
          daemon: healthPayload?.health?.daemon,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.allSettled([client.close(), server.close()]);
}

function parseToolText(result) {
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (!text) return null;
  return JSON.parse(text);
}
