# Delivery, workflows, and migrations

Read when changing durable side effects, outbox processing, workflows, or schema
history. For SQL/Effect wiring use [persistence](effect/persistence.md).

## One write path

```text
impl opens transaction
  app loads -> core decides -> adapter guards and writes state + outbox
commit
  poke processor
processor claims -> publisher sends with persisted key -> acknowledge
```

Protect decisions against concurrent changes using locks, expected versions,
constraints, or suitable isolation. A transaction alone does not prevent stale
read decisions. Status-only guards miss relevant changes within the same status.
A conflict or failed outbox append commits neither the mutation nor its event.

Call a downstream service synchronously only when its result is needed for the
current response and coupled failure semantics are intentional. Otherwise required
cross-process effects belong in the outbox, not a post-commit fan-out or detached fiber.

## Outbox contract

| Guarantee | Implementation obligation |
| --- | --- |
| Atomic intent | State and outbox row use the same actual transaction |
| Stable replay identity | Persist event/effect ID before dispatch; never regenerate on retry |
| Concurrent claim safety | `FOR UPDATE SKIP LOCKED` plus explicit claim ownership |
| Crash recovery | Lease/reclaim protocol or equivalent; a released row lock is not a lease |
| At-least-once delivery | Downstream deduplication by stable key; duplicates remain possible |
| Retry recovery | Persist attempts/backoff; retain exhausted work for repair |
| Missed wakeups | Startup drain plus bounded recovery scan/durable wakeup |
| Shutdown | Stop accepting work, drain within a budget, leave pending work recoverable |

Pokes improve latency; they are not durable delivery. Delayed retries need a wakeup
after their due time. Bound batch size, concurrency, attempts, and memory. A database
commit or HTTP response lost in transit can have an **uncertain outcome**; reconcile
by stable identity instead of claiming rollback or retrying a new logical operation.

## Ownership

- `core/main/events.ts` owns persisted event variants.
- `events/main/` owns portable published schemas and conversion to/from outbox data.
- Persistence adapters write outbox rows; they do not send to the queue.
- `publisher/` implements queue delivery and translates transport failures.
- `impl/` starts, pokes, drains, and closes the processor and owns its fibers.
- In Rust the same roles use modules and `impls/`.

## Durable workflows

A workflow is a durable-runtime adapter, not the home of business decisions.
Activities are small adapter operations corresponding to ports. Keep durable
sequencing visible at workflow/app level; do not hide the entire operation in one
giant activity. Optional `impl/main/activities.ts` exposes activity operations,
not business orchestration. Deterministic workflow code must use runtime-safe
clock/randomness/activity facilities, not ordinary host I/O.

Do not create workflows merely to schedule, poll, claim, or drain outbox rows.
In-memory state machines can help complex finite lifecycles, but XState is not
mandatory and is not durable storage. A simple pure union/decision or bounded
Effect Schedule is often sufficient.

## Service-owned migrations, one runner

```text
service/migrations/        owns schema history, including its outbox
shared Postgres package    owns generic migration mechanics
migration workspace       executable root registering all service targets
```

Services export migration files/descriptors, never runnable migration entrypoints.
Do not move service-specific history into the runner or make shared infrastructure
depend on services. IDs must be globally/order-safe within each migration target
according to the repository convention. Keep migrations at Rust crate root too.

## Proof to require

- Fail an outbox insert after mutation; prove both roll back.
- Race two writers at the same version; only one mutation/event pair commits.
- Crash after send but before acknowledgement; replay keeps the same key.
- Lose a poke or advance past retry due time; recovery still dispatches.
- Exhaust retries or shutdown budget; pending work is retained and discoverable.
- Use real PostgreSQL for SQL/isolation guarantees; a fake cannot prove them.
