# Packaging fancy-cat into Nix

## fancy-cat Overview

fancy-cat is a terminal PDF viewer written in Zig that renders PDFs using the Kitty image protocol. Works in Kitty, Ghostty, and WezTerm. The upstream repo is at github.com/freref/fancy-cat.

## Why the existing nixpkgs package is broken

The package at `pkgs/by-name/fa/fancy-cat/package.nix` in nixpkgs is marked broken because Zig's build system tries to fetch dependencies from GitHub during the build phase. Nix's sandbox blocks all network access during builds. The nixpkgs version is also outdated (v0.4.0, Zig 0.14) while upstream now requires Zig 0.15.2.

## How Ghostty solves the Zig-in-Nix problem

Ghostty (github.com/ghostty-org/ghostty) uses a three-layer approach:

### 1. `zon2nix` generates `build.zig.zon.nix`

The `zon2nix` tool (github.com/jcollie/zon2nix) reads `build.zig.zon` and generates a Nix file with `fetchurl`/`fetchgit` calls for every Zig dependency. The output is a `linkFarm` — a flat directory of symlinks to pre-fetched packages in the Nix store.

It defines helper functions:
- `fetchZig` — downloads HTTP tarballs via `fetchurl`, unpacks with `zig fetch --global-cache-dir`
- `fetchGitZig` — clones git repos via `fetchgit` for `git+https://` deps
- `fetchZigArtifact` — routes to the correct fetcher based on URL protocol
- `unpackZigArtifact` — runs `zig fetch` in `runCommandLocal` to unpack into correct Zig cache layout

Each dependency has a content-addressed name (the Zig package hash), a human-readable name, a URL, and a SHA256 hash.

### 2. `--system` flag (Zig 0.15+)

Zig 0.15 supports `--system <path>` which tells the build system to use a local directory as its package cache instead of fetching from the network. This completely bypasses network access during the build.

### 3. Wiring in `package.nix`

```nix
deps = callPackage ../build.zig.zon.nix { name = "ghostty-cache-${finalAttrs.version}"; };

zigBuildFlags = [
  "--system"
  "${finalAttrs.deps}"
];
```

### Key Ghostty files for reference
- `flake.nix` — ghostty-org/ghostty/blob/main/flake.nix
- `build.zig.zon.nix` — ghostty-org/ghostty/blob/main/build.zig.zon.nix
- `nix/package.nix` — ghostty-org/ghostty/blob/main/nix/package.nix
- `nix/build-support/check-zig-cache.sh` — regenerates dep manifests from `build.zig.zon`

## Steps to package fancy-cat

1. **Clone fancy-cat** and check its `build.zig.zon` for dependencies
2. **Run `zon2nix`** on it to generate `build.zig.zon.nix` with all prefetched deps
3. **Write `default.nix`** using the Zig hook with:
   - Source fetched via `fetchFromGitHub`
   - Deps from the generated `build.zig.zon.nix` linkFarm
   - `--system "${deps}"` in build flags
   - Native dependencies: mupdf, harfbuzz, freetype, jbig2dec, libjpeg, openjpeg, gumbo, mujs, libz
4. **Wire it into flake.nix** alongside existing packages (leetgpu_cli, pi)
