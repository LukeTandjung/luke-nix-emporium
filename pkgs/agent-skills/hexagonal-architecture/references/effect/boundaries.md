# Boundaries: parse values, translate failures

Read for schemas and public/adapter error handling. Examples reuse the model from
[flow](flow.md) and errors from [services](services.md).

## 1. Decode before dispatch; encode before transport

```typescript
// example: api/contracts.ts -> api/main/archive-contract.ts
import { Schema } from 'effect';
import { InvoiceId } from 'core';

export const ArchiveRequest = Schema.Struct({ invoiceId: InvoiceId });
export const ArchiveReply = Schema.Struct({ invoiceId: InvoiceId });
export const decodeArchiveRequest = Schema.decodeUnknownEffect(ArchiveRequest);
export const encodeArchiveReply = Schema.encodeEffect(ArchiveReply);

export const PublicArchiveError = Schema.Union([
  Schema.Struct({
    code: Schema.Literal('INVOICE_NOT_FOUND'), status: Schema.Literal(404),
    requestId: Schema.String, invoiceId: InvoiceId,
  }),
  Schema.Struct({
    code: Schema.Literals(['INVOICE_NOT_PAID', 'INVOICE_CHANGED']),
    status: Schema.Literal(409), requestId: Schema.String, invoiceId: InvoiceId,
  }),
  Schema.Struct({
    code: Schema.Literal('INVOICE_STORAGE_FAILED'), status: Schema.Literal(500),
    requestId: Schema.String,
  }),
]);
export type PublicArchiveError = typeof PublicArchiveError.Type;
```

The framework can own decode/encode execution. For manual bridges, both are explicit
steps: JSON parsing is not schema decoding, and JSON serialization is not schema
encoding. Supply generated/validated `eventId` from the command identity protocol,
not a fresh value hidden inside a retried handler.

- Use `decodeUnknownEffect` for untrusted inputs/rows. A SQL generic is not validation.
- Use typed decoders only when the value matches the schema's encoded input type.
- Derive TypeScript types from schemas; preserve brands internally.
- Do not reparse trusted values at every function call. New computations may still
  need new invariants checked (ranges, state transitions, cross-field constraints).
- Keep API DTOs at the edge. Map fields explicitly into app inputs; no payload spreads.
- Bound incoming bodies/strings/arrays/page sizes before expensive work.
- Collect independent validation failures before writes when callers benefit from
  seeing them together; do not accumulate failures by continuing dependent writes.

## 2. Separate recovery from presentation

App composition owns `catchTag`/`catchTags` recovery policy. Adapters translate
vendor failures into port errors; API/impl projects unresolved failures into these
public schemas without choosing business fallbacks. See [error policy](errors.md)
for a complete app recovery example and exhaustive public projection.

## 3. One use case, multiple surfaces—not one DTO everywhere

```text
HTTP decode ─┐
CLI parse  ──┼─> explicit app input -> one use case -> explicit result mapping
Queue decode ┘
```

Share core values and the app operation. Keep transport metadata, authentication,
and envelope schemas in their surface. If several surfaces genuinely need the
same schema contract, derive them from that contract; do not duplicate business
handlers. Introduce shared projection machinery only when the surfaces need it.

Credits: [schemas](https://ratstack.sh/lore/schemas-define-the-boundary),
[error model](https://ratstack.sh/lore/error-model),
[shared capabilities](https://ratstack.sh/lore/one-capability-every-surface),
[public error design](https://github.com/dmmulroy/cf-workflow-pool/blob/main/docs/errors.md).
