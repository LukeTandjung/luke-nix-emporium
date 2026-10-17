---
name: typescript-style
description: Tiger Style engineering methodology for safer, faster, simpler TypeScript backend code. Use when writing TypeScript code, reviewing TypeScript code, or discussing TypeScript patterns.
---

# Tiger Style for TypeScript

*An engineering methodology for safer, faster, simpler TypeScript backend code.*

*Inspired by [TigerBeetle's Tiger Style](https://tigerstyle.dev/) — adapted for the TypeScript/Node.js ecosystem.*

---

> "Do the hard thing today to make tomorrow easy."

TypeScript's type system is powerful, but it only checks at compile time. Types are erased at
runtime. A `req.body` typed as `CreateUserInput` could contain anything. This guide bridges
that gap. It is an evolving set of principles — a collective give-and-take at the intersection of
engineering and art — for producing TypeScript backend code that is safe, performant, and a
pleasure to maintain.

This style guide is opinionated. It prioritises long-term velocity over short-term convenience. It
asks you to do the hard thing now so that your future self, your teammates, and your on-call
rotation can sleep at night.

---

## Table of Contents

1. [The Three Values](#1-the-three-values)
2. [Safety](#2-safety)
3. [Performance](#3-performance)
4. [Developer Experience](#4-developer-experience)
5. [Formatting & Structure](#5-formatting--structure)
6. [Dependencies](#6-dependencies)
7. [Testing](#7-testing)
8. [Style By The Numbers](#8-style-by-the-numbers)

---

## 1. The Three Values

Tiger Style establishes a strict hierarchy. When values conflict, the higher value wins.

```
1. Safety        — The system must not corrupt data, lose work, or behave incorrectly.
2. Performance   — The system must be fast and efficient under real-world load.
3. Experience    — The system must be simple to read, run, debug, and change.
```

Safety trumps performance. Performance trumps developer experience. But the goal is to find
**super ideas** that satisfy all three simultaneously through simplicity and elegance. When you
find yourself trading safety for convenience, stop. When you find yourself trading performance
for cleverness, stop. The best solutions are the ones where you don't have to choose.


---

## 2. Safety

### 2.1 Parse, Don't Validate — The Boundary Rule

TypeScript types vanish at runtime. Every trust boundary — HTTP requests, message queues,
database results, file reads, environment variables, third-party API responses — is a point where
the real world meets your type system, and the real world does not care about your interfaces.

**Parse data at the boundary. Once parsed, trust the types downstream.**

```typescript
// ✅ GOOD: Parse at the boundary, trust the types downstream.
import { z } from 'zod';

const CreateAccountSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  currency: z.enum(['GBP', 'USD', 'EUR']),
});

type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

function handleCreateAccount(rawBody: unknown): CreateAccountInput {
  return CreateAccountSchema.parse(rawBody);
}

// Downstream code receives CreateAccountInput — no re-validation needed.
// The schema IS the documentation. The type IS the schema.
```

```typescript
// ❌ BAD: Sprinkling validation throughout the codebase.
function createAccount(input: CreateAccountInput) {
  if (!input.name) throw new Error('name required');      // Redundant if parsed at boundary.
  if (!input.email) throw new Error('email required');    // Defensive everywhere = trust nowhere.
  if (!input.currency) throw new Error('currency required');
  // ...
}
```

**Rules:**

- Define one Zod schema per trust boundary input. Co-locate the schema with the handler.
- Use `z.infer<typeof Schema>` to derive the TypeScript type. Never duplicate the type manually.
- Use `.parse()` for inputs that MUST be valid (throw on failure). Use `.safeParse()` only when
  you need to handle the error structurally (e.g., returning 400 with field-level errors).
- Once data is parsed, it is trusted. Do not re-validate downstream. This is the reward for doing
  the hard work at the boundary.

### 2.2 Assertions — Your Runtime Safety Net

Types check structure. Assertions check logic and state. They catch programmer error, multiply
the effectiveness of tests, and downgrade catastrophic correctness bugs into loud, debuggable
crashes.

**Assert what you expect AND what you don't expect. Assert the positive and negative space.**

```typescript
// ✅ GOOD: Assert invariants that must hold.
function debitAccount(account: Account, amount: number): Account {
  assert(amount > 0, `Debit amount must be positive, got ${amount}`);
  assert(
    account.balance >= amount,
    `Insufficient balance: ${account.balance} < ${amount} for account ${account.id}`,
  );

  const newBalance = account.balance - amount;

  assert(newBalance >= 0, `Balance went negative after debit: ${newBalance}`);
  assert(
    newBalance === account.balance - amount,
    `Balance arithmetic mismatch: ${newBalance} !== ${account.balance} - ${amount}`,
  );

  return { ...account, balance: newBalance };
}
```

**Assertion rules:**

- Use Node's built-in `import assert from 'node:assert'`. Do not install assertion libraries. Exception: Temporal workflows cannot import `node:assert` due to sandbox restrictions — define a workflow-safe helper instead (see temporal-workflows skill).
- Target a minimum of **2 assertions per non-trivial function**. Assert arguments on entry.
  Assert return values or post-conditions on exit.
- **Split compound assertions.** Each assertion checks one thing. When it fires, the message
  tells you exactly what went wrong without further investigation.
- **Assertions are NOT error handling.** Assertions catch programmer mistakes. Errors handle
  expected runtime conditions (network failures, invalid user input). Never assert on user input —
  that's what parsing is for. Never catch assertion failures — they mean your code is wrong.
- **Include context in messages.** Bare `assert(x)` is nearly useless. Always include the
  offending values and enough context to reproduce.
- Assertions remain in production. They are not development-only. A crash with a stack trace is
  infinitely better than silent data corruption.

```typescript
// ❌ BAD: Compound assertion — which condition failed?
assert(amount > 0 && account.balance >= amount);

// ✅ GOOD: Split into individual assertions with messages.
assert(amount > 0, `Amount must be positive: ${amount}`);
assert(account.balance >= amount, `Insufficient balance: ${account.balance} < ${amount}`);
```

### 2.3 Explicit Limits — Put a Limit on Everything

Everything has a limit. Memory, connections, queue depth, retry count, payload size, batch size,
string length, array length, concurrency. If you don't set the limit, the universe will — at 3 AM,
during an incident.

```typescript
// ✅ GOOD: Explicit limits, documented with the unit.
const MAX_BATCH_SIZE = 1000;
const MAX_PAYLOAD_BYTES = 1_048_576;       // 1 MiB
const MAX_RETRY_COUNT = 3;
const MAX_CONCURRENT_REQUESTS = 50;
const CONNECTION_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

// Apply limits at the boundary.
const ListAccountsSchema = z.object({
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
});
```

```typescript
// ❌ BAD: Unbounded.
async function processAll(items: Item[]) {
  await Promise.all(items.map(processItem));  // 10,000 items? Have fun.
}

// ✅ GOOD: Bounded concurrency.
import pLimit from 'p-limit';

const limit = pLimit(MAX_CONCURRENT_REQUESTS);

async function processAll(items: Item[]) {
  assert(items.length <= MAX_BATCH_SIZE, `Batch too large: ${items.length}`);
  await Promise.all(items.map(item => limit(() => processItem(item))));
}
```

**Rules:**

- Every loop, queue, pool, buffer, page, and retry has an explicit upper bound.
- Name limits as constants. Include the unit in the name: `_MS`, `_BYTES`, `_COUNT`.
- Timeouts on every external call. No exceptions. Use `AbortSignal.timeout()`.
- Apply pagination limits at the schema level. Never trust client-provided page sizes.

### 2.4 Strict TypeScript Configuration

Your `tsconfig.json` is your first line of defence. A lax config is a liability.

```jsonc
{
  "compilerOptions": {
    "strict": true,                           // Non-negotiable. Enables all strict checks.
    "noUncheckedIndexedAccess": true,          // Array/object indexing returns T | undefined.
    "exactOptionalPropertyTypes": true,        // Distinguishes missing from explicitly undefined.
    "noImplicitReturns": true,                 // Every code path must return.
    "noFallthroughCasesInSwitch": true,        // Prevent switch fallthrough.
    "forceConsistentCasingInFileNames": true,  // Prevent cross-platform casing bugs.
    "isolatedModules": true,                   // Required for esbuild/swc compatibility.
    "moduleResolution": "bundler",             // Or "node16" for pure Node.
    "verbatimModuleSyntax": true,              // Enforces explicit type-only imports.
    "skipLibCheck": true,                      // Skip .d.ts checking for build speed.
    "target": "ES2022",                        // Use modern JS. No need to target ES5.
    "module": "ESNext"                         // ESM is the standard.
  }
}
```

**The `strict` flag is mandatory. Do not disable individual strict checks. If a library
conflicts with strict mode, the library is wrong — fix it, fork it, or replace it.**

### 2.5 Eliminate `any` — Zero Tolerance

`any` is a hole in your type system. Every `any` is a place where bugs hide. Treat every `any`
like a security vulnerability.

```typescript
// ❌ BAD: any turns off the type checker.
function process(data: any) {
  return data.items.map((item: any) => item.name);
}

// ❌ BAD: Type assertion as escape hatch.
const user = JSON.parse(body) as User;

// ✅ GOOD: Parse unknown data with a schema.
function process(data: unknown): string[] {
  const parsed = DataSchema.parse(data);
  return parsed.items.map(item => item.name);
}

// ✅ GOOD: Generics when the type varies but is constrained.
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}
```

**Rules:**

- Enable `@typescript-eslint/no-explicit-any` as an error in ESLint.
- Use `unknown` instead of `any` for truly unknown data, then narrow with schemas or guards.
- Use generics to preserve type information when types vary.
- `as` casts are a code smell. Acceptable only with `as const` or after an exhaustive type guard.
  If you write `as`, write a comment justifying it.

### 2.6 Discriminated Unions for State Machines

Model state explicitly. Do not use boolean flags, optional fields, or status strings to represent
states. Discriminated unions make invalid states unrepresentable.

```typescript
// ❌ BAD: Boolean soup. What does pending=true, error=undefined, data=undefined mean?
interface RequestState {
  pending: boolean;
  error?: Error;
  data?: Response;
}

// ✅ GOOD: Discriminated union. Every state is explicit and exhaustive.
type RequestState =
  | { status: 'idle' }
  | { status: 'pending'; startedAt: number }
  | { status: 'success'; data: Response; completedAt: number }
  | { status: 'failure'; error: Error; failedAt: number; retryCount: number };

function handleState(state: RequestState): string {
  switch (state.status) {
    case 'idle':    return 'Ready';
    case 'pending': return `Loading since ${state.startedAt}`;
    case 'success': return `Done: ${state.data.body}`;
    case 'failure': return `Error: ${state.error.message} (retries: ${state.retryCount})`;
  }
  // No default — TypeScript ensures exhaustiveness.
  // Adding a new state forces you to handle it everywhere.
}
```

### 2.7 Error Handling — Crash or Handle, Never Swallow

```typescript
// ❌ BAD: Swallowing errors.
try {
  await sendEmail(user.email, template);
} catch {
  // "This should never happen."
  // Narrator: It did happen. In production. On a Friday.
}

// ❌ BAD: Logging and re-throwing without adding context.
try {
  await sendEmail(user.email, template);
} catch (error) {
  console.error('Failed to send email', error);
  throw error;
}

// ✅ GOOD: Catch, wrap with context, and re-throw.
try {
  await sendEmail(user.email, template);
} catch (error) {
  throw new EmailDeliveryError(
    `Failed to send ${template.name} to ${user.email}`,
    { cause: error },
  );
}

// ✅ GOOD: Or handle deliberately with a documented reason.
try {
  await sendAnalyticsEvent(event);
} catch (error) {
  // Analytics failures are non-critical. Log and continue.
  // The user's request must not fail because analytics is down.
  logger.warn('Analytics event failed', { event: event.type, error });
}
```

**Rules:**

- **Throw `Error` instances only.** Always use `new Error(message, { cause })` to chain.
  Define custom error classes extending `Error` for each domain (e.g., `NotFoundError`,
  `ConflictError`, `ValidationError`). Include structured context, not just a message string.
- **Never throw strings, objects, or undefined.** They lose stack traces and break `instanceof`.
- **Catch at the boundary.** Handlers (HTTP, queue consumers, cron) catch errors and map them
  to responses. Interior functions let errors propagate.
- **Never use `catch {}` with an empty block.** If you swallow an error, document exactly why.
- **Use `Result` types for expected failures in core domain logic.** For operations where failure
  is a normal outcome (validation, lookups), consider returning a discriminated union instead of
  throwing.

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### 2.8 Immutability by Default

Mutable state is the root cause of the hardest bugs — race conditions, stale data, unexpected
side effects. Default to immutable. Opt in to mutation only when performance demands it.

```typescript
// ✅ GOOD: Immutable inputs.
function applyDiscount(
  order: Readonly<Order>,
  discountPercent: number,
): Order {
  assert(discountPercent >= 0 && discountPercent <= 100);
  return {
    ...order,
    total: order.total * (1 - discountPercent / 100),
    discountApplied: true,
  };
}

// ✅ GOOD: Readonly arrays in interfaces.
interface Account {
  readonly id: string;
  readonly ledger: number;
  readonly createdAt: Date;
  balance: number;  // Only mutable fields are writable.
}

// ✅ GOOD: as const for literal objects and arrays.
const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR'] as const;
type Currency = typeof SUPPORTED_CURRENCIES[number];
```

**Rules:**

- Use `Readonly<T>`, `ReadonlyArray<T>`, and `readonly` on interface fields by default.
- Use `as const` for static configuration objects and enum-like arrays.
- Never mutate function arguments. Return new values.
- The only exception: hot-path loops where allocation cost is measured and significant.

---

## 3. Performance

### 3.1 Think About Performance in the Design Phase

> "The lack of back-of-the-envelope sketches is the root of all evil."

The time to solve performance, and get the 1000x wins, is in the design phase — when you
can't profile. It's hard to fix a system after implementation, and the gains are less. Have
mechanical sympathy. Work with the grain, not against it.

Before writing code, sketch the four primary resources and their two textures:

```
Resource   │ Bandwidth            │ Latency
───────────┼──────────────────────┼─────────────────────
Network    │ Requests/sec, MB/s   │ RTT, DNS, TLS
Storage    │ IOPS, MB/s           │ fsync, query time
Memory     │ Allocation rate      │ GC pause, cache miss
Compute    │ Operations/sec       │ Event loop block
```

**Optimise for the slowest resource first, adjusted by frequency.**  A database query that takes
50ms but runs once is less important than a 1ms memory allocation that runs 50,000 times.

### 3.2 Batch Everything — Control Plane / Data Plane

Separate the control plane (setup, validation, orchestration) from the data plane (the actual
work). Use bigger buffers to amortise costs.

```typescript
// ❌ BAD: One query per item. N+1 problem.
async function enrichAccounts(accountIds: string[]): Promise<Account[]> {
  const accounts: Account[] = [];
  for (const id of accountIds) {
    const account = await db.query('SELECT * FROM accounts WHERE id = $1', [id]);
    accounts.push(account);
  }
  return accounts;
}

// ✅ GOOD: One query for all items. Batched.
async function enrichAccounts(accountIds: string[]): Promise<Account[]> {
  assert(accountIds.length <= MAX_BATCH_SIZE);
  if (accountIds.length === 0) return [];

  return db.query(
    'SELECT * FROM accounts WHERE id = ANY($1)',
    [accountIds],
  );
}
```

**Rules:**

- Batch database reads with `WHERE id = ANY($1)` or `IN (...)`. Batch writes with multi-row
  inserts or `COPY`.
- Batch HTTP calls to downstream services. If a service doesn't support batch endpoints,
  use bounded concurrent requests with `p-limit`.
- Batch event publishing. Accumulate events and flush on interval or buffer size, not per-event.
- In queue consumers, prefer batch message consumption over single-message handlers.

### 3.3 Avoid Blocking the Event Loop

Node.js is single-threaded. One synchronous bottleneck blocks everything. Respect the event
loop.

```typescript
// ❌ BAD: Synchronous JSON parsing of large payloads.
const data = JSON.parse(hugeString);  // Blocks event loop for 100ms+.

// ❌ BAD: Synchronous crypto.
import { pbkdf2Sync } from 'node:crypto';
const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha512');

// ✅ GOOD: Async crypto.
import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
const pbkdf2Async = promisify(pbkdf2);
const hash = await pbkdf2Async(password, salt, 100000, 64, 'sha512');

// ✅ GOOD: For CPU-bound work, offload to a worker thread.
import { Worker } from 'node:worker_threads';
```

**Rules:**

- Never use synchronous `fs` methods in request paths. Use `fs/promises`.
- Never use `JSON.parse` on untrusted, unbounded input without size limits.
- Profile with `--prof` or `clinic.js` to find event loop blockers. If a synchronous operation
  takes more than 1ms, it is a candidate for offloading.
- Avoid `Array.sort()` on large arrays in hot paths — it's synchronous and O(n log n). Consider
  streaming or pre-sorted data structures.

### 3.4 Connection Management

Database connections are expensive. Mismanaging them is the most common source of backend
latency and outages.

```typescript
// ✅ GOOD: Explicit pool configuration with documented limits.
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  max: 20,                           // Hard limit. Matches Cloud SQL max.
  idleTimeoutMillis: 30_000,         // Close idle connections after 30s.
  connectionTimeoutMillis: 5_000,    // Fail fast if pool is exhausted.
  statement_timeout: 10_000,         // Kill queries running longer than 10s.
});
```

**Rules:**

- Set `max` connections explicitly. Never rely on defaults. Document why the number was chosen.
- Set `statement_timeout` on the pool. Runaway queries should not hold connections forever.
- Set `connectionTimeoutMillis`. Waiting indefinitely for a connection is an availability risk.
- Monitor pool utilisation. If `waitingCount > 0` in steady state, your pool is too small or your
  queries are too slow.

---

## 4. Developer Experience

### 4.1 Naming — Get the Nouns and Verbs Right

> "There are only two hard things in Computer Science: cache invalidation, naming things,
> and off-by-one errors."

Great names are the essence of great code. They capture what a thing is or does, and provide a
crisp, intuitive mental model. They show that you understand the domain.

**Rules:**

- **Do not abbreviate.** Write `account`, not `acct`. Write `transaction`, not `txn`. Write
  `request`, not `req` (except in Express handler signatures where `req`/`res` is idiomatic).
  Write `configuration`, not `cfg`. The cost of typing is negligible. The cost of deciphering
  is not.
- **Use camelCase for variables and functions, PascalCase for types and classes.** This is
  standard TypeScript convention. Do not deviate.
- **Append qualifiers.** `connectionTimeoutMs`, not `timeout`. `maxRetryCount`, not `retries`.
  `accountBalance`, not `balance` (when ambiguous).
- **Include the unit in the name.** `durationMs`, `sizeBytes`, `limitCount`, `intervalSeconds`.
- **Big-endian naming.** Most significant qualifier first. `accountCreate`, not `createAccount`
  for file names. `connectionPoolMax`, not `maxConnectionPool`. (Function names remain
  verb-first: `createAccount()`.)
- **Use the same character count for related names** so they align in code: `source`/`target`,
  not `source`/`destination`. `start`/`end`, not `start`/`finish`.
- **Boolean variables start with `is`, `has`, `should`, `can`.** `isActive`, `hasPermission`,
  `shouldRetry`, `canWrite`.

```typescript
// ❌ BAD: Ambiguous, abbreviated, no units.
const timeout = 5000;
const max = 100;
const retries = 3;
function proc(d: unknown) { /* ... */ }

// ✅ GOOD: Self-documenting.
const connectionTimeoutMs = 5_000;
const maxPageSize = 100;
const maxRetryCount = 3;
function processIncomingWebhook(rawPayload: unknown) { /* ... */ }
```

### 4.2 File and Module Organisation

Files are read top-down on first encounter. Organise for the reader, not the writer.

**Rules:**

- **One module, one responsibility.** If a file has multiple unrelated exports, split it.
- **File ordering within a module:**
  1. Imports (external, then internal, then relative — enforced by `eslint-plugin-import`)
  2. Constants and configuration
  3. Types and schemas
  4. The primary exported function/class
  5. Helper functions (private, unexported)
- **Barrel files (`index.ts`) are allowed only at package/module boundaries.** Never create
  barrel files inside a module. They obscure dependencies and break tree-shaking.
- **Co-locate related code.** The schema, handler, types, and tests for a feature live in the
  same directory. Do not scatter them across `types/`, `schemas/`, `handlers/`, `tests/`.

```
src/
  accounts/
    account.schema.ts       # Zod schemas + inferred types
    account.service.ts       # Business logic
    account.repository.ts    # Database queries
    account.handler.ts       # HTTP/queue handler
    account.test.ts          # Tests
    account.errors.ts        # Domain-specific errors
  transfers/
    transfer.schema.ts
    transfer.service.ts
    ...
```

### 4.3 Functions — Small, Focused, Testable

```typescript
// ❌ BAD: God function. 200 lines, 6 responsibilities, untestable.
async function handleCreateTransfer(req: Request, res: Response) {
  // Validate input (30 lines)
  // Check permissions (20 lines)
  // Load accounts (15 lines)
  // Check balances (25 lines)
  // Create transfer (30 lines)
  // Send notifications (20 lines)
  // Return response (10 lines)
}

// ✅ GOOD: Composed from focused, testable functions.
async function handleCreateTransfer(req: Request, res: Response) {
  const input = CreateTransferSchema.parse(req.body);
  const actor = requirePermission(req, 'transfers:create');

  const transfer = await createTransfer(input, actor);

  res.status(201).json(transfer);
}

// Each of these is independently testable with clear inputs and outputs.
```

**Rules:**

- **Hard limit: 50 lines per function** (excluding blank lines and comments). If it's longer,
  decompose. This is not a guideline — it's a limit. Long functions are where bugs accumulate
  and comprehension collapses.
- **One level of abstraction per function.** If a function mixes HTTP concerns with business
  logic with database queries, it's doing too much.
- **Pure functions wherever possible.** A pure function takes arguments and returns a value. It
  doesn't read from or write to anything external. Pure functions are trivially testable, cacheable,
  and parallelisable.
- **Limit function parameters to 3.** Beyond 3, use an options object.

```typescript
// ❌ BAD: Too many positional parameters. Easy to swap by accident.
function createTransfer(
  debitAccountId: string,
  creditAccountId: string,
  amount: number,
  ledger: number,
  code: number,
  memo?: string,
) { /* ... */ }

// ✅ GOOD: Options object. Self-documenting at the call site.
function createTransfer(input: CreateTransferInput): Transfer { /* ... */ }
```

### 4.4 Comments — Why and How, Not What

The code says *what*. Comments say *why* and *how*. If you feel the need to comment *what*
the code does, the code is not clear enough — refactor it.

**Rules:**

- **Comments are full sentences.** Capital letter, full stop, proper grammar.
- **Comment the why.** Why does this timeout exist? Why is this field nullable? Why do we
  retry exactly 3 times? Why is this order important?
- **Comment the non-obvious.** Performance trade-offs, historical context, links to relevant
  issues or design documents, known gotchas.
- **Do not comment-out code.** Delete it. Git remembers.
- **TODOs include a ticket reference.** `// TODO(ARC-1234): Migrate to streaming parser.`
  Untracked TODOs rot.

```typescript
// ❌ BAD: Comment says what the code already says.
// Increment the counter.
counter += 1;

// ✅ GOOD: Comment explains a non-obvious decision.
// Cloud SQL's managed connection pooler requires connections to be returned within 60s.
// We set our statement timeout below this to avoid the pooler forcibly closing connections
// mid-query, which surfaces as a cryptic "connection reset" error.
const STATEMENT_TIMEOUT_MS = 50_000;
```

### 4.5 Prevent Cache Invalidation Bugs

The hardest bugs come from state that drifts out of sync. Tiger Style prevents this by
minimising opportunities for staleness.

**Rules:**

- **No variable aliasing.** Do not create a second variable that references the same mutable
  data. If two variables can see the same data, they can disagree.
- **Define variables as close to their usage as possible.** A variable declared 40 lines before
  it's used is 40 lines of opportunity for it to go stale.
- **Prefer computation over caching.** Unless profiling shows a measurable gain, re-derive
  values instead of storing them. A computed value is always fresh. A cached value might not be.
- **Single source of truth.** Every piece of data has exactly one canonical location. Anything
  else is a read-through view or a derived value, and must declare itself as such.

```typescript
// ❌ BAD: Two sources of truth for "is admin".
const isAdmin = user.role === 'admin';
// ... 50 lines later ...
if (user.role === 'admin') { /* This might disagree with isAdmin if user mutated. */ }

// ✅ GOOD: Compute once, use the computed value consistently.
const isAdmin = user.role === 'admin';
// ... use isAdmin everywhere, never re-check user.role ...
```

---

## 5. Formatting & Structure

### 5.1 Hard Limits

| Constraint                | Limit      | Rationale                                                   |
| ------------------------- | ---------- | ----------------------------------------------------------- |
| Line length               | 100 cols   | Fits two panes side-by-side. No horizontal scrolling. Ever. |
| Function length           | 50 lines   | Reduces probability of bugs. Forces decomposition.          |
| Function parameters       | 3 max      | Beyond 3, use an options object.                            |
| File length               | 400 lines  | If longer, the module has too many responsibilities.        |
| Nesting depth             | 3 levels   | Deep nesting hides logic. Flatten with early returns.       |
| `any` count               | 0          | Enforced by ESLint rule.                                    |

### 5.2 Formatting Rules

Let the tools do the formatting. Do not argue about style. Configure once, enforce everywhere.

```jsonc
// .prettierrc
{
  "printWidth": 100,
  "singleQuote": true,
  "trailingComma": "all",
  "arrowParens": "always",
  "semi": true,
  "tabWidth": 2
}
```

**Rules:**

- **2-space indentation.** Standard TypeScript convention. Consistent with the ecosystem.
- **Trailing commas everywhere.** They produce cleaner diffs and make reordering painless.
- **Single quotes for strings.** Double quotes for JSX (not applicable to backend code).
- **Semicolons: always.** ASI (Automatic Semicolon Insertion) is a source of subtle bugs.
- **Use Prettier for formatting, ESLint for logic.** Do not use ESLint for formatting rules.
  They are two tools with two jobs.
- **Format on save. Lint on commit.** There is no discussion about formatting in code review.

### 5.3 Early Returns — Flatten the Pyramid

```typescript
// ❌ BAD: Nested pyramid of doom.
async function getAccountBalance(accountId: string): Promise<number> {
  const account = await findAccount(accountId);
  if (account) {
    if (account.status === 'active') {
      if (account.balance !== null) {
        return account.balance;
      } else {
        throw new Error('Balance is null');
      }
    } else {
      throw new InactiveAccountError(accountId);
    }
  } else {
    throw new NotFoundError('Account', accountId);
  }
}

// ✅ GOOD: Early returns. Linear reading. One level of nesting.
async function getAccountBalance(accountId: string): Promise<number> {
  const account = await findAccount(accountId);
  if (!account) {
    throw new NotFoundError('Account', accountId);
  }
  if (account.status !== 'active') {
    throw new InactiveAccountError(accountId);
  }
  assert(account.balance !== null, `Active account has null balance: ${accountId}`);
  return account.balance;
}
```

### 5.4 Import Discipline

```typescript
// ✅ GOOD: Grouped, ordered, explicit.

// 1. Node built-ins.
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';

// 2. External packages.
import { z } from 'zod';
import { sql } from 'slonik';

// 3. Internal packages (monorepo).
import { logger } from '@company/logger';

// 4. Relative imports.
import { AccountSchema } from './account.schema.js';
import { NotFoundError } from './account.errors.js';
```

**Rules:**

- **Use `type` imports for type-only values.** `import type { Account } from './types.js'`.
  This is enforced by `verbatimModuleSyntax` in tsconfig.
- **No default exports.** Named exports are greppable, refactor-safe, and auto-importable.
  The only exception: framework conventions that require it (e.g., Next.js pages).
- **No circular imports.** They cause subtle initialisation-order bugs and indicate tangled
  architecture. If two modules depend on each other, extract the shared piece.

---

## 6. Dependencies

### 6.1 Minimal Dependencies — Every Dependency is a Liability

> "Dependencies, in general, inevitably lead to supply chain attacks, safety and performance
> risk, and slow install times."

Unlike TigerBeetle's zero-dependency policy, TypeScript backend code exists in the npm
ecosystem and necessarily has dependencies. But every dependency must earn its place.

**Rules:**

- **Justify every dependency.** Before adding a package, answer: Can I write this in 50 lines?
  Is the maintenance cost of owning the code higher than the risk of depending on a stranger's
  code? For utilities under ~100 lines (deep clone, debounce, slug generation), write it yourself.
- **Pin exact versions.** Use `--save-exact` by default. Put `save-exact=true` in `.npmrc`.
  Lockfiles are necessary but not sufficient — ranges in `package.json` cause drift across
  branches and environments.
- **Audit regularly.** Run `npm audit` in CI. Block merges on critical vulnerabilities.
- **Prefer well-maintained, minimal packages** over kitchen-sink frameworks. A package with
  1 purpose, 0 dependencies, and an active maintainer is better than a package with 50 features
  and 200 transitive dependencies.
- **Prefer Node built-ins.** `node:crypto`, `node:fs/promises`, `node:http`, `node:test`.
  Do not install packages for things Node already does.

### 6.2 Recommended Core Dependencies

These are the packages that have earned their place. They are well-maintained, minimal,
TypeScript-first, and solve problems that are genuinely hard to solve well in-house:

| Purpose                  | Package            | Why                                                         |
| ------------------------ | ------------------ | ----------------------------------------------------------- |
| Schema validation        | `zod`              | TypeScript-first. Schema = type. Runtime + compile time.    |
| Database client (Pg)     | `pg` or `slonik`   | Mature, well-understood, minimal abstraction.               |
| Logging                  | `pino`             | Fast (JSON, async), structured, low overhead.               |
| HTTP framework           | `fastify` or `hono`| Performance-focused, schema-integrated.                     |
| Job queue                | `temporal`         | Durable workflows. Not a "job queue" — a workflow engine.   |
| Testing                  | `vitest`           | Fast, TypeScript-native, ESM-first.                         |

Do not add ORMs. ORMs trade a small amount of convenience for a large amount of
abstraction leakage, performance unpredictability, and migration complexity. Write SQL. Know
your queries. Own your data access.

---

## 7. Testing

### 7.1 Testing Philosophy

> "Testing is more important than shipping. If you have no tests or an inadequate amount,
> then every time you ship code, you won't be sure that you didn't break anything."

**Rules:**

- **Test the behaviour, not the implementation.** Tests assert what a function does given
  certain inputs, not how it does it internally. Implementation changes shouldn't break tests
  unless behaviour changes.
- **Arrange → Act → Assert.** Every test has exactly three sections, clearly separated.
- **One assertion per test.** Or more precisely: one logical assertion. A test that checks both
  the happy path and the error path is two tests.
- **No mocking unless necessary.** Mock only external dependencies (HTTP, database, clock).
  Never mock your own code — if you need to mock it to test it, the design is wrong. Extract
  the dependency and inject it.

```typescript
// ✅ GOOD: Clear, focused, no mocking of internal code.
describe('applyDiscount', () => {
  it('reduces the total by the discount percentage', () => {
    const order = { total: 100, discountApplied: false };

    const result = applyDiscount(order, 20);

    assert.strictEqual(result.total, 80);
    assert.strictEqual(result.discountApplied, true);
  });

  it('throws on negative discount', () => {
    const order = { total: 100, discountApplied: false };

    assert.throws(
      () => applyDiscount(order, -10),
      (error: Error) => error.message.includes('discountPercent'),
    );
  });
});
```

### 7.2 Boundary Tests and Schema Tests

Because parsing happens at the boundary, test the boundary schemas explicitly.

```typescript
describe('CreateAccountSchema', () => {
  it('accepts valid input', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Acme Corp',
      email: 'admin@acme.com',
      currency: 'GBP',
    });
    assert.strictEqual(result.success, true);
  });

  it('rejects empty name', () => {
    const result = CreateAccountSchema.safeParse({
      name: '',
      email: 'admin@acme.com',
      currency: 'GBP',
    });
    assert.strictEqual(result.success, false);
  });

  it('rejects unsupported currency', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Acme',
      email: 'admin@acme.com',
      currency: 'BTC',
    });
    assert.strictEqual(result.success, false);
  });
});
```

---

## 8. Style By The Numbers

| Constraint                        | Value         | Enforced By          |
| --------------------------------- | ------------- | -------------------- |
| `strict` mode                     | Always on     | `tsconfig.json`      |
| `noUncheckedIndexedAccess`        | Always on     | `tsconfig.json`      |
| `any` count                       | 0             | ESLint               |
| Line length                       | 100 cols max  | Prettier             |
| Function length                   | 50 lines max  | ESLint / code review |
| Function parameters               | 3 max         | ESLint / code review |
| File length                       | 400 lines max | Code review          |
| Nesting depth                     | 3 levels max  | ESLint               |
| Assertion density                 | ≥ 2 per fn    | Code review          |
| Trust boundary coverage           | 100%          | Code review          |
| Default exports                   | 0             | ESLint               |
| `catch {}` empty blocks           | 0             | ESLint               |
| TODO without ticket               | 0             | ESLint (custom rule) |
| Trailing commas                   | Always        | Prettier             |
| Semicolons                        | Always        | Prettier             |
| Indentation                       | 2 spaces      | Prettier             |

---

## Zero Technical Debt

Code, like steel, is easier to change while it's hot. Do it right the first time, the best you know
how, because you may not get another chance, and because quality builds momentum.

**Rules:**

- Fix bugs when you find them. Not "later". Not "in a follow-up". Now.
- Refactor opportunistically. If you touch a file and it's messy, clean it up. The Boy Scout Rule
  is not optional — it's the only way to prevent entropy.
- Never ship code you know is wrong. If the deadline forces a trade-off, log the debt as a
  ticket with severity and schedule it within the current sprint.
- If a shortcut saves you an hour today but costs your team a day next month, it's not a shortcut.
  It's a loan with predatory interest.

---

## The Spirit of Tiger Style

These rules are not bureaucracy. They are force multipliers. Each one exists because we've
seen the alternative — in production, at 3 AM, during a customer incident.

The goal is not perfection. The goal is steady, compounding quality. Every assertion you write
is a future bug you've pre-empted. Every schema you define is a class of runtime errors you've
eliminated. Every limit you set is an outage you've prevented.

Tiger Style is evolving. This is what we've learned along the way. The best is yet to come.

---

*"Software is engineering, and more, it is art. Information and inspiration. Reason and
experience. Precision and poetry."*
