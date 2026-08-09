---
name: hexagonal-architecture
description: Opinionated ports-and-adapters architecture for designing, scaffolding, implementing, and reviewing TypeScript Effect services and Rust services. Use for service boundaries, core/app/ports/adapters/impl layout, repositories, migrations, dependency direction, transactional outbox policy, workflows, and testing strategy.
---

# Hexagonal Architecture

Use this skill when designing, scaffolding, implementing, migrating, or
reviewing a service. Also load `software-design`; for TypeScript load
`typescript-style`. Before writing Effect code, read `repos/effect/LLMS.md` and
inspect the vendored Effect source and examples for current APIs.

For a brand-new service, produce a scaffold plan and checklist before
implementation. Do not silently omit canonical layers.

## Correction loop

If the user corrects a boundary, Effect convention, Rust convention, outbox
policy, workflow rule, or package layout:

1. Fix the current work.
2. Propose updating this skill so the correction persists.

## Vocabulary

Use exactly these architecture terms:

- **Port**: an application-owned contract describing a capability the
  application needs.
- **Adapter**: an implementation that translates an external system into a port.
- **Use case**: application orchestration that loads state, asks pure core code
  to decide, and invokes ports.

Avoid importing DDD machinery or vocabulary unless explicitly requested. A
domain event means only a published fact about service-owned state.

## Hard boundary

```text
API       -> transport contract and mapping; calls impl/service boundary
Core      -> pure decisions and transformations
Ports     -> application-owned contracts only
App       -> use cases; depends on core and ports
------------- everything above tests without infrastructure -------------
Adapters  -> port implementations: Postgres, RPC/HTTP, queues, in-memory
Repositories -> concrete persistence queries and row mapping
Publisher -> optional queue producer adapter
Workflows -> optional durable-runtime adapter
Impl      -> composition root; constructs Layers/adapters and exposes service
Migrations -> service-owned schema history
```

Rules:

- Core performs no I/O, clock reads, randomness, environment access, logging, or
  global mutation.
- Runtime values such as time and generated IDs enter core as explicit data.
- Ports describe application needs, not vendor APIs.
- App never imports adapters, repositories, impl, transport clients, or workflow
  runtimes.
- `impl/` is the only place that imports both app and concrete adapters.
- Prefer functions and records. TypeScript Effect service/tag classes and Rust
  data structs are language mechanisms, not business-logic objects.
- Greenfield orchestration-heavy services default to the canonical layout. Omit
  a layer only when genuinely unused and record why.

## Canonical layouts

### TypeScript Effect service

A service is one Deno workspace. Architectural layers are explicit subfolders
with barrel exports.

```text
workspaces/services/{service}/
├── deno.json
├── api/
│   ├── main/
│   │   ├── {service}-api.ts
│   │   └── index.ts
│   └── test/
├── core/
│   ├── main/
│   │   ├── decisions/
│   │   ├── extractors/
│   │   ├── formatters/
│   │   ├── events.ts
│   │   ├── type-ids.ts
│   │   └── index.ts
│   └── test/
├── ports/
│   ├── main/
│   │   ├── effects.ts
│   │   ├── {capability}-store.ts
│   │   └── index.ts
│   └── test/
├── events/                 # optional published-event contract
│   ├── main/
│   └── test/
├── app/
│   ├── main/
│   │   ├── {concept}/
│   │   ├── outbox/         # when an outbox exists
│   │   └── index.ts
│   └── test/
├── adapters/
│   ├── main/
│   │   ├── postgres/
│   │   ├── rpc/
│   │   ├── temporal/       # only for genuine workflows
│   │   ├── in-memory/
│   │   └── index.ts
│   └── test/
├── publisher/              # optional queue producer adapter
│   ├── main/
│   └── test/
├── workflows/              # optional thin durable workflows
│   ├── main/
│   └── test/
├── repositories/
│   ├── main/
│   └── test/
├── migrations/
└── impl/
    ├── main/
    │   ├── service.ts
    │   ├── activities.ts   # optional
    │   └── index.ts
    └── test/
```

### Rust service crate

The same boundaries become Rust modules inside a crate. Keep migrations at crate
root so the service owns them.

```text
crates/{service}/
├── Cargo.toml
├── src/
│   ├── api/
│   ├── core/
│   │   ├── decisions/
│   │   ├── events.rs
│   │   └── ids.rs
│   ├── ports/
│   ├── events/             # optional
│   ├── app/
│   │   ├── {concept}/
│   │   └── outbox/
│   ├── adapters/
│   │   ├── postgres/
│   │   ├── rpc/
│   │   ├── workflows/      # optional runtime adapter
│   │   └── in_memory/
│   ├── publisher/          # optional
│   ├── workflows/          # optional
│   ├── repositories/
│   ├── impls/              # Rust keyword-safe equivalent of impl/
│   ├── lib.rs
│   └── main.rs
├── migrations/
└── tests/
```

