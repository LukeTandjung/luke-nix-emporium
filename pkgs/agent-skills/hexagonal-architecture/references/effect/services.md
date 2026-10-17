# Services: contracts inside, implementations outside

Read for ports, adapter construction, and Layer wiring. These contracts use the
invoice values in [flow](flow.md). They do not require new application folders.

## 1. Declare the capability in ports

```typescript
// example: ports/invoices.ts -> ports/main/invoices.ts
import { Context, Effect, Option, Schema } from 'effect';
import { InvoiceId } from 'core';
import type { ArchiveWrite, Invoice } from 'core';

export class InvoiceStoreFailure extends Schema.TaggedError<InvoiceStoreFailure>()(
  'InvoiceStoreFailure', {
    operation: Schema.String,
    reason: Schema.Literals(['QueryFailed', 'StoredDataInvalid']),
    cause: Schema.Defect(),
  },
) {}
export class InvoiceChanged extends Schema.TaggedError<InvoiceChanged>()(
  'InvoiceChanged', { invoiceId: InvoiceId },
) {}

/** All methods share one actual transaction, supplied by impl. */
export class InvoiceSession extends Context.Service<InvoiceSession, {
  readonly find: (id: InvoiceId) => Effect.Effect<Option.Option<Invoice>, InvoiceStoreFailure>;
  readonly archive: (write: ArchiveWrite) => Effect.Effect<
    void, InvoiceChanged | InvoiceStoreFailure
  >;
}>()('@invoices/ports/InvoiceSession') {}

/** A separate, intentionally non-transactional bounded reader. */
export class InvoiceCatalog extends Context.Service<InvoiceCatalog, {
  /** Newest first, stable ID tie-breaker; at most 100 rows. */
  readonly listRecent: () => Effect.Effect<ReadonlyArray<Invoice>, InvoiceStoreFailure>;
}>()('@invoices/ports/InvoiceCatalog') {}
```

Keep the method shape inline in `Context.Service`; do not declare a separate
`InvoiceSessionShape` interface. When an implementation needs the service's value
type, derive `InvoiceSession['Service']` rather than duplicating the shape. Use
unique scoped keys: `@<service>/<owner>/<Capability>`, such as
`@invoices/ports/InvoiceSession` or `@invoices/api/InvoiceApi`. The key identifies
the service; it is not an import path or an access-control boundary.

Tags declare capabilities, not implementations. No static Postgres Layer in this
file. `Schema.Defect()` describes an internal cause field; it does not convert the
enclosing `InvoiceStoreFailure` into an Effect defect. Do not serialize that cause.

## 2. Capture stable dependencies in the adapter Layer

**Inline service methods in the record returned by the Layer.** Capture dependencies
once, then define `find: Effect.fn(...)(...)`, `archive: Effect.fn(...)(...)`, etc.
directly inside `Service.of({ ... })`. Do not define standalone implementations
that accept the captured dependency only to forward to them from the service record.
Pure codecs and genuinely shared helpers may remain separate. Keep each method
focused; the outer Layer construction callback may exceed the general function-length
limit rather than forcing its methods into separate functions merely to shorten it.

```typescript
// example: adapters/catalog.ts -> adapters/main/postgres/invoice-catalog.ts
import { Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/sql';
import { Invoice } from 'core';
import { InvoiceCatalog, InvoiceStoreFailure } from 'ports';

export const invoiceCatalogPostgresLayer = Layer.effect(
  InvoiceCatalog,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const decodeRows = Schema.decodeUnknownEffect(Schema.Array(Invoice));
    return InvoiceCatalog.of({
      listRecent: Effect.fn('InvoiceCatalog.listRecent')(
        (): Effect.Effect<ReadonlyArray<Invoice>, InvoiceStoreFailure> =>
          Effect.gen(function* () {
            const rows = yield* sql`
              SELECT id, status, version, archived_at_ms AS "archivedAtMs"
              FROM invoice ORDER BY created_at_ms DESC, id ASC LIMIT 100
            `.pipe(Effect.mapError((cause) => new InvoiceStoreFailure({
              operation: 'listRecent', reason: 'QueryFailed', cause,
            })));
            return yield* decodeRows(rows).pipe(
              Effect.mapError((cause) => new InvoiceStoreFailure({
                operation: 'listRecent', reason: 'StoredDataInvalid', cause,
              })),
            );
          }),
      ),
    });
  }),
);
```

