# Testing: exercise the supplied capability

Read for app tests, in-memory implementations, and Effect lifecycle tests. Examples
use [flow](flow.md), [services](services.md), and the lookup policy in
[runtime](runtime.md). Use `@effect/vitest` for Effect tests; ordinary pure tests do
not need an Effect wrapper.

## 1. A fresh, behaviorally honest in-memory adapter

```typescript
// example: fixtures/invoices.ts -> adapters/test/fixtures/invoices.ts
import { Context, Effect, Layer, Option } from 'effect';
import type { ArchiveWrite, Invoice } from 'core';
import { InvoiceChanged, InvoiceSession } from 'ports';

export class InvoiceProbe extends Context.Service<InvoiceProbe, {
  readonly events: Effect.Effect<ReadonlyArray<ArchiveWrite>>;
}>()('@invoices/test/InvoiceProbe') {}

export const invoiceTestLayer = (initial: Invoice) => Layer.effectContext(
  Effect.gen(function* () {
    let current = initial;
    const events: Array<ArchiveWrite> = [];
    const session = InvoiceSession.of({
      find: (id) => Effect.sync(() => id === current.id ? Option.some(current) : Option.none()),
      archive: (write) => Effect.suspend(() => {
        if (write.invoiceId !== current.id || current.status !== 'paid'
          || write.expectedVersion !== current.version) {
          return Effect.fail(new InvoiceChanged({ invoiceId: write.invoiceId }));
        }
        current = {
          id: current.id, status: 'archived', version: current.version + 1,
          archivedAtMs: write.archivedAtMs,
        };
        events.push(write);
        return Effect.void;
      }),
    });
    return Context.make(InvoiceSession, session).pipe(
      Context.add(InvoiceProbe, { events: Effect.sync(() => [...events]) }),
    );
  }),
);
```

State is allocated when the Layer builds, not in a module-global singleton. This
fixture enforces a version guard and appends an event, rather than returning canned
success. It models this one-invoice operation; it does not implement general rollback,
SQL isolation, outbox uniqueness, or a multi-port transaction. Do not claim those
properties from tests against it.

## 2. Test behavior, not how many helper calls occurred

```typescript
// example: tests/invoice.test.ts -> app/test/archive-invoice.test.ts
import { expect, it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { EventId, InvoiceId } from 'core';
import { archiveInvoice } from 'app/archive';
import { archiveItem } from 'app/archive-item';
import { InvoiceSession, InvoiceStoreFailure } from 'ports';
import { InvoiceProbe, invoiceTestLayer } from 'fixtures/invoices';

const invoiceId = Schema.decodeUnknownSync(InvoiceId)('00000000-0000-4000-8000-000000000001');
const eventId = Schema.decodeUnknownSync(EventId)('00000000-0000-4000-8000-000000000002');

it.effect('repeated archive calls append only one event', () => Effect.gen(function* () {
  const probe = yield* InvoiceProbe;
  const input = { invoiceId, eventId };

  yield* archiveInvoice(input);
  yield* archiveInvoice(input);

  expect(yield* probe.events).toHaveLength(1);
}).pipe(Effect.provide(invoiceTestLayer({ id: invoiceId, status: 'paid', version: 0 }))));

it.effect('an open invoice is rejected without appending an event', () => Effect.gen(function* () {
  const probe = yield* InvoiceProbe;

  const error = yield* archiveInvoice({ invoiceId, eventId }).pipe(Effect.flip);

  expect({ tag: error._tag, events: yield* probe.events }).toEqual({
    tag: 'InvoiceNotPaid', events: [],
  });
}).pipe(Effect.provide(invoiceTestLayer({ id: invoiceId, status: 'open', version: 0 }))));

const missingId = Schema.decodeUnknownSync(InvoiceId)('00000000-0000-4000-8000-000000000003');
it.effect.each([
  { id: invoiceId, reason: 'not-paid' },
  { id: missingId, reason: 'missing' },
])('batch policy skips $reason without writes', ({ id, reason }) => Effect.gen(function* () {
  const probe = yield* InvoiceProbe;

  const result = yield* archiveItem({ invoiceId: id, eventId });

  expect({ result, events: yield* probe.events }).toEqual({
    result: { kind: 'skipped', invoiceId: id, reason }, events: [],
  });
}).pipe(Effect.provide(invoiceTestLayer({ id: invoiceId, status: 'open', version: 0 }))));

it.effect('batch policy does not turn a storage failure into a skip', () => {
  const failure = new InvoiceStoreFailure({
    operation: 'find', reason: 'QueryFailed', cause: new Error('fixture unavailable'),
  });
  const unavailableLayer = Layer.succeed(InvoiceSession, InvoiceSession.of({
    find: () => Effect.fail(failure),
    archive: () => Effect.fail(failure),
  }));
  return Effect.gen(function* () {
    const error = yield* archiveItem({ invoiceId, eventId }).pipe(Effect.flip);
    expect(error).toBe(failure);
  }).pipe(Effect.provide(unavailableLayer));
});
```

