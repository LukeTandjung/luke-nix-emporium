import { constants as fsConstants } from "node:fs";
import { mkdtemp, open, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

export const limits = Object.freeze({
  defaultMaxPages: 100,
  maxPages: 1000,
  defaultDpi: 150,
  minDpi: 72,
  maxDpi: 300,
  defaultWorkers: 4,
  maxWorkers: 8,
  defaultMaxResults: 50,
  maxResults: 200,
  maxPathBytes: 8 * 1024,
  maxDocumentBytes: 256 * 1024 * 1024,
  maxSelectionBytes: 16 * 1024,
  maxSelectionPages: 1000,
  maxPhraseBytes: 4 * 1024,
  maxTextBytes: 96 * 1024,
  maxJsonBytes: 256 * 1024,
  maxHitTextBytes: 1024,
  maxFontNameBytes: 256,
  maxScreenshotPages: 4,
  maxScreenshotPixels: 24 * 1024 * 1024,
  maxScreenshotDimension: 16 * 1024,
  maxScreenshotBytes: 3 * 1024 * 1024,
  maxScreenshotTotalBytes: 12 * 1024 * 1024,
});

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const commonArgumentNames = [
  "path", "targetPages", "ocr", "ocrLanguage", "numWorkers", "maxPages", "dpi", "password",
];
const parseArgumentNames = new Set([...commonArgumentNames, "format", "preserveSmallText"]);
const searchArgumentNames = new Set([...commonArgumentNames, "phrase", "caseSensitive", "maxResults"]);
const screenshotArgumentNames = new Set(["path", "pages", "dpi", "password"]);

function validateToolArguments(raw, allowed) {
  if (!isRecord(raw)) throw new Error("Tool arguments must be an object.");
  const extra = Object.keys(raw).find((key) => !allowed.has(key));
  if (extra !== undefined) throw new Error(`Unknown tool argument: ${extra}`);
}

function integer(name, value, fallback, minimum, maximum) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return result;
}

function optionalString(name, value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  const result = value.trim();
  return result || undefined;
}

function boundedOptionalString(name, value, maximumBytes, { preserve = false } = {}) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  if (Buffer.byteLength(value) > maximumBytes || value.includes("\0")) {
    throw new Error(`${name} must be at most ${maximumBytes} UTF-8 bytes and contain no NUL character.`);
  }
  const result = preserve ? value : value.trim();
  return result || undefined;
}

function boolean(name, value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function requiredString(name, value) {
  const result = optionalString(name, value);
  if (!result) throw new Error(`${name} must be a non-empty string.`);
  return result;
}

function utf8Prefix(value, maximumBytes) {
  const text = String(value ?? "");
  const buffer = Buffer.from(text);
  if (buffer.byteLength <= maximumBytes) return { text, truncated: false };
  return { text: buffer.subarray(0, maximumBytes).toString("utf8").replace(/\uFFFD$/, ""), truncated: true };
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw new Error("Document operation was cancelled.");
}

export async function workspaceRoot(value = process.env.AUTOLITH_WORKSPACE_ROOT ?? process.cwd()) {
  const root = await realpath(resolve(value));
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error("The document workspace root must be a directory.");
  return root;
}

function pathIsInside(path, root) {
  const suffix = relative(root, path);
  return suffix === "" || (!suffix.startsWith("..") && !isAbsolute(suffix));
}

export async function resolveDocumentPath(input, rootValue) {
  const root = await workspaceRoot(rootValue);
  const source = requiredString("path", input).replace(/^@/, "");
  if (Buffer.byteLength(source) > limits.maxPathBytes) {
    throw new Error(`path exceeds ${limits.maxPathBytes} UTF-8 bytes.`);
  }
  const candidate = isAbsolute(source) ? source : resolve(root, source);
  let target;
  try {
    target = await realpath(candidate);
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a regular file");
  } catch {
    throw new Error(`Document is not a readable regular file: ${source}`);
  }
  if (!pathIsInside(target, root)) {
    throw new Error(`Document path is outside the workspace root: ${root}`);
  }
  return { sourcePath: source, resolvedPath: target, workspaceRoot: root };
}

function safeDocumentExtension(path) {
  const suffix = extname(path).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(suffix) ? suffix : ".bin";
}

async function openedFilePath(handle, fallback) {
  if (process.platform === "linux") return realpath(`/proc/self/fd/${handle.fd}`);
  return realpath(fallback);
}

export async function copyBoundedFile(handle, target, maximumBytes = limits.maxDocumentBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new Error("maximumBytes must be a non-negative safe integer.");
  }
  const destination = await open(target, "wx", 0o600);
  let totalBytes = 0;
  try {
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, maximumBytes - totalBytes + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) return totalBytes;
      if (totalBytes + bytesRead > maximumBytes) {
        throw new Error(`Document exceeds ${maximumBytes} bytes.`);
      }
      let offset = 0;
      while (offset < bytesRead) {
        const { bytesWritten } = await destination.write(buffer, offset, bytesRead - offset, null);
        if (bytesWritten < 1) throw new Error("Could not write the private document snapshot.");
        offset += bytesWritten;
      }
      totalBytes += bytesRead;
    }
  } finally {
    await destination.close();
  }
}

