# Persistence: one port, one adapter, one actual transaction

Read for SQL/write paths. Requires the model in [flow](flow.md) and port in
[services](services.md). Durable dispatch policy is in [delivery](../delivery.md).

## 1. Put SQL and row decoding inside the adapter

This example assumes service-owned migrations create `invoice` (UUID primary key,
status, integer version, `created_at_ms`, nullable `archived_at_ms`) and `invoice_outbox` (unique
UUID event ID, invoice ID, JSONB payload). Every relevant invoice change increments
`version`. No SQL escapes this adapter and no repository wrapper is required.

```typescript
// example: adapters/session.ts -> adapters/main/postgres/invoice-session.ts
import { Effect, Layer, Option, Schema } from 'effect';
import { SqlClient } from 'effect/sql';
import { Invoice, InvoiceId } from 'core';
import type { ArchiveWrite } from 'core';
import { InvoiceChanged, InvoiceSession, InvoiceStoreFailure } from 'ports';

const decodeInvoices = Schema.decodeUnknownEffect(Schema.Array(Invoice));
const decodeUpdated = Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ id: InvoiceId })));

export const invoiceSessionPostgresLayer = Layer.effect(
  InvoiceSession,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const transaction = yield* Effect.serviceOption(sql.transactionService);
    if (Option.isNone(transaction)) {
      return yield* Effect.die(new Error('InvoiceSession requires an active transaction'));
    }
    return InvoiceSession.of({
      find: Effect.fn('InvoiceSession.find')(
        (id: InvoiceId): Effect.Effect<
          Option.Option<Invoice>, InvoiceStoreFailure
        > => Effect.gen(function* () {
          const rows = yield* sql`
            SELECT id, status, version, archived_at_ms AS "archivedAtMs" FROM invoice WHERE id = ${id}
          `.pipe(Effect.mapError((cause) => new InvoiceStoreFailure({
            operation: 'find', reason: 'QueryFailed', cause,
          })));
          const invoices = yield* decodeInvoices(rows).pipe(
            Effect.mapError((cause) => new InvoiceStoreFailure({
              operation: 'find', reason: 'StoredDataInvalid', cause,
            })),
          );
          return Option.fromUndefinedOr(invoices[0]);
        }),
      ),
      archive: Effect.fn('InvoiceSession.archive')(
        (write: ArchiveWrite): Effect.Effect<
          void, InvoiceChanged | InvoiceStoreFailure
        > => Effect.gen(function* () {
          const rows = yield* sql`
            UPDATE invoice SET status = 'archived', version = version + 1,
              archived_at_ms = ${write.archivedAtMs}
            WHERE id = ${write.invoiceId} AND version = ${write.expectedVersion} AND status = 'paid'
            RETURNING id
          `.pipe(Effect.mapError((cause) => new InvoiceStoreFailure({
            operation: 'archive', reason: 'QueryFailed', cause,
          })));
          const updated = yield* decodeUpdated(rows).pipe(
            Effect.mapError((cause) => new InvoiceStoreFailure({
              operation: 'archive', reason: 'StoredDataInvalid', cause,
            })),
          );
          if (updated.length === 0) {
            return yield* Effect.fail(new InvoiceChanged({ invoiceId: write.invoiceId }));
          }
          yield* sql`
            INSERT INTO invoice_outbox (id, invoice_id, payload)
            VALUES (${write.eventId}, ${write.invoiceId}, ${JSON.stringify(write)}::jsonb)
          `.pipe(Effect.mapError((cause) => new InvoiceStoreFailure({
            operation: 'archive', reason: 'QueryFailed', cause,
          })));
        }),
      ),
    });
  }),
);
```

The guard rechecks the pure decision's preconditions under concurrency. SQL checks
enforce integrity; they do not become the place to invent business rules. The
outbox event ID is supplied, not generated during the write or dispatch retry.
Do not suppress an event-ID collision unless reconciliation proves it is the same
logical operation. An insert failure must fail the surrounding transaction.
Local `mapError` translates each I/O phase; it does not recover. Keep write failures
failed until rollback completes. App-owned recovery can then be applied by impl
outside the transaction wrapper; catching them as success inside it risks a partial commit.

The constructor guard detects missing transaction wiring, a programmer defect.
It does **not** enforce lifetime after construction: never retain this session or
use its methods after the enclosing transaction, including from detached fibers.
A fake transaction marker would provide no safety.

## 2. Impl owns the transaction boundary

```typescript
// example: impl/transaction.ts -> impl/main/transaction.ts
import { Effect } from 'effect';
import { SqlClient, SqlError } from 'effect/sql';
import { archiveInvoice } from 'app/archive';
import type { ArchiveFailure } from 'app/archive';
import type { ArchiveInput, InvoiceId } from 'core';
import { invoiceSessionPostgresLayer } from 'adapters/session';

export const archiveInTransaction = Effect.fn('Invoices.archiveTransaction')(
  (input: ArchiveInput): Effect.Effect<
    InvoiceId, ArchiveFailure | SqlError.SqlError, SqlClient.SqlClient
  > => Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(
      archiveInvoice(input).pipe(Effect.provide(invoiceSessionPostgresLayer)),
    );
  }),
);
```

The concrete SQL driver Layer comes from the outer impl composition. Building a
Layer does not open a transaction: `withTransaction` does. The session Layer is
provided within each operation, not memoized as a process singleton. Never open
independent transactions inside `find` and `archive`.

For several cohesive ports in one atomic use case, provide their transaction-scoped
adapters inside this same transaction. Do not introduce generic `UnitOfWork` or
expose the SQL client to app to make wiring easier.

## 3. Do not overclaim what the error channel proves

The wrapper above leaves acquisition/transaction errors visible for the integration
boundary to classify; it is not a complete HTTP implementation. Inspect the actual
driver's commit and rollback behavior. **Effect 4.0.0's SQL transaction helper uses
`orDie` for commit/rollback failures**: a `catchTag('SqlError', ...)` alone does not
handle every transaction failure. Preserve/observe those causes at the runtime
boundary; do not blanket-convert unrelated defects into retryable errors.

| Failure | Required policy |
| --- | --- |
| Version conflict | Roll back; report conflict or deliberately retry the full decision |
| Outbox append fails | Roll back the state mutation too |
| Known serialization/deadlock rollback | Retry the whole transaction only if safe and bounded |
| Connection/commit acknowledgement lost | Outcome may be uncertain; reconcile by stable identity |
| Malformed persisted data | Fail observably, never return absence or a default invoice |

On a safe retry, reload and recompute; keep the logical command/event identity.
Do not retry only the last SQL statement or wrap every use case in a generic retry.
Do not hold a transaction across arbitrary remote calls. Use tenant filters and
constraints where required; this single-tenant example is not authorization policy.

## 4. Read contracts need operational guarantees too

Name the system of record, owner, and any rebuildable derived copies. Specify
ordering, stable tie-breaker, key/index, result budget, cursor, and consistency.
A bounded result can still scan all history; inspect plans. Do not independently
write authoritative state and a derived copy and call that atomic.

## Verify against real Postgres

- Outbox failure after the update leaves the original invoice and no event.
- Two writers at one version produce one committed mutation/event pair.
- A new read sees the committed state; failed reads are not disguised as missing.
- Claim/replay tests preserve stable IDs and recover interrupted work.

In-memory contract tests complement these checks; they do not prove SQL isolation.

Credits: [add a store](https://ratstack.sh/skills/add-a-store),
[service lifetimes](https://ratstack.sh/lore/services-capture-dependencies),
[SQL transaction implementation](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/sql/SqlClient.ts).
