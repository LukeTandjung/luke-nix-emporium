import assert from "node:assert/strict";
import { mkdtemp, open, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  boundedJsonResult,
  copyBoundedFile,
  documentParse,
  documentScreenshot,
  documentSearch,
  limits,
  parsePageSelection,
  resolveDocumentPath,
  validateCommonParameters,
} from "../src/document.js";
import { tools } from "../src/index.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "document-mcp-test-"));
  await writeFile(join(root, "document.pdf"), "%PDF-1.4\nfixture");
  return root;
}

function pngHeader(width = 10, height = 20, extraBytes = 0) {
  const buffer = Buffer.alloc(24 + extraBytes);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function mockModule({ result, screenshots } = {}) {
  return {
    LiteParse: class {
      constructor(config) { this.config = config; }
      async parse(input) {
        assert.match(input, /document\.pdf$/);
        return result ?? {
          text: "Alpha beta",
          pages: [{ pageNum: 1, width: 612, height: 792, text: "Alpha beta", textItems: [
            { text: "Alpha beta", x: 10, y: 20, width: 50, height: 12, fontName: "Test", fontSize: 12 },
          ] }],
        };
      }
      async screenshot() {
        return screenshots ?? [{ pageNum: 1, width: 10, height: 20, imageBuffer: pngHeader() }];
      }
    },
    searchItems(items, { phrase, caseSensitive }) {
      const needle = caseSensitive ? phrase : phrase.toLowerCase();
      return items.filter((item) => (caseSensitive ? item.text : item.text.toLowerCase()).includes(needle));
    },
  };
}

const loadLiteParse = (options) => async () => mockModule(options);

test("the server exposes the three document tools as read-only tools", () => {
  assert.deepEqual(tools.map((tool) => tool.name), ["document_parse", "document_search", "document_screenshot"]);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});

test("page selections expand ranges, remove duplicates, and enforce bounds", () => {
  assert.deepEqual(parsePageSelection("1-3,2,7"), [1, 2, 3, 7]);
  assert.deepEqual(parsePageSelection("1-4,1-2,4", { maximumCount: 4 }), [1, 2, 3, 4]);
  assert.deepEqual(parsePageSelection(String(limits.maxPages)), [limits.maxPages]);
  assert.throws(() => parsePageSelection("all"), /explicit page numbers/);
  assert.throws(() => parsePageSelection("3-1"), /Invalid page range/);
  assert.throws(() => parsePageSelection(String(limits.maxPages + 1)), /cannot exceed/);
  assert.throws(() => parsePageSelection("9007199254740992"), /Invalid page range/);
  assert.throws(() => parsePageSelection("1-5", { maximumCount: 4, screenshot: true }), /4-page limit/);
  assert.throws(() => parsePageSelection("1-4,5", { maximumCount: 4, screenshot: true }), /4-page limit/);
});

test("common parameters have bounded defaults and validation", () => {
  assert.deepEqual(validateCommonParameters({}), {
    ocrEnabled: true,
    ocrLanguage: "eng",
    numWorkers: limits.defaultWorkers,
    maxPages: limits.defaultMaxPages,
    targetPages: undefined,
    dpi: limits.defaultDpi,
    preserveVerySmallText: false,
    password: undefined,
    quiet: true,
  });
  assert.throws(() => validateCommonParameters({ dpi: 400 }), /dpi/);
  assert.throws(() => validateCommonParameters({ numWorkers: 0 }), /numWorkers/);
});


test("document handlers require plain closed argument objects", async () => {
  const inherited = Object.create({ path: "document.pdf" });
  for (const [handler, valid] of [
    [documentParse, { path: "document.pdf" }],
    [documentSearch, { path: "document.pdf", phrase: "alpha" }],
    [documentScreenshot, { path: "document.pdf" }],
  ]) {
    await assert.rejects(() => handler(inherited), /arguments must be an object/);
    await assert.rejects(() => handler(new Date()), /arguments must be an object/);
    await assert.rejects(() => handler([]), /arguments must be an object/);
    await assert.rejects(() => handler(null), /arguments must be an object/);
    await assert.rejects(() => handler({ ...valid, unknown: true }), /Unknown tool argument: unknown/);
  }
});

test("bounded snapshot copies enforce their byte limit while reading", async () => {
  const root = await mkdtemp(join(tmpdir(), "document-copy-test-"));
  const sourcePath = join(root, "source.pdf");
  await writeFile(sourcePath, "abcde");
  try {
    const oversizedSource = await open(sourcePath, "r");
    try {
      await assert.rejects(
        () => copyBoundedFile(oversizedSource, join(root, "oversized.pdf"), 4),
        /exceeds 4 bytes/,
      );
    } finally {
      await oversizedSource.close();
    }

    const exactSource = await open(sourcePath, "r");
    try {
      assert.equal(await copyBoundedFile(exactSource, join(root, "exact.pdf"), 5), 5);
      assert.equal(await readFile(join(root, "exact.pdf"), "utf8"), "abcde");
    } finally {
      await exactSource.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("path resolution accepts files in the workspace and blocks symlink escapes", async () => {
  const root = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "document-mcp-outside-"));
  try {
    await writeFile(join(outside, "private.pdf"), "%PDF");
    await symlink(join(outside, "private.pdf"), join(root, "escape.pdf"));
    const inside = await resolveDocumentPath("document.pdf", root);
    assert.equal(inside.resolvedPath, join(root, "document.pdf"));
    await assert.rejects(() => resolveDocumentPath("escape.pdf", root), /outside the workspace root/);
    await assert.rejects(() => resolveDocumentPath(join(outside, "private.pdf"), root), /outside the workspace root/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});


test("document parsing uses a private snapshot and removes it afterwards", async () => {
  const root = await fixture();
  let parserPath;
  try {
    const loadSnapshotParser = async () => ({
      LiteParse: class {
        async parse(input) {
          parserPath = input;
          assert.notEqual(input, join(root, "document.pdf"));
          await writeFile(join(root, "document.pdf"), "replacement");
          assert.equal(await readFile(input, "utf8"), "%PDF-1.4\nfixture");
          return { text: "snapshot", pages: [] };
        }
      },
      searchItems: () => [],
    });
    const response = await documentParse(
      { path: "document.pdf" },
      { workspaceRoot: root, loadLiteParse: loadSnapshotParser },
    );
    assert.match(response.content[0].text, /snapshot/);
    await assert.rejects(() => stat(parserPath), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("document_parse returns text and stable projected JSON", async () => {
  const root = await fixture();
  try {
    const text = await documentParse({ path: "document.pdf" }, { workspaceRoot: root, loadLiteParse: loadLiteParse() });
    assert.match(text.content[0].text, /Parsed 1 page/);
    assert.match(text.content[0].text, /Alpha beta/);

    const json = await documentParse({ path: "document.pdf", format: "json" }, { workspaceRoot: root, loadLiteParse: loadLiteParse() });
    const parsed = JSON.parse(json.content[0].text);
    assert.deepEqual(parsed.pages[0].textItems[0], {
      text: "Alpha beta", x: 10, y: 20, width: 50, height: 12, fontName: "Test", fontSize: 12,
    });
    assert.equal(parsed.pages[0].pageNum, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parse output is bounded", () => {
  const projected = boundedJsonResult({
    text: "x".repeat(limits.maxJsonBytes),
    pages: Array.from({ length: 100 }, (_, index) => ({
      pageNum: index + 1, width: 1, height: 1, text: "y".repeat(20_000),
      textItems: Array.from({ length: 500 }, () => ({ text: "z".repeat(1000), x: 0, y: 0, width: 1, height: 1 })),
    })),
  });
  assert.equal(projected.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(projected)) <= limits.maxJsonBytes);
});

test("document_search returns bounded projected hits", async () => {
  const root = await fixture();
  try {
    const response = await documentSearch(
      { path: "document.pdf", phrase: "alpha", maxResults: 1 },
      { workspaceRoot: root, loadLiteParse: loadLiteParse() },
    );
    assert.equal(response.structuredContent.hits.length, 1);
    assert.equal(response.structuredContent.hits[0].pageNum, 1);
    assert.equal(response.structuredContent.hits[0].text, "Alpha beta");
    await assert.rejects(
      () => documentSearch({ path: "document.pdf", phrase: "x".repeat(limits.maxPhraseBytes + 1) }, { workspaceRoot: root }),
      /phrase exceeds/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("document_search enforces its aggregate response limit", async () => {
  const root = await fixture();
  try {
    const items = Array.from({ length: limits.maxResults }, () => ({
      text: `alpha ${"x".repeat(5000)}`,
      fontName: "f".repeat(5000),
      x: 1, y: 2, width: 3, height: 4,
    }));
    const response = await documentSearch(
      { path: "document.pdf", phrase: "alpha", maxResults: limits.maxResults },
      { workspaceRoot: root, loadLiteParse: loadLiteParse({ result: {
        text: "", pages: [{ pageNum: 1, width: 612, height: 792, text: "", textItems: items }],
      } }) },
    );
    assert.equal(response.structuredContent.truncated, true);
    assert.ok(Buffer.byteLength(response.content[0].text) <= limits.maxJsonBytes);
    assert.ok(response.structuredContent.hits.length < limits.maxResults);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("document_screenshot returns bounded PNG image blocks", async () => {
  const root = await fixture();
  try {
    const response = await documentScreenshot(
      { path: "document.pdf", pages: "1" },
      { workspaceRoot: root, loadLiteParse: loadLiteParse() },
    );
    assert.equal(response.content[1].type, "image");
    assert.equal(response.content[1].mimeType, "image/png");
    assert.equal(response.structuredContent.screenshots[0].bytes, 24);

    const rejectPng = (buffer, pattern) => assert.rejects(
      () => documentScreenshot(
        { path: "document.pdf" },
        { workspaceRoot: root, loadLiteParse: loadLiteParse({ screenshots: [{ pageNum: 1, imageBuffer: buffer }] }) },
      ),
      pattern,
    );
    await rejectPng(pngHeader(0, 1), /dimensions must be positive/);
    await rejectPng(pngHeader(1, 0), /dimensions must be positive/);

    const boundary = await documentScreenshot(
      { path: "document.pdf" },
      { workspaceRoot: root, loadLiteParse: loadLiteParse({ screenshots: [{ pageNum: 1, imageBuffer: pngHeader(limits.maxScreenshotDimension, 1) }] }) },
    );
    assert.equal(boundary.structuredContent.screenshots[0].width, limits.maxScreenshotDimension);
    await rejectPng(pngHeader(limits.maxScreenshotDimension + 1, 1), /PNG dimension limit/);
    await rejectPng(pngHeader(limits.maxScreenshotDimension, Math.floor(limits.maxScreenshotPixels / limits.maxScreenshotDimension) + 1), /PNG dimension limit/);
    await rejectPng(pngHeader(1, 1, limits.maxScreenshotBytes), /exceeds/);

    await assert.rejects(
      () => documentScreenshot(
        { path: "document.pdf" },
        { workspaceRoot: root, loadLiteParse: loadLiteParse({ result: {
          text: "", pages: [{ pageNum: 1, width: 1_000_000, height: 1_000_000, text: "", textItems: [] }],
        } }) },
      ),
      /raster size limit/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
