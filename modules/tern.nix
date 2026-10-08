{ config, lib, pkgs, ... }:

let
  cfg = config.programs.tern;
in
{
  options.programs.tern = {
    enable = lib.mkEnableOption "Tern app";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/tern { };
      description = "The Tern package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