Do not use generic `handlers/`, `commands/`, or `queries/` buckets. Organize app
code by application concept, with action names such as `create*`, `update*`,
`get*`, and `list*`.

## Layer responsibilities

### API

The API owns transport-safe request/response contracts and boundary mapping.
DTOs stop here.

- Decode and validate untrusted input before calling inward.
- Map internal results/errors to transport responses.
- Re-export service-owned ID schemas/parsers only when callers need boundary
  validation.
- Core, ports, app, adapters, and repositories do not import their own API DTOs
  as convenience types.

### Core

Core owns validated domain types, ID types, event payload types, pure
schemas/helpers, and decisions.

A decision receives current state, request data, and injected runtime values,
then returns data describing what should happen. It never performs those
actions. Alternative outcomes are explicit discriminated unions/enums.

Core cannot import databases, transport clients, workflow runtimes, loggers,
environment APIs, clocks, random generators, or adapters.

### Ports

Ports contain contracts and types only.

- Bundle methods by cohesive capability; avoid one port per method and god
  ports.
- Clock, ID generation, randomness, and external effects are dependencies.
- A port reflects what a use case needs, not the shape of a vendor/downstream
  API.
- Reads and writes participating in atomic work receive a real transaction
  capability/context.
- Never fabricate transaction contexts or build a generic `UnitOfWork`.
- An intentionally non-transactional reader is a separate explicit capability.

### App

App owns use cases and orchestration.

Write path:

```text
load -> pure decision -> persist state + append outbox atomically -> return
```

Read paths use real read transactions/readers. Post-commit use cases are
idempotent and accept a real transaction when they need transactional
reads/writes.

Business branching belongs in pure core decisions. Infrastructure-result
branching, such as a port returning no row, may remain in app orchestration.

### Adapters

Adapters implement ports.

- `postgres/` wraps repositories and transaction helpers.
- `rpc/` or `http/` wraps service clients and translates contracts.
- `temporal/` or workflow-runtime adapters exist only when durable workflow
  semantics are real.
- `in-memory/` provides reusable app-test implementations.
- Translate vendor errors into service-owned errors at the adapter boundary.
- Keep adapter state inside each factory/Layer/struct instance, never
  module-global mutable state.

### Repositories

Repositories own concrete persistence mechanics: SQL, generated query bindings,
row decoding, and database-specific persistence types.

Repositories are not ports. Postgres adapters translate repository operations
into application-owned port contracts. Repositories:

- accept validated/newtype IDs;
- decode and validate IDs read from the database;
- operate on the real transaction/query executor;
- do not contain business decisions or cross-service effects;
- are integration-tested against real PostgreSQL.

### Events and publisher

`events/` owns portable published-event schemas and conversion to/from persisted
outbox event data. `publisher/` is the queue producer adapter.

Published events carry stable idempotency keys and transport-safe values. Do not
publish directly from API handlers or repositories.

### Workflows

A workflow is an adapter translating a durable runtime into an app use case.

- No business decisions in workflow files.
- Activities are small adapter operations corresponding to ports.
- Durable sequencing remains visible at workflow/app orchestration level; do not
  hide it in one giant activity.
- Do not create workflows merely to schedule, poll, claim, or drain outbox rows.

### Impl

`impl/` is the composition root.

- Constructs repositories, adapters, clients, publishers, Layers/runtime
  resources, and processors.
- Opens read/write transactions around app use cases.
- Maps API calls to app use cases.
- Starts, pokes, drains, and closes in-process outbox work.
- Exposes the service as a record/service implementation without owning business
  rules.
- Is the only layer importing both app and adapters.

### Migrations

Every service owns and exports its migration files or migration descriptor, but
does not own a runnable migration entrypoint. Shared PostgreSQL infrastructure
owns the generic runner. A dedicated repository-level migration workspace owns
the single executable composition point that registers and runs all service
migration targets. This avoids making shared PostgreSQL infrastructure depend on
services and prevents service-local runners from drifting.

Do not centralize service-specific schema history in the runner or PostgreSQL
package. Outbox tables are service-owned migrations. Migration identifiers must
be globally/order-safe within their migration target according to the repository
convention.

## IDs and boundary parsing

- The service owning an ID owns its validated/branded TypeScript type or Rust
  newtype and parser/schema.
- Other services reuse the owner's public boundary contract rather than
  redefining the ID.
- Parse untrusted strings once at HTTP/RPC/event boundaries.
- Parse IDs read from Postgres before returning trusted internal values.
- Tests and in-memory adapters use valid deterministic IDs through
  constructors/parsers.
- Avoid unchecked casts in TypeScript and unchecked string wrappers in Rust.

## Transactional outbox

Use an outbox for cross-process effects that must survive failure:

