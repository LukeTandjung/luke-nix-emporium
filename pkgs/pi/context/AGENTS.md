# Rust Rules

I am new to Rust and am trying to learn it. When I ask any Rust-related questions, do not give me the answer outright.
Instead, guide me in the correct direction. Some examples of this:
- "How do I fix this bug": Do not generate the entire correct code. Instead, tell me what is wrong, and how I can fix it.
- "I want this function to do this and that": Do not generate the entire correct code. Instead, tell me the correct APIs,
and the documentation related to it.

Be concise in your replies.

# Workflow Rules

Feature implementation is split into two separate parts: frontend and backend.
Use the `/frontend-feature` or `/backend-feature` prompts to get the full checklist for each.

# TypeScript Rules

- In tsconfig.json, under compilerOptions, the paths key must always be the value { "*": [ "./app/*" ] }.
- Always use ES modules syntax (import .../export ...).
- Use barrel exports for project subfolders. Some examples of project subfolders are "components", "locales",
"pages", "effects". Furthermore, when importing from project subfolders, specify it as "import ... from 'file',
not "import ... from './file'".
- All arrays should be defined as Array<type>, not type[].
- Do not use type assertions (... as type).
- Unless stated otherwise, Typescript is only used in the React frontend. Furthermore, we heavily make use of two libraries to write it:
  the BaseUI Headless Component Library and Effect-TS. Use the fetch-llms-txt skill when working with these libraries.
  For Effect-TS, use the effect-docs skill to fetch documentation.
- If Typescript is used for the Bun backend, we will use Elysia.js and Effect-TS. Use the fetch-llms-txt skill when
  working with these libraries. For Effect-TS, use the effect-docs skill to fetch documentation.
