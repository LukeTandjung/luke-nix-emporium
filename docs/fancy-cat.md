# fancy-cat Nix Flake

A Nix flake for installing [fancy-cat](https://github.com/freref/fancy-cat), a terminal PDF viewer written in Zig that renders PDFs using the Kitty image protocol. Works in Kitty, Ghostty, and WezTerm.

## Features

- Built from source using Zig 0.15 with prefetched dependencies via `zon2nix`
- Bypasses Nix sandbox network restrictions using Zig's `--system` flag
- Fixes the broken nixpkgs package by using up-to-date source and proper dependency handling

## Usage

### Direct Package Installation

```nix
{ inputs, pkgs, ... }:
{
  home.packages = [
    inputs.luke-pkgs.packages.${pkgs.system}.fancy-cat
  ];
}
```

### Try Without Installing

```bash
nix run github:LukeTandjung/luke-nix-emporium#fancy-cat -- --help
```

### Development Shell

```bash
nix shell github:LukeTandjung/luke-nix-emporium#fancy-cat
fancy-cat document.pdf
```

## Supported Systems

All platforms supported by the Zig toolchain, including:

- `x86_64-linux`
- `aarch64-linux`
- `x86_64-darwin` (macOS Intel)
- `aarch64-darwin` (macOS Apple Silicon)

## How It Works

The nixpkgs package for fancy-cat is marked broken because Zig's build system tries to fetch dependencies during the build phase, which Nix's sandbox blocks. This flake solves that using the same approach as [Ghostty](https://github.com/ghostty-org/ghostty):

1. **`zon2nix`** reads `build.zig.zon` and generates `build.zig.zon.nix` with prefetched dependencies as a `linkFarm`
2. **`--system` flag** (Zig 0.15+) tells the build system to use the local dependency cache instead of fetching from the network
3. **`default.nix`** wires the prefetched deps into the Zig build via `zigBuildFlags`

## License

fancy-cat is licensed under the AGPL-3.0 License. See [fancy-cat](https://github.com/freref/fancy-cat) for details.
