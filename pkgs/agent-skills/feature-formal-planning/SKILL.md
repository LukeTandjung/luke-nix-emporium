---
name: feature-formal-planning
description: >
  Formally plan a feature with Quint model checking before implementation. Use when Luke wants to
  plan, spec, or design a feature rigorously — "plan this feature formally", "quint spec this",
  "let's model this before building", "is this spec airtight?" — or wants a spec-backed Linear
  ticket. Drives the loop: chat → Quint spec → D2 visualisation → quint run/verify →
  counterexamples become clarifying questions → airtight spec → Linear issue(s) with the spec
  embedded. Complements the quint-lang / quint-modeling / quint-execute-spec skills (language and
  modeling mechanics live there; this skill owns the planning workflow).
---

# Formal Feature Planning (Quint + D2 + Linear)

## Why this exists

LLM-only spec review degrades because smart models charitably fill gaps instead of
surfacing them. A model checker cannot be charitable: unspecified transitions become
deadlocks, missing guards become invariant violations, and every counterexample is a
concrete trace. The LLM's job shrinks to *transcription* (prose → model), which it is
good at. Verification is mechanical.

## Toolchain (all vendored in ~/.pi/agent — no system deps)

| Tool | Invocation | Notes |
|---|---|---|
| Quint CLI 0.32+ | `quint` (on PATH via ~/.pi/agent/bin) | typecheck, run, test, verify |
| D2 renderer | `d2-render [in.d2] [out.svg]` (stdin/stdout when omitted) | WASM build, no Go binary |
| Quint skills | quint-lang, quint-modeling, quint-execute-spec | load for language/modeling mechanics |
| Linear | linear-mcp skill | create the final issues |

`quint run` (simulator) and `quint test`/`typecheck` are pure TypeScript — always available.
`quint verify` (exhaustive, Apalache) needs Java ≥ 17. The Home Manager module vendors
Temurin JRE 17 in the pi user profile. If `java -version` still fails, report that the pi
Home Manager generation needs rebuilding; do not install Java system-wide. Fall back to a
high-budget simulation (`quint run --max-samples=100000`) in the meantime, clearly labelled
as non-exhaustive.

## The loop

1. **Interview.** Discuss the feature. Identify the decision-critical behavior: state
   transitions, concurrency, failure paths. Scope the model to that (~50–150 lines).
   Do NOT mirror the whole implementation.
2. **Draft the Quint spec.** Load the quint-modeling + quint-lang skills. Work in a
   scratch dir (e.g. `/tmp/plan-<feature>/`) or the repo if Luke wants it committed.
   `quint typecheck` after every edit.
3. **Derive the D2 diagram FROM the spec** — states/actions map mechanically to a state
   diagram. Render with `d2-render spec.d2 spec.svg` and show Luke. The diagram must
   never be hand-drawn separately from the model, so it cannot drift.
4. **Check.** `quint run spec.qnt --invariant=<inv>` first (cheap), then
   `quint verify` for the exhaustive pass. Also probe for underspecification:
   check *negated* properties to force example traces ("the spec permits this — intended?").
5. **Every counterexample becomes a clarifying question** to Luke, with the concrete
   trace attached. Fix spec or requirements. Repeat 2–5 until clean.
6. **Ship to Linear.** Via linear-mcp, create the issue(s) with: the final `.qnt` spec
   in a code block, the D2 source, the invariants checked and how (verify vs simulate),
   and a checklist derived from the model — every action/guard/transition becomes a
   verifiable item ("handles event X in state Y — line + test required").

## Implementation-phase follow-through

- The spec in the ticket is the source of truth; completion = every checklist item
  mapped to code + tests. Verify enumerable facts, never vibes.
- For stateful/concurrent features (Temporal workflows especially), offer model-based
  testing: `quint run --out-itf=trace.itf.json` exports traces a test harness can replay
  against the real implementation for true conformance testing.
