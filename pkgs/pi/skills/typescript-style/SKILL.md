---
name: typescript-style
description: This skill should be used when writing TypeScript code, reviewing TypeScript code, or discussing TypeScript patterns. Enforces opinionated TypeScript conventions for module structure, type definitions, error handling, and code style.
version: 0.1.0
---

# TypeScript Style Guide

## Module System

- Always use ES module syntax (`import`/`export`).
- Use barrel exports (`index.ts`) for project subfolders (e.g., `components`, `pages`, `effects`).
- Import from project subfolders without relative paths: `import ... from 'file'`, not `import ... from './file'`.
- In `tsconfig.json`, `compilerOptions.paths` must always be `{ "*": ["./app/*"] }`.

## Type Definitions

- Define arrays as `Array<type>`, never `type[]`.
- Never use type assertions (`... as type`).
- Function return types must explicitly document all possible outcomes, including errors.

## Error Handling

Errors are values, not exceptions. Return errors as union types rather than throwing.

### Core Rules

1. **If a function can fail, use the `Result` type.** Define it as a plain union alias:
   ```typescript
   type Result<T, E extends Error> = T | E

   function getUser(id: string): Promise<Result<User, NotFoundError | NetworkError>>
   ```

2. **Narrow with `instanceof`.** Use `instanceof Error` checks to narrow types before accessing success values:
   ```typescript
   const user = await getUser(id)
   if (user instanceof NotFoundError) return
   if (user instanceof NetworkError) return
   console.log(user.username) // TypeScript knows user is User
   ```

3. **Keep control flow linear.** Structure error checks as early returns, not nested try-catch blocks:
   ```typescript
   const config = parseConfig(input)
   if (config instanceof Error) return config
   const db = connectDB(config.dbUrl)
   if (db instanceof Error) return db
   ```

4. **Define custom error classes** by extending `Error`:
   ```typescript
   class NotFoundError extends Error {
     constructor(public id: string) {
       super(`User ${id} not found`)
     }
   }
   ```

5. **Wrap throwing library code** to convert exceptions into returnable errors:
   ```typescript
   function trySync<T>(fn: () => T): Error | T {
     try { return fn() } catch (e) { return e instanceof Error ? e : new Error(String(e)) }
   }

   function parseConfig(input: string): ParseError | Config {
     const result = trySync(() => JSON.parse(input))
     if (result instanceof Error) return new ParseError({ reason: result.message })
     return result
   }
   ```

6. **Use ts-pattern for exhaustive pattern matching** when handling multiple error variants or any discriminated type:
   ```typescript
   import { match } from 'ts-pattern'

   const message = match(error)
     .with(P.instanceOf(NotFoundError), e => `User ${e.id} not found`)
     .with(P.instanceOf(NetworkError), e => `Failed to reach ${e.url}`)
     .otherwise(e => `Unexpected: ${e.message}`)
   ```
   ts-pattern works on any type — errors, strings, objects, discriminated unions — not just errors.

7. **Use `await using` for resource cleanup** with `AsyncDisposableStack` (TypeScript 5.2+) for Go-like defer semantics:
   ```typescript
   async function processOrder(orderId: string) {
     await using cleanup = new AsyncDisposableStack()
     const db = await connectDb()
     cleanup.defer(() => db.close())
     // db automatically closes when scope exits
   }
   ```

### Handling Multiple Error Types

When consuming a function that returns multiple error types, choose the simplest construct that fits:

- **Sequential `instanceof` early returns** for straightforward cases with 2-3 error types.
- **`switch` on a discriminant** (e.g., `error.name` or a tag field) when all branches are type-restricted and you want exhaustiveness.
- **`match` from ts-pattern** when the logic per branch is complex or expression-based.

Prefer the lightest tool that keeps the code readable. Don't reach for `matchError` when a simple `if`/early-return suffices, and don't chain five `instanceof` checks when a `switch` or `match` would be clearer.

### What NOT to Do

- Do not use `try`/`catch` for expected error paths. Reserve `try`/`catch` only for truly unexpected exceptions at top-level boundaries.
- `Result` is a plain union alias, not a wrapper class. Do not use libraries like `neverthrow` or `fp-ts` that provide `Result` as a container object with `.map()`, `.flatMap()`, `.unwrap()` methods.
- Do not throw errors for control flow. Return them.

## Async Patterns

- **Prefer `.then()` chains over `async`/`await`.** Promise chains read as data transformations and compose naturally with combinators. Use `.then()` as the default.
- **Use `.then()` where `await` isn't available**, such as inside `.map()` or other combinator callbacks.
- **Parallelise independent calls.** If two async operations don't depend on each other, use `Promise.all` rather than sequential `await`. Only sequence calls when one depends on the result of another.

### When Throwing is Acceptable

- **Inside contained boundaries** like `Promise.allSettled` callbacks, throwing is fine — the settlement boundary catches the error, so it never escapes untyped. Prefer this over verbose `instanceof` chains inside short lambdas.
- **Custom error classes are for programmatic handling.** When errors are only being reported as data (e.g., collected into a `failed` array for display), a plain `{ url: string, error: string }` is sufficient. Don't create a custom error class just to carry a message.

## Validation

- Use **Zod** for schema validation. Define the schema once and derive the TypeScript type from it with `z.infer<typeof Schema>` — never duplicate a type and its validation logic separately.
- Use `safeParse` over `parse` — it returns a discriminated union (success/failure) rather than throwing, which aligns with the error-as-values pattern.
- Let Zod collect all validation errors, not just the first.

## Functions and Abstraction

- **Functions solve DRY, not decomposition.** Only extract logic into a function when it is reused in multiple places. One-off logic should stay inline where it is read.
- **Avoid premature extraction.** Breaking single-use logic into small helper functions fragments the reading flow and makes code harder to follow. Inline code is easier to read top-to-bottom.
- **Prefer named interfaces over inline object types.** Even when a type is used once, a named interface is clearer. Define the interface, then reference it in the return type.

## Function Signatures

- **Accept wide, return narrow.** Functions should accept a broad range of input types (via generics, unions, or base types) but return specific, concrete types.
- **Use generics over `any`.** Never use `any` — use generics to preserve type information through the call.

## Iteration

- Prefer functional combinators (`.map()`, `.filter()`, `.reduce()`, `.flatMap()`, etc.) over imperative `for` loops, `forEach`, and manual index tracking.
- Chain combinators for multi-step transformations rather than accumulating into mutable variables.
