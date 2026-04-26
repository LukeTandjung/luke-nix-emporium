---
name: typst-mcp
description: Use the Typst MCP bridge when working with Typst documents, Typst syntax, Typst documentation, LaTeX-to-Typst conversion, syntax validation, or rendering Typst snippets.
version: 0.2.0
---

# Typst MCP

Use this skill whenever the task involves Typst files (`.typ`), Typst markup, Typst packages/functions, LaTeX-to-Typst conversion, Typst syntax validation, or rendering/checking Typst output.

This flake provides a Pi extension that bridges <https://github.com/johannesbrandenburger/typst-mcp> into native Pi tools. The extension starts the MCP server lazily through Docker with this default command:

```bash
docker run --rm -i ghcr.io/johannesbrandenburger/typst-mcp:latest
```

If these tools are present in the current tool list, use them directly. Do not pretend to have used MCP tools if they are absent or if a tool call fails to start Docker.

## Available tools

The Typst MCP bridge exposes these tools:

- `list_docs_chapters()` — list Typst documentation chapters and routes.
- `get_docs_chapter(route)` / `get_docs_chapters(routes)` — fetch one or more Typst documentation chapters.
- `latex_snippet_to_typst(latex_snippet)` / `latex_snippets_to_typst(latex_snippets)` — convert LaTeX snippets to Typst via Pandoc inside the MCP container.
- `check_if_snippet_is_valid_typst_syntax(typst_snippet)` / `check_if_snippets_are_valid_typst_syntax(typst_snippets)` — validate Typst snippets.
- `typst_snippet_to_image(typst_snippet)` — render a Typst snippet to a PNG image.
- `typst_to_image(typst_snippet)` — alias for `typst_snippet_to_image`.

The user can manage the bridge with `/typst-mcp status`, `/typst-mcp start`, `/typst-mcp restart`, and `/typst-mcp stop`.

## Workflow

1. For Typst syntax, APIs, layout features, math, figures, bibliographies, or package usage, start by calling `list_docs_chapters()`, then fetch the relevant chapter(s) with `get_docs_chapter` or `get_docs_chapters`.
2. For LaTeX-to-Typst conversion, call `latex_snippet_to_typst` or `latex_snippets_to_typst`, then review and adapt the output to fit the surrounding document.
3. Before presenting or committing non-trivial Typst code, validate it with `check_if_snippet_is_valid_typst_syntax`. Use the batch validation tool for multiple snippets.
4. For complex diagrams, page layouts, or visual output, use `typst_snippet_to_image` or `typst_to_image` and inspect the rendered image when multimodal inspection is available.
5. When editing a repository, use MCP validation as a fast snippet check, but still run the local project build/compile command when available, such as `typst compile input.typ output.pdf`.

## Fallback when MCP tools are unavailable

If the Typst MCP tools are not visible in the tool list or Docker cannot start the MCP server:

- Say that the Typst MCP bridge is unavailable in this session and include the observed error if there is one.
- Use local tools if present: `typst compile`, `typst query`, `typst fonts`, and `typst --help`.
- Fetch current Typst documentation from <https://typst.app/docs/> when documentation is needed.
- Do not claim that syntax was checked by MCP unless an MCP validation tool was actually called.

## Configuration

The extension defaults to Docker. Override the command with environment variables if needed:

- `TYPST_MCP_COMMAND` — command to run, default `docker`.
- `TYPST_MCP_ARGS` — arguments, either whitespace-separated or a JSON string array. Default: `["run", "--rm", "-i", "ghcr.io/johannesbrandenburger/typst-mcp:latest"]`.
- `TYPST_MCP_TIMEOUT_MS` — request timeout in milliseconds, default `300000`.
