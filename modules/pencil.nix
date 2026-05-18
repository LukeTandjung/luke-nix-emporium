{ config, lib, pkgs, ... }:

let
  cfg = config.programs.pencil;
in
{
  options.programs.pencil = {
    enable = lib.mkEnableOption "Pencil desktop app";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/pencil { };
      description = "The Pencil package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
