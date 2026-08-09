# TypeScript Effect adaptation

Read `repos/effect/LLMS.md` before implementation and use the vendored Effect
source, tests, and `ai-docs/` as the source of truth. Effect APIs evolve. Treat
these snippets as architecture shapes, not an excuse to skip the vendored
implementation.

## Mapping

| Architecture   | Effect representation                                         |
| -------------- | ------------------------------------------------------------- |
| Core           | ordinary pure functions returning data                        |
| Port           | Effect service contract/tag                                   |
| Adapter        | `Layer` providing a port                                      |
| Use case       | function returning `Effect<Success, Error, Requirements>`     |
| Wiring         | Layer graph plus one runtime boundary                         |
| Expected error | tagged error in Effect's error channel                        |
| Defect         | unexpected bug represented as a defect, not a routine failure |

Effect's environment already performs dependency injection. Do not also pass a
giant dependency record through every function unless a pure function genuinely
benefits from explicit data.

## Core

Core does not return `Effect` merely for stylistic consistency. If computation
is pure, keep it pure.

```typescript
export interface ScheduleInput {
  readonly requestedAt: Date;
  readonly agentId: AgentId;
}

export type ScheduleDecision =
  | { readonly kind: "schedule"; readonly run: PendingRun }
  | { readonly kind: "already-running"; readonly runId: RunId };

export function decideSchedule(
  input: ScheduleInput,
  current: AgentRun | undefined,
): ScheduleDecision {
  // pure branching only
}
```

Pass `requestedAt` and IDs in. Never call clock/random/ID APIs in core.

## Ports

Define a cohesive service contract. Keep contract methods typed with success,
failure, and requirements. A port's adapter-specific requirements should
normally be closed by its Layer rather than leak to callers.

```typescript
export interface AgentRunStoreShape {
  readonly findActive: (
    agentId: AgentId,
  ) => Effect.Effect<AgentRun | undefined, AgentRunStoreError, Transaction>;

  readonly insert: (
    run: PendingRun,
  ) => Effect.Effect<AgentRun, AgentRunStoreError, Transaction>;
}
```

Use the current documented Effect service/tag constructor. A class used only to
declare an Effect tag is allowed; do not put business methods or mutable state
on it.

Clock and ID generation should use standard Effect services when available.
Define project ports only when the application needs a narrower or
project-specific contract.

## Use cases

A use case is a named function returning Effect. It requests ports through the
Effect environment and delegates business branching to core.

```typescript
export function scheduleAgent(
  input: ScheduleAgentInput,
): Effect.Effect<
  AgentRun,
  ScheduleAgentError,
  AgentRunStore | Clock | IdGenerator | Transaction
> {
  return Effect.gen(function* () {
    const store = yield* AgentRunStore;
    const clock = yield* Clock;
    const ids = yield* IdGenerator;
    const current = yield* store.findActive(input.agentId);
    const decision = decideSchedule(
      { agentId: input.agentId, requestedAt: yield* clock.currentTimeMillis },
      current,
    );

    // Switch only to execute the pure decision. Persist state and outbox atomically.
  });
}
```

Verify exact APIs and time representations against current Effect docs. Do not
hide required services with `Effect.runPromise` inside app/core/adapters. Run
the Effect exactly once at the executable boundary.

## Repositories, adapters, and Layers

Repositories contain concrete SQL/generated-query calls and row decoding. They
accept the real Effect SQL transaction/client capability and return
persistence/domain values. They are not Effect port tags merely because they
access data.

Postgres adapters wrap repositories to satisfy application-owned ports. This
separation prevents query shapes and driver details from defining app contracts.

- An adapter interprets an external dependency and provides one or more ports.
- Construct adapters with `Layer`; compose Layers in `wiring/`.
- Adapter errors are translated into service-owned tagged errors. Do not leak
  raw driver errors through port contracts.
- Resource lifecycles use scoped Layers/acquisition.
- In-memory adapters are Layers with isolated state per construction.

```typescript
export const AgentRunStorePostgresLive: Layer.Layer<
  AgentRunStore,
  never,
  PostgresClient
> = Layer.effect(
  AgentRunStore,
  Effect.gen(function* () {
    const postgres = yield* PostgresClient;
    return {
      findActive: (agentId) => /* translate query result and errors */,
      insert: (run) => /* translate query result and errors */,
    };
  }),
);
```

## Errors

- Expected failures use tagged error values in Effect's error channel.
- Decode/validation failures are explicit boundary errors.
- Translate infrastructure errors at the adapter boundary.
- Use defects only for broken invariants or programmer errors.
- Handle errors at the narrowest layer with enough policy knowledge; do not
  catch and rethrow unchanged errors.

## Transactions

Prefer a transaction service/capability supplied for the scoped operation. Every
store operation participating in atomic work must use the real transaction. The
wiring layer opens the transaction around the use case or provides a
transaction-scoped Layer. Never create `{}` placeholders or silently open
independent transactions in each store method.

## API and schemas

Use runtime schemas at untrusted boundaries. API types map to core types;
internal code does not import API DTOs. Branded IDs are decoded at
HTTP/RPC/event/DB boundaries and remain branded internally. Follow the
repository TypeScript style skill when choosing the schema library and error
representation.

## Impl and composition

`impl/main/service.ts` is the composition root. It builds the Layer graph, opens
transaction scopes, invokes app use cases, maps API calls, owns outbox processor
lifecycle, and exposes the runnable service. It is the only location importing
both app and adapters. Do not place decisions in Layer constructors or API
method closures.

Optional `impl/main/activities.ts` exposes small activity-backed port operations
for genuine durable workflows. It does not contain orchestration.

## Events, publisher, and workflows

- `core/main/events.ts` owns persisted outbox event variants.
- `events/main/` owns portable queue schemas and conversion.
- `publisher/main/` provides the queue publisher port.
- `workflows/main/` delegates deterministic sequencing to app use cases and
  calls small activity-backed ports.
- Effect fibers are not a substitute for durable outbox persistence; fiber
  ownership and interruption belong in impl/wiring.

## Testing

- Core tests call functions directly.
- App tests provide in-memory Layers and run the Effect at the test boundary.
- Adapter tests provide real Postgres or transport Layers.
- Use deterministic Clock/ID Layers.
- Avoid `vi.mock` and global mutable Layer singletons.

## Effect-specific checks

- [ ] Pure core has no `Effect` return merely to look consistent.
- [ ] Port requirements are visible in Effect types.
- [ ] Layers close adapter-specific dependencies.
- [ ] No nested `Effect.run*` below the executable/test boundary.
- [ ] Scoped resources are acquired and released by Layers.
- [ ] Tagged expected errors remain in the typed error channel.
- [ ] Layer composition occurs in `impl/`, not app.
- [ ] Repositories remain concrete persistence code; Postgres adapters implement
      ports over them.
- [ ] API DTOs do not leak into core/ports/app/adapters/repositories.
- [ ] Outbox processor fibers are scoped, single-flight, and drained on
      shutdown.
