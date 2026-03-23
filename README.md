# Luke's Nix Packages

A personal collection of Nix flake packages for software not yet available in nixpkgs.

## Packages

| Package | Description |
|---------|-------------|
| [LeetGPU CLI](docs/LEETGPU.md) | CLI tool for [LeetGPU](https://leetgpu.com), a platform for GPU programming challenges |

## Usage

Add this flake to your inputs:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    luke-pkgs.url = "github:LukeTandjung/leetgpu_cli_nix";
  };
}
```

Then use any package:

```nix
{ inputs, pkgs, ... }:
{
  home.packages = [
    inputs.luke-pkgs.packages.${pkgs.system}.leetgpu_cli
  ];
}
```

## License

Each package may have its own license. See the individual package documentation for details.
