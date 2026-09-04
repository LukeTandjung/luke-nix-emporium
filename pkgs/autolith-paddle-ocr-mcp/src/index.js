#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { paddleOcr } from "./ocr.js";

export const tool = {
  name: "paddle_ocr",
  title: "PaddleOCR-VL",
  description: "Extract text, formulas, tables, charts, seals, or text positions from a local BMP, JPEG, PNG, WebP, or PDF file with PaddleOCR-VL-1.6.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: {
      path: { type: "string", minLength: 1, description: "Absolute or working-directory-relative path to an image or PDF." },
      task: { type: "string", enum: ["ocr", "formula", "table", "chart", "seal", "spotting"], default: "ocr", description: "Recognition task." },
      pageStart: { type: "integer", minimum: 1, default: 1, description: "First PDF page to process, starting at 1." },
      maxPages: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "Maximum PDF pages to process." },
      dpi: { type: "integer", minimum: 72, maximum: 300, default: 150, description: "PDF rendering resolution." },
      timeoutSeconds: { type: "integer", minimum: 1, maximum: 1800, default: 300, description: "Timeout for PDF conversion and each OCR page request." },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export function createServer() {
  const server = new Server({ name: "autolith-paddle-ocr-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [tool] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== tool.name) {
      return { content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }], isError: true };
    }
    try {
      return await paddleOcr(request.params.arguments ?? {}, { signal: extra.signal });
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
