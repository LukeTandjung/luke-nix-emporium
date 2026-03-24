{ config, lib, pkgs, ... }:

let
  cfg = config.programs.leetgpu;
in
{
  options.programs.leetgpu = {
    enable = lib.mkEnableOption "LeetGPU CLI";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/leetgpu-cli { };
      description = "The leetgpu package to use";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
