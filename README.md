# Luke's Nix Packages

A personal collection of Nix flake packages for software not yet available in nixpkgs.

## Packages

| Package | Description |
|---------|-------------|
| [Autolith](docs/AUTOLITH.md) | Live Common Lisp agent with shared skills, document conversion, and OCR |
| bookokrat | Terminal EPUB/PDF/DJVU reader with Vim-style workflows |
| claude_code | Agentic coding tool for the terminal |
| claude_desktop | Claude Desktop app for Linux |
| [delta](docs/DELTA.md) | Zed's Delta agent harness, packaged from local binary archives |
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
    inputs.luke-pkgs.packages.${pkgs.system}.autolith
    inputs.luke-pkgs.packages.${pkgs.system}.bookokrat
    inputs.luke-pkgs.packages.${pkgs.system}.claude_code
    inputs.luke-pkgs.packages.${pkgs.system}.claude_desktop # Linux only
    inputs.luke-pkgs.packages.${pkgs.system}.delta # Linux or Apple Silicon macOS
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

  programs.autolith.enable = true;
  programs.bookokrat.enable = true;
  programs.claude-code.enable = true; # Reuses the shared agent skills and context
  programs.claude-desktop.enable = true; # Linux only
  programs.leetgpu.enable = true;
  programs.zed-delta.enable = true; # Requires the local Delta archive; see docs/DELTA.md

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
  imports = [ inputs.luke-pkgs.homeManagerModules.bookokrat ];

  programs.bookokrat.enable = true;
}

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
