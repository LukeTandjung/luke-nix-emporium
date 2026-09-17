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
    context.enable = lib.mkEnableOption "shared personal AGENTS.md instructions for Delta";
  };

  config = {
    # Delta reads AGENT.md before AGENTS.md; use the preferred name so an
    # existing fallback AGENTS.md cannot silently shadow the shared rules.
    home.file = lib.mkMerge [
      (lib.mkIf cfg.context.enable {
        ".config/delta/AGENT.md".source = ../pkgs/pi/context/AGENTS.md;
      })

      # Match Pi's per-skill sources so its realpath-based discovery deduplicates
      # skills visible through both ~/.pi/agent/skills and ~/.agents/skills.
      (lib.mkIf cfg.skills.enable (
        lib.mapAttrs'
          (name: _: lib.nameValuePair ".agents/skills/${name}" {
            source = ../pkgs/agent-skills + "/${name}";
          })
          (lib.filterAttrs (_: type: type == "directory")
            (builtins.readDir ../pkgs/agent-skills))
      ))
    ];
  };
}