This uses the same explicit-column invoice schema as [persistence](persistence.md),
including `created_at_ms` for ordering. Decode the actual returned row representation;
a query's TypeScript annotation is not evidence that stored data is valid.

The Layer requires `SqlClient`; methods require only their arguments. Capture stable
clients/configuration at construction, not during every call. Keep the database
requirement visible until `impl/` provides it. The local `mapError` calls translate
query/decode failures without recovering, logging, or choosing a fallback. App
composition owns that policy. SQL and row decoding stay here—no repository wrapper. Limit results **and** inspect query/index plans; `LIMIT` alone
does not bound a scan.

## 3. Choose implementations in impl

```typescript
// Wiring shapes: these Layer values come from their owning adapters.
const CatalogLive = invoiceCatalogPostgresLayer.pipe(Layer.provide(DatabaseLive));
const CatalogAndDatabase = invoiceCatalogPostgresLayer.pipe(Layer.provideMerge(DatabaseLive));
const AppDependencies = Layer.mergeAll(CatalogLive, DeliveryLive);
```

| Operator | Meaning |
| --- | --- |
| `mergeAll(A, B)` | Combine outputs; does not wire B into A's requirements |
| `A.pipe(provide(B))` | Build A using B; expose A's outputs |
| `A.pipe(provideMerge(B))` | Build A using B; expose both outputs |

Reuse the **same Layer value** for shared construction within one memoized build.
Calling a factory twice creates distinct Layer identities. Independent runtime
builds do not share instances just because they import the same Layer constant.
Do not use merge order as an implicit implementation override policy.

## 4. Do not capture short-lived context at startup

| Dependency | Typical lifetime | Rule |
| --- | --- | --- |
| DB pool, HTTP transport, validated config | Runtime | Capture in adapter construction |
| Current actor/tenant/request ID | Request | Pass as data or retain a request requirement |
| SQL connection/transaction session | Transaction | Build/use inside that transaction |
| Cache | Explicit owner | Never retain request-owned pending I/O across requests |

`R = never` is not a universal law for methods. Runtime-dependent requirements
are legitimate when they express the operation's actual lifetime. A transactional
session must never escape into a singleton cache or detached fiber. See
[persistence](persistence.md) for real transaction provision and its guard.

**Avoid:** manual DI records alongside Effect Context, `makeLayer(yield* Service)`
for ordinary contextual dependencies, or exported constructors used to bypass Layers.
Plain domain values and non-service constructor options remain normal arguments.

## 5. Use service contracts across capability boundaries, not only at HTTP

| Mechanism | Role |
| --- | --- |
| `Context.Service` | Declares a named, typed capability and its lookup key |
| Service value | The actual record of methods implementing that contract |
| `Context` | Holds supplied service values for an Effect's execution |
| `Layer` | Describes how to construct values, supply dependencies, and own resources |

```text
app use case --requires--> ports/InvoiceSession
                              ^ provided by
                          adapters/Postgres Layer
                              ^ selected by
                              impl/

caller --requires--> api/InvoiceApi       (optional contextual API facade)
                          ^ provided by
                      impl/InvoiceApi Layer
                          |
                          +--> app use case + selected adapters
```

- **Port -> adapter:** the standard use. Declare the tag in ports, implement it
  with an adapter Layer, select that Layer in impl. App yields the port.
- **API -> impl:** useful when callers consume a cohesive contextual service.
  Declare an API-facing service contract in API; impl supplies its methods and
  maps API values/errors to app operations. API must not import app error types
  or concrete implementation Layers. An `HttpApi` endpoint schema is a transport
  contract, not automatically another `Context.Service`.
- **App -> core:** ordinary function calls, not services or Layers. Core is pure.
- **Use cases/private helpers:** normally functions returning Effect; add a
  service only for a genuine capability, shared construction, or owned lifetime.

A Layer is not an architectural layer and not an OO implementation class. Do not
create a tag for every folder/function or a Layer for every function call. Defining
adapter Layers throughout adapters is normal; choosing the production graph still
belongs to impl. Executing a runtime stays at the host integration boundary.

Credits: [capture dependencies](https://ratstack.sh/lore/services-capture-dependencies),
[Layer composition](https://ratstack.sh/lore/layers-make-dependencies-explicit),
[neutral contracts](https://ratstack.sh/lore/engine-neutral-tokens-keep-adapters-replaceable).
