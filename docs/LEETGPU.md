# LeetGPU CLI Nix Flake

A Nix flake for installing the [LeetGPU CLI](https://leetgpu.com) on NixOS and other systems using Nix.

## Features

- Pre-built binaries for Linux (x86_64, aarch64) and macOS (x86_64, aarch64)
- Home Manager module with `programs.leetgpu.enable` option
- Automatic package management through Nix

## Usage

### As a Home Manager Module

1. Add this flake to your configuration's inputs:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager.url = "github:nix-community/home-manager";
    leetgpu.url = "github:LukeTandjung/leetgpu_cli_nix";
  };
}
```

2. Import the module in your Home Manager configuration:

```nix
{ inputs, ... }:
{
  imports = [ inputs.leetgpu.homeManagerModules.default ];

  programs.leetgpu = {
    enable = true;
  };
}
```

3. Rebuild your configuration:

```bash
# NixOS with Home Manager
sudo nixos-rebuild switch --flake .

# Standalone Home Manager
home-manager switch --flake .
```

### Direct Package Installation

You can also install the package directly without the module:

```nix
{ inputs, pkgs, ... }:
{
  home.packages = [
    inputs.leetgpu.packages.${pkgs.system}.leetgpu_cli
  ];
}
```

### Try Without Installing

```bash
nix run github:yourusername/leetgpu_cli_nix#leetgpu_cli -- --help
```

### Development Shell

```bash
nix shell github:yourusername/leetgpu_cli_nix#leetgpu_cli
leetgpu --help
```

## Supported Systems

- `x86_64-linux`
- `aarch64-linux`
- `x86_64-darwin` (macOS Intel)
- `aarch64-darwin` (macOS Apple Silicon)

## License

This flake packages the LeetGPU CLI, which is proprietary software. See [LeetGPU's terms](https://leetgpu.com) for details.

## Configuration Options

### `programs.leetgpu.enable`

Type: `boolean`
Default: `false`

Whether to enable the LeetGPU CLI.

### `programs.leetgpu.package`

Type: `package`
Default: `self.packages.${system}.leetgpu_cli`

The LeetGPU CLI package to use. Override this if you want to use a different version or build.

## Building from Source

This flake downloads pre-built binaries from the official LeetGPU distribution. To update the version:

1. Change the `version` variable in `flake.nix`
2. Update the SHA256 hashes for each platform
3. Run `nix flake check` to verify

To get the correct hash for a new binary:

```bash
nix-prefetch-url https://cli.leetgpu.com/dist/v1.0.0/leetgpu-linux-amd64
```
