# Autolith

This repository vendors the exact Autolith source used to build the base image. It manages the user configuration through Home Manager.

## Contents

- `vendor/autolith`: pinned Autolith source and its Nix build
- `pkgs/agent-skills`: shared `SKILL.md` sources for Autolith, Pi, and Claude Code
- `pkgs/autolith/init.lisp`: global executable initialization
- `pkgs/autolith/mcp.nix`: generated MCP configuration
- `pkgs/autolith-paddle-ocr-mcp`: local PaddleOCR-VL MCP server
- `pkgs/markitdown-mcp`: Nix package for the upstream Microsoft document conversion MCP server
- `modules/autolith.nix`: Home Manager module

Generated SBCL core files and private mutation history are not committed. Nix builds the base image from the vendored source. Committed configuration reconstructs the local extensions.

## Home Manager

```nix
{
  imports = [ inputs.luke-pkgs.homeManagerModules.autolith ];

  programs.autolith.enable = true;
}
```

This installs Autolith and the tool packages required by the shared skills. It writes:

```text
~/.config/autolith/init.lisp
~/.config/autolith/mcp.sexp
~/.config/autolith/skills/<name>/
~/.config/autolith/agents/<name>.sexp
```

The PaddleOCR and MarkItDown MCP servers are enabled by default. The PaddleOCR server uses `http://127.0.0.1:8080/v1` and model `paddleocr-vl-1.6`.

Map a different parent environment variable into the server when needed:

```nix
programs.autolith.paddleOcr.endpointEnvironmentVariable = "PADDLE_OCR_URL";
```

The variable must contain the complete OpenAI-compatible `/v1` base URL when Autolith starts the MCP server.

## Add a skill

Create a complete directory under `pkgs/agent-skills`:

```text
pkgs/agent-skills/release-check/
├── SKILL.md
├── references/
└── scripts/
```

The Pi, Claude Code, and Autolith modules all use this directory. Autolith reads standard `SKILL.md` files directly.

## Native tools and skills

The vendored Autolith image includes `user.ask`. It presents one to four multiple-choice questions through the terminal selector. The tool is not available to child agents.

The shared `autoresearch` skill defines measured Git experiments under `.auto/`. The `document-parsing` skill selects MarkItDown for document conversion and PaddleOCR for visual OCR.

Source-level Autolith changes belong under `vendor/autolith` with tests. Configure external tools as upstream MCP packages when they are available.

## PaddleOCR

The `paddle_ocr` MCP tool supports BMP, JPEG, PNG, WebP, and PDF files. Tasks are `ocr`, `formula`, `table`, `chart`, `seal`, and `spotting`.

PDF input uses `pdftoppm`. The Home Manager module installs Poppler, ImageMagick, Typst, the Quint toolchain, and Java for the committed skills.

The MCP server marks `paddle_ocr` as read-only and non-destructive. Autolith prompts for approval by default. Set `programs.autolith.paddleOcr.approval = "read-only"` to trust the tool without a prompt.

## Documents

The upstream MarkItDown server provides `convert_to_markdown`. It converts local file URIs and remote URIs to Markdown, including PDF, Word, PowerPoint, and Excel input. The Home Manager module installs the server from a fixed Microsoft source revision; this repository does not vendor its source.

The tool can read files available to the Autolith process and can fetch remote URLs. Autolith prompts for approval by default. Set `programs.autolith.document.approval = "read-only"` to trust `convert_to_markdown` without a prompt.

## Update the vendored base

Replace `vendor/autolith` with a reviewed source snapshot. Update `vendor/autolith/VENDORED_COMMIT`, then run:

```bash
nix flake lock --update-input autolith
nix flake check
```

Review upstream source and release notes before an update because `init.lisp` uses Autolith's Lisp API.
