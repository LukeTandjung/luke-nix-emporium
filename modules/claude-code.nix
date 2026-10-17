{ config, lib, pkgs, ... }:

let
  cfg = config.programs.claude-code;
in
{
  config = lib.mkIf cfg.enable {
    home.packages = [ (pkgs.callPackage ../pkgs/effect-solutions { }) ];

    programs.claude-code = {
      package = lib.mkDefault (pkgs.callPackage ../pkgs/claude-code { });

      # Keep skills and agent instructions in one place for all agents.
      skills = ../pkgs/agent-skills;
      context = builtins.readFile ../pkgs/pi/context/AGENTS.md;
    };
  };
}