The batch-policy tests exercise [app-owned recovery](errors.md), including failures
that must not be swallowed. The unavailable fixture is a complete port implementation,
not a module mock or a partial object cast.

Provide a fresh stateful Layer per isolated case. `it.layer(Layer)(name, callback)`
is useful for shared expensive resources, but **does not promise a reset between
tests in its block**. Separate pure decision tests from adapter tests. Use real
PostgreSQL for transaction rollback, constraints, and racing writes.

## 3. Virtual time proves a retry budget

```typescript
// example: tests/retry.test.ts -> app/test/lookup-policy.test.ts
import { expect, it } from '@effect/vitest';
import { Effect, Fiber, Ref } from 'effect';
import { TestClock } from 'effect/testing';
import { retryLookup } from 'app/retry';
import { LookupUnavailable } from 'ports/lookup';

it.effect('stops after the initial lookup plus three retries', () => Effect.gen(function* () {
  const attempts = yield* Ref.make(0);
  const lookup = Ref.update(attempts, (count) => count + 1).pipe(
    Effect.andThen(Effect.fail(new LookupUnavailable({ retryable: true }))),
  );

  const fiber = yield* lookup.pipe(retryLookup, Effect.flip, Effect.forkChild);
  yield* TestClock.adjust('1 second');
  yield* Fiber.join(fiber);

  expect(yield* Ref.get(attempts)).toBe(4);
}));
```

Use barriers/Deferreds rather than sleeps to stage races. Test per-attempt and total
budgets separately, including a non-retryable error and an interrupted operation.
Do not let a real network timeout substitute for a deterministic policy test.

## 4. Cleanup is observable behavior

```typescript
// example: tests/scope.test.ts -> adapters/test/resource-lifetime.test.ts
import { expect, it } from '@effect/vitest';
import { Effect, Ref, Schema } from 'effect';

class FixtureFailure extends Schema.TaggedError<FixtureFailure>()('FixtureFailure', {}) {}

it.effect('releases an acquired resource after expected failure', () => Effect.gen(function* () {
  const released = yield* Ref.make(0);
  const use = Effect.gen(function* () {
    yield* Effect.acquireRelease(Effect.succeed('resource'), () => Ref.update(released, (n) => n + 1));
    return yield* Effect.fail(new FixtureFailure());
  }).pipe(Effect.scoped);

  yield* Effect.flip(use);

  expect(yield* Ref.get(released)).toBe(1);
}));
```

Also test success and interruption when lifecycle correctness is part of the adapter.
A failed acquisition does not register its release; partial acquisition needs its
own cleanup. Test the actual adapter's acquisition, not only this library fixture.

## Choose the smallest proof

| Missing proof | Test |
| --- | --- |
| Business transition | Pure table cases; properties when the rule spans many inputs |
| Behavior depends on history | Generated commands checked against an independent model |
| Adapter portability | Shared port contract cases against each implementation |
| HTTP policy | Supplied HttpClient: 2xx valid body, non-2xx, malformed JSON, wrong schema |
| Boundary safety | Input limits, output encoding, error redaction, actor/tenant isolation |
| Atomicity/concurrency | Real database fault injection and synchronized races |
| Delivery | Crash after send/before ack; replay retains the persisted key |

`it.prop` / `it.effect.prop` and Schema-derived `Arbitrary` generators can explore
more cases. The oracle must be independent: do not calculate expected output with
the same helper being tested. Plant a plausible violation, observe failure, restore
it, then verify success. Keep a regression that detects behavior, not a duplicate
of implementation syntax or a snapshot of generated code.

Credits: [supplied-service tests](https://ratstack.sh/lore/tests-that-earn-their-place),
[property tests](https://ratstack.sh/lore/property-based-testing),
[model tests](https://ratstack.sh/lore/model-based-testing),
[resource exits](https://ratstack.sh/lore/scopes-own-resources).
