import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const OCR_ENDPOINT = process.env.PADDLE_OCR_URL ?? "http://127.0.0.1:8080/v1";
const OCR_MODEL = "paddleocr-vl-1.6";
const DEFAULT_TIMEOUT_SECONDS = 300;

const OcrParameters = Type.Object({
	path: Type.String({ description: "Absolute or working-directory-relative path to an image or PDF." }),
	task: Type.Optional(Type.Union([
		Type.Literal("ocr"),
		Type.Literal("formula"),
		Type.Literal("table"),
		Type.Literal("chart"),
		Type.Literal("seal"),
		Type.Literal("spotting"),
	], { description: "Recognition task. Defaults to OCR." })),
	pageStart: Type.Optional(Type.Integer({ description: "First PDF page to process, starting at 1.", minimum: 1 })),
	maxPages: Type.Optional(Type.Integer({ description: "Maximum PDF pages to process. Defaults to 20.", minimum: 1, maximum: 100 })),
	dpi: Type.Optional(Type.Integer({ description: "PDF rendering resolution. Defaults to 150 DPI.", minimum: 72, maximum: 300 })),
	timeoutSeconds: Type.Optional(Type.Integer({ description: "Timeout for each page. Defaults to 300 seconds.", minimum: 1, maximum: 1800 })),
});

class OcrError extends Error {}

interface CommandResult {
	stdout: string;
}

function runCommand(command: string, args: Array<string>, signal: AbortSignal): Promise<CommandResult | OcrError> {
	return new Promise((complete) => {
		const child = spawn(command, args, { signal, stdio: ["ignore", "pipe", "pipe"] });
		const stdout: Array<Buffer> = [];
		const stderr: Array<Buffer> = [];

		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", (error) => complete(new OcrError(`${command} failed: ${error.message}`)));
		child.on("close", (code) => {
			if (code !== 0) {
				complete(new OcrError(`${command} exited with ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
				return;
			}
			complete({ stdout: Buffer.concat(stdout).toString("utf8") });
		});
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function extractText(payload: unknown): string | OcrError {
	if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
		return new OcrError("The OCR server returned no choices.");
	}
	const choice: unknown = payload.choices[0];
	if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") {
		return new OcrError("The OCR server returned an unexpected response shape.");
	}
	return choice.message.content.trim();
}

export default function ocrExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "paddle_ocr",
		label: "PaddleOCR-VL",
		description: "Extract text, formulas, tables, charts, seals, or text positions from local images and PDFs with the local PaddleOCR-VL-1.6 model.",
		promptSnippet: "OCR local images and PDFs with PaddleOCR-VL-1.6",
		promptGuidelines: [
			"Use paddle_ocr when visual text or document structure must be extracted from a local image or PDF. Use read for ordinary text files.",
		],
		parameters: OcrParameters,
		async execute(_toolCallId, params, signal, onUpdate) {
			const inputPath = resolve(params.path);
			const extension = extname(inputPath).toLowerCase();
			const taskPrompts: Record<string, string> = {
				ocr: "OCR:",
				formula: "Formula Recognition:",
				table: "Table Recognition:",
				chart: "Chart Recognition:",
				seal: "Seal Recognition:",
				spotting: "Spotting:",
			};
			const prompt = taskPrompts[params.task ?? "ocr"] ?? "OCR:";
			const supportedExtensions = new Set([".bmp", ".jpeg", ".jpg", ".pdf", ".png", ".webp"]);
			if (!supportedExtensions.has(extension)) {
				throw new OcrError(`Unsupported input type: ${extension || "no extension"}. Use BMP, JPEG, PNG, WebP, or PDF.`);
			}
			const timeoutSeconds = params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
			const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutSeconds * 1000)]);
			let temporaryDirectory: string | undefined;
			let imagePaths = [inputPath];

			if (extension === ".pdf") {
				temporaryDirectory = await mkdtemp(join(tmpdir(), "pi-paddle-ocr-"));
				const pageStart = params.pageStart ?? 1;
				const pageEnd = pageStart + (params.maxPages ?? 20) - 1;
				const outputPrefix = join(temporaryDirectory, "page");
				const conversion = await runCommand("pdftoppm", [
					"-f", String(pageStart), "-l", String(pageEnd), "-r", String(params.dpi ?? 150),
					"-png", inputPath, outputPrefix,
				], requestSignal);
				if (conversion instanceof Error) throw conversion;

				imagePaths = (await readdir(temporaryDirectory))
					.filter((path) => path.startsWith("page-") && path.endsWith(".png"))
					.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
					.map((path) => join(temporaryDirectory ?? "", path));
				if (imagePaths.length === 0) throw new OcrError("PDF conversion produced no pages.");
			}

			try {
				const results: Array<string> = [];
				for (const [index, imagePath] of imagePaths.entries()) {
					onUpdate?.({ content: [{ type: "text", text: `OCR page ${index + 1} of ${imagePaths.length}...` }] });
					const bytes = await readFile(imagePath);
					const imageExtension = extname(imagePath).toLowerCase();
					const mimeTypes: Record<string, string> = {
						".bmp": "image/bmp",
						".jpeg": "image/jpeg",
						".jpg": "image/jpeg",
						".png": "image/png",
						".webp": "image/webp",
					};
					const mimeType = mimeTypes[imageExtension] ?? "image/png";
					const response = await fetch(`${OCR_ENDPOINT}/chat/completions`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							model: OCR_MODEL,
							temperature: 0,
							messages: [{
								role: "user",
								content: [
									{ type: "text", text: prompt },
									{ type: "image_url", image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` } },
								],
							}],
						}),
						signal: requestSignal,
					});
					if (!response.ok) throw new OcrError(`OCR server returned HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
					const payload: unknown = await response.json();
					const text = extractText(payload);
					if (text instanceof Error) throw text;
					results.push(imagePaths.length === 1 ? text : `## Page ${index + 1}\n\n${text}`);
				}

				return {
					content: [{ type: "text", text: results.join("\n\n") }],
					details: { model: OCR_MODEL, pages: imagePaths.length, task: params.task ?? "ocr", source: inputPath },
				};
			} finally {
				if (temporaryDirectory !== undefined) await rm(temporaryDirectory, { recursive: true, force: true });
			}
		},
	});
}
