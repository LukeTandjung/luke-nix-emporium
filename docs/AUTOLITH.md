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


## Upstream comparison: v0.55.0

The package pins [v0.55.0](https://github.com/lambda-symbolics/autolith/releases/tag/v0.55.0),
commit `ef110edc66e04cc7c263bba3c9ce66845dc0a692` (released 2026-10-02).
The update from v0.50.0 compared the release notes, changed source, dependency
pins, and tests against every local patch and the startup override.

- **Use native completion; add selected-file snapshots.** Upstream owns token
  detection, search and directory candidates, the selector, navigation, and
  insertion through `terminal-path-completion-entries` and
  `terminal-ui--accept-path-completion`. See upstream
  [`path-completion.lisp`](https://github.com/lambda-symbolics/autolith/blob/v0.55.0/src/terminal/path-completion.lisp)
  and [`ui.lisp`](https://github.com/lambda-symbolics/autolith/blob/v0.55.0/src/terminal/ui.lisp).
  Selecting a file adds a bounded UTF-8 snapshot to that same native selection.
  Native insertion still removes `@`; directories remain insert-only. Tab and
  Shift-Tab preview candidates, Enter commits the selection, and Escape restores
  the original draft and its snapshots. A second Enter submits the draft.
  There is no second completion provider, selector, token parser, rendering pass,
  async request queue, generation counter, shutdown drain, or suppression guard.
  Upstream's synchronous search and normal runtime connection remain in charge.
- **Fix exact paths in the native provider.** Upstream
  [`application-path-search-files`](https://github.com/lambda-symbolics/autolith/blob/v0.55.0/src/application/operation.lisp)
  parses formatted `search.files` content at ` [`, which can truncate filenames
  and select another file. The existing worker's existing `:files` request now
  accepts an optional `:paths-only` mode. Only native completion requests it;
  normal tool calls still receive formatted text. The response is a validated
  list of strings decoded with reader evaluation disabled. No separate worker
  operation or search adapter is retained. Native filesystem candidates also
  preserve literal backslashes and wildcard characters on Unix.
- **Keep Shift-Tab reasoning.** Upstream's `:complete-previous` handling cycles
  completion or recalled follow-ups, not reasoning. Its
  [`/effort` command](https://github.com/lambda-symbolics/autolith/blob/v0.55.0/src/application/commands.lisp)
  still accepts absolute levels only. Retain relative `/effort next`, resolved
  at execution time so repeated busy presses do not reuse a stale target.
- **Remove obsolete test-runner edits.** Upstream removed `run-terminal-tests`
  in favour of its FiveAM catalog. The patches no longer resurrect that aggregate
  runner; local cases stay in `tests/test-suites.lisp`.
- **Adapt retained API calls.** v0.54.0 replaced configuration readers and
  preference-state accessors with `config`, `configuration-copy`, and
  `preferences-load-values`. Both source patches and `init.lisp` use those APIs.
- **Keep the Nix skill-link override.** Upstream adds `~/.agents/skills` as a
  discovery root, but does not admit arbitrary Nix store targets linked from
  the user skill directory. Its pinned `cl-skills`
  [`3c219ae`](https://github.com/lambda-symbolics/cl-skills/blob/3c219ae44379a1891bbd8f374692763cae9215f8/src/discovery.lisp)
  still rejects directories outside all configured canonical roots.
  The override admits only store targets reached through the configured
  Autolith user skill root; it does not grant access to all of `/nix/store`.
- **Do not restore the old dependency override.** Both upstream `nix/package.nix`
  and `qlfile.lock` pin `cl-skills` to `3c219ae`. The mismatch fixed in v0.50.0
  remains fixed.

## Packaged source patches

`pkgs/autolith/package.nix` applies these patches in order to Autolith **v0.55.0**:

1. `inline-file-context.patch`: use native `@` path completion. File selection
   captures exact UTF-8 contents; the editor keeps upstream's path insertion,
   without the old custom `@"quoted token"` syntax. The submission carries the
   snapshot separately from the draft. Limits are 128 KiB per file and 256 KiB
   per submission. Missing, non-regular, invalid UTF-8, oversized, or escaping
   files produce a notice without replacing the draft.
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

### Snapshot lifecycle and limits

The two patches separate snapshot handling from reasoning cycling:

- Shift-Tab calculated an absolute effort on the input thread. Repeated presses
  during a turn queued the same value. The command now resolves `next` when it runs.
- Search uses upstream's synchronous path provider. There is deliberately no
  local scheduler to hide search latency. The selected file read is synchronous
  too, but bounded. Native runtime rebinding supplies the current completion root.
- Preview cycling starts from the original draft's snapshots, so moving through
  candidates does not accumulate hidden attachments. Enter commits the already
  captured snapshot rather than rereading a file that changed during selection.
  Escape on passive suggestions leaves attachments unchanged. Cancelling a
  preview restores its saved attachments without overwriting the history draft's
  stash. Snapshot pruning uses upstream's path-token boundary rule, including
  apostrophes, rather than maintaining a second delimiter list.
- Exact native search paths and filesystem names survive selection, including
  spaces, brackets, quotes, backslashes, and literal wildcard characters.
- The inline patch matched attachment history by text. The old Shift-Tab patch
  changed this to a parallel index, but did not preserve saved draft attachments.
  History now tracks exact entries and the saved draft. Submission and history
  use the same pruned attachments.
- Snapshots are pruned when their exact visible path leaves the draft. Merely
  typing a path does not read a file. Pending input serializes the captured data;
  conversation replay uses it even after the original file changes or disappears.
- Upstream inserts raw paths, not shell or Lisp string literals. Completion does
  not promise language-specific escaping. Review filenames containing quotes or
  backslashes before using the draft as executable Lisp or a shell command.

Validation covers the native path-completion tests, snapshot selection and
cancellation, exact filenames through the real existing worker, unchanged default
tool output, history, bounds, pending serialization, conversation replay, and
reasoning priority. Terminal cases are registered in the committed FiveAM catalog;
the conversation snapshot helpers also run from the conversation persistence case.

On x86_64-linux, `nix build .#autolith --no-link`, `nix flake check`, and
`git diff --check` pass. The packaged runtime passed **49 focused cases and
761 checks** across terminal, fullscreen, snapshot replay, and effort switching.
Both patches apply in order with zero fuzz. Other platforms and the full upstream
test suite were not run; flake check reports incompatible systems as omitted.

An isolated packaged-runtime skill test also confirmed that upstream rejects a
Home Manager-style link to a real `/nix/store` skill directory. Loading the
committed `init.lisp` discovers it exactly once, preserves its logical user-root
pathname, and permits fresh instruction reads. An unrelated non-store symlink
target remains rejected.

The full v0.55.0 suite has not been run. Historically, the full upstream suites
had separate environment failures on the unmodified
v0.47.1 package: application approval classification in the worker environment,
and a clean-child conversation test whose registry setting conflicts with the Nix
SBCL wrapper. The focused suites above pass without changing those tests.

## Local Lisp patches

Store tested live fixes in `pkgs/autolith/init.lisp`. Home Manager installs this
file as `~/.config/autolith/init.lisp`, which Autolith loads at startup. Commit
this source and its documentation rather than a saved core or private replay script.

The current Autolith 0.55.0 override accepts Nix store targets reached through
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
