{ config, lib, pkgs, ... }:

let
  cfg = config.programs.claude-desktop;
in
{
  options.programs.claude-desktop = {
    enable = lib.mkEnableOption "Claude Desktop app";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/claude-desktop { };
      description = "The Claude Desktop package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