async function withDocumentCopy(input, rootValue, callback) {
  const path = await resolveDocumentPath(input, rootValue);
  let handle;
  let directory;
  try {
    handle = await open(path.resolvedPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile()) throw new Error("Document is not a regular file.");
    if (openedInfo.size > limits.maxDocumentBytes) {
      throw new Error(`Document exceeds ${limits.maxDocumentBytes} bytes.`);
    }

    const actualPath = await openedFilePath(handle, path.resolvedPath);
    const actualInfo = await stat(actualPath);
    if (!pathIsInside(actualPath, path.workspaceRoot)
        || actualInfo.dev !== openedInfo.dev
        || actualInfo.ino !== openedInfo.ino) {
      throw new Error("Document path changed during secure open.");
    }

    directory = await mkdtemp(join(tmpdir(), "autolith-document-"));
    const parserPath = join(directory, `document${safeDocumentExtension(path.resolvedPath)}`);
    await copyBoundedFile(handle, parserPath);
    await handle.close();
    handle = undefined;
    return await callback({ ...path, parserPath });
  } finally {
    try {
      await handle?.close();
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}

export function parsePageSelection(value, { maximumCount = limits.maxSelectionPages, screenshot = false } = {}) {
  const selection = requiredString(screenshot ? "pages" : "targetPages", value);
  if (Buffer.byteLength(selection) > limits.maxSelectionBytes) {
    throw new Error(`Page selection exceeds ${limits.maxSelectionBytes} UTF-8 bytes.`);
  }
  if (selection === "all" || selection === "*") {
    throw new Error("Page selection must contain explicit page numbers and ranges.");
  }
  const pages = new Set();
  for (const rawToken of selection.split(",")) {
    const token = rawToken.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!match) throw new Error(`Invalid page selection token: ${token || "(empty)"}`);
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first) {
      throw new Error(`Invalid page range: ${token}`);
    }
    if (last > limits.maxPages) {
      throw new Error(`Page numbers cannot exceed ${limits.maxPages}.`);
    }
    for (let page = first; page <= last; page += 1) {
      pages.add(page);
      if (pages.size > maximumCount) {
        throw new Error(`Page selection exceeds the ${maximumCount}-page limit.`);
      }
    }
  }
  const result = [...pages];
  if (screenshot && result.length > limits.maxScreenshotPages) {
    throw new Error(`pages can select at most ${limits.maxScreenshotPages} pages.`);
  }
  return result;
}

export function validateCommonParameters(raw) {
  if (!isRecord(raw)) throw new Error("Tool arguments must be an object.");
  const ocr = raw.ocr ?? "auto";
  if (ocr !== "auto" && ocr !== "off") throw new Error("ocr must be auto or off.");
  const maxPages = integer("maxPages", raw.maxPages, limits.defaultMaxPages, 1, limits.maxPages);
  const targetPages = raw.targetPages === undefined
    ? undefined
    : parsePageSelection(raw.targetPages, { maximumCount: maxPages }).join(",");
  const ocrLanguage = boundedOptionalString("ocrLanguage", raw.ocrLanguage, 64) ?? "eng";
  if (!/^[A-Za-z0-9_+.-]+$/.test(ocrLanguage)) {
    throw new Error("ocrLanguage contains unsupported characters.");
  }
  return {
    ocrEnabled: ocr !== "off",
    ocrLanguage,
    numWorkers: integer("numWorkers", raw.numWorkers, limits.defaultWorkers, 1, limits.maxWorkers),
    maxPages,
    targetPages,
    dpi: integer("dpi", raw.dpi, limits.defaultDpi, limits.minDpi, limits.maxDpi),
    preserveVerySmallText: boolean("preserveSmallText", raw.preserveSmallText),
    password: boundedOptionalString("password", raw.password, 1024, { preserve: true }),
    quiet: true,
  };
}

async function defaultLiteParse() {
  return import("@llamaindex/liteparse");
}

