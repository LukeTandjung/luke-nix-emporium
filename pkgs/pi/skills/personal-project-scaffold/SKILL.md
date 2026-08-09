---
name: personal-project-scaffold
description: Creates a new personal project from Luke T's private GitHub project-skeleton template. Use when Luke asks to scaffold, bootstrap, initialize, or create a personal project repository with the standard Deno, Cargo, devenv, Nix, PostgreSQL, and migration structure.
---

# Personal Project Scaffold

Create new repositories from `LukeTandjung/project-skeleton`. The template is the canonical source of project files; do not manually copy its contents or duplicate them in this skill.

## Gather requirements

Determine these values before creating anything:

- GitHub repository name.
- Visibility: default to private unless Luke explicitly requests otherwise.
- GitHub owner: default to the account authenticated by `gh`.
- Local parent directory: default to `~/Projects`.
- Optional repository description.

Ask only for values that are missing or ambiguous. Normalize the repository name to a valid GitHub slug only with Luke's approval.

Creating a GitHub repository is an external side effect. Before running the creation command, clearly state the resolved owner, name, visibility, and local destination. Luke's explicit request to create a named project counts as approval when all those values are already clear.

## Preconditions

1. Run `gh auth status` and obtain the active account with `gh api user --jq .login`.
2. Confirm the template is accessible with:

   ```bash
   gh repo view LukeTandjung/project-skeleton \
     --json nameWithOwner,isPrivate,isTemplate
   ```

3. Ensure the destination path does not exist.
4. Ensure `<owner>/<repository>` does not already exist.
5. Never delete, overwrite, or repurpose an existing directory or repository.

If either target exists, stop and ask Luke how to proceed.

## Create the project

Run the command from the selected local parent directory:

```bash
gh repo create <owner>/<repository> \
  --template LukeTandjung/project-skeleton \
  --private \
  --clone
```

Use `--public` only when explicitly requested. Add `--description <description>` when one was supplied.

Do not use a normal clone of the template and do not preserve the template repository's Git history. `gh repo create --template` must create the independent repository.

## Verify

Inside the cloned project:

1. Confirm `origin` points to `<owner>/<repository>`.
2. Confirm the current branch is `main` and tracks `origin/main`.
3. Confirm the working tree is clean.
4. Confirm the expected skeleton boundaries exist:

   ```text
   crates/
   workspaces/postgres/
   workspaces/migrations/
   workspaces/services/
   Cargo.toml
   deno.json
   devenv.nix
   flake.nix
   AGENTS.md
   ```

5. Run:

   ```bash
   deno task check
   deno task test
   nix flake check --no-build
   devenv tasks run project:check
   devenv tasks run project:test
   ```

Do not run `direnv allow` automatically; that is a local trust decision for Luke.

If validation modifies generated files, inspect the changes and explain them rather than committing or discarding them automatically.

## Customization

Leave the generated repository identical to the template unless Luke asks for project-specific customization. For requested customization:

- Replace only intentional generic values such as the README title, database name, or package namespace.
- Preserve the tool ownership and architectural boundaries in `AGENTS.md`.
- Use the `hexagonal-architecture` skill when adding a service or crate.
- Do not add example application code merely to make the skeleton look populated.
- Do not commit changes unless Luke explicitly asks for a commit.

## Completion report

Report:

- GitHub repository URL.
- Local clone path.
- Visibility.
- Validation results.
- Any remaining uncommitted customization or follow-up action.
