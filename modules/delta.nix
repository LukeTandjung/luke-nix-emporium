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

    skills.enable = lib.mkEnableOption "shared personal skills for Delta, without installing the app";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/delta { };
      description = "The Zed Delta package to use.";
    };
  };

  config = {
    home.packages = lib.mkIf cfg.enable [ cfg.package ];

    # Match Pi's per-skill sources so its realpath-based discovery deduplicates
    # skills visible through both ~/.pi/agent/skills and ~/.agents/skills.
    home.file = lib.mkIf cfg.skills.enable (
      lib.mapAttrs'
        (name: _: lib.nameValuePair ".agents/skills/${name}" {
          source = ../pkgs/agent-skills + "/${name}";
        })
        (lib.filterAttrs (_: type: type == "directory")
          (builtins.readDir ../pkgs/agent-skills))
    );
  };
}
