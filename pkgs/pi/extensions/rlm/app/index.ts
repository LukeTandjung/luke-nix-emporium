import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Monty, runMontyAsync } from "@pydantic/monty"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { z } from "zod"

const BASE_URL = "http://127.0.0.1:8080/v1/chat/completions"
const MAX_CORPUS_BYTES = 2 * 1024 * 1024 * 1024
const MAX_SLICE_CHARACTERS = 200_000
const MAX_LEAF_CONTEXT_CHARACTERS = 120_000
const MAX_GREP_HITS = 20

class CorpusError extends Error {}
class ModelError extends Error {}
class SandboxError extends Error {}

type Result<T, E extends Error> = T | E

interface Corpus {
  text: string
  paths: Array<string>
  bytes: number
}

interface LoadedFile {
  path: string
  content: string
}

interface TraceEntry {
  operation: string
  durationMs: number
  detail: string
}

const MessageSchema = z.object({
  content: z.string().nullable().optional(),
  reasoning_content: z.string().nullable().optional(),
})

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: MessageSchema })).min(1),
  timings: z.record(z.string(), z.unknown()).optional(),
})

const RlmParameters = Type.Object({
  question: Type.String({ description: "Question to answer from the external corpus." }),
  paths: Type.Array(Type.String(), {
    description: "Text file paths forming the external corpus. Relative paths resolve from the current working directory.",
    minItems: 1,
  }),
})

function errorFromUnknown(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function loadCorpus(cwd: string, paths: Array<string>): Promise<Result<Corpus, CorpusError>> {
  const resolvedPaths = paths.map((path) => resolve(cwd, path.startsWith("@") ? path.slice(1) : path))
  return Promise.all(
    resolvedPaths.map((path) =>
      readFile(path, "utf8").then(
        (content) => ({ path, content }),
        (error: unknown) => new CorpusError(`Could not read ${path}: ${errorFromUnknown(error).message}`),
      ),
    ),
  ).then((files) => {
    const failure = files.find((file) => file instanceof CorpusError)
    if (failure instanceof CorpusError) return failure

    const loadedFiles = files.filter((file): file is LoadedFile => !(file instanceof CorpusError))
    const bytes = loadedFiles.reduce((total, file) => total + Buffer.byteLength(file.content), 0)
    if (bytes > MAX_CORPUS_BYTES) {
      return new CorpusError(`Corpus is ${bytes} bytes; the M1 limit is ${MAX_CORPUS_BYTES} bytes.`)
    }

    return {
      paths: loadedFiles.map((file) => file.path),
      bytes,
      text: loadedFiles
        .map((file) => `\n\n===== FILE: ${file.path} =====\n\n${file.content}`)
        .join(""),
    }
  })
}

function postCompletion(payload: object, signal: AbortSignal | undefined): Promise<Result<z.infer<typeof CompletionSchema>, ModelError>> {
  return fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  })
    .then((response) => {
      if (!response.ok) {
        return response.text().then((body) => new ModelError(`llama-swap returned HTTP ${response.status}: ${body}`))
      }
      return response.json().then((value: unknown) => {
        const parsed = CompletionSchema.safeParse(value)
        return parsed.success ? parsed.data : new ModelError(`Invalid completion response: ${parsed.error.message}`)
      })
    })
    .catch((error: unknown) => new ModelError(`Completion request failed: ${errorFromUnknown(error).message}`))
}

function extractPython(content: string): Result<string, ModelError> {
  const fenced = /```python\s*([\s\S]*?)```/i.exec(content)
  const code = fenced?.[1]?.trim() ?? content.trim()
  if (code.length === 0) return new ModelError("Root model returned no Python code.")
  return code
}

function stringifyOutput(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined) return "None"
  if (value === null) return "None"
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value)
  const encoded = JSON.stringify(value, null, 2)
  return encoded ?? String(value)
}

