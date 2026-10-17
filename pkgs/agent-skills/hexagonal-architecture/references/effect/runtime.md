# Runtime: dependencies, bounds, and owners

Read only the sections relevant to configuration, HTTP, retries, or resource/runtime
ownership. Keep business decisions in core and production selection in impl.

## Configuration is supplied, not ambient

```typescript
// example: ports/settings.ts -> ports/main/delivery-settings.ts
import { Context } from 'effect';

export class DeliverySettings extends Context.Service<DeliverySettings, {
  readonly concurrency: number;
}>()('@delivery/ports/DeliverySettings') {}
```

```typescript
// example: adapters/config.ts -> adapters/main/config/delivery-settings.ts
import { Config, Effect, Layer, Schema } from 'effect';
import { DeliverySettings } from 'ports/settings';

const concurrencySchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(32),
);
export const deliverySettingsLayer = Layer.effect(
  DeliverySettings,
  Effect.gen(function* () {
    const raw = yield* Config.Number('DELIVERY_CONCURRENCY');
    const concurrency = yield* Schema.decodeUnknownEffect(concurrencySchema)(raw);
    return DeliverySettings.of({ concurrency });
  }),
);
```

The contract stays in `ports/`; the parsing Layer stays in `adapters/`. Parse
when the Layer builds, not on every method call. Use `ConfigProvider` for parsing
tests and `Layer.succeed(DeliverySettings, ...)` when testing business behavior.
Keep credentials redacted; never read `process.env` in core or app.

## HTTP requires status *and* body validation

```typescript
// example: adapters/http.ts -> adapters/main/http/provider-version.ts
import { Effect, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';

const Reply = Schema.Struct({ version: Schema.Int });
export class ProviderFailure extends Schema.TaggedError<ProviderFailure>()(
  'ProviderFailure', {
    phase: Schema.Literals(['request', 'body']), cause: Schema.Defect(),
  },
) {}

export const readProviderVersion = Effect.fn('Provider.readVersion')(
  (): Effect.Effect<number, ProviderFailure, HttpClient.HttpClient> => Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
    const response = yield* client.get('https://provider.example.test/version').pipe(
      Effect.timeout('2 seconds'),
      Effect.mapError((cause) => new ProviderFailure({ phase: 'request', cause })),
    );
    return yield* HttpClientResponse.schemaBodyJson(Reply)(response).pipe(
      Effect.timeout('2 seconds'),
      Effect.map((reply) => reply.version),
      Effect.mapError((cause) => new ProviderFailure({ phase: 'body', cause })),
    );
  }),
);
```

Here the pipeline deliberately groups request/status/timeout errors into one
meaning, and body/parse/schema failures into another. Use more specific tags when
callers need different recovery. `filterStatusOk` transforms the **client**, not
the Effect returned by `client.get`. A fulfilled request or valid JSON is not proof
of a valid domain response. Set body-size limits in the concrete transport too.

This helper requires HttpClient; an adapter Layer captures it and exposes the
application port, hiding transport requirements from app callers. Supply a test
HttpClient to test this decoder rather than replacing the whole adapter.

## Bound active work and replay separately

```typescript
// example: ports/lookup.ts -> ports/main/lookup-errors.ts
import { Schema } from 'effect';

export class LookupUnavailable extends Schema.TaggedError<LookupUnavailable>()(
  'LookupUnavailable', { retryable: Schema.Boolean },
) {}
```

