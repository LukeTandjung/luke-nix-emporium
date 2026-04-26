import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type, type TSchema } from "typebox";

type Result<T, E extends Error> = T | E;
type VoidResult = Error | undefined;

type NotificationLevel = "info" | "warning" | "error";

interface ServerConfig {
	command: string;
	args: Array<string>;
}

interface PendingRequest {
	resolve: (value: Result<unknown, Error>) => void;
	timeout: ReturnType<typeof setTimeout>;
	signal?: AbortSignal;
	abortHandler?: () => void;
}

interface TextToolContent {
	type: "text";
	text: string;
}

interface ImageToolContent {
	type: "image";
	data: string;
	mimeType: string;
}

type ToolContent = TextToolContent | ImageToolContent;

interface MappedToolResult {
	content: Array<ToolContent>;
	details: {
		mcpToolName: string;
		contentTypes: Array<string>;
	};
}

interface TypstToolDefinition {
	name: string;
	mcpName: string;
	label: string;
	description: string;
	promptSnippet: string;
	promptGuidelines: Array<string>;
	parameters: TSchema;
}

const DEFAULT_DOCKER_IMAGE = "ghcr.io/johannesbrandenburger/typst-mcp:latest";
const DEFAULT_SERVER_CONFIG: ServerConfig = {
	command: "docker",
	args: ["run", "--rm", "-i", DEFAULT_DOCKER_IMAGE],
};
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_STDERR_CHARS = 8_000;
const MAX_TEXT_BYTES = 50 * 1024;
const MAX_TEXT_LINES = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(value: Record<string, unknown>, field: string): string | undefined {
	const fieldValue = value[field];
	return typeof fieldValue === "string" ? fieldValue : undefined;
}

function getNumberField(value: Record<string, unknown>, field: string): number | undefined {
	const fieldValue = value[field];
	return typeof fieldValue === "number" ? fieldValue : undefined;
}

function getRecordField(value: Record<string, unknown>, field: string): Record<string, unknown> | undefined {
	const fieldValue = value[field];
	return isRecord(fieldValue) ? fieldValue : undefined;
}

function hasOwnField(value: Record<string, unknown>, field: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, field);
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch (error: unknown) {
		return error instanceof Error ? error.message : String(value);
	}
}

function parseJson(value: string): Result<unknown, Error> {
	try {
		return JSON.parse(value);
	} catch (error: unknown) {
		return error instanceof Error ? error : new Error(String(error));
	}
}

function parseArgs(value: string | undefined): Array<string> {
	if (!value || value.trim().length === 0) {
		return DEFAULT_SERVER_CONFIG.args;
	}

	const json = parseJson(value);
	if (!(json instanceof Error) && Array.isArray(json) && json.every((entry) => typeof entry === "string")) {
		return json;
	}

	return value.split(/\s+/).filter((entry) => entry.length > 0);
}

function getServerConfig(): ServerConfig {
	return {
		command: process.env.TYPST_MCP_COMMAND ?? DEFAULT_SERVER_CONFIG.command,
		args: parseArgs(process.env.TYPST_MCP_ARGS),
	};
}

