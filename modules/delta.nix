{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.programs.zed-delta;
in
{
  options.programs.zed-delta = {
    enable = lib.mkEnableOption "Zed's Delta agent harness";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/delta { };
      description = "The Zed Delta package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
