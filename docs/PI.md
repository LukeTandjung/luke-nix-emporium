# Pi Coding Agent Nix Flake

A Nix flake for installing [pi](https://github.com/badlogic/pi-mono), a terminal-based coding agent with multi-model support.

## Features

- Pre-built npm package from the official registry
- Home Manager module with declarative configuration
- Manages settings, skills, prompts, extensions, and context files

## Usage

### As a Home Manager Module

1. Add this flake to your configuration's inputs:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager.url = "github:nix-community/home-manager";
    luke-pkgs.url = "github:LukeTandjung/luke-nix-emporium";
  };
}
```

2. Import the module in your Home Manager configuration:

```nix
{ inputs, ... }:
{
  imports = [ inputs.luke-pkgs.homeManagerModules.pi ];

  programs.pi = {
    enable = true;
    settings = {
      defaultProvider = "anthropic";
      defaultModel = "claude-sonnet-4-20250514";
      defaultThinkingLevel = "medium";
      theme = "dark";
    };
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

```nix
{ inputs, pkgs, ... }:
{
  home.packages = [
    inputs.luke-pkgs.packages.${pkgs.system}.pi
  ];
}
```

### Try Without Installing

```bash
nix run github:LukeTandjung/luke-nix-emporium#pi -- --help
```

## Supported Systems

- `x86_64-linux`
- `aarch64-linux`
- `x86_64-darwin` (macOS Intel)
- `aarch64-darwin` (macOS Apple Silicon)

## Configuration Options

### `programs.pi.enable`

Type: `boolean` | Default: `false`

Whether to enable the pi coding agent.

### `programs.pi.package`

Type: `package` | Default: built-in pi package

The pi package to use.

### `programs.pi.settings`

Type: `attrs` | Default: `{ }`

Configuration written to `~/.pi/agent/settings.json`. See [pi-mono](https://github.com/badlogic/pi-mono) for available options.

```nix
settings = {
  defaultProvider = "anthropic";
  defaultModel = "claude-sonnet-4-20250514";
  defaultThinkingLevel = "medium";
  theme = "dark";
  compaction = {
    enabled = true;
    reserveTokens = 16384;
    keepRecentTokens = 20000;
  };
  retry = {
    enabled = true;
    maxRetries = 3;
  };
};
```

### `programs.pi.skills`

Type: `attrsOf (either path lines)` | Default: `{ }`

Skills to install. Each key is a skill name, and the value is either a path to a `SKILL.md` file or its content as a string. Written to `~/.pi/agent/skills/<name>/SKILL.md`.

```nix
skills = {
  my-skill = ''
    # My Skill
    Description of what this skill does.
  '';
  imported-skill = ./skills/other-skill/SKILL.md;
};
```

### `programs.pi.prompts`

Type: `attrsOf (either path lines)` | Default: `{ }`

Prompt templates to install. Each key is a prompt name, and the value is either a path to a `PROMPT.md` file or its content as a string. Written to `~/.pi/agent/prompts/<name>/PROMPT.md`.

```nix
prompts = {
  review = ''
    Review the current PR and suggest improvements.
  '';
  my-prompt = ./prompts/my-prompt/PROMPT.md;
};
```

### `programs.pi.extensions`

Type: `attrsOf path` | Default: `{ }`

Extensions to install. Each key is an extension name, and the value is a path to the extension file (`.ts`). Linked to `~/.pi/agent/extensions/<name>`.

```nix
extensions = {
  "my-extension.ts" = ./extensions/my-extension.ts;
};
```

### `programs.pi.context.agents`

Type: `null or lines` | Default: `null`

Content for `~/.pi/agent/AGENTS.md`. Project-level instructions for the agent.

### `programs.pi.context.systemPrompt`

Type: `null or lines` | Default: `null`

Content for `~/.pi/agent/SYSTEM.md`. Replaces the default system prompt entirely.

### `programs.pi.context.appendSystemPrompt`

Type: `null or lines` | Default: `null`

Content for `~/.pi/agent/APPEND_SYSTEM.md`. Appended to the default system prompt.

## License

Pi is licensed under the MIT License. See [pi-mono](https://github.com/badlogic/pi-mono) for details.
