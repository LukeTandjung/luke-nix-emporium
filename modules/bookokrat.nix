{ config, lib, pkgs, ... }:

let
  cfg = config.programs.bookokrat;
in
{
  options.programs.bookokrat = {
    enable = lib.mkEnableOption "Bookokrat";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/bookokrat { };
      description = "The bookokrat package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
