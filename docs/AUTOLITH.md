# Autolith

This repository pins the Autolith package as a flake input. It stores the user configuration that Home Manager installs.

## Contents

- `pkgs/agent-skills`: shared `SKILL.md` sources for Autolith, Pi, and Claude Code
- `pkgs/autolith/init.lisp`: global executable initialization
- `pkgs/autolith/package.nix`: patched package builder for the locked upstream source
- `pkgs/autolith/patches`: focused source changes applied before the base image build
- `pkgs/autolith/mcp.nix`: generated MCP configuration
- `pkgs/autolith-paddle-ocr-mcp`: local PaddleOCR-VL MCP server
- `modules/autolith.nix`: Home Manager module

Generated SBCL core files and private mutation history are not committed. Nix builds the base image from the locked upstream Autolith source. The committed Home Manager module, initialization source, MCP configuration, skills, and agent definitions reconstruct the local configuration.

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

The PaddleOCR MCP server is enabled by default. The PaddleOCR server uses `http://127.0.0.1:8080/v1` and model `paddleocr-vl-1.6`.

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

## Skills

The shared `autoresearch` skill defines measured Git experiments under `.auto/`.

Make source-level Autolith changes in the upstream Autolith repository with tests. Configure external tools as upstream MCP packages when they are available.

## PaddleOCR

The `paddle_ocr` MCP tool supports BMP, JPEG, PNG, WebP, and PDF files. Tasks are `ocr`, `formula`, `table`, `chart`, `seal`, and `spotting`.

PDF input uses `pdftoppm`. The Home Manager module installs Poppler, ImageMagick, Typst, the Quint toolchain, and Java for the committed skills.

The MCP server marks `paddle_ocr` as read-only and non-destructive. Autolith prompts for approval by default. Set `programs.autolith.paddleOcr.approval = "read-only"` to trust the tool without a prompt.


## Update the Autolith package

Change the Autolith release tag in `flake.nix`. Then update the lock file and run the checks:

```bash
nix flake update autolith
nix flake check
```

Review upstream source and release notes before an update because `init.lisp` uses Autolith's Lisp API.
