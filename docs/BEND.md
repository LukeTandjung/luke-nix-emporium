# Bend 2

The `bend` package installs Bend 2.0.25 from the release archives pinned in
upstream's `install.sh`, with a SHA-256 checksum for each platform:
`aarch64-darwin`, `x86_64-darwin`, `aarch64-linux`, and `x86_64-linux`.
This is Bend 2, not the older Bend 0.x package.

## Usage

```sh
nix run github:LukeTandjung/luke-nix-emporium#bend -- guide
```

Or use the Home Manager module:

```nix
{
  imports = [ inputs.luke-pkgs.homeManagerModules.bend ];
  programs.bend.enable = true;
}
```

The module also belongs to `homeManagerModules.default`. Override
`programs.bend.package` to use a different derivation.

The package includes the base library, effect implementations, and guides. It
provides Clang on Bend's fallback PATH for native compilation. GPU builds and
programs using graphics or audio may need additional platform SDKs, drivers,
or libraries in a development shell; these are not bundled with Bend.

Telemetry/version checks are disabled. `bend update` is blocked because it
runs upstream's shell installer outside Nix. Upgrade the pinned package and
rebuild your configuration instead.

## Agent skill

The shared `bend` skill is discovered by the existing Pi, Claude Code, Autolith,
and Delta skill integrations. Enable your agent's shared skills as usual; the
skill does not install the compiler by itself.

When using Bend:

- Run `bend guide` to learn it.
- Use `LAWS.bend` to keep important rules.
- Run `bend PROOF.bend` before committing.
- Parallelize the code whenever possible.

## Validation

`nix build .#bend` runs install checks for the version, guide, base library,
interpreted execution, native compilation and execution, and the blocked
self-update command. The checks also ensure no `~/.bend` state is created.
