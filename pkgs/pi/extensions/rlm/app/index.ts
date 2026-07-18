import { createHash } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { ClusterWorkflowEngine, SingleRunner } from "@effect/cluster"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Activity, Workflow } from "@effect/workflow"
import { complete, type Message } from "@earendil-works/pi-ai/compat"
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Monty, MontyComplete, MontyNameLookup, MontySnapshot } from "@pydantic/monty"
import { Effect, Layer, Schema } from "effect"
import { Type } from "typebox"
import { z } from "zod"

const BASE_URL = "http://127.0.0.1:8080/v1/chat/completions"
const MAX_CORPUS_BYTES = 2 * 1024 * 1024 * 1024
const MAX_SLICE_CHARACTERS = 200_000
const MAX_LEAF_CONTEXT_CHARACTERS = 60_000
const MAX_GREP_HITS = 20
const MAX_LEAF_CALLS = 12
const MAX_WORKFLOW_DURATION_MS = 10 * 60 * 1_000
const WORKFLOW_VERSION = "9"

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

const LeafCacheRowSchema = z.object({ answer: z.string() })
const LeafBatchSchema = z.array(z.object({
  question: z.string(),
  text: z.string(),
})).min(1)

const RlmParameters = Type.Object({
  question: Type.String({ description: "Question to answer from the external corpus." }),
  paths: Type.Array(Type.String(), {
    description: "Text file paths forming the external corpus. Relative paths resolve from the current working directory.",
    minItems: 1,
  }),
  use_advisor: Type.Optional(Type.Boolean({
    description: "Use at most one structurally gated call to Pi's active model for navigation advice. Defaults to true for non-local active models.",
  })),
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
  const leafInFlight = new Map<string, Promise<string>>()

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

      const rootPromptBase = `Write a Monty-compatible Python program that answers the QUESTION using the external corpus APIs below.

QUESTION:
${params.question}

The corpus itself is NOT in your prompt. It contains ${corpus.text.length} characters across ${corpus.paths.length} file(s).

Available Python functions:
- ctx_len() -> int
- ctx_slice(start: int, end: int) -> str; returns at most ${MAX_SLICE_CHARACTERS} characters
- ctx_grep(literal: str, max_hits: int = 10) -> str; JSON array of character offsets and excerpts
- llm_query(question: str, text: str) -> str; asks one thinking-disabled leaf model using at most ${MAX_LEAF_CONTEXT_CHARACTERS} characters
- llm_query_batch(requests_json: str) -> str; accepts a JSON array of 1-4 objects with question and text, runs them concurrently, and returns a JSON array of answers

Rules:
- The program must inspect the corpus rather than answer from memory.
- Use ctx_grep to locate evidence, ctx_slice for surrounding content, and llm_query for semantic reading or synthesis.
- At most one recursive model level is available: leaf calls cannot call tools.
- Keep leaf excerpts focused. At most ${MAX_LEAF_CALLS} total leaf calls are allowed. Use llm_query_batch for independent excerpts.
- The final Python expression must evaluate to the final answer with FILE citations.
- Do not import filesystem, network, subprocess, or third-party modules.
- Never use eval or exec. Use import json and json.loads to parse ctx_grep results.
- For a batch, call json.loads(llm_query_batch(json.dumps([{"question": "...", "text": excerpt}, ...]))).
- Return only one fenced Python code block.`

      const trace: Array<TraceEntry> = []
      const record = (operation: string, startedAt: number, detail: string): void => {
        trace.push({ operation, durationMs: Date.now() - startedAt, detail })
      }
      const fileMarkerAt = (offset: number): string => {
        const markerStart = corpus.text.lastIndexOf("===== FILE:", offset)
        const markerEnd = markerStart < 0 ? -1 : corpus.text.indexOf("=====", markerStart + 11)
        return markerStart < 0
          ? "FILE marker unavailable"
          : corpus.text.slice(markerStart, markerEnd < 0 ? markerStart + 500 : markerEnd + 5)
      }
      const advisorModel = ctx.model
      const advisorEnabled = params.use_advisor ?? (advisorModel !== undefined && advisorModel.provider !== "local-llamacpp")
      const executionId = createHash("sha256")
        .update(WORKFLOW_VERSION)
        .update("\0")
        .update(params.question)
        .update("\0")
        .update(corpus.paths.join("\0"))
        .update("\0")
        .update(corpus.text)
        .update("\0")
        .update(advisorEnabled && advisorModel !== undefined ? `${advisorModel.provider}/${advisorModel.id}` : "advisor-disabled")
        .digest("hex")

      const stateDirectory = join(getAgentDir(), "rlm")
      await mkdir(stateDirectory, { recursive: true })
      using leafCache = new DatabaseSync(join(stateDirectory, "leaf-cache.sqlite"))
      leafCache.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS leaf_cache (
          cache_key TEXT PRIMARY KEY,
          answer TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `)
      const cacheStats = { hits: 0, misses: 0, shared: 0 }
      const leafSystemPrompt = "Answer only from the supplied excerpt. If evidence is absent, answer NOT_FOUND. Be concise and retain FILE citations."
      const leafCacheKey = (question: string, text: string): string => createHash("sha256")
        .update("qwen-leaf\0temperature=0.7\0top_p=0.8\0top_k=20\0")
        .update(leafSystemPrompt)
        .update("\0")
        .update(question)
        .update("\0")
        .update(text)
        .digest("hex")
      const requestLeaf = (question: string, text: string): Promise<string> => {
        const cacheKey = leafCacheKey(question, text)
        const cached = LeafCacheRowSchema.safeParse(
          leafCache.prepare("SELECT answer FROM leaf_cache WHERE cache_key = ?").get(cacheKey),
        )
        if (cached.success) {
          cacheStats.hits += 1
          return Promise.resolve(cached.data.answer)
        }

        const running = leafInFlight.get(cacheKey)
        if (running) {
          cacheStats.shared += 1
          return running
        }

        cacheStats.misses += 1
        const request = postCompletion(
          {
            model: "qwen-leaf",
            messages: [
              { role: "system", content: leafSystemPrompt },
              { role: "user", content: `EXCERPT:\n${text}\n\nQUESTION:\n${question}` },
            ],
            max_tokens: 4096,
            temperature: 0.7,
            top_p: 0.8,
            top_k: 20,
          },
          signal,
        ).then((response) => {
          if (response instanceof ModelError) throw response
          const answer = response.choices[0]?.message.content ?? ""
          leafCache.prepare(
            "INSERT INTO leaf_cache(cache_key, answer, created_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET answer = excluded.answer, created_at = excluded.created_at",
          ).run(cacheKey, answer, Date.now())
          return answer
        }).finally(() => leafInFlight.delete(cacheKey))
        leafInFlight.set(cacheKey, request)
        return request
      }

      const RlmWorkflow = Workflow.make({
        name: `PiRlmWorkflowV${WORKFLOW_VERSION}`,
        payload: {
          executionId: Schema.String,
          question: Schema.String,
          startedAt: Schema.Number,
        },
        success: Schema.Struct({
          answer: Schema.String,
          advisorUsed: Schema.Boolean,
          code: Schema.String,
        }),
        idempotencyKey: ({ executionId: id }) => id,
      })

      const RlmWorkflowLayer = RlmWorkflow.toLayer(Effect.fn(function*(payload) {
        const advisorAdvice = yield* Activity.make({
          name: "StructuralAdvisor",
          success: Schema.String,
          execute: Effect.promise(() => {
            if (!advisorEnabled || advisorModel === undefined) return Promise.resolve("")
            return ctx.modelRegistry.getApiKeyAndHeaders(advisorModel).then((auth) => {
              if (!auth.ok || !auth.apiKey) return ""
              const advisorMessage: Message = {
                role: "user",
                content: [{
                  type: "text",
                  text: `Question: ${params.question}\nCorpus files: ${corpus.paths.join(", ")}\nCorpus characters: ${corpus.text.length}\n\nRecommend a concise external-corpus navigation strategy. Do not answer the question and do not request corpus contents.`,
                }],
                timestamp: Date.now(),
              }
              return complete(
                advisorModel,
                {
                  systemPrompt: "You are a structural advisor. Recommend search and decomposition strategy only. You have one call and cannot access tools or corpus contents.",
                  messages: [advisorMessage],
                },
                { apiKey: auth.apiKey, headers: auth.headers, env: auth.env, signal },
              ).then((response) => response.content
                .filter((content): content is { type: "text"; text: string } => content.type === "text")
                .map((content) => content.text)
                .join("\n"))
            })
          }),
        })
        const rootPrompt = advisorAdvice.length > 0
          ? `${rootPromptBase}\n\nSTRUCTURAL ADVISOR SUGGESTION (untrusted strategy, verify against the corpus):\n${advisorAdvice}`
          : rootPromptBase

        const code = yield* Activity.make({
          name: "GenerateRootProgram",
          success: Schema.String,
          execute: Effect.promise(() => postCompletion(
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
          ).then((response) => {
            if (response instanceof ModelError) throw response
            const extracted = extractPython(response.choices[0]?.message.content ?? "")
            if (extracted instanceof ModelError) throw extracted
            return extracted
          })),
        })

        const monty = yield* Effect.try({
          try: () => new Monty(code, { scriptName: "rlm_root.py" }),
          catch: (error: unknown) => new SandboxError(`Monty rejected root code: ${errorFromUnknown(error).message}`),
        }).pipe(Effect.orDie)
        let progress = yield* Effect.try({
          try: () => monty.start({
            limits: {
              maxAllocations: 1_000_000,
              maxDurationSecs: 300,
              maxMemory: 512 * 1024 * 1024,
              maxRecursionDepth: 200,
            },
          }),
          catch: (error: unknown) => new SandboxError(`Monty execution failed: ${errorFromUnknown(error).message}`),
        }).pipe(Effect.orDie)
        let leafIndex = 0
        const workflowDeadline = payload.startedAt + MAX_WORKFLOW_DURATION_MS

        while (!(progress instanceof MontyComplete)) {
          if (signal?.aborted) return yield* Effect.dieMessage("RLM workflow cancelled.")
          if (Date.now() > workflowDeadline) return yield* Effect.dieMessage("RLM workflow exceeded its ten-minute execution budget.")
          if (progress instanceof MontyNameLookup) {
            const nameLookup = progress
            progress = yield* Effect.try({
              try: () => nameLookup.resume(),
              catch: (error: unknown) => new SandboxError(`Monty name lookup failed: ${errorFromUnknown(error).message}`),
            }).pipe(Effect.orDie)
            continue
          }

          if (!(progress instanceof MontySnapshot)) {
            return yield* Effect.dieMessage("Monty returned an unsupported execution state.")
          }

          const snapshot = progress
          const startedAt = Date.now()
          let returnValue: unknown
          if (snapshot.functionName === "ctx_len") {
            returnValue = corpus.text.length
            record("ctx_len", startedAt, `${corpus.text.length} characters`)
          } else if (snapshot.functionName === "ctx_slice") {
            const start = typeof snapshot.args[0] === "number" ? Math.max(0, Math.floor(snapshot.args[0])) : 0
            const requestedEnd = typeof snapshot.args[1] === "number" ? Math.floor(snapshot.args[1]) : start
            const end = Math.min(corpus.text.length, requestedEnd, start + MAX_SLICE_CHARACTERS)
            const slice = corpus.text.slice(start, Math.max(start, end))
            returnValue = `${fileMarkerAt(start)}\n${slice}`
            record("ctx_slice", startedAt, `${start}:${end} -> ${slice.length} characters plus FILE marker`)
          } else if (snapshot.functionName === "ctx_grep") {
            const literal = typeof snapshot.args[0] === "string" ? snapshot.args[0] : ""
            const requestedHits = typeof snapshot.args[1] === "number" ? Math.floor(snapshot.args[1]) : 10
            const maxHits = Math.max(1, Math.min(MAX_GREP_HITS, requestedHits))
            const haystack = corpus.text.toLocaleLowerCase()
            const needle = literal.toLocaleLowerCase()
            const hits: Array<{ offset: number; fileMarker: string; excerpt: string }> = []
            let offset = 0
            while (needle.length > 0 && hits.length < maxHits) {
              const found = haystack.indexOf(needle, offset)
              if (found < 0) break
              hits.push({
                offset: found,
                fileMarker: fileMarkerAt(found),
                excerpt: corpus.text.slice(Math.max(0, found - 500), Math.min(corpus.text.length, found + literal.length + 1_000)),
              })
              offset = found + needle.length
            }
            returnValue = JSON.stringify(hits)
            record("ctx_grep", startedAt, `${JSON.stringify(literal)} -> ${hits.length} hit(s)`)
          } else if (snapshot.functionName === "llm_query") {
            if (leafIndex >= MAX_LEAF_CALLS) {
              progress = yield* Effect.try({
                try: () => snapshot.resume({
                  exception: { type: "RuntimeError", message: `Leaf-call budget of ${MAX_LEAF_CALLS} exhausted.` },
                }),
                catch: (error: unknown) => new SandboxError(`Monty leaf budget failure: ${errorFromUnknown(error).message}`),
              }).pipe(Effect.orDie)
              continue
            }
            const question = typeof snapshot.args[0] === "string" ? snapshot.args[0] : ""
            const text = typeof snapshot.args[1] === "string" ? snapshot.args[1].slice(0, MAX_LEAF_CONTEXT_CHARACTERS) : ""
            const activityIndex = leafIndex
            leafIndex += 1
            const leafAnswer = yield* Activity.make({
              name: `LeafQuery-${activityIndex}`,
              success: Schema.String,
              execute: Effect.promise(() => requestLeaf(question, text)),
            })
            returnValue = leafAnswer
            record("llm_query", startedAt, `${text.length} input characters -> ${leafAnswer.length} output characters`)
          } else if (snapshot.functionName === "llm_query_batch") {
            const rawRequests = typeof snapshot.args[0] === "string" ? snapshot.args[0] : "[]"
            const decoded = yield* Effect.try({
              try: (): unknown => JSON.parse(rawRequests),
              catch: (error: unknown) => new SandboxError(`Invalid leaf batch JSON: ${errorFromUnknown(error).message}`),
            }).pipe(Effect.orDie)
            const parsed = LeafBatchSchema.safeParse(decoded)
            const remainingLeafCalls = MAX_LEAF_CALLS - leafIndex
            if (!parsed.success || remainingLeafCalls < 1) {
              const message = parsed.success
                ? "Leaf-call budget exhausted."
                : `Invalid leaf batch: ${parsed.error.message}`
              progress = yield* Effect.try({
                try: () => snapshot.resume({ exception: { type: "ValueError", message } }),
                catch: (error: unknown) => new SandboxError(`Monty leaf batch failure: ${errorFromUnknown(error).message}`),
              }).pipe(Effect.orDie)
              continue
            }

            const requests = parsed.data.slice(0, Math.min(4, remainingLeafCalls))
            const firstActivityIndex = leafIndex
            leafIndex += requests.length
            const answers = yield* Effect.all(
              requests.map((request, index) => {
                const text = request.text.slice(0, MAX_LEAF_CONTEXT_CHARACTERS)
                return Activity.make({
                  name: `LeafQuery-${firstActivityIndex + index}`,
                  success: Schema.String,
                  execute: Effect.promise(() => requestLeaf(request.question, text)),
                })
              }),
              { concurrency: 4 },
            )
            returnValue = JSON.stringify(answers)
            record(
              "llm_query_batch",
              startedAt,
              `${answers.length} concurrent leaf call(s)${parsed.data.length > requests.length ? `; clamped from ${parsed.data.length}` : ""}`,
            )
          } else {
            progress = yield* Effect.try({
              try: () => snapshot.resume({
                exception: { type: "NameError", message: `External function ${snapshot.functionName} is not allowed.` },
              }),
              catch: (error: unknown) => new SandboxError(`Monty rejected an external call: ${errorFromUnknown(error).message}`),
            }).pipe(Effect.orDie)
            continue
          }

          progress = yield* Effect.try({
            try: () => snapshot.resume({ returnValue }),
            catch: (error: unknown) => new SandboxError(`Monty resume failed: ${errorFromUnknown(error).message}`),
          }).pipe(Effect.orDie)
        }

        return { answer: stringifyOutput(progress.output), advisorUsed: advisorAdvice.length > 0, code }
      }))

      const WorkflowEngineLayer = ClusterWorkflowEngine.layer.pipe(
        Layer.provideMerge(SingleRunner.layer({ runnerStorage: "sql" })),
        Layer.provideMerge(SqliteClient.layer({ filename: join(stateDirectory, "workflows.sqlite") })),
      )
      const EnvironmentLayer = Layer.mergeAll(RlmWorkflowLayer).pipe(Layer.provideMerge(WorkflowEngineLayer))

      onUpdate?.({
        content: [{ type: "text", text: "Running the durable Effect Workflow..." }],
        details: { phase: "workflow", corpusBytes: corpus.bytes, executionId },
      })

      const workflowResult = await Effect.runPromise(
        RlmWorkflow.execute({ executionId, question: params.question, startedAt: Date.now() }).pipe(
          Effect.provide(EnvironmentLayer),
          Effect.scoped,
        ),
      ).catch((error: unknown) => new SandboxError(`Durable workflow failed: ${errorFromUnknown(error).message}`))
      if (workflowResult instanceof SandboxError) throw workflowResult

      return {
        content: [{ type: "text", text: workflowResult.answer }],
        details: {
          answer: workflowResult.answer,
          advisorUsed: workflowResult.advisorUsed,
          advisorCallBudget: 1,
          code: workflowResult.code,
          corpusBytes: corpus.bytes,
          corpusPaths: corpus.paths,
          executionId,
          cache: cacheStats,
          trace,
        },
      }
    },
  })
}