function getTimeoutMs(): number {
	const value = Number(process.env.TYPST_MCP_TIMEOUT_MS);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function formatCommand(config: ServerConfig): string {
	return [config.command, ...config.args].join(" ");
}

function formatJsonRpcError(error: Record<string, unknown>): string {
	const code = getNumberField(error, "code");
	const message = getStringField(error, "message") ?? stringifyUnknown(error);
	const data = hasOwnField(error, "data") ? `\n${stringifyUnknown(error.data)}` : "";
	return code === undefined ? `${message}${data}` : `${message} (${code})${data}`;
}

function appendTail(current: string, addition: string, maxChars: number): string {
	const next = `${current}${addition}`;
	return next.length > maxChars ? next.slice(next.length - maxChars) : next;
}

function truncateUtf8(text: string, maxBytes: number): string {
	let bytes = 0;
	let endIndex = 0;

	for (const char of text) {
		const charBytes = Buffer.byteLength(char, "utf8");
		if (bytes + charBytes > maxBytes) {
			break;
		}

		bytes += charBytes;
		endIndex += char.length;
	}

	return text.slice(0, endIndex);
}

function saveFullText(toolName: string, text: string): string | Error {
	try {
		const directory = mkdtempSync(join(tmpdir(), "pi-typst-mcp-"));
		const filePath = join(directory, `${toolName}.txt`);
		writeFileSync(filePath, text, "utf8");
		return filePath;
	} catch (error: unknown) {
		return error instanceof Error ? error : new Error(String(error));
	}
}

function truncateToolText(toolName: string, text: string): string {
	const normalized = text.replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	const lineLimited = lines.length > MAX_TEXT_LINES ? lines.slice(0, MAX_TEXT_LINES).join("\n") : normalized;
	const byteLimited =
		Buffer.byteLength(lineLimited, "utf8") > MAX_TEXT_BYTES ? truncateUtf8(lineLimited, MAX_TEXT_BYTES) : lineLimited;
	const truncated = lineLimited !== normalized || byteLimited !== lineLimited;

	if (!truncated) {
		return normalized;
	}

	const savedPath = saveFullText(toolName, normalized);
	const saveNote =
		savedPath instanceof Error
			? `Could not save full output: ${savedPath.message}`
			: `Full output saved to: ${savedPath}`;

	return `${byteLimited}\n\n[Output truncated to ${MAX_TEXT_LINES} lines / ${MAX_TEXT_BYTES} bytes. ${saveNote}]`;
}

function mapContentItem(toolName: string, item: unknown): Array<ToolContent> {
	if (typeof item === "string") {
		return [{ type: "text", text: truncateToolText(toolName, item) }];
	}

	if (!isRecord(item)) {
		return [{ type: "text", text: truncateToolText(toolName, stringifyUnknown(item)) }];
	}

	const type = getStringField(item, "type");
	if (type === "text") {
		return [{ type: "text", text: truncateToolText(toolName, getStringField(item, "text") ?? "") }];
	}

	if (type === "image") {
		const data = getStringField(item, "data");
		if (!data) {
			return [{ type: "text", text: "Typst MCP returned an image without base64 data." }];
		}

		const explicitMimeType = getStringField(item, "mimeType") ?? getStringField(item, "mime_type");
		const format = getStringField(item, "format");
		const mimeType = explicitMimeType ?? (format ? `image/${format}` : "image/png");
		return [{ type: "image", data, mimeType }];
	}

	return [{ type: "text", text: truncateToolText(toolName, stringifyUnknown(item)) }];
}

function mapMcpToolResult(toolName: string, result: unknown): MappedToolResult | Error {
	const contentValue = isRecord(result) ? result.content : undefined;
	const contentItems = Array.isArray(contentValue) ? contentValue : [result];
	const content = contentItems.flatMap((item) => mapContentItem(toolName, item));

	if (content.length === 0) {
		return new Error(`Typst MCP tool ${toolName} returned no content.`);
	}

	return {
		content,
		details: {
			mcpToolName: toolName,
			contentTypes: content.map((item) => item.type),
		},
	};
}

function getTextForError(content: Array<ToolContent>): string {
	return content
		.filter((item): item is TextToolContent => item.type === "text")
		.map((item) => item.text)
		.join("\n");
}

function isMcpToolError(result: unknown): boolean {
	return isRecord(result) && result.isError === true;
}

function notify(ctx: ExtensionContext, message: string, level: NotificationLevel): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

export default function typstMcpExtension(pi: ExtensionAPI): void {
	let serverProcess: ReturnType<typeof spawn> | undefined;
	let initialized = false;
	let initPromise: Promise<VoidResult> | undefined;
	let nextRequestId = 1;
	let stdoutBuffer = "";
	let stderrTail = "";
	let stdoutDecoder: StringDecoder | undefined;
	const pending = new Map<number, PendingRequest>();

	function settlePending(id: number, value: Result<unknown, Error>): void {
		const request = pending.get(id);
		if (!request) {
			return;
		}

		pending.delete(id);
		clearTimeout(request.timeout);
		if (request.signal && request.abortHandler) {
			request.signal.removeEventListener("abort", request.abortHandler);
		}
		request.resolve(value);
	}

	function settleAllPending(error: Error): void {
		Array.from(pending.keys()).forEach((id) => {
			settlePending(id, error);
		});
	}

	function handleJsonRpcMessage(message: unknown): void {
		if (!isRecord(message)) {
			return;
		}

		const id = getNumberField(message, "id");
		if (id === undefined || !pending.has(id)) {
			return;
		}

		const error = getRecordField(message, "error");
		if (error) {
			settlePending(id, new Error(formatJsonRpcError(error)));
			return;
		}

		if (hasOwnField(message, "result")) {
			settlePending(id, message.result);
			return;
		}

		settlePending(id, new Error(`JSON-RPC response ${id} had neither result nor error.`));
	}

	function handleStdoutChunk(chunk: Buffer): void {
		const text = stdoutDecoder ? stdoutDecoder.write(chunk) : chunk.toString("utf8");
		stdoutBuffer = `${stdoutBuffer}${text}`;

		let newlineIndex = stdoutBuffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const line = stdoutBuffer.slice(0, newlineIndex).trim();
			stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

			if (line.length > 0) {
				const parsed = parseJson(line);
				if (!(parsed instanceof Error)) {
					handleJsonRpcMessage(parsed);
				}
			}

			newlineIndex = stdoutBuffer.indexOf("\n");
		}
	}

	function sendJsonRpcMessage(message: Record<string, unknown>): VoidResult {
		if (!serverProcess || !serverProcess.stdin.writable) {
			return new Error("Typst MCP server is not running.");
		}

		serverProcess.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
		return undefined;
	}

	function request(method: string, params: unknown, signal: AbortSignal | undefined): Promise<Result<unknown, Error>> {
		if (signal?.aborted) {
			return Promise.resolve(new Error(`Typst MCP request ${method} was aborted before it started.`));
		}

		if (!serverProcess) {
			return Promise.resolve(new Error("Typst MCP server is not running."));
		}

		const id = nextRequestId;
		nextRequestId += 1;

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				settlePending(id, new Error(`Typst MCP request ${method} timed out after ${getTimeoutMs()}ms.`));
			}, getTimeoutMs());

			const abortHandler = () => {
				settlePending(id, new Error(`Typst MCP request ${method} was aborted.`));
			};

			pending.set(id, { resolve, timeout, signal, abortHandler });
			signal?.addEventListener("abort", abortHandler, { once: true });

			const sendError = sendJsonRpcMessage({ jsonrpc: "2.0", id, method, params });
			if (sendError) {
				settlePending(id, sendError);
			}
		});
	}

	function sendNotification(method: string, params: unknown): VoidResult {
		return sendJsonRpcMessage({ jsonrpc: "2.0", method, params });
	}

	function stopServer(message = "Typst MCP server stopped."): void {
		const child = serverProcess;
		serverProcess = undefined;
		initialized = false;
		initPromise = undefined;
		settleAllPending(new Error(message));

		if (child && !child.killed) {
			child.kill();
		}
	}

	function startServer(): VoidResult {
		if (serverProcess) {
			return undefined;
		}

		const config = getServerConfig();
		stdoutBuffer = "";
		stderrTail = "";
		stdoutDecoder = new StringDecoder("utf8");

		try {
			const child = spawn(config.command, config.args, { stdio: ["pipe", "pipe", "pipe"] });
			serverProcess = child;

			child.stdout.on("data", handleStdoutChunk);
			child.stderr.on("data", (chunk: Buffer) => {
				stderrTail = appendTail(stderrTail, chunk.toString("utf8"), MAX_STDERR_CHARS);
			});
			child.on("error", (error) => {
				if (serverProcess === child) {
					serverProcess = undefined;
					initialized = false;
					initPromise = undefined;
				}
				settleAllPending(new Error(`Typst MCP server failed to start (${formatCommand(config)}): ${error.message}`));
			});
			child.on("exit", (code, signal) => {
				if (serverProcess !== child) {
					return;
				}

				serverProcess = undefined;
				initialized = false;
				initPromise = undefined;
				const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
				const stderrNote = stderrTail.trim().length > 0 ? `\nRecent stderr:\n${stderrTail.trim()}` : "";
				settleAllPending(new Error(`Typst MCP server exited with ${reason}.${stderrNote}`));
			});

			return undefined;
		} catch (error: unknown) {
			return error instanceof Error ? error : new Error(String(error));
		}
	}

	async function initialize(signal: AbortSignal | undefined): Promise<VoidResult> {
		const startError = startServer();
		if (startError) {
			return startError;
		}

		const result = await request(
			"initialize",
			{
				protocolVersion: DEFAULT_PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: { name: "pi-typst-mcp", version: "0.1.0" },
			},
			signal,
		);

		if (result instanceof Error) {
			stopServer(`Typst MCP initialization failed: ${result.message}`);
			return result;
		}

		const notifyError = sendNotification("notifications/initialized", {});
		if (notifyError) {
			stopServer(`Typst MCP initialization failed: ${notifyError.message}`);
			return notifyError;
		}

		initialized = true;
		return undefined;
	}

	async function ensureInitialized(signal: AbortSignal | undefined): Promise<VoidResult> {
		if (initialized && serverProcess) {
			return undefined;
		}

		if (!initPromise) {
			initPromise = initialize(signal).then((result) => {
				if (result instanceof Error) {
					initialized = false;
					initPromise = undefined;
					return result;
				}

				initPromise = undefined;
				return undefined;
			});
		}

		return initPromise;
	}

	async function callMcpTool(toolName: string, args: unknown, signal: AbortSignal | undefined): Promise<MappedToolResult | Error> {
		const initError = await ensureInitialized(signal);
		if (initError) {
			return new Error(
				`Could not start Typst MCP server. Default command: ${formatCommand(getServerConfig())}\n${initError.message}`,
			);
		}

		const response = await request("tools/call", { name: toolName, arguments: args }, signal);
		if (response instanceof Error) {
			return response;
		}

		const mapped = mapMcpToolResult(toolName, response);
		if (mapped instanceof Error) {
			return mapped;
		}

		if (isMcpToolError(response)) {
			const text = getTextForError(mapped.content);
			return new Error(text.length > 0 ? text : `Typst MCP tool ${toolName} failed.`);
		}

		return mapped;
	}

	function registerTypstTool(tool: TypstToolDefinition): void {
		pi.registerTool({
			name: tool.name,
			label: tool.label,
			description: tool.description,
			promptSnippet: tool.promptSnippet,
			promptGuidelines: tool.promptGuidelines,
			parameters: tool.parameters,
			executionMode: "sequential",
			async execute(_toolCallId, params, signal) {
				const result = await callMcpTool(tool.mcpName, params, signal);
				if (result instanceof Error) {
					throw result;
				}

				return result;
			},
		});
	}

	const tools: Array<TypstToolDefinition> = [
		{
			name: "list_docs_chapters",
			mcpName: "list_docs_chapters",
			label: "List Typst Docs Chapters",
			description: "List chapters and routes in the Typst documentation via the Typst MCP Docker server.",
			promptSnippet: "List Typst documentation chapters and route identifiers.",
			promptGuidelines: ["Use list_docs_chapters before fetching Typst documentation chapters by route."],
			parameters: Type.Object({}),
		},
		{
			name: "get_docs_chapter",
			mcpName: "get_docs_chapter",
			label: "Get Typst Docs Chapter",
			description: "Fetch a Typst documentation chapter by route via the Typst MCP Docker server.",
			promptSnippet: "Fetch one Typst documentation chapter by route.",
			promptGuidelines: ["Use get_docs_chapter after list_docs_chapters identifies the relevant Typst docs route."],
			parameters: Type.Object({
				route: Type.String({ description: "Typst docs route, for example ____reference____layout____colbreak." }),
			}),
		},
		{
			name: "get_docs_chapters",
			mcpName: "get_docs_chapters",
			label: "Get Typst Docs Chapters",
			description: "Fetch multiple Typst documentation chapters by route via the Typst MCP Docker server.",
			promptSnippet: "Fetch multiple Typst documentation chapters by route.",
			promptGuidelines: ["Use get_docs_chapters when multiple Typst docs routes are needed for one task."],
			parameters: Type.Object({
				routes: Type.Array(Type.String(), { description: "Typst docs routes to fetch." }),
			}),
		},
		{
			name: "latex_snippet_to_typst",
			mcpName: "latex_snippet_to_typst",
			label: "Convert LaTeX to Typst",
			description: "Convert a LaTeX snippet to Typst via the Typst MCP Docker server and Pandoc.",
			promptSnippet: "Convert a LaTeX snippet to Typst.",
			promptGuidelines: ["Use latex_snippet_to_typst when adapting LaTeX examples or math into Typst."],
			parameters: Type.Object({
				latex_snippet: Type.String({ description: "LaTeX snippet to convert." }),
			}),
		},
		{
			name: "latex_snippets_to_typst",
			mcpName: "latex_snippets_to_typst",
			label: "Convert LaTeX Snippets to Typst",
			description: "Convert multiple LaTeX snippets to Typst via the Typst MCP Docker server and Pandoc.",
			promptSnippet: "Convert multiple LaTeX snippets to Typst.",
			promptGuidelines: ["Use latex_snippets_to_typst when converting several LaTeX snippets in one task."],
			parameters: Type.Object({
				latex_snippets: Type.Array(Type.String(), { description: "LaTeX snippets to convert." }),
			}),
		},
		{
			name: "check_if_snippet_is_valid_typst_syntax",
			mcpName: "check_if_snippet_is_valid_typst_syntax",
			label: "Validate Typst Syntax",
			description: "Check whether a Typst snippet has valid syntax via the Typst MCP Docker server.",
			promptSnippet: "Validate one Typst snippet for syntax errors.",
			promptGuidelines: ["Use check_if_snippet_is_valid_typst_syntax before presenting or committing non-trivial Typst code."],
			parameters: Type.Object({
				typst_snippet: Type.String({ description: "Typst snippet to validate." }),
			}),
		},
		{
			name: "check_if_snippets_are_valid_typst_syntax",
			mcpName: "check_if_snippets_are_valid_typst_syntax",
			label: "Validate Typst Snippets Syntax",
			description: "Check whether multiple Typst snippets have valid syntax via the Typst MCP Docker server.",
			promptSnippet: "Validate multiple Typst snippets for syntax errors.",
			promptGuidelines: ["Use check_if_snippets_are_valid_typst_syntax when checking several generated Typst snippets."],
			parameters: Type.Object({
				typst_snippets: Type.Array(Type.String(), { description: "Typst snippets to validate." }),
			}),
		},
		{
			name: "typst_snippet_to_image",
			mcpName: "typst_snippet_to_image",
			label: "Render Typst Snippet to Image",
			description: "Render a Typst snippet to a PNG image via the Typst MCP Docker server.",
			promptSnippet: "Render a Typst snippet to a PNG image.",
			promptGuidelines: ["Use typst_snippet_to_image for complex Typst visuals when image inspection is useful."],
			parameters: Type.Object({
				typst_snippet: Type.String({ description: "Typst snippet to render." }),
			}),
		},
		{
			name: "typst_to_image",
			mcpName: "typst_snippet_to_image",
			label: "Render Typst to Image",
			description: "Alias for typst_snippet_to_image. Render a Typst snippet to a PNG image via the Typst MCP Docker server.",
			promptSnippet: "Render a Typst snippet to a PNG image.",
			promptGuidelines: ["Use typst_to_image as an alias for typst_snippet_to_image when the task asks to render Typst."],
			parameters: Type.Object({
				typst_snippet: Type.String({ description: "Typst snippet to render." }),
			}),
		},
	];

	tools.forEach(registerTypstTool);

	pi.registerCommand("typst-mcp", {
		description: "Manage the Typst MCP Docker bridge (status, start, restart, stop)",
		handler: async (args, ctx) => {
			const action = args.trim().length > 0 ? args.trim() : "status";

			if (action === "status") {
				const state = initialized && serverProcess ? "running" : initPromise ? "starting" : "stopped";
				notify(ctx, `Typst MCP bridge is ${state}. Command: ${formatCommand(getServerConfig())}`, "info");
				return;
			}

			if (action === "start") {
				const result = await ensureInitialized(undefined);
				notify(ctx, result instanceof Error ? `Typst MCP failed to start: ${result.message}` : "Typst MCP bridge started.", result instanceof Error ? "error" : "info");
				return;
			}

			if (action === "restart") {
				stopServer("Typst MCP bridge restarting.");
				const result = await ensureInitialized(undefined);
				notify(ctx, result instanceof Error ? `Typst MCP failed to restart: ${result.message}` : "Typst MCP bridge restarted.", result instanceof Error ? "error" : "info");
				return;
			}

			if (action === "stop") {
				stopServer();
				notify(ctx, "Typst MCP bridge stopped.", "info");
				return;
			}

			notify(ctx, "Usage: /typst-mcp status | start | restart | stop", "warning");
		},
	});

	pi.on("session_shutdown", async () => {
		stopServer("Typst MCP bridge shutting down.");
	});
}
