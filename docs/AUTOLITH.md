# Autolith

This repository pins the Autolith package as a flake input. It stores the user configuration that Home Manager installs.

## Contents

- `pkgs/agent-skills`: shared `SKILL.md` sources for Autolith, Pi, and Claude Code
- `pkgs/autolith/init.lisp`: global executable initialization
- `pkgs/autolith/package.nix`: package builder for the locked upstream source
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


## Dependency workaround

Autolith v0.47.1's Nix package pins an older `cl-skills` revision than its
`qlfile.lock`. `pkgs/autolith/package.nix` overrides only that stale dependency
pin to `ef20ce4bde2eb1d8f483a063788256aad06d0968`, which supports the `:prefix`
and `:guidance` arguments Autolith uses. Autolith's Lisp source is not patched.
Remove this workaround once upstream aligns the dependency pins.

## Local Lisp patches

Store tested live fixes in `pkgs/autolith/init.lisp`. Home Manager installs this
file as `~/.config/autolith/init.lisp`, which Autolith loads at startup. Commit
this source and its documentation rather than a saved core or private replay script.

The current Autolith 0.47.1 override accepts Nix store targets reached through
links under the configured user skill root. It preserves the logical skill paths
for name validation. Remove the override when upstream supports Home Manager
skill links.

After changing this file, run `nix flake check`, update the consuming configuration's
flake input if needed, and apply its Home Manager configuration. Check `/skills`
in a new Autolith process. Retire a matching private image override only after
the installed initialization file works without it.

## Update the Autolith package

Change the Autolith release tag in `flake.nix`. Then update the lock file and run the checks:

```bash
nix flake update autolith
nix flake check
```

Review upstream source and release notes before an update because `init.lisp` uses Autolith's Lisp API.
