import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { extractText, paddleOcr, recognizeImageFiles, validateParameters } from "../src/ocr.js";
import { tool } from "../src/index.js";

const parameters = {
  path: "unused.png",
  task: "ocr",
  pageStart: 1,
  maxPages: 20,
  dpi: 150,
  timeoutSeconds: 300,
};

function response(content = " text ") {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("parameter defaults and tool annotations match the contract", () => {
  assert.deepEqual(validateParameters({ path: "scan.pdf" }), parametersFor("scan.pdf"));
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.equal(tool.annotations.idempotentHint, true);
});

function parametersFor(path) {
  return { ...parameters, path };
}

test("parameter validation rejects invalid values", () => {
  assert.throws(() => validateParameters({ path: "x.png", task: "words" }), /task must be one of/);
  assert.throws(() => validateParameters({ path: "x.png", pageStart: 0 }), /pageStart/);
  assert.throws(() => validateParameters({ path: "x.png", maxPages: 101 }), /maxPages/);
  assert.throws(() => validateParameters({ path: "x.png", dpi: 71 }), /dpi/);
  assert.throws(() => validateParameters({ path: "x.png", timeoutSeconds: 1.5 }), /timeoutSeconds/);
});

test("extractText validates and trims OpenAI-compatible responses", () => {
  assert.equal(extractText({ choices: [{ message: { content: "  result  " } }] }), "result");
  assert.throws(() => extractText({ choices: [] }), /no choices/);
  assert.throws(() => extractText({ choices: [{}] }), /unexpected response shape/);
});

test("image request contains the model, task prompt, MIME type, and data", async () => {
  let request;
  const result = await recognizeImageFiles(["test.webp"], parameters, {
    endpoint: "http://ocr.test/v1/",
    readFileImpl: async () => Buffer.from("pixels"),
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return response("recognized");
    },
  });

  assert.equal(result, "recognized");
  assert.equal(request.url, "http://ocr.test/v1/chat/completions");
  assert.equal(request.body.model, "paddleocr-vl-1.6");
  assert.equal(request.body.temperature, 0);
  assert.equal(request.body.messages[0].content[0].text, "OCR:");
  assert.match(request.body.messages[0].content[1].image_url.url, /^data:image\/webp;base64,/);
});

test("multiple image requests run serially and receive page headings", async () => {
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const result = await recognizeImageFiles(["page-1.png", "page-2.png"], parameters, {
    readFileImpl: async () => Buffer.from("page"),
    fetchImpl: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const current = ++calls;
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return response(`result ${current}`);
    },
  });

  assert.equal(maximumActive, 1);
  assert.equal(result, "## Page 1\n\nresult 1\n\n## Page 2\n\nresult 2");
});

test("unsupported files fail before any OCR request", async () => {
  await assert.rejects(() => paddleOcr({ path: "notes.txt" }, {
    fetchImpl: async () => { throw new Error("must not run"); },
  }), /Unsupported input type/);
});

test("HTTP errors include status and a bounded response body", async () => {
  await assert.rejects(() => recognizeImageFiles(["page.png"], parameters, {
    readFileImpl: async () => Buffer.from("page"),
    fetchImpl: async () => new Response("bad request", { status: 400 }),
  }), /HTTP 400: bad request/);
});

test("PDF temporary directory is removed when conversion fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "ocr-test-"));
  const made = join(root, "rendered");
  let removed;
  try {
    await assert.rejects(() => paddleOcr({ path: "missing.pdf" }, {
      mkdtempImpl: async () => made,
      spawnImpl: () => { throw new Error("pdftoppm unavailable"); },
      rmImpl: async (path, options) => { removed = { path, options }; },
    }), /pdftoppm unavailable/);
    assert.deepEqual(removed, { path: made, options: { recursive: true, force: true } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
