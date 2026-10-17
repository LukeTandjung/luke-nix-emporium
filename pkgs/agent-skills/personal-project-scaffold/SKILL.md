---
name: personal-project-scaffold
description: Creates a personal project from Luke T's private project-skeleton template with Deno, Cargo, devenv, PostgreSQL, Effect tooling, and anti-slop. Use when scaffolding or initializing a personal repository, or updating the canonical template.
---

# Personal Project Scaffold

Create new repositories from `LukeTandjung/project-skeleton`. The template is the canonical source of project files; do not manually copy its contents or duplicate them in this skill.

## Updating the template

When Luke asks to change the scaffold itself:

1. Reuse `~/Projects/project-skeleton` (or the existing checkout Luke specifies).
   Verify its Git remote is `LukeTandjung/project-skeleton`.
2. Read its `AGENTS.md` and inspect the working tree. If it is clean and on the
   template's tracked branch, update it with `git pull --ff-only`. If it has local
   changes, another branch, or diverged history, preserve that work and resolve the
   situation with Luke; do not reset, auto-stash, or create a replacement clone.
3. Clone the template only if no local checkout exists. If the expected directory
   exists but is not the template checkout, stop rather than overwrite it.
4. Edit and validate that same checkout. Do not generate a new application merely
   to update the template, and do not clone again on subsequent updates.

This skill describes the workflow; the template repository owns the project files.
Do not commit or push without being asked.

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

5. Confirm the template's Effect tooling is present:

   - devenv provides the pinned `effect-solutions` CLI.
   - Deno manages `effect`, `@maple-dev/effect-orm`, `@typeonce/effect-machine`,
     and Alchemy, with a committed `deno.lock`.
   - `tools/oxlint/anti-slop/` includes vendored rules, licenses, and provenance;
     `.oxlintrc.json` enables generic and Effect rules. Oxlint and `@oxlint/plugins`
     use the same exact version.
   - PostgreSQL guidance uses effect-orm in adapters, not Zapatos or a repository layer.
   - `docs/cloudflare-workflow-pool.md` is an opt-in recipe. Do not install the
     unpublished upstream package, vendor it, or create cloud resources by default.
   - Alchemy's CLI uses Node supplied by devenv for compatibility; Deno still owns
     the dependency graph and tasks. Do not add a second package-manager workspace.

6. Run in the declared development environment:

   ```bash
   deno install --frozen
   effect-solutions list
   effect-solutions show services-and-layers
   deno task alchemy --help
   deno task check
   deno task test
   nix flake check --no-build
   devenv tasks run project:check
   devenv tasks run project:test
   ```

Do not run `direnv allow` automatically; that is a local trust decision for Luke.
Do not deploy, destroy, authenticate to cloud providers, warm workflow pools, or
blanket-approve dependency install scripts as part of scaffold verification.
If the remote template lacks a required tool, report the template revision and
missing item rather than silently installing unpinned packages into the new project.

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
