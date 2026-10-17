# Errors: aggregate policy at app composition

Read when deciding what a failure means for the use case. Values/ports come from
[flow](flow.md) and [services](services.md); public schemas are in
[boundaries](boundaries.md).

## One recovery owner, not a catch at every layer

```text
adapter: translate vendor failure -> owned port failure (still failed)
   app: compose operations -> one recovery/aggregation policy
   API: unresolved failure -> safe public representation (still failed)
```

This applies Ousterhout's error aggregation: reduce the number of places making
handling decisions. It does **not** require exposing SQL/HTTP failures to app or
moving transport status codes into core. Do not catch, log, wrap, and rethrow the
same failure at every function on the path.

| Concern | Default owner / tool |
| --- | --- |
| Domain decisions | Pure core outcomes; app turns them into expected failures where needed |
| Vendor-to-port translation | Adapter-local `mapError`; preserve useful cause and reason |
| Recovery, fallback, aggregation | App composition's `catchTag` / `catchTags` |
| Public response classification | Exhaustive pure projection + `mapError` at API/impl boundary |
| Final reporting of unresolved failures/defects | Owning runtime/integration boundary |

Let an already-correct typed error propagate unchanged. If a driver needs tag-specific
translation, handle it at that adapter seam rather than leak the vendor types inward;
that exception is translation, not a second business recovery policy. `catchTags`
is not intrinsically app-only, but **app composition is our default policy owner**.

## App example: a batch contract permits specific skips

This batch operation may skip missing/unpaid invoices. The ordinary archive API
still fails for those cases. This is an explicit product contract, not a blanket
"ignore errors" helper. Conflicts and storage failures remain failures.

```typescript
// example: app/archive-item.ts -> app/main/invoices/archive-item.ts
import { Effect } from 'effect';
import { archiveInvoice } from 'app/archive';
import type { ArchiveInput, InvoiceId } from 'core';
import type { InvoiceChanged, InvoiceSession, InvoiceStoreFailure } from 'ports';

export type ArchiveItemResult =
  | { readonly kind: 'archived'; readonly invoiceId: InvoiceId }
  | { readonly kind: 'skipped'; readonly invoiceId: InvoiceId;
      readonly reason: 'missing' | 'not-paid' };

export const archiveItem = Effect.fn('Invoices.archiveItem')(
  (input: ArchiveInput): Effect.Effect<
    ArchiveItemResult, InvoiceChanged | InvoiceStoreFailure, InvoiceSession
  > => Effect.gen(function* () {
    return yield* archiveInvoice(input);
  }).pipe(
    Effect.map((invoiceId): ArchiveItemResult => ({ kind: 'archived', invoiceId })),
    Effect.catchTags({
      InvoiceNotFound: (error) => Effect.succeed<ArchiveItemResult>({
        kind: 'skipped', invoiceId: error.invoiceId, reason: 'missing',
      }),
      InvoiceNotPaid: (error) => Effect.succeed<ArchiveItemResult>({
        kind: 'skipped', invoiceId: error.invoiceId, reason: 'not-paid',
      }),
    }),
  ),
);
```

These two refusals happen **before writes**. Do not recover a post-mutation failure
into success inside an active transaction: that could commit partial work. Let it
fail through the transaction wrapper first. Recovery that requires rollback runs
outside that wrapper; app can define the policy and impl apply it to the composed
transactional Effect. Keep vendor transaction mechanics out of app.

The explicit remaining error union makes a newly unhandled failure visible to the
compiler. Do not re-fail unchanged errors just to list every tag in `catchTags`.

## Public presentation is not another recovery decision

```typescript
// example: impl/public-archive.ts -> impl/main/public-archive.ts
import { Effect, Match } from 'effect';
import { archiveInvoice } from 'app/archive';
import type { ArchiveFailure } from 'app/archive';
import type { PublicArchiveError } from 'api/contracts';
import type { ArchiveInput, InvoiceId } from 'core';
import type { InvoiceSession } from 'ports';

const publicArchiveError = (error: ArchiveFailure, requestId: string): PublicArchiveError =>
  Match.value(error).pipe(
    Match.withReturnType<PublicArchiveError>(),
    Match.tagsExhaustive({
      InvoiceNotFound: (failure) => ({
        code: 'INVOICE_NOT_FOUND', status: 404, requestId, invoiceId: failure.invoiceId,
      }),
      InvoiceNotPaid: (failure) => ({
        code: 'INVOICE_NOT_PAID', status: 409, requestId, invoiceId: failure.invoiceId,
      }),
      InvoiceChanged: (failure) => ({
        code: 'INVOICE_CHANGED', status: 409, requestId, invoiceId: failure.invoiceId,
      }),
      InvoiceStoreFailure: () => ({ code: 'INVOICE_STORAGE_FAILED', status: 500, requestId }),
    }),
  );

export const archiveForApi = Effect.fn('Invoices.archiveForApi')(
  (input: ArchiveInput, requestId: string): Effect.Effect<
    InvoiceId, PublicArchiveError, InvoiceSession
  > => Effect.gen(function* () {
    return yield* archiveInvoice(input);
  }).pipe(Effect.mapError((error) => publicArchiveError(error, requestId))),
);
```

This projection intentionally distinguishes tags; it does not retry, fallback, or
change failure into success. `Match.tagsExhaustive` rejects new unclassified failures;
it projects an error value, while app's `catchTags` handles the Effect error channel.
Binding belongs in impl: API contract modules do not import app implementations or
app errors. A real handler additionally classifies transaction acquisition/commit
failures, authentication, and decoding, and invokes app under an actual transaction.

## Safety rules

- Logging then returning `Effect.void` is recovery to success, not mere reporting.
- No blanket `orDie` for operational failures or catch-all successful defaults.
- Internal failures retain safe operation/reason/cause data; public errors exclude
  raw bodies, SQL, secrets, and private causes. Correlate using a request ID.
- Retry guidance must follow actual idempotency/rollback semantics. Unknown commit
  or remote-write outcomes require reconciliation, not "no changes were made".
- Report an unresolved failure once at the owning boundary rather than log-and-rethrow
  throughout the call path. Meaningful nested spans are not duplicate log statements.

Credits: [error model](https://ratstack.sh/lore/error-model),
[error interface](https://ratstack.sh/lore/errors-are-part-of-the-interface),
[public error design](https://github.com/dmmulroy/cf-workflow-pool/blob/main/docs/errors.md).
