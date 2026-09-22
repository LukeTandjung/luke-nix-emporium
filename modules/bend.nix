{ config, lib, pkgs, ... }:

let
  cfg = config.programs.bend;
in
{
  options.programs.bend = {
    enable = lib.mkEnableOption "Bend 2";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/bend { };
      description = "The Bend 2 package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
