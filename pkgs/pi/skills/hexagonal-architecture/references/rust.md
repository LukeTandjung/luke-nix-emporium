# Rust adaptation

When assisting a learner, explain the direction, relevant traits/types, and
documentation rather than supplying a finished implementation. The snippets here
communicate boundaries only.

## Mapping

| Architecture     | Rust representation                                         |
| ---------------- | ----------------------------------------------------------- |
| Core             | pure functions, enums, newtypes                             |
| Port             | application-owned trait                                     |
| Adapter          | struct or closure implementing a port trait                 |
| Use case         | function generic over narrow port traits                    |
| Wiring           | `main.rs` or `wiring` module constructing concrete adapters |
| Expected error   | explicit `Result<T, E>` with service-owned error enum       |
| Broken invariant | panic only when truly unrecoverable/programmer error        |

## Core

Core depends only on core data. Use enums for alternative decisions and newtypes
for validated identifiers.

```rust
pub enum ScheduleDecision {
    Schedule(PendingRun),
    AlreadyRunning(RunId),
}

pub fn decide_schedule(
    input: ScheduleInput,
    current: Option<&AgentRun>,
) -> ScheduleDecision {
    // Pure decision only; time and IDs are already in input.
}
```

Do not read system time, generate randomness, access environment variables,
spawn tasks, or perform I/O in core.

## Ports

Traits belong to the app/ports side, not the adapter crate/module. Bundle
operations by cohesive capability.

```rust
pub trait AgentRunStore {
    type Error;

    async fn find_active(
        &self,
        tx: &mut TransactionContext,
        agent_id: &AgentId,
    ) -> Result<Option<AgentRun>, Self::Error>;

    async fn insert(
        &self,
        tx: &mut TransactionContext,
        run: PendingRun,
    ) -> Result<AgentRun, Self::Error>;
}
```

Choose static dispatch (`impl Trait`/generics) by default. Use `dyn Trait` when
runtime adapter selection or heterogeneous storage is a real requirement. Do not
add `Arc`, `Box`, `Send`, or `Sync` reflexively; add them where
runtime/concurrency boundaries require them.

## Use cases

Use cases are functions over the narrow traits they need. They load, call pure
decisions, and persist state plus outbox within one real transaction.

```rust
pub async fn schedule_agent<S, C, I>(
    store: &S,
    clock: &C,
    ids: &I,
    tx: &mut TransactionContext,
    input: ScheduleAgentInput,
) -> Result<AgentRun, ScheduleAgentError>
where
    S: AgentRunStore,
    C: Clock,
    I: IdGenerator,
{
    // load -> decide -> write state and outbox
}
```

This is an architectural signature, not a mandate to accumulate many generic
parameters. If the dependency list grows, define one cohesive
application-dependencies record only when it lowers cognitive load.

## Repositories and adapters

Repositories contain concrete SQL/query bindings, transaction-executor use, row
decoding, and database-specific persistence types. They are not ports merely
because they access data.

Postgres adapters wrap repositories to implement application-owned port traits.
This keeps query/driver shapes from defining app contracts.

- Postgres adapters own SQL/driver knowledge and map rows into core/application
  types.
- Translate driver errors into adapter/service-owned error types at the
  boundary.
- RPC/HTTP/queue adapters translate transport shapes; internal layers never use
  transport DTOs as domain types.
- In-memory adapters implement the same traits and own state per test instance.
- Avoid global mutable state.

## Errors

- Expected outcomes are enums or `Result` variants.
- Port errors are associated or concrete service-owned error types.
- Adapter internals may retain source errors for diagnostics without exposing
  vendor APIs throughout app code.
- Do not use `unwrap`/`expect` in request paths for recoverable conditions.
- Panic only for impossible states or programmer defects.

## Transactions and outbox

Use the actual transaction type directly or hide it behind one concrete opaque
context understood by Postgres adapters. Do not build a generic unit-of-work
framework. Do not open one transaction per repository call when a use case
requires atomicity.

Cross-process effects follow the same persisted outbox policy as TypeScript
services. The processor must claim safely, preserve idempotency keys, and
tolerate at-least-once delivery.

## Async and concurrency

- Keep core synchronous and deterministic.
- Async belongs in app orchestration, adapters, and wiring.
- Spawn tasks only in wiring/process-management code unless task ownership and
  shutdown semantics are explicit.
- Cancellation, resource ownership, and graceful shutdown are wiring concerns.
- Do not hold a database transaction across arbitrary external network calls;
  commit an outbox event instead.

## Impl and composition

`src/impls/` is Rust's keyword-safe equivalent of `impl/`. It constructs
concrete adapters, chooses static or dynamic dispatch, opens transactions around
app use cases, owns task lifecycle/shutdown, maps API calls, and runs the outbox
processor. It is the only module that imports both app and adapters.

Optional workflow activities are small wrappers over port operations. Durable
orchestration must not move into one giant activity.

## Events, publisher, and workflows

- `core/events.rs` owns persisted outbox event variants.
- `events/` owns portable queue schemas/conversion.
- `publisher/` implements event publication.
- `workflows/` contains only durable-runtime translation and sequencing.
- Spawned outbox tasks are owned, cancelled, and drained by `impls/`; detached
  tasks are forbidden.

## Testing

- Core: table-driven pure tests.
- App: in-memory trait implementations; no database or network.
- Adapters: integration tests against real dependencies.
- Wiring/E2E: only critical paths.

Tests use valid newtype identifiers and deterministic clock/ID adapters. Avoid
mocking concrete libraries when a port can be implemented in memory.

## Rust-specific checks

- [ ] Traits are owned by the application that consumes them.
- [ ] Core remains synchronous and pure.
- [ ] Newtypes protect identifiers after parsing.
- [ ] `Result`/enums model expected outcomes.
- [ ] No recoverable-path `unwrap`/`expect`.
- [ ] Generic bounds remain narrow and readable.
- [ ] Dynamic dispatch appears only for a runtime need.
- [ ] Async tasks have explicit ownership and shutdown.
- [ ] Transactions do not span arbitrary network effects.
- [ ] Repositories remain concrete persistence code; Postgres adapters implement
      app-owned traits.
- [ ] API DTOs do not leak into core/ports/app/adapters/repositories.
- [ ] Outbox tasks have explicit ownership, cancellation, and shutdown draining.
