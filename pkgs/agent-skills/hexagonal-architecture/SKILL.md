---
name: hexagonal-architecture
description: Luke's ports-and-adapters architecture for TypeScript Effect and Rust. Use for service boundaries, core/app/ports/adapters/impl layout, persistence, transactions, outbox, workflows, migrations, and testing. Keep the folder structure; load implementation recipes by task.
---

# Hexagonal architecture

**Keep Luke's folders. Use idiomatic Effect inside them. Read only the recipes
needed for the task—not every linked document.**

## The boundary in one picture

```text
api/      public contracts; maps input/output, not business decisions
core/     pure values, schemas, decisions; no runtime effects
ports/    application-owned capability contracts; no implementations
app/      use cases: load -> core decision -> invoke ports
---------------------------------------------------------------
adapters/ implements ports; SQL, row decoding, HTTP, in-memory state
impl/     chooses implementations, transactions, runtimes, lifetimes
```

Optional `events/`, `publisher/`, and `workflows/` retain their existing roles.
`migrations/` remains service-owned. **There is no repository layer.**

## Rules that apply to every task

1. **Core is pure.** Time, IDs, permissions, and other runtime facts arrive as
   explicit data. In-process pure libraries do not need ceremonial adapters.
2. **Ports name application jobs.** Adapters hide vendors, SQL, DTOs, and drivers.
   Bundle cohesive methods; avoid generic CRUD and one tag per function.
3. **App imports core and ports, not adapters.** `impl/` is the production meeting
   point of app and concrete adapters. Tests may compose them too.
4. **Persist atomically.** State changes and required durable effects share one
   transaction/outbox. Protect decisions against concurrent changes.
5. **Parse at trust boundaries.** Preserve validated types internally. Expected
   failures are typed; defects remain exceptional.
6. **Own runtime work.** Bound concurrency/retries/queues; acquire and release
   resources in the owning scope. A fiber is not durable delivery.
7. **Keep the layout.** Organize domain-specific names within the canonical layers;
   preserve their ownership and dependency direction.

For named Effect operations, default to **`Effect.fn('name')((...) =>
Effect.gen(...).pipe(...))`**: `fn` supplies diagnostics, `gen` expresses flow,
and `.pipe` composes transformations and policy. Core remains pure. Aggregate
recovery policy in app composition (`catchTag`/`catchTags`), rather than catching
and rethrowing at every layer. Adapters translate vendor failures into port errors;
API boundaries present unresolved failures without choosing business recovery.

## Choose what to read

| Task | Read |
| --- | --- |
| Any Effect implementation/review | [Effect entry point](references/typescript-effect.md), then its relevant recipe(s) |
| Scaffold or move folders | [Canonical layouts](references/layout.md) |
| Decide ownership or review dependencies | [Boundary rules](references/architecture.md) |
| Durable events, outbox, workflows, migrations | [Delivery and migrations](references/delivery.md) |
| Rust implementation/review | [Rust adaptation](references/rust.md) |

Read each selected recipe completely. Do not recursively load every link or
preload the Rust reference for TypeScript work. Load `software-design` for design
judgment and `typescript-style` for TypeScript conventions as applicable; the
Effect entry point states how Tiger Style's Node examples are adapted.

## Before implementing

- Name the use case and its situation -> outcome cases, including rejected states.
- Identify the capability owner, atomic write boundary, and durable external effects.
- For new services, show the canonical scaffold and deliberate layer omissions.
- Verify the installed Effect version before copying an API. Do not assume a
  vendored `repos/effect/` exists or mix major versions.

## Before finishing

- [ ] Folder ownership and import direction remain intact; no repository layer.
- [ ] Public contracts do not leak into core/app as convenience DTOs.
- [ ] Typed failures, concurrency protection, and resource lifetimes are explicit.
- [ ] Tests prove relevant behavior through real ports, not module mocks.
- [ ] Durability work follows the delivery recipe; migrations stay service-owned.
- [ ] Report what was verified and any gaps; do not claim a sketch was executed.

If Luke corrects a boundary or convention, fix the work and propose updating the
smallest owning recipe. Keep one authoritative rule rather than duplicating it
across every page.

## Credits

- [rat-stack lore and recipes](https://ratstack.sh/lore)
- [Tim Zolleis's Effect DDD skill](https://github.com/timzolleis/.dotfiles/tree/main/agents/.agents/skills/effect-ddd)
- [Dillon Mulroy's error guide](https://github.com/dmmulroy/cf-workflow-pool/blob/main/docs/errors.md)
  and [coding standards](https://github.com/dmmulroy/cf-workflow-pool/blob/main/docs/coding-standards.md)
- [Effect documentation and source](https://github.com/Effect-TS/effect)
