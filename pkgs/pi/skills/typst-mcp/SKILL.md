---
name: typst-mcp
description: Use the Typst MCP server when working with Typst documents, Typst syntax, Typst documentation, LaTeX-to-Typst conversion, syntax validation, or rendering Typst snippets.
version: 0.1.0
---

# Typst MCP

Use this skill whenever the task involves Typst files (`.typ`), Typst markup, Typst packages/functions, LaTeX-to-Typst conversion, Typst syntax validation, or rendering/checking Typst output.

Prefer the Typst MCP server from <https://github.com/johannesbrandenburger/typst-mcp> when the current harness exposes its tools. Do not pretend to have used MCP tools if they are not available.

## Available MCP tools

The Typst MCP server provides these tools:

- `list_docs_chapters()` — list Typst documentation chapters.
- `get_docs_chapter(route)` / `get_docs_chapters(routes)` — fetch one or more Typst documentation chapters.
- `latex_snippet_to_typst(latex_snippet)` / `latex_snippets_to_typst(latex_snippets)` — convert LaTeX snippets to Typst via Pandoc.
- `check_if_snippet_is_valid_typst_syntax(typst_snippet)` / `check_if_snippets_are_valid_typst_syntax(typst_snippets)` — validate Typst snippets.
- `typst_to_image(typst_snippet)` — render a Typst snippet to a PNG image for visual inspection when supported by the model/harness.

## Workflow

1. For Typst syntax, APIs, layout features, math, figures, bibliographies, or package usage, start by calling `list_docs_chapters()`, then fetch the relevant chapter(s) with `get_docs_chapter` or `get_docs_chapters`.
2. For LaTeX-to-Typst conversion, call `latex_snippet_to_typst` or `latex_snippets_to_typst`, then review and adapt the output to fit the surrounding document.
3. Before presenting or committing non-trivial Typst code, validate it with `check_if_snippet_is_valid_typst_syntax`. Use the batch validation tool for multiple snippets.
4. For complex diagrams, page layouts, or visual output, use `typst_to_image` and inspect the rendered image when multimodal inspection is available.
5. When editing a repository, use MCP validation as a fast snippet check, but still run the local project build/compile command when available, such as `typst compile input.typ output.pdf`.

## Fallback when MCP tools are unavailable

Pi does not necessarily expose native MCP tools. If the Typst MCP tools are not available in the current session:

- Say that the Typst MCP tools are not exposed in this harness.
- Use local tools if present: `typst compile`, `typst query`, `typst fonts`, and `typst --help`.
- Fetch current Typst documentation from <https://typst.app/docs/> when documentation is needed.
- Do not claim that syntax was checked by MCP unless an MCP validation tool was actually called.

## Setup reference

The linked MCP can be run with Docker in MCP-capable clients:

```json
{
  "mcpServers": {
    "typst": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "ghcr.io/johannesbrandenburger/typst-mcp:latest"
      ]
    }
  }
}
```

For a local installation, clone the repository and run its `server.py` as documented upstream.
