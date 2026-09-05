# Autolith

This repository vendors the exact Autolith source used to build the base image. It manages the user configuration through Home Manager.

## Contents

- `vendor/autolith`: pinned Autolith source and its Nix build
- `pkgs/agent-skills`: shared `SKILL.md` sources for Autolith, Pi, and Claude Code
- `pkgs/autolith/init.lisp`: global executable initialization
- `pkgs/autolith/mcp.nix`: generated MCP configuration
- `pkgs/autolith-paddle-ocr-mcp`: local PaddleOCR-VL MCP server
- `pkgs/autolith-document-mcp`: workspace-scoped document MCP server
- `pkgs/autolith-notify-mcp`: native desktop notification MCP server
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

The PaddleOCR, document, and notification MCP servers are enabled by default. The PaddleOCR server uses `http://127.0.0.1:8080/v1` and model `paddleocr-vl-1.6`.

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

The shared `autoresearch` skill defines measured Git experiments under `.auto/`. The `document-parsing` and `notify-user` skills select the matching MCP tools.

Source-level Autolith changes belong under `vendor/autolith` with tests. Keep external model-facing tools in local MCP packages.

## PaddleOCR

The `paddle_ocr` MCP tool supports BMP, JPEG, PNG, WebP, and PDF files. Tasks are `ocr`, `formula`, `table`, `chart`, `seal`, and `spotting`.

PDF input uses `pdftoppm`. The Home Manager module installs Poppler, ImageMagick, Typst, the Quint toolchain, and Java for the committed skills.

The MCP server marks `paddle_ocr` as read-only and non-destructive. Autolith prompts for approval by default. Set `programs.autolith.paddleOcr.approval = "read-only"` to trust the tool without a prompt.

## Documents and notifications

The document server provides `document_parse`, `document_search`, and `document_screenshot`. It accepts workspace-contained regular files, parses a private snapshot, limits result sizes, and supports local OCR. Set `programs.autolith.document.approval = "read-only"` to trust its read-only tools without a prompt.

The notification server provides `notify_user`. It calls `notify-send` on Linux and `osascript` on macOS. Autolith prompts by default because this tool has a visible side effect. Set `programs.autolith.notifications.approval` to `"prompt"`, `"allow"`, or `"deny"`.

## Update the vendored base

Replace `vendor/autolith` with a reviewed source snapshot. Update `vendor/autolith/VENDORED_COMMIT`, then run:

```bash
nix flake lock --update-input autolith
nix flake check
```

Review upstream source and release notes before an update because `init.lisp` uses Autolith's Lisp API.
