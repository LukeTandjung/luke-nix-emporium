# Flow: pure decision, generator, pipeline

Read for business use cases. The app example uses the port from
[services](services.md). Model definitions here are shared by the other examples.

## 1. Core owns values, not runtime services

```typescript
// example: core/model.ts -> core/main/model.ts
import { Match, Schema } from 'effect';

export const InvoiceId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('InvoiceId'));
export type InvoiceId = typeof InvoiceId.Type;
export const EventId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('EventId'));
export type EventId = typeof EventId.Type;
const version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const epochMs = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const fields = { id: InvoiceId, version };

export const Invoice = Schema.Union([
  Schema.Struct({ ...fields, status: Schema.Literal('open') }),
  Schema.Struct({ ...fields, status: Schema.Literal('paid') }),
  Schema.Struct({ ...fields, status: Schema.Literal('archived'), archivedAtMs: epochMs }),
]);
export type Invoice = typeof Invoice.Type;

export interface ArchiveInput {
  readonly invoiceId: InvoiceId;
  readonly eventId: EventId;
}
export interface ArchiveWrite extends ArchiveInput {
  readonly expectedVersion: number;
  readonly archivedAtMs: number;
}
export type ArchiveDecision =
  | { readonly kind: 'archive'; readonly write: ArchiveWrite }
  | { readonly kind: 'already-archived'; readonly invoiceId: InvoiceId }
  | { readonly kind: 'not-paid'; readonly invoiceId: InvoiceId };

export function decideArchive(
  invoice: Invoice,
  eventId: EventId,
  nowMs: number,
): ArchiveDecision {
  return Match.value(invoice).pipe(
    Match.withReturnType<ArchiveDecision>(),
    Match.discriminatorsExhaustive('status')({
      open: (current) => ({ kind: 'not-paid', invoiceId: current.id }),
      archived: (current) => ({ kind: 'already-archived', invoiceId: current.id }),
      paid: (current) => ({
        kind: 'archive',
        write: {
          invoiceId: current.id, eventId, expectedVersion: current.version, archivedAtMs: nowMs,
        },
      }),
    }),
  );
}
```

No clock reads or persistence in core. `eventId` is a stable command/effect identity,
allocated outside a retry or recovered from persisted command data. Replaying an
already-archived invoice returns its identity without appending another event.

These are intent-specific outcomes, not boolean flags or a generic `update` bag.
Prefer Effect `Match` for discriminated-union-to-value transformations like this.
`discriminatorsExhaustive('status')` requires every status; `tagsExhaustive` is the
`_tag` shorthand. For predicate-based branches use `Match.when` and finish with
`Match.exhaustive`. Do not add a catch-all merely to hide missing variants.
`withReturnType` checks the result contract without type assertions.

Keep simple guards as `if` statements and use an imperative `switch` when branches
contain sequential effects/early exits that read better inside the generator.
`Match` is pure pattern matching; importing it does not introduce runtime effects
into core. It does not replace `catchTags` for app-owned error-channel recovery.

## 2. App executes the decision

```typescript
// example: app/archive.ts -> app/main/invoices/archive-invoice.ts
import { Clock, Effect, Option, Schema } from 'effect';
import { decideArchive, InvoiceId } from 'core';
import type { ArchiveInput } from 'core';
import { InvoiceSession } from 'ports';
import type { InvoiceChanged, InvoiceStoreFailure } from 'ports';

export class InvoiceNotFound extends Schema.TaggedError<InvoiceNotFound>()(
  'InvoiceNotFound', { invoiceId: InvoiceId },
) {}
export class InvoiceNotPaid extends Schema.TaggedError<InvoiceNotPaid>()(
  'InvoiceNotPaid', { invoiceId: InvoiceId },
) {}
export type ArchiveFailure =
  | InvoiceNotFound | InvoiceNotPaid | InvoiceChanged | InvoiceStoreFailure;

export const archiveInvoice = Effect.fn('Invoices.archive')(
  (input: ArchiveInput): Effect.Effect<InvoiceId, ArchiveFailure, InvoiceSession> =>
    Effect.gen(function* () {
      const session = yield* InvoiceSession;
      const found = yield* session.find(input.invoiceId);
      if (Option.isNone(found)) {
        return yield* Effect.fail(new InvoiceNotFound({ invoiceId: input.invoiceId }));
      }
      const decision = decideArchive(found.value, input.eventId, yield* Clock.currentTimeMillis);
      switch (decision.kind) {
        case 'not-paid':
          return yield* Effect.fail(new InvoiceNotPaid({ invoiceId: decision.invoiceId }));
        case 'already-archived':
          return decision.invoiceId;
        case 'archive':
          yield* session.archive(decision.write);
          return decision.write.invoiceId;
      }
    }),
);
```

