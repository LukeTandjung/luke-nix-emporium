import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

export const OCR_MODEL = "paddleocr-vl-1.6";
export const DEFAULT_OCR_URL = "http://127.0.0.1:8080/v1";

const TASK_PROMPTS = Object.freeze({
  ocr: "OCR:",
  formula: "Formula Recognition:",
  table: "Table Recognition:",
  chart: "Chart Recognition:",
  seal: "Seal Recognition:",
  spotting: "Spotting:",
});

const MIME_TYPES = Object.freeze({
  ".bmp": "image/bmp",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
});

const SUPPORTED_EXTENSIONS = new Set([...Object.keys(MIME_TYPES), ".pdf"]);

export class OcrError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "OcrError";
  }
}

export function validateParameters(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OcrError("Tool arguments must be an object.");
  }

  const path = value.path;
  if (typeof path !== "string" || path.trim() === "") {
    throw new OcrError("path must be a non-empty string.");
  }

  const task = value.task ?? "ocr";
  if (!Object.hasOwn(TASK_PROMPTS, task)) {
    throw new OcrError(`task must be one of: ${Object.keys(TASK_PROMPTS).join(", ")}.`);
  }

  return {
    path,
    task,
    pageStart: integerInRange(value.pageStart, "pageStart", 1, Number.MAX_SAFE_INTEGER, 1),
    maxPages: integerInRange(value.maxPages, "maxPages", 1, 100, 20),
    dpi: integerInRange(value.dpi, "dpi", 72, 300, 150),
    timeoutSeconds: integerInRange(value.timeoutSeconds, "timeoutSeconds", 1, 1800, 300),
  };
}

function integerInRange(value, name, minimum, maximum, defaultValue) {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    const upper = maximum === Number.MAX_SAFE_INTEGER ? "" : ` and at most ${maximum}`;
    throw new OcrError(`${name} must be an integer of at least ${minimum}${upper}.`);
  }
  return value;
}

export function extractText(payload) {
  if (typeof payload !== "object" || payload === null || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new OcrError("The OCR server returned no choices.");
  }
  const choice = payload.choices[0];
  if (typeof choice !== "object" || choice === null || typeof choice.message !== "object" || choice.message === null || typeof choice.message.content !== "string") {
    throw new OcrError("The OCR server returned an unexpected response shape.");
  }
  return choice.message.content.trim();
}

function timeoutSignal(externalSignal, timeoutSeconds) {
  const timeout = AbortSignal.timeout(timeoutSeconds * 1000);
  return externalSignal ? AbortSignal.any([externalSignal, timeout]) : timeout;
}

async function runCommand(command, args, signal, spawnImpl = spawn) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawnImpl(command, args, { signal, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => fail(new OcrError(`${command} failed: ${error.message}`, { cause: error })));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new OcrError(`${command} exited with ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
      } else {
        resolvePromise(Buffer.concat(stdout).toString("utf8"));
      }
    });
  });
}

function requestBody(bytes, mimeType, prompt) {
  return {
    model: OCR_MODEL,
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` } },
      ],
    }],
  };
}

export async function recognizeImageFiles(imagePaths, parameters, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const readFileImpl = options.readFileImpl ?? readFile;
  const endpoint = (options.endpoint ?? process.env.PADDLE_OCR_URL ?? DEFAULT_OCR_URL).replace(/\/+$/, "");
  const results = [];

  for (const [index, imagePath] of imagePaths.entries()) {
    const imageExtension = extname(imagePath).toLowerCase();
    const mimeType = MIME_TYPES[imageExtension];
    if (mimeType === undefined) throw new OcrError(`Unsupported image type after conversion: ${imageExtension || "no extension"}.`);

    let bytes;
    try {
      bytes = await readFileImpl(imagePath);
    } catch (error) {
      throw new OcrError(`Cannot read ${imagePath}: ${error.message}`, { cause: error });
    }

    let response;
    try {
      response = await fetchImpl(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody(bytes, mimeType, TASK_PROMPTS[parameters.task])),
        signal: timeoutSignal(options.signal, parameters.timeoutSeconds),
      });
    } catch (error) {
      const reason = error?.name === "TimeoutError" ? `timed out after ${parameters.timeoutSeconds} seconds` : error.message;
      throw new OcrError(`OCR request for page ${index + 1} failed: ${reason}`, { cause: error });
    }

    if (!response.ok) {
      const body = (await response.text()).slice(0, 1000);
      throw new OcrError(`OCR server returned HTTP ${response.status}: ${body}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new OcrError(`OCR server returned invalid JSON: ${error.message}`, { cause: error });
    }
    const text = extractText(payload);
    results.push(imagePaths.length === 1 ? text : `## Page ${index + 1}\n\n${text}`);
  }

  return results.join("\n\n");
}

export async function paddleOcr(rawParameters, options = {}) {
  const parameters = validateParameters(rawParameters);
  const inputPath = resolve(parameters.path);
  const extension = extname(inputPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new OcrError(`Unsupported input type: ${extension || "no extension"}. Use BMP, JPEG, PNG, WebP, or PDF.`);
  }

  let temporaryDirectory;
  try {
    let imagePaths = [inputPath];
    if (extension === ".pdf") {
      temporaryDirectory = await (options.mkdtempImpl ?? mkdtemp)(join(tmpdir(), "autolith-paddle-ocr-"));
      const outputPrefix = join(temporaryDirectory, "page");
      const pageEnd = parameters.pageStart + parameters.maxPages - 1;
      await runCommand("pdftoppm", [
        "-f", String(parameters.pageStart), "-l", String(pageEnd), "-r", String(parameters.dpi),
        "-png", inputPath, outputPrefix,
      ], timeoutSignal(options.signal, parameters.timeoutSeconds), options.spawnImpl);

      imagePaths = (await (options.readdirImpl ?? readdir)(temporaryDirectory))
        .filter((name) => name.startsWith("page-") && name.endsWith(".png"))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        .map((name) => join(temporaryDirectory, name));
      if (imagePaths.length === 0) throw new OcrError("PDF conversion produced no pages.");
    }

    const text = await recognizeImageFiles(imagePaths, parameters, options);
    return {
      content: [{ type: "text", text }],
      structuredContent: {
        model: OCR_MODEL,
        pages: imagePaths.length,
        task: parameters.task,
        source: inputPath,
      },
    };
  } finally {
    if (temporaryDirectory !== undefined) {
      await (options.rmImpl ?? rm)(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