export default function rlmExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "rlm_run",
    label: "RLM Run",
    description: "Answer a question by having the local Qwen root write sandboxed Python that navigates external text files and delegates reading to local leaf calls.",
    promptSnippet: "Run recursive language-model analysis over external text files.",
    promptGuidelines: [
      "Use rlm_run for questions requiring navigation or synthesis over external corpora too large for the active context.",
      "Pass only relevant text-like files to rlm_run; binary files are not supported.",
    ],
    parameters: RlmParameters,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const corpus = await loadCorpus(ctx.cwd, params.paths)
      if (corpus instanceof CorpusError) throw corpus

      onUpdate?.({
        content: [{ type: "text", text: `Loaded ${corpus.bytes} bytes. Asking Qwen root to write the RLM program...` }],
        details: { phase: "root", corpusBytes: corpus.bytes },
      })

      const rootPrompt = `Write a Monty-compatible Python program that answers the QUESTION using the external corpus APIs below.

QUESTION:
${params.question}

The corpus itself is NOT in your prompt. It contains ${corpus.text.length} characters across ${corpus.paths.length} file(s).

Available Python functions:
- ctx_len() -> int
- ctx_slice(start: int, end: int) -> str; returns at most ${MAX_SLICE_CHARACTERS} characters
- ctx_grep(literal: str, max_hits: int = 10) -> str; JSON array of character offsets and excerpts
- llm_query(question: str, text: str) -> str; asks one thinking-disabled leaf model using at most ${MAX_LEAF_CONTEXT_CHARACTERS} characters

Rules:
- The program must inspect the corpus rather than answer from memory.
- Use ctx_grep to locate evidence, ctx_slice for surrounding content, and llm_query for semantic reading or synthesis.
- At most one recursive model level is available: leaf calls cannot call tools.
- Keep leaf excerpts focused. Multiple independent llm_query calls are allowed.
- The final Python expression must evaluate to the final answer with FILE citations.
- Do not import filesystem, network, subprocess, or third-party modules.
- Return only one fenced Python code block.`

      const rootResponse = await postCompletion(
        {
          model: "qwen-root",
          messages: [
            { role: "system", content: "You write reliable, bounded Python programs for a sandboxed recursive language model. Follow the requested API exactly." },
            { role: "user", content: rootPrompt },
          ],
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 0.8,
          top_k: 20,
          chat_template_kwargs: { enable_thinking: false, preserve_thinking: true },
        },
        signal,
      )
      if (rootResponse instanceof ModelError) throw rootResponse

      const rootMessage = rootResponse.choices[0]?.message
      const code = extractPython(rootMessage?.content ?? "")
      if (code instanceof ModelError) throw code

      const trace: Array<TraceEntry> = []
      const record = (operation: string, startedAt: number, detail: string): void => {
        trace.push({ operation, durationMs: Date.now() - startedAt, detail })
      }

      const monty = await Promise.resolve()
        .then(() => new Monty(code, { scriptName: "rlm_root.py" }))
        .catch((error: unknown) => new SandboxError(`Monty rejected root code: ${errorFromUnknown(error).message}`))
      if (monty instanceof SandboxError) throw monty

      onUpdate?.({
        content: [{ type: "text", text: "Executing the root program in Monty..." }],
        details: { phase: "sandbox", corpusBytes: corpus.bytes, code },
      })

      const output: unknown = await runMontyAsync(monty, {
        limits: {
          maxAllocations: 1_000_000,
          maxDurationSecs: 300,
          maxMemory: 512 * 1024 * 1024,
          maxRecursionDepth: 200,
        },
        externalFunctions: {
          ctx_len: () => {
            const startedAt = Date.now()
            record("ctx_len", startedAt, `${corpus.text.length} characters`)
            return corpus.text.length
          },
          ctx_slice: (...args: Array<unknown>) => {
            const startedAt = Date.now()
            const start = typeof args[0] === "number" ? Math.max(0, Math.floor(args[0])) : 0
            const requestedEnd = typeof args[1] === "number" ? Math.floor(args[1]) : start
            const end = Math.min(corpus.text.length, requestedEnd, start + MAX_SLICE_CHARACTERS)
            const result = corpus.text.slice(start, Math.max(start, end))
            record("ctx_slice", startedAt, `${start}:${end} -> ${result.length} characters`)
            return result
          },
          ctx_grep: (...args: Array<unknown>) => {
            const startedAt = Date.now()
            const literal = typeof args[0] === "string" ? args[0] : ""
            const requestedHits = typeof args[1] === "number" ? Math.floor(args[1]) : 10
            const maxHits = Math.max(1, Math.min(MAX_GREP_HITS, requestedHits))
            if (literal.length === 0) return "[]"

            const haystack = corpus.text.toLocaleLowerCase()
            const needle = literal.toLocaleLowerCase()
            const hits: Array<{ offset: number; excerpt: string }> = []
            let offset = 0
            while (hits.length < maxHits) {
              const found = haystack.indexOf(needle, offset)
              if (found < 0) break
              hits.push({
                offset: found,
                excerpt: corpus.text.slice(Math.max(0, found - 500), Math.min(corpus.text.length, found + literal.length + 1_000)),
              })
              offset = found + Math.max(1, needle.length)
            }
            record("ctx_grep", startedAt, `${JSON.stringify(literal)} -> ${hits.length} hit(s)`)
            return JSON.stringify(hits)
          },
          llm_query: (...args: Array<unknown>) => {
            const startedAt = Date.now()
            const question = typeof args[0] === "string" ? args[0] : ""
            const text = typeof args[1] === "string" ? args[1].slice(0, MAX_LEAF_CONTEXT_CHARACTERS) : ""
            return postCompletion(
              {
                model: "qwen-leaf",
                messages: [
                  { role: "system", content: "Answer only from the supplied excerpt. If evidence is absent, answer NOT_FOUND. Be concise and retain FILE citations." },
                  { role: "user", content: `EXCERPT:\n${text}\n\nQUESTION:\n${question}` },
                ],
                max_tokens: 4096,
                temperature: 0.7,
                top_p: 0.8,
                top_k: 20,
              },
              signal,
            ).then((response) => {
              if (response instanceof ModelError) {
                record("llm_query", startedAt, `error: ${response.message}`)
                return `LEAF_ERROR: ${response.message}`
              }
              const answer = response.choices[0]?.message.content ?? ""
              record("llm_query", startedAt, `${text.length} input characters -> ${answer.length} output characters`)
              return answer
            })
          },
        },
      }).catch((error: unknown) => new SandboxError(`Monty execution failed: ${errorFromUnknown(error).message}`))

      if (output instanceof SandboxError) throw output
      const answer = stringifyOutput(output)
      return {
        content: [{ type: "text", text: answer }],
        details: {
          answer,
          code,
          corpusBytes: corpus.bytes,
          corpusPaths: corpus.paths,
          rootReasoning: rootMessage?.reasoning_content ?? undefined,
          rootTimings: rootResponse.timings,
          trace,
        },
      }
    },
  })
}
