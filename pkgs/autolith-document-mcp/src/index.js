#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { documentParse, documentScreenshot, documentSearch, limits } from "./document.js";

const commonProperties = {
  path: { type: "string", minLength: 1, maxLength: limits.maxPathBytes, description: "Workspace-relative or workspace-contained absolute document path." },
  targetPages: { type: "string", minLength: 1, maxLength: limits.maxSelectionBytes, description: "Explicit pages and ranges, for example 1-5,8." },
  ocr: { type: "string", enum: ["auto", "off"], default: "auto", description: "Enable local automatic OCR or disable OCR." },
  ocrLanguage: { type: "string", minLength: 1, maxLength: 64, default: "eng", description: "Tesseract OCR language code." },
  numWorkers: { type: "integer", minimum: 1, maximum: limits.maxWorkers, default: limits.defaultWorkers },
  maxPages: { type: "integer", minimum: 1, maximum: limits.maxPages, default: limits.defaultMaxPages },
  dpi: { type: "integer", minimum: limits.minDpi, maximum: limits.maxDpi, default: limits.defaultDpi },
  password: { type: "string", maxLength: 1024, description: "Optional document password." },
};

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const tools = [
  {
    name: "document_parse",
    title: "Document Parse",
    description: "Parse a workspace document with LiteParse and return bounded text or stable JSON with page coordinates.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        ...commonProperties,
        format: { type: "string", enum: ["text", "json"], default: "text" },
        preserveSmallText: { type: "boolean", default: false },
      },
    },
    annotations: { ...annotations, openWorldHint: true },
  },
  {
    name: "document_search",
    title: "Document Search",
    description: "Search a workspace document and return bounded phrase hits with page numbers and bounding boxes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "phrase"],
      properties: {
        ...commonProperties,
        phrase: { type: "string", minLength: 1, maxLength: limits.maxPhraseBytes },
        caseSensitive: { type: "boolean", default: false },
        maxResults: { type: "integer", minimum: 1, maximum: limits.maxResults, default: limits.defaultMaxResults },
      },
    },
    annotations: { ...annotations, openWorldHint: true },
  },
  {
    name: "document_screenshot",
    title: "Document Screenshot",
    description: "Render one to four explicit document pages as bounded PNG image blocks.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: commonProperties.path,
        pages: { type: "string", maxLength: limits.maxSelectionBytes, default: "1", description: "At most four explicit pages or ranges. all and * are not accepted." },
        dpi: commonProperties.dpi,
        password: commonProperties.password,
      },
    },
    annotations,
  },
];

const handlers = new Map([
  ["document_parse", documentParse],
  ["document_search", documentSearch],
  ["document_screenshot", documentScreenshot],
]);

export function createServer(options = {}) {
  const server = new Server({ name: "autolith-document-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const handler = handlers.get(request.params.name);
    if (!handler) return { content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }], isError: true };
    try {
      return await handler(request.params.arguments ?? {}, { ...options, signal: extra.signal });
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createServer().connect(new StdioServerTransport());
}
