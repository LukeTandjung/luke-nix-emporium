# Effect: start here

**Use Luke's folders and the traced `fn` + `gen(...).pipe(...)` hybrid.** This
page is the entry point, not a request to load every recipe below.

## The coding shape

```typescript
const operation = Effect.fn('Service.operation')(
  (input: Input): Effect.Effect<Output, Failure, NeededPort> =>
    Effect.gen(function* () {
      const port = yield* NeededPort;
      const current = yield* port.load(input.id);
      const decision = decide(current, input); // Pure core function.
      return yield* port.apply(decision);
    }).pipe(
      Effect.map(toOutput),
      Effect.catchTag('RecoverableFailure', recoverAccordingToUseCase),
    ),
);
```

This is a shape, not a runnable snippet; the recipes contain concrete examples.
For writes, do not recover a failure into success before required rollback. Place
that policy outside the transaction, or handle only proven pre-write refusals.

- **`gen`:** service access, dependent work, branching, loops, early exits, and
  business-flow orchestration. Call pure core decisions rather than duplicating them.
- **`.pipe`:** ordered data transformations (`map`), linear effectful transforms
  (`flatMap`/`andThen`), error translation/recovery, tracing, timeouts, and provision.
- Move a pipeline back into a generator when it grows nested callbacks, branching,
  or dependencies on several earlier results. Do not ban a clear linear pipeline.
- `.pipe` is composition, not automatic concurrency. Operator order matters:
  `timeout -> retry` and `retry -> timeout` have different budgets.
- Local `.pipe(...)` calls inside a generator are welcome for one boundary's error
  translation. Never move business rules into error combinators to hide branching.
- **`fn('name')`:** add a named span and Effect function-boundary stack metadata
  around the normal function returning `gen(...).pipe(...)`. Do not duplicate its
  span with an identical `withSpan`. This is diagnostic context, not a durable audit log.
- Use the hybrid for named use cases and adapter operations. Pure functions, Layer
  construction, inline effects, and small policy combinators need no ceremonial wrapper.
  `fnUntraced` is an explicit exception where instrumentation is not useful.
- **App owns recovery policy.** Let owned typed failures propagate to the app's
  composition point; use `catchTag`/`catchTags` there for deliberate fallbacks or
  aggregation. Do not add handlers merely to log and rethrow unchanged errors.
- Adapters still translate vendor failures with localized `mapError` where the
  operation has one meaning. API/impl maps unresolved failures to public responses.
  Translation and presentation are not business recovery. See [error policy](effect/errors.md).

## Load by task

| Working on | Read next | What the example proves |
| --- | --- | --- |
| A use case or core transition | [Flow](effect/flow.md) | Pure decision + generator orchestration + transformation pipeline |
| A port, adapter Layer, or composition root | [Services](effect/services.md) | Construction dependencies, method requirements, Layer operators |
| Input/output and schemas | [Boundaries](effect/boundaries.md) | Decode/encode without DTO leakage |
| Recovery, fallback, error aggregation | [Errors](effect/errors.md) | One app policy owner; adapter translation and public presentation |
| SQL or transactional writes | [Persistence](effect/persistence.md) | Real transaction, guarded mutation, atomic outbox |
| HTTP, config, retry, scopes, runtime | [Runtime](effect/runtime.md) | Status/body checks, bounded work, lifetime ownership |
| Tests or fake implementations | [Testing](effect/testing.md) | Fresh Layers, virtual time, observable behavior |

Recipes link to the exact prerequisites used by their examples. Load those when
needed. External credit links are attribution, not required reading.

## Adapt Tiger Style, do not mix runtimes

| Tiger Style concern | Effect implementation |
| --- | --- |
| Parse at boundaries | Effect Schema, not a second Zod schema for the same value |
| Expected errors | Typed `E` channel, not throwing or `Promise<Result<...>>` wrappers |
| Programmer invariants | Defects; no assertion quota or assertions for normal refusals |
| Bounded async work | Effect combinators, not already-started Promises or `p-limit` |
| Cleanup | Scope/finalizers, not a second resource-management framework |
| Immutable values | Pure core; runtime state belongs to a scoped adapter instance |

No assertions/type casts to bypass parsing. No `run*` in app or adapters. Only
executable, framework integration, or test boundaries run Effects; a managed runtime
may execute many requests and must be disposed by its owner.

## Version and verification

Check the project's manifest/lockfile and matching Effect `LLMS.md`/source before
using an unfamiliar API. These recipes target **Effect 4.0.0**; they are not an
Effect 3 migration guide. Example module labels map to Luke's canonical folders;
imports such as `core` and `ports` mean their public barrels. Typechecking and
in-memory tests do not prove real database isolation, live HTTP behavior, or
production shutdown semantics; verify those against the actual integrations.
