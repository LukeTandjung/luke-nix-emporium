{ config, lib, pkgs, ... }:

let
  cfg = config.programs.fancy-cat;
in
{
  options.programs.fancy-cat = {
    enable = lib.mkEnableOption "fancy-cat";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/fancy-cat { };
      description = "The fancy-cat package to use";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
