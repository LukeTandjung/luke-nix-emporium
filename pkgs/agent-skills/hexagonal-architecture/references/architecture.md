# Boundary rules

Read for ownership decisions or cross-layer reviews. For directories use
[layouts](layout.md); for code select the [Effect recipes](typescript-effect.md).

## Vocabulary

- **Port:** an application-owned contract for a needed capability.
- **Adapter:** an implementation translating an external system into that port.
- **Use case:** app orchestration that loads facts, asks core to decide, and invokes ports.
- **Domain event:** a published fact about service-owned state—not a requirement
  for event sourcing or a DDD framework.

Prefer functions and records. Service/tag classes declare Effect capabilities;
Rust structs/traits express data and contracts, not business-object hierarchies.
Use state unions and intent names where they clarify rules. Do not import DDD
machinery merely because an example uses that vocabulary.

## Who owns what?

| Concern | Owner | Not here |
| --- | --- | --- |
| Transport input/output, status codes | API | Core, app, persistence DTOs |
| Validated IDs, pure schemas, decisions | Core | Clock reads, I/O, logging, mutable globals |
| Needed storage/network capability | Ports | SQL, clients, concrete Layers |
| Loading facts and executing decisions | App | Vendor APIs or hidden business rules in adapters |
| SQL, row decoding, guarded writes | Persistence adapter | Separate repository layer |
| HTTP requests and remote error translation | HTTP adapter | App's business policy |
| Choosing concrete implementations | Impl | Core/app or static production Layers on ports |
| Runtime/transaction/process lifetime | Impl, using adapter mechanics | Detached background work |

### API

Decode untrusted input, map explicitly to app inputs, and encode output through
the declared public schema. Public errors have intentional codes/status/details;
raw internal causes never become public JSON. API types do not become convenient
shared internal types. Re-export service-owned ID schemas when callers need them.

API contract modules do not import app implementations. Bind handlers to app
operations in `impl/`; the transport framework may perform decoding/encoding.
Rust API owns public caller-facing traits, implemented by `impls/`, never forwarding
functions that import `impls/`. Caller-facing API traits are distinct from ports.

### Core and app

```text
request + loaded facts + runtime values
                 |
                 v
          pure core decision
                 |
                 v
        app executes that decision
```

Business decisions live in core; app may branch on absence, port failures, and
which decision was returned. Aggregate recovery/fallback policy at the app's
composition point instead of catching and rethrowing in each helper. Adapters
still translate vendor failures into owned port errors; API boundaries present
unresolved failures. Translation and presentation do not own business recovery. Core receives time, generated IDs, and authorization
facts as data. App does not need a new service class for each use-case function.

Define intent-specific operations such as `archiveInvoice`, not generic updates
that hide different rules. Do not introduce `handlers/`, `commands/`, or `queries/`
as generic app buckets. Keep concepts within the existing layer folders.

### Ports and adapters

- Bundle methods by a cohesive capability; neither one-method ceremony nor god ports.
- Describe absence, ordering, limits, consistency, conflicts, and replay guarantees.
- Persistence ports expose domain values, not SQL/query builders or driver errors.
- Adapters decode rows, including IDs, and map vendor failures to owned errors.
- Private SQL helpers may live inside the adapter. No public repository layer.
- Transactional calls use an actual transaction or transaction-scoped capability;
  never `{}` placeholders or a generic `UnitOfWork` framework.
- An intentionally non-transactional reader is a distinct explicit capability.
- Adapter state belongs to an instance/Layer construction, not a module-global Map.

## What requires a port?

```text
External/runtime capability?  clock, filesystem, database, network, randomness
                              -> application-owned port + adapter

Pure in-process library?      parser, codec, compiler, algorithm, UI calculation
                              -> import in the responsible layer
```

A dependency's package origin is not itself a reason for a wrapper. Avoid shallow
pass-through layers. Standard Effect services can satisfy runtime needs without
inventing project-specific copies.

## Dependency direction

| Layer | May import | Must not import |
| --- | --- | --- |
| API | Core boundary types, transport framework | App implementation, adapters |
| Core | Pure type/validation/algorithm libraries | I/O, runtime services, adapters |
| Ports | Core, service-contract declarations | Adapters, DB clients, impl, own API DTOs |
| App | Core, ports, appropriate in-process libraries | Adapters, impl, workflow runtime |
| Adapters | Ports, core, infrastructure | App business decisions |
| Events | Core, pure codecs | Impl, adapters, downstream implementations |
| Publisher | Event contracts, queue infrastructure | App/impl internals |
| Workflows | Deterministic app sequencing, activity contracts | DB clients, activity implementations |
| Impl | Layers needed for composition | Business decisions |

Enforce imports with tooling when practical, including barrel re-exports. Test
both allowed and forbidden examples of the rule; checking one directory spelling
is not proof that a boundary cannot be bypassed.

## Types retain their evidence

The owner of an ID owns its schema/type; other services consume that public
boundary contract instead of inventing duplicate brands. Parse HTTP/RPC/event/DB
values once. Use valid deterministic IDs in tests. Do not widen trusted values to
`unknown`, serialize/reparse them internally, or assert a lost type back into place.
New calculations and patches must establish any new cross-field invariants.
Explicitly map fields across representation boundaries; spreads are fine within
a layer when they preserve its invariants.

## Migration without a big-bang rewrite

1. Extract pure decisions and values.
2. Define ports for real external capabilities.
3. Move existing SQL/row decoding into adapters; remove repository forwarding.
4. Move orchestration into app and implementation selection into impl.
5. Add atomic outbox handling for required durable external effects.
6. Thin workflows and remove outbox-only workflow schedulers.

Preserve behavior at each step. Stop adding layers when they provide no hidden
complexity or independent responsibility.