1. Persist state and outbox record in one transaction.
2. Commit.
3. Poke an in-process processor; also drain once at startup.
4. Claim rows using `FOR UPDATE SKIP LOCKED`.
5. Dispatch using persisted stable effect/event IDs and idempotency keys.
6. Retry safely under at-least-once delivery.
7. Drain owned work during service shutdown.

Never generate a downstream effect ID inside the retrying processor. Never call
a downstream service directly from a write handler when failure must not lose
the effect.

Use synchronous cross-process calls only when their result is required to
produce the current response and the failure semantics are intentionally
coupled.

## Dependency direction

| Layer        | May depend on                                              | Must not depend on                             |
| ------------ | ---------------------------------------------------------- | ---------------------------------------------- |
| API          | core boundary types, transport framework                   | app implementation, adapters, repositories     |
| Core         | pure validation/type libraries                             | DB, network, workflow runtime, adapters        |
| Ports        | core and pure shared types                                 | adapters, repositories, impl, own API DTOs     |
| Events       | core and pure codecs                                       | impl, adapters, downstream implementations     |
| App          | core and ports                                             | adapters, repositories, impl, workflow runtime |
| Adapters     | ports, core, specific infrastructure, repositories         | app business decisions                         |
| Publisher    | events and queue infrastructure                            | app/impl internals                             |
| Workflows    | deterministic app use cases, activity/port types           | repositories and activity implementations      |
| Repositories | database client/generated bindings, core persistence types | app and cross-process clients                  |
| Impl         | all layers needed for composition                          | business decisions                             |

## Testing strategy

| Layer        | Test                                        | Infrastructure                    |
| ------------ | ------------------------------------------- | --------------------------------- |
| Core         | pure input/output unit tests                | none                              |
| App          | orchestration tests with in-memory adapters | none                              |
| Adapters     | integration tests                           | real dependency                   |
| Repositories | query/transaction tests                     | real PostgreSQL                   |
| Workflows    | minimal wiring/replay sanity                | workflow test runtime when needed |
| Impl/E2E     | critical paths only                         | composed service                  |

Prefer reusable in-memory adapters over mocking frameworks. If an app test mocks
many modules, carve out the missing port. Do not test trivial adapter forwarding
with mocks.

## Anti-patterns

- Business decisions smeared across app, adapters, and workflows.
- API DTOs leaking into internal layers.
- One-method ports or one god port.
- Generic unit-of-work abstraction.
- Fake transaction contexts.
- Repository interfaces mislabeled as ports merely because they access data.
- App importing a concrete database/RPC/workflow client.
- Direct fan-out after a commit instead of an outbox.
- Temporal/workflow runtime used as an outbox scheduler.
- Giant activities hiding durable orchestration.
- Module-global mutable adapter state.
- Many shallow pass-through layers that add no hidden complexity.
- Tests beginning with extensive module mocks.

## Migration path

For an existing service, migrate in independently shippable phases:

1. Extract pure types/helpers/decisions into core.
2. Define ports around real external dependencies and add adapters.
3. Move orchestration into app use-case functions.
4. Introduce a transactional outbox for durable cross-process effects.
5. Thin or remove workflows that contain business logic or only dispatch outbox
   rows.
6. Reduce impl to composition and lifecycle management.

Preserve behavior at each phase. Stop when additional layers would be shallow
and provide no payoff.

## Language references

Read the matching reference completely before writing or reviewing
language-specific code:

- [TypeScript Effect](references/typescript-effect.md)
- [Rust](references/rust.md)

## Acceptance checklist

- [ ] Canonical layers exist or each omission is documented as deliberate.
- [ ] Core has no I/O, clock, randomness, environment, logger, workflow, or
      infrastructure imports.
- [ ] App imports only core and ports.
- [ ] Ports contain contracts/types only and describe application needs.
- [ ] Repositories remain concrete persistence code, distinct from ports.
- [ ] Postgres adapters bridge repositories to ports.
- [ ] Impl is the only app/adapters meeting point.
- [ ] API DTOs stop at the transport boundary.
- [ ] IDs are validated/branded/newtyped after boundary parsing.
- [ ] Database-returned IDs are parsed before entering trusted code.
- [ ] Expected failures are typed values; defects remain exceptional.
- [ ] No transaction context is fabricated.
- [ ] State mutation and outbox append are atomic.
- [ ] Outbox claiming uses `FOR UPDATE SKIP LOCKED` and has concurrency
      coverage.
- [ ] Cross-process effects use persisted stable idempotency/effect IDs.
- [ ] No workflow exists solely to drain the outbox.
- [ ] Workflows contain no business rules; activities remain small adapters.
- [ ] Service-owned migrations remain in the service directory.
- [ ] One centralized migration workspace composes service targets and runs the
      shared runner.
- [ ] Services contain no runnable migration entrypoints.
- [ ] Core tests use no mocks; app tests use in-memory adapters.
- [ ] Adapter/repository tests use real infrastructure.
- [ ] Dependency direction is enforced by tooling where practical.
