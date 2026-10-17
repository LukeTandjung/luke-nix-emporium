# Shared MCP servers

`programs.agent-mcp.servers` is the shared catalogue for Pi, Claude Code,
Autolith, and Delta. Each agent module imports it automatically. It can also be
imported as `inputs.luke-pkgs.homeManagerModules.agent-mcp`.

REA is enabled by default. Its pinned `rea-agents` package provides both `rea`
and `rea-agents`; agents launch `rea mcp` directly, without `npx` or an install
at startup. The shared reverse-engineering skill is installed separately through
the existing skills collection.

REA uses its supported `compact` input-schema profile and `off` output-schema
profile. Full discovery exceeds Autolith's JSON node budget. These settings
reduce advertised schema data, not runtime validation: REA still validates each
successful result against its canonical contract and returns structured content.
Client safety limits are unchanged.

| Client | Provisioning |
| --- | --- |
| Pi | `~/.pi/agent/mcp.json`, built-in MCP client |
| Claude Code | Home Manager's `programs.claude-code.mcpServers` |
| Autolith | `~/.config/autolith/mcp.sexp`, stdio or HTTP transport |
| Delta | CLI packages and `~/.config/agent-mcp/delta-setup.md`; no local MCP support |

Disabled agents do not install packages or write configuration. Delta's shared
CLI packages follow `programs.zed-delta.skills.enable`.

## Configure once

```nix
{ pkgs, ... }:
{
  programs.agent-mcp.servers = {
    rea = {
      clients = [ "pi" "claude-code" "autolith" "delta" ];
      # Public configuration only. Credentials belong in runtime variables.
      env.REA_MCP_INPUT_SCHEMA_PROFILE = "compact";
    };
    documentation = {
      url = "https://example.com/mcp";
      clients = [ "pi" "claude-code" "delta" ];
    };
    local-tool = {
      package = pkgs.my-mcp-server;
      # command defaults to lib.getExe package; override for a different binary.
      args = [ "serve" ];
      envFrom.API_KEY = "MY_MCP_API_KEY";
    };
  };
}
```

Replace example packages and URLs with real servers. A server needs exactly one
of `command` or `url`. Set `command = null` when attaching a package to a remote
server. `clients` defaults to all four clients. Use `enable = false` to disable a
server everywhere, or restrict `clients` to disable it in individual agents.
Pi also supports `programs.pi.mcp.enable = false` for its managed configuration.

Pi-specific `programs.pi.mcp.servers.<name>` entries replace the shared entry of
the same name. Claude Code's generated entries use `mkDefault`, so native Home
Manager overrides remain available. Shared settings remain the preferred source.

## Credentials and approvals

- `env` contains public literal values, which are stored in the Nix store.
- `envFrom` maps a child variable to a parent variable name, resolved at runtime.
- `headersFrom` maps an HTTP header to the parent variable holding its complete
  value, such as `Bearer ...`. It is HTTP-only.
- Never interpolate secret values into Nix. This module neither reads secrets
  during evaluation nor shares OAuth token stores between agents.
- Pi and Claude Code handle their own OAuth sign-in. Authenticate interactively
  after activation; a URL in the catalogue does not establish authentication.
- Autolith supports HTTP but does not provide the same MCP OAuth login flow.
  Exclude it from OAuth-only servers such as Notion.
- Autolith defaults to `autolith.approval = "prompt"`. REA includes tools that
  can mutate targets; do not mark the whole server read-only or preapprove it.
  Child tools are opt-in through `autolith.childTools`. Trusted read-only names
  are separately configured through `autolith.trustedReadOnlyTools`.

Existing `programs.autolith.paddleOcr` options register PaddleOCR in this same
catalogue, scoped to Autolith by default. Explicit shared `paddle-ocr` settings
win over those compatibility defaults. Its local OCR endpoint is not installed
or started by this module.

## REA runtime dependencies

This package installs the published CLI/MCP runtime, not every analysis engine.
Ghidra, Hopper, browser binaries, Frida, Android tools, and other backends have
separate platform, licensing, and runtime requirements. Provision only the
engines needed for a task, following REA's installation guide. Tool discovery
proves that the MCP server works; it does not prove that every analysis engine
is available. No browser or engine download runs during the Nix build.

The package uses the published compiled runtime and a production-only lockfile.
Its local `package.json` retains release metadata and dependencies while dropping
development dependencies and lifecycle scripts. When updating it, obtain the
published archive, regenerate that manifest/lockfile, recompute `npmDepsHash`,
and run the install checks plus an MCP initialize/tools-list smoke test.

## Delta limitation

Delta currently accepts only remote HTTPS MCP, added in **Settings → MCP**.
It supports OAuth or unauthenticated endpoints, not manually supplied tokens or
API keys. The generated guide is not a Delta configuration file and is never
represented as one. Local tools such as REA remain available through their CLI.
Do not expose a local server publicly merely to work around this limitation.

## Verify

```sh
nix build .#rea .#checks.x86_64-linux.agent-mcp --no-link
rea --version
pi mcp list
```

`pi mcp list` connects to every enabled server; run it only when those connections
are intended. For an isolated REA check, use a temporary Pi agent directory with
only the `rea` entry. Live OAuth, Docker daemon access, and optional analysis
engines require separate validation.

References: [REA installation](https://github.com/morluto/rea/blob/main/docs/installation.md),
[REA clients](https://github.com/morluto/rea/blob/main/docs/client-configuration.md),
[Delta MCP](https://delta.dev/docs/agents/mcp).