async function parserFor(config, dependencies) {
  const module = await (dependencies.loadLiteParse ?? defaultLiteParse)();
  return { parser: new module.LiteParse(config), searchItems: module.searchItems };
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function projectItem(item, maximumTextBytes = 512) {
  const text = utf8Prefix(item?.text, maximumTextBytes);
  const result = {
    text: text.text,
    x: number(item?.x),
    y: number(item?.y),
    width: number(item?.width),
    height: number(item?.height),
  };
  let truncated = text.truncated;
  if (typeof item?.fontName === "string") {
    const fontName = utf8Prefix(item.fontName, limits.maxFontNameBytes);
    result.fontName = fontName.text;
    truncated ||= fontName.truncated;
  }
  for (const key of ["fontSize", "confidence"]) {
    if (typeof item?.[key] === "number" && Number.isFinite(item[key])) result[key] = item[key];
  }
  return { result, truncated };
}

export function boundedJsonResult(result) {
  const aggregate = utf8Prefix(result?.text, 64 * 1024);
  const output = { pages: [], text: aggregate.text, truncated: aggregate.truncated };
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  for (const page of pages) {
    const pageText = utf8Prefix(page?.text, 16 * 1024);
    const itemProjections = Array.isArray(page?.textItems)
      ? page.textItems.slice(0, 250).map((item) => projectItem(item))
      : [];
    const projected = {
      pageNum: integer("pageNum", page?.pageNum, 1, 1, 0xffffffff),
      width: number(page?.width),
      height: number(page?.height),
      text: pageText.text,
      textItems: itemProjections.map(({ result: item }) => item),
    };
    if (pageText.truncated
        || itemProjections.some(({ truncated }) => truncated)
        || projected.textItems.length < (page?.textItems?.length ?? 0)) {
      output.truncated = true;
    }
    output.pages.push(projected);
    while (Buffer.byteLength(JSON.stringify(output)) > limits.maxJsonBytes && projected.textItems.length > 0) {
      projected.textItems.pop();
      output.truncated = true;
    }
    if (Buffer.byteLength(JSON.stringify(output)) > limits.maxJsonBytes) {
      output.pages.pop();
      output.truncated = true;
      break;
    }
  }
  if (output.pages.length < pages.length) output.truncated = true;
  return output;
}

function boundedSearchResult(response) {
  while (Buffer.byteLength(JSON.stringify(response)) > limits.maxJsonBytes && response.hits.length > 0) {
    response.hits.pop();
    response.truncated = true;
  }
  if (Buffer.byteLength(JSON.stringify(response)) > limits.maxJsonBytes) {
    throw new Error("Search metadata exceeds the bounded result limit.");
  }
  return response;
}

export async function documentParse(raw, dependencies = {}) {
  assertNotAborted(dependencies.signal);
  validateToolArguments(raw, parseArgumentNames);
  const format = raw?.format ?? "text";
  if (format !== "text" && format !== "json") throw new Error("format must be text or json.");
  const config = { ...validateCommonParameters(raw), outputFormat: format };
  return withDocumentCopy(raw?.path, dependencies.workspaceRoot, async (path) => {
    const { parser } = await parserFor(config, dependencies);
    const result = await parser.parse(path.parserPath);
    assertNotAborted(dependencies.signal);
    const pageCount = Array.isArray(result?.pages) ? result.pages.length : 0;
    if (format === "json") {
      const projected = boundedJsonResult(result);
      return {
        content: [{ type: "text", text: JSON.stringify(projected) }],
        structuredContent: { pageCount, truncated: projected.truncated, format, sourcePath: path.sourcePath },
      };
    }
    const bounded = utf8Prefix(result?.text, limits.maxTextBytes);
    const prefix = `Parsed ${pageCount} page(s) from ${path.sourcePath}.${bounded.truncated ? " Output was truncated." : ""}`;
    return {
      content: [{ type: "text", text: `${prefix}\n\n${bounded.text}` }],
      structuredContent: { pageCount, truncated: bounded.truncated, format, sourcePath: path.sourcePath },
    };
  });
}

export async function documentSearch(raw, dependencies = {}) {
  assertNotAborted(dependencies.signal);
  validateToolArguments(raw, searchArgumentNames);
  const phrase = requiredString("phrase", raw?.phrase);
  if (Buffer.byteLength(phrase) > limits.maxPhraseBytes) {
    throw new Error(`phrase exceeds ${limits.maxPhraseBytes} UTF-8 bytes.`);
  }
  const maxResults = integer("maxResults", raw?.maxResults, limits.defaultMaxResults, 1, limits.maxResults);
  const caseSensitive = boolean("caseSensitive", raw.caseSensitive);
  const config = { ...validateCommonParameters(raw), outputFormat: "json", preserveVerySmallText: false };
  return withDocumentCopy(raw?.path, dependencies.workspaceRoot, async (path) => {
    const { parser, searchItems } = await parserFor(config, dependencies);
    const result = await parser.parse(path.parserPath);
    assertNotAborted(dependencies.signal);
    const hits = [];
    let truncated = false;
    for (const page of result?.pages ?? []) {
      for (const item of searchItems(page.textItems ?? [], { phrase, caseSensitive })) {
        if (hits.length === maxResults) { truncated = true; break; }
        const projected = projectItem(item, limits.maxHitTextBytes);
        hits.push({ pageNum: number(page.pageNum), ...projected.result });
        truncated ||= projected.truncated;
      }
      if (hits.length === maxResults) break;
    }
    const response = boundedSearchResult({ sourcePath: path.sourcePath, phrase, hits, truncated });
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  });
}

function validateScreenshotDimensions(pages, requestedPages, dpi) {
  const byNumber = new Map((pages ?? []).map((page) => [page.pageNum, page]));
  for (const pageNumber of requestedPages) {
    const page = byNumber.get(pageNumber);
    if (!page || !Number.isFinite(page.width) || !Number.isFinite(page.height)
        || page.width <= 0 || page.height <= 0) {
      throw new Error(`Cannot determine dimensions for screenshot page ${pageNumber}.`);
    }
    const width = Math.ceil(page.width * dpi / 72);
    const height = Math.ceil(page.height * dpi / 72);
    if (width > limits.maxScreenshotDimension || height > limits.maxScreenshotDimension
        || width * height > limits.maxScreenshotPixels) {
      throw new Error(`Screenshot page ${pageNumber} exceeds the raster size limit.`);
    }
  }
}

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 24
      || !buffer.subarray(0, 8).equals(signature)
      || buffer.readUInt32BE(8) !== 13
      || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Screenshot output is not a valid PNG header.");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1) throw new Error("Screenshot PNG dimensions must be positive.");
  return { width, height };
}

