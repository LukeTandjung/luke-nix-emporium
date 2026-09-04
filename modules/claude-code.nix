{ config, lib, pkgs, ... }:

let
  cfg = config.programs.claude-code;
in
{
  config = lib.mkIf cfg.enable {
    programs.claude-code = {
      package = lib.mkDefault (pkgs.callPackage ../pkgs/claude-code { });

      mcpServers.effect-docs = {
        command = "npx";
        args = [
          "-y"
          "effect-mcp@latest"
        ];
        env = { };
        type = "stdio";
      };

      # Keep skills and agent instructions in one place for all agents.
      skills = ../pkgs/agent-skills;
      context = builtins.readFile ../pkgs/pi/context/AGENTS.md;
    };
  };
}
