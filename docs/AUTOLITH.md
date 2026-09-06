# Autolith

This repository pins the Autolith package as a flake input. It stores the user configuration that Home Manager installs.

## Contents

- `pkgs/agent-skills`: shared `SKILL.md` sources for Autolith, Pi, and Claude Code
- `pkgs/autolith/init.lisp`: global executable initialization
- `pkgs/autolith/package.nix`: package builder for the locked upstream source
- `pkgs/autolith/patches`: source patches for the pinned Autolith release
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

Develop source-level Autolith changes against the pinned upstream release, with behavioral tests. Store local source patches in `pkgs/autolith/patches`. Configure external tools as upstream MCP packages when they are available.

## PaddleOCR

The `paddle_ocr` MCP tool supports BMP, JPEG, PNG, WebP, and PDF files. Tasks are `ocr`, `formula`, `table`, `chart`, `seal`, and `spotting`.

PDF input uses `pdftoppm`. The Home Manager module installs Poppler, ImageMagick, Typst, the Quint toolchain, and Java for the committed skills.

The MCP server marks `paddle_ocr` as read-only and non-destructive. Autolith prompts for approval by default. Set `programs.autolith.paddleOcr.approval = "read-only"` to trust the tool without a prompt.


## Dependency workaround

Autolith v0.47.1's Nix package pins an older `cl-skills` revision than its
`qlfile.lock`. `pkgs/autolith/package.nix` overrides only that stale dependency
pin to `ef20ce4bde2eb1d8f483a063788256aad06d0968`, which supports the `:prefix`
and `:guidance` arguments Autolith uses.
Remove this workaround once upstream aligns the dependency pins.

## Packaged source patches

`pkgs/autolith/package.nix` applies these patches in order to Autolith **v0.47.1**:

1. `inline-file-context.patch`: type `@` followed by a workspace file query,
   then select a match with Tab. The editor inserts a quoted path when needed.
   The submission carries the selected UTF-8 snapshot separately from the draft.
   Limits are 128 KiB per file and 256 KiB per submission.
2. `shift-tab-reasoning.patch`: Shift-Tab cycles the model's supported reasoning
   efforts. Completion candidates take priority, then recalled queue editing,
   then reasoning. `/effort next` uses the same relative operation.
   During a turn, each press takes effect at a safe command boundary.

These replace the v0.40.1 patches removed in `5ad0c17`. Rebase and test them when
changing the upstream release. Build the package, not only the flake evaluation:

```bash
nix flake check
nix build .#autolith --no-link
```

### Repair notes

The old Shift-Tab patch also contained partial repairs for the inline patch.
The new patches separate those responsibilities. The review found:

- Shift-Tab calculated an absolute effort on the input thread. Repeated presses
  during a turn queued the same value. The command now resolves `next` when it runs.
- File search blocked the input thread. The new worker coalesces pending queries,
  discards stale results, and respects Escape and UI shutdown. Runtime replacement
  drains that worker before it closes the old search engine, then binds completion
  and file selection to the new workspace.
- On v0.47.1, the old completion code treated decorated `clifff` search output as
  filenames. A dedicated child-worker operation now returns exact paths. Spaces,
  brackets, quotes, and backslashes survive selection.
- The inline patch matched attachment history by text. The old Shift-Tab patch
  changed this to a parallel index, but did not preserve saved draft attachments.
  History now tracks exact entries and the saved draft. Submission and history
  use the same pruned attachments.
- The inline patch alone discarded editor action values through a misplaced
  cleanup form. Its token predicate also returned a character despite its boolean
  type. Both repairs now belong to the inline patch.

On x86_64-linux, both Nix commands above pass. A fresh process using the built
package passes 620 assertions across the terminal suite, command suite, effort
switching, file-context replay, recovery construction, and workspace switching.
The patches include these tests, including repeated busy Shift-Tab presses and
blocked completion workers.

The full upstream suites have separate environment failures on the unmodified
v0.47.1 package: application approval classification in the worker environment,
and a clean-child conversation test whose registry setting conflicts with the Nix
SBCL wrapper. The focused suites above pass without changing those tests.

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
