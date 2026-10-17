{ config, lib, pkgs, ... }:

let
  cfg = config.programs.claude-code;
  sharedMcp = import ../pkgs/agent-mcp {
    inherit lib pkgs;
    servers = config.programs.agent-mcp.servers;
  };
in
{
  imports = [ ./agent-mcp.nix ];

  config = lib.mkIf cfg.enable {
    home.packages = [ (pkgs.callPackage ../pkgs/effect-solutions { }) ]
      ++ sharedMcp.packagesFor "claude-code";

    programs.claude-code = {
      package = lib.mkDefault (pkgs.callPackage ../pkgs/claude-code { });

      mcpServers = lib.mapAttrs (_: lib.mkDefault) (sharedMcp.jsonFor "claude-code");

      # Keep skills and agent instructions in one place for all agents.
      skills = ../pkgs/agent-skills;
      context = builtins.readFile ../pkgs/pi/context/AGENTS.md;
    };
  };
}
