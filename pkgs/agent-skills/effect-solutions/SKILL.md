---
name: effect-solutions
description: Look up Effect patterns with the effect-solutions CLI when writing, reviewing, or debugging Effect TypeScript services, Layers, errors, schemas, configuration, or tests. Check examples against the project's installed Effect version before applying them.
---

# Effect Solutions

Use the CLI for focused, local documentation lookup. It replaces the Effect docs MCP.
Load only the topics relevant to the task; do not read the whole catalog by default.

## Lookup

1. Read the project's dependency manifest and lockfile to identify its Effect version.
2. Prefer `effect-solutions` from PATH (provided by Nix/devenv).
3. List the bundled topics, then show the relevant slug or slugs:

   ```bash
   effect-solutions list
   effect-solutions show services-and-layers error-handling
   ```

   Other topics include `data-modeling`, `testing`, `config`, `basics`,
   `project-setup`, `tsconfig`, and `cli`. Use `list` to confirm availability.

4. For command syntax, use `effect-solutions --help` or
   `effect-solutions show --help` rather than inventing flags or topic names.
5. If the CLI is unavailable, enter the project's declared development environment.
   With Bun already available, the pinned fallback is:

   ```bash
   bunx --bun effect-solutions@0.5.3 list
   bunx --bun effect-solutions@0.5.3 show services-and-layers
   ```

   The fallback downloads code on its first run; it is not an offline installation.
   Do not silently install global packages or replace the project's package manager.
   If neither execution path is available, report the missing prerequisite.

## Apply the result

- Treat the output as pattern guidance, not a version-independent API reference.
  Check unfamiliar APIs against installed declarations/source or version-matched docs.
  Do not mix Effect 3, Effect 4 prerelease, and stable Effect 4 examples.
- Follow the project's standards and `hexagonal-architecture` for ownership, pure
  core, inline Layer methods, error policy, and the named `fn` + `gen(...).pipe(...)`
  convention. Keep those rules authoritative; do not import an upstream project layout.
- Keep dependencies, compiler settings, and test commands owned by the project's
  existing toolchain. Do not copy a suggested tsconfig over local configuration.
- Typecheck and test the resulting code. State which checks actually ran.
- `open-issue` is an external feedback action, not part of documentation lookup;
  use it only when the user asks to submit feedback.

Credit: [Effect Solutions by Kit Langton](https://github.com/kitlangton/effect-solutions).
