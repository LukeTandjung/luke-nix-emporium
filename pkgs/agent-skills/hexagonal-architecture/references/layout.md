# Canonical layouts

Read when scaffolding, moving files, or checking module ownership. These are Luke's
layouts; external examples must be mapped into them, not used to replace them.

### TypeScript Effect service

A service is one Deno workspace. Architectural layers are explicit subfolders
with barrel exports.

```text
workspaces/services/{service}/
├── deno.json
├── api/
│   ├── main/
│   │   ├── {service}-api.ts
│   │   └── index.ts
│   └── test/
├── core/
│   ├── main/
│   │   ├── decisions/
│   │   ├── extractors/
│   │   ├── formatters/
│   │   ├── events.ts
│   │   ├── type-ids.ts
│   │   └── index.ts
│   └── test/
├── ports/
│   ├── main/
│   │   ├── effects.ts
│   │   ├── {capability}-store.ts
│   │   └── index.ts
│   └── test/
├── events/                 # optional published-event contract
│   ├── main/
│   └── test/
├── app/
│   ├── main/
│   │   ├── {concept}/
│   │   ├── outbox/         # when an outbox exists
│   │   └── index.ts
│   └── test/
├── adapters/
│   ├── main/
│   │   ├── postgres/
│   │   ├── rpc/
│   │   ├── temporal/       # only for genuine workflows
│   │   ├── in-memory/
│   │   └── index.ts
│   └── test/
├── publisher/              # optional queue producer adapter
│   ├── main/
│   └── test/
├── workflows/              # optional thin durable workflows
│   ├── main/
│   └── test/
├── migrations/
└── impl/
    ├── main/
    │   ├── service.ts
    │   ├── activities.ts   # optional
    │   └── index.ts
    └── test/
```

### Rust service or product-feature crate

Each Rust crate represents one cohesive service or one cohesive product feature.
Never create crates merely to separate architectural layers, adapters, FFI, UI,
or other implementation technologies. The same boundaries become modules inside
the owning crate. Keep migrations at crate root so a service owns them.

```text
crates/{service}/
├── Cargo.toml
├── src/
│   ├── api/
│   ├── core/
│   │   ├── decisions/
│   │   ├── events.rs
│   │   └── ids.rs
│   ├── ports/
│   ├── events/             # optional
│   ├── app/
│   │   ├── {concept}/
│   │   └── outbox/
│   ├── adapters/
│   │   ├── postgres/
│   │   ├── rpc/
│   │   ├── workflows/      # optional runtime adapter
│   │   └── in_memory/
│   ├── publisher/          # optional
│   ├── workflows/          # optional
│   ├── impls/              # Rust keyword-safe equivalent of impl/
│   ├── lib.rs
│   └── main.rs
├── migrations/
└── tests/
    ├── core/
    ├── app/
    ├── adapters/
    └── impls/
```

Production modules under `src/` contain no inline test modules. Keep tests under
`tests/`, organized by the architectural layer they exercise. Omit unused
production and test layers rather than creating empty ceremony.

For Rust, `api/` owns public interface traits and their API-facing
configuration, request, result, and error types. `impls/` defines concrete types
that implement those traits and remains the composition root. API modules must
not import `impls/` or forward calls to it. The crate root may re-export both
API traits and concrete implementation types or factories. API traits describe
the public caller-facing service interface; they are distinct from ports, which
describe capabilities needed inward by app use cases.

Do not use generic `handlers/`, `commands/`, or `queries/` buckets. Organize app
code by application concept, with action names such as `create*`, `update*`,
`get*`, and `list*`.
