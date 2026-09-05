#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { notifyUser } from "./notify.js";

export const tool = {
  name: "notify_user",
  title: "Notify user",
  description: "Send a native desktop notification to the user.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: {
        message: { type: "string", minLength: 1, maxLength: 4096, description: "Notification body." },
        title: { type: "string", minLength: 1, maxLength: 256, default: "Autolith", description: "Notification title." },
        priority: { type: "string", enum: ["low", "normal", "high"], default: "normal", description: "Notification priority. High maps to critical urgency on Linux." },
    },
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export function createServer() {
  const server = new Server({ name: "autolith-notify-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [tool] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== tool.name) {
      return { content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }], isError: true };
    }
    try {
      return await notifyUser(request.params.arguments ?? {}, { signal: extra.signal });
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