export async function documentScreenshot(raw, dependencies = {}) {
  assertNotAborted(dependencies.signal);
  validateToolArguments(raw, screenshotArgumentNames);
  const pages = raw?.pages === undefined ? [1] : parsePageSelection(raw.pages, { maximumCount: limits.maxScreenshotPages, screenshot: true });
  const dpi = integer("dpi", raw?.dpi, limits.defaultDpi, limits.minDpi, limits.maxDpi);
  const password = boundedOptionalString("password", raw.password, 1024, { preserve: true });
  const config = {
    dpi,
    password,
    quiet: true,
    ocrEnabled: false,
    outputFormat: "json",
    targetPages: pages.join(","),
    maxPages: Math.max(...pages),
  };
  return withDocumentCopy(raw?.path, dependencies.workspaceRoot, async (path) => {
    const { parser } = await parserFor(config, dependencies);
    const pageData = await parser.parse(path.parserPath);
    validateScreenshotDimensions(pageData?.pages, pages, dpi);
    const screenshots = await parser.screenshot(path.parserPath, pages);
    assertNotAborted(dependencies.signal);
    if (!Array.isArray(screenshots) || screenshots.length !== pages.length) {
      throw new Error("LiteParse returned an unexpected screenshot count.");
    }
    const content = [];
    const metadata = [];
    const requested = new Set(pages);
    const returned = new Set();
    let totalBytes = 0;
    for (const screenshot of screenshots) {
      if (!requested.has(screenshot?.pageNum) || returned.has(screenshot.pageNum)) {
        throw new Error(`LiteParse returned an unexpected screenshot page: ${screenshot?.pageNum ?? "unknown"}.`);
      }
      returned.add(screenshot.pageNum);
      const dimensions = pngDimensions(screenshot.imageBuffer);
      if (dimensions.width > limits.maxScreenshotDimension
          || dimensions.height > limits.maxScreenshotDimension
          || dimensions.width * dimensions.height > limits.maxScreenshotPixels) {
        throw new Error(`Screenshot page ${screenshot.pageNum} exceeds the PNG dimension limit.`);
      }
      const bytes = screenshot.imageBuffer.byteLength;
      totalBytes += bytes;
      if (bytes > limits.maxScreenshotBytes) throw new Error(`Screenshot page ${screenshot.pageNum} exceeds ${limits.maxScreenshotBytes} bytes.`);
      if (totalBytes > limits.maxScreenshotTotalBytes) throw new Error(`Screenshots exceed ${limits.maxScreenshotTotalBytes} bytes in total.`);
      metadata.push({ pageNum: screenshot.pageNum, ...dimensions, bytes });
      content.push({ type: "image", data: screenshot.imageBuffer.toString("base64"), mimeType: "image/png" });
    }
    content.unshift({ type: "text", text: JSON.stringify({ sourcePath: path.sourcePath, screenshots: metadata }) });
    return { content, structuredContent: { sourcePath: path.sourcePath, screenshots: metadata } };
  });
}