The generator contains business **flow**, not duplicate business rules. The named
`fn` supplies its span and stack metadata; no duplicate `withSpan` is needed. This
operation has no recovery policy, so its failures propagate unchanged to app
composition. Omit `.pipe(...)` when there is nothing to transform or handle.
Clock is a standard Effect runtime service; no custom clock tag is needed here.

## 3. Use a pipeline when the transformation is linear

```typescript
// example: app/list.ts -> app/main/invoices/list-paid-ids.ts
import { Effect } from 'effect';
import { InvoiceCatalog } from 'ports';
import type { InvoiceStoreFailure } from 'ports';
import type { InvoiceId } from 'core';

export const listPaidIds = Effect.fn('Invoices.listPaidIds')(
  (): Effect.Effect<ReadonlyArray<InvoiceId>, InvoiceStoreFailure, InvoiceCatalog> =>
    Effect.gen(function* () {
      const catalog = yield* InvoiceCatalog;
      return yield* catalog.listRecent();
    }).pipe(
      Effect.map((invoices) => invoices.filter((invoice) => invoice.status === 'paid')),
      Effect.map((invoices) => invoices.map((invoice) => invoice.id)),
    ),
);
```

`map` transforms success values; `flatMap` chains a transformation that returns an
Effect; `andThen` sequences the next step when the old value is not needed. A clear
linear decode/transform pipeline is welcome. If three nested callbacks must retain
old results or branch on business outcomes, use named values in a generator instead.

**Avoid:** nesting generators around trivial pure maps, hiding core business rules
inside `catch`, or instrumenting every helper. Use `catchTags` at the app composition
that owns recovery, not in every function that a failure passes through.

## `gen`, `fn`, and `fnUntraced` are function-style choices

| Form | Automatic instrumentation | Construction difference |
| --- | --- | --- |
| **Default:** `Effect.fn('Operation')((input) => Effect.gen(function* () { ... }).pipe(...))` | Named span plus Effect stack-frame metadata | Still creates the inner generator-function closure per call |
| `(input) => Effect.gen(function* () { ... }).pipe(...)` | No automatic function-boundary instrumentation | Useful for inline/uninstrumented composition |
| `Effect.fnUntraced(function* (input) { ... }, transforms...)` | No added span or Effect stack-frame boundary | Reuses the generator function |
| `Effect.fn('Operation')(function* (input) { ... }, transforms...)` | Named span plus Effect stack-frame metadata | Reuses the generator function |
| `Effect.fn(function* (input) { ... }, transforms...)` | Effect stack-frame boundary, no automatic span | Reuses the generator function |

All describe Effect work; none is an execution runtime or different DI mechanism.
`gen(...).pipe(withSpan(name))` provides a named span but not the additional `fn`
stack-frame metadata. `fnUntraced` does not disable spans explicitly created inside
its body. Closure reuse is an allocation difference, not a blanket performance claim.

The transforms after an `fn`/`fnUntraced` body are pipeline-like and can access the
original arguments; calls to the resulting function also return pipeable Effects.
Do not add the same `withSpan` again to a named `fn` unless a nested span is intended.
Luke's default is the hybrid: a named `fn` wraps a normal function returning
`gen(...).pipe(...)`. Preserve the readable inner pipeline. Unlike passing the
generator directly to `fn`, this does not gain generator-function closure reuse.
Use `fnUntraced` only when omitting instrumentation is a deliberate choice, not a
reason to remove useful diagnostics from all operations.

Credits: [service composition](https://ratstack.sh/lore/services-capture-dependencies),
[Effect function builders](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/Effect.ts).
