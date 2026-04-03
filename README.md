# Luke's Nix Packages

A personal collection of Nix flake packages for software not yet available in nixpkgs.

## Packages

| Package | Description |
|---------|-------------|
| [LeetGPU CLI](docs/LEETGPU.md) | CLI tool for [LeetGPU](https://leetgpu.com), a platform for GPU programming challenges |
| [pi](docs/PI.md) | A terminal-based coding agent with multi-model support |
| terminal-grotesque | Terminal Grotesque typeface by Raphaël Bastide |

## Usage

Add this flake to your inputs:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    luke-pkgs.url = "github:LukeTandjung/luke-nix-emporium";
  };
}
```

### Standalone packages

```nix
{ inputs, pkgs, ... }:
{
  home.packages = [
    inputs.luke-pkgs.packages.${pkgs.system}.leetgpu_cli
    inputs.luke-pkgs.packages.${pkgs.system}.pi
    inputs.luke-pkgs.packages.${pkgs.system}.terminal_grotesque
  ];
}
```

### Home Manager modules

Import all modules at once:

```nix
{
  imports = [ inputs.luke-pkgs.homeManagerModules.default ];

  programs.leetgpu.enable = true;

  programs.pi = {
    enable = true;
    settings = {
      defaultProvider = "anthropic";
      defaultModel = "claude-sonnet-4-20250514";
    };
  };
}
```

Or import individually:

```nix
{
  imports = [ inputs.luke-pkgs.homeManagerModules.pi ];

  programs.pi = {
    enable = true;
    settings = { /* ... */ };
    skills.my-skill = ''
      # My Skill
      Description of what this skill does.
    '';
  };
}
```

## License

Each package may have its own license. See the individual package documentation for details.