```typescript
// example: app/retry.ts -> app/main/lookups/retry-policy.ts
import { Cause, Effect, Schedule } from 'effect';
import { LookupUnavailable } from 'ports/lookup';

const MAX_RETRY_COUNT = 3;
const ATTEMPT_TIMEOUT_MS = 1_000;
const TOTAL_TIMEOUT_MS = 5_000;
const schedule = Schedule.max([Schedule.spaced('200 millis'), Schedule.recurs(MAX_RETRY_COUNT)])
  .pipe(
    Schedule.setInputType<LookupUnavailable | Cause.TimeoutError>(),
    Schedule.while(({ input }) => input._tag === 'TimeoutError' || input.retryable),
  );

/** Only for an idempotent lookup; timeout is safe to retry under that contract. */
export const retryLookup = <A, R>(lookup: Effect.Effect<A, LookupUnavailable, R>): Effect.Effect<
  A, LookupUnavailable | Cause.TimeoutError, R
> => lookup.pipe(
  Effect.timeout(ATTEMPT_TIMEOUT_MS),
  Effect.retry(schedule),
  Effect.timeout(TOTAL_TIMEOUT_MS),
);
```

This policy is selected by app composition; adapters expose the owned failure
without silently deciding business replay policy. The policy combinator itself
needs no extra function span; the named lookup operation already owns one.
These limits are illustrative, not measured production settings. `recurs(3)` allows
three retries after the initial attempt. Per-attempt timeout goes **before** retry;
total budget goes **after**. Add capped backoff/jitter when appropriate. Retry
classification is not proof a write can be replayed: never apply this lookup policy
to arbitrary writes. Preserve terminal failures after exhaustion.

For a bounded input batch, `Effect.forEach(items, work, { concurrency: 8 })` bounds
active work and preserves result order. Do not pre-create running Promises; that
escapes the bound. Also bound queue capacity and input size or stream with backpressure.
Partial completion is possible; this combinator is not a distributed transaction.

## Acquire lazily; use within scope; release on every exit

```typescript
// Ownership shape; acquire/use/release belong to the actual adapter API.
Effect.gen(function* () {
  const resource = yield* Effect.acquireRelease(acquire, release);
  return yield* use(resource);
}).pipe(Effect.scoped);
```

Allocate inside `acquire`, not before building the Effect. Successful acquisition
registers cleanup for success, typed failure, and interruption. Failed acquisition
does not run that finalizer: acquisition must clean up any partial setup itself.
Use `acquireUseRelease` for one-shot use, a scoped Layer for service lifetime, and
`forkScoped` for owned background work. A scope closing interrupts its children;
shutdown/draining still needs an explicit bounded protocol. See the executable
cleanup test in [testing](testing.md).

When wrapping Promise I/O, use `Effect.tryPromise({ try: (signal) => ..., catch })`
and pass `signal` to cancellation-aware I/O. `Effect.promise` treats rejection as a
defect. Interruption cannot undo a remote write or cancel an API that ignores its
signal. Keep database statement timeouts as well as request budgets.

## Run only where the host enters

- CLI/executable: the platform's `runMain` at the entry point.
- Native Effect HTTP/workflow integration: return an Effect; let that bridge run it.
- Foreign Promise-based framework: one owned `ManagedRuntime` from the impl Layer,
  reuse `runtime.runPromise` for requests, `await runtime.dispose()` on shutdown.
- Tests: Effect-aware runner; manual execution only at a genuinely non-Effect test edge.

Do not rebuild the full Layer graph per request or call `runPromise` inside adapters.
Do not cache request-owned pending Promises at process/isolate scope; cache completed
immutable data only with an explicit key, authorization boundary, expiry, and budget.

Use meaningful names on the default `Effect.fn('name')` boundary and safe correlation
attributes. Do not add an identical `withSpan` inside it; reserve `withSpan` for a
useful additional sub-operation. A created span is not proof telemetry was exported;
exporter startup/flushing belongs to impl.
Do not attach raw payloads, credentials, or high-cardinality secrets.

Credits: [configuration](https://ratstack.sh/lore/configuration-is-a-dependency),
[HTTP](https://ratstack.sh/lore/http-responses-need-validation),
[scopes](https://ratstack.sh/lore/scopes-own-resources),
[concurrency](https://ratstack.sh/lore/concurrent-work-needs-an-owner),
[runtime](https://ratstack.sh/lore/run-effect-at-the-boundary),
[caches](https://ratstack.sh/lore/cache-completed-values),
[tracing](https://ratstack.sh/lore/trace-meaningful-operations).
