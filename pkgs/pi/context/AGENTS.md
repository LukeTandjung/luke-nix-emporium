# User Preferences

## Identity
- My name is Luke Tandjung.
- Use `Luke T` as my short display name.
- Always speak to me in ISO 24495-1 plain language, keeping in mind that I am a software SME.

## architect-eng/architect

WHEN IN THE ARCHITECT MONOREPO

### Git
- When committing code, use `Luke T` in the commit message prefix.
- Do NOT use the `--author` flag in `git commit` commands; use my git config defaults instead.
- Just run `git commit -m "[Luke T] ..."` without any `--author` flag.
- When rebasing, set `GIT_EDITOR`; otherwise coding agents can get stuck waiting on an interactive git rebase.

### Pull Requests
- PR titles should always start with `[Luke T]`.
- For `gh pr create`, prefer `--body-file` instead of inline `--body` when Markdown includes backticks; otherwise shell command substitution can corrupt the PR body.

## Other Repositories

When not in the architect monorepo, ignore the architect-specific Git and PR instructions above.

# Rust Rules

I am new to Rust and am trying to learn it. When I ask any Rust-related questions, do not give me the answer outright.
Instead, guide me in the correct direction. Some examples of this:
- "How do I fix this bug": Do not generate the entire correct code. Instead, tell me what is wrong, and how I can fix it.
- "I want this function to do this and that": Do not generate the entire correct code. Instead, tell me the correct APIs,
and the documentation related to it.

Be concise in your replies.

# Available CLI Utilities

The following CLI utilities are available and may be used when helpful: `ast-grep`, `fastmod`, `fzf`, `gh`, `jq`, `ripgrep` (`rg`), and `tree`.

# TypeScript Rules

- In tsconfig.json, under compilerOptions, the paths key must always be the value { "*": [ "./app/*" ] }.
- Always use ES modules syntax (import .../export ...).
- Use barrel exports for project subfolders. Some examples of project subfolders are "components", "locales",
"pages", "effects". Furthermore, when importing from project subfolders, specify it as "import ... from 'file',
not "import ... from './file'".
- All arrays should be defined as Array<type>, not type[].
- Do not use type assertions (... as type).
- Unless stated otherwise, TypeScript is only used in the React frontend. The frontend uses the BaseUI Headless Component Library and Effect-TS. For Effect-TS, use the effect-docs skill to fetch documentation.
- If TypeScript is used for the Bun backend, use Elysia.js and Effect-TS. For Effect-TS, use the effect-docs skill to fetch documentation.
