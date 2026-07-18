# Pi RLM extension

`rlm_run` lets a Pi model answer questions over text corpora that do not fit in
the active model context. Qwen root writes a bounded Python navigation program,
Monty executes it without ambient filesystem or network access, and host-owned
external functions provide corpus search and local leaf inference.

## Architecture

- **Root:** `qwen-root` writes the Monty program.
- **Sandbox:** Pydantic Monty, limited to 512 MiB, one million allocations,
  recursion depth 200, and ten minutes.
- **Corpus API:** `ctx_len`, `ctx_slice`, and literal `ctx_grep` with source-file
  markers.
- **Leaves:** `qwen-leaf`, with at most 12 calls per workflow and no recursive
  tools. `llm_query_batch` can run up to four independent calls concurrently.
- **Durability:** `@effect/workflow` with the Effect single-node SQL runner and
  SQLite storage under `~/.pi/agent/rlm/workflows.sqlite`.
- **Leaf cache:** SQLite cache under `~/.pi/agent/rlm/leaf-cache.sqlite`, keyed by
  the model, sampling configuration, system prompt, leaf question, and excerpt.
  Identical in-flight calls share one promise.
- **Advisor:** an optional, single structurally gated call to Pi's active model.
  Advisor output is strategy-only and is persisted as a workflow activity. It is
  never exposed as a Monty external function.

## Validated milestones

- **M0:** Qwen root answered 4/5 known-answer questions while navigating an
  external 2.2-million-character (~500K-token) corpus.
- **M1:** root-generated Python executed through Monty and completed a local
  leaf call.
- **M2:** Pi was killed during a leaf request. Repeating the same `rlm_run`
  resumed the SQLite-backed workflow without regenerating the completed root
  program and completed successfully.
- **M3:** leaf results persist in SQLite; cache rows and cache telemetry were
  verified.
- **M4:** a three-request `llm_query_batch` produced three simultaneous leaf
  requests on the four-slot server. Wall-clock, memory, recursion, excerpt, and
  leaf-call budgets are enforced by the host.
- **M5:** JSON-mode tool telemetry confirmed `advisorUsed: true` and a hard
  `advisorCallBudget: 1`. Monty cannot invoke the advisor.

## Current constraints

- Corpora must be text files and are loaded into system RAM for each invocation.
- Recursion is intentionally one level: root to non-tool-using leaves.
- The local leaf profile provides four concurrent 32K slots. Eight 32K slots do
  not fit in 32 GiB VRAM with the Q6_K model.
- A failed workflow is immutable under its idempotency key. Increment
  `WORKFLOW_VERSION` when execution semantics change.
