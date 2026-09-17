{
  config,
  lib,
  ...
}:

let
  cfg = config.programs.zed-delta;
in
{
  options.programs.zed-delta = {
    skills.enable = lib.mkEnableOption "shared personal skills for Delta, without installing the app";
  };

  config = {
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
