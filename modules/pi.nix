{ config, lib, pkgs, ... }:

let
  cfg = config.programs.pi;
  jsonFormat = pkgs.formats.json { };
  pathOrLines = lib.types.either lib.types.path lib.types.lines;

  skillsDir = ../pkgs/pi/skills;
  promptsDir = ../pkgs/pi/prompts;
  extensionsDir = ../pkgs/pi/extensions;
  contextDir = ../pkgs/pi/context;

  defaultSkills = lib.mapAttrs
    (name: _: skillsDir + "/${name}/SKILL.md")
    (lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir));

  defaultPrompts = lib.mapAttrs
    (name: _: promptsDir + "/${name}/PROMPT.md")
    (lib.filterAttrs (_: type: type == "directory") (builtins.readDir promptsDir));

  defaultExtensions = lib.mapAttrs
    (name: _: extensionsDir + "/${name}")
    (lib.filterAttrs (_: type: type == "regular") (builtins.readDir extensionsDir));
in
{
  options.programs.pi = {
    enable = lib.mkEnableOption "pi coding agent";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/pi { };
      description = "The pi package to use.";
    };

    settings = lib.mkOption {
      type = jsonFormat.type;
      default = { };
      description = ''
        Configuration written to {file}`~/.pi/agent/settings.json`.
        See https://github.com/LukeTandjung/pi-mono for available options.
      '';
      example = lib.literalExpression ''
        {
          defaultProvider = "anthropic";
          defaultModel = "claude-sonnet-4-20250514";
          defaultThinkingLevel = "medium";
          theme = "dark";
          compaction = {
            enabled = true;
            reserveTokens = 16384;
            keepRecentTokens = 20000;
          };
          retry = {
            enabled = true;
            maxRetries = 3;
          };
        }
      '';
    };

    skills = lib.mkOption {
      type = lib.types.attrsOf pathOrLines;
      default = defaultSkills;
      description = ''
        Skills to install. Each key is a skill name, and the value is either
        a path to a SKILL.md file or its content as a multi-line string.
        Written to {file}`~/.pi/agent/skills/<name>/SKILL.md`.
      '';
      example = lib.literalExpression ''
        {
          my-skill = '''
            # My Skill
            Description of what this skill does.
          ''';
          imported-skill = ./skills/other-skill/SKILL.md;
        }
      '';
    };

    prompts = lib.mkOption {
      type = lib.types.attrsOf pathOrLines;
      default = defaultPrompts;
      description = ''
        Prompt templates to install. Each key is a prompt name, and the value
        is either a path to a PROMPT.md file or its content as a multi-line string.
        Written to {file}`~/.pi/agent/prompts/<name>/PROMPT.md`.
      '';
      example = lib.literalExpression ''
        {
          review = '''
            Review the current PR and suggest improvements.
          ''';
          my-prompt = ./prompts/my-prompt/PROMPT.md;
        }
      '';
    };

    extensions = lib.mkOption {
      type = lib.types.attrsOf lib.types.path;
      default = defaultExtensions;
      description = ''
        Extensions to install. Each key is an extension name, and the value
        is a path to the extension file (.ts).
        Linked to {file}`~/.pi/agent/extensions/<name>`.
      '';
      example = lib.literalExpression ''
        {
          "my-extension.ts" = ./extensions/my-extension.ts;
        }
      '';
    };

    context = {
      agents = lib.mkOption {
        type = lib.types.nullOr lib.types.lines;
        default = builtins.readFile (contextDir + "/AGENTS.md");
        description = ''
          Content for {file}`~/.pi/agent/AGENTS.md`.
          Project-level instructions for the agent.
        '';
        example = ''
          # Project Instructions
          Always use conventional commits.
        '';
      };

      systemPrompt = lib.mkOption {
        type = lib.types.nullOr lib.types.lines;
        default = null;
        description = ''
          Content for {file}`~/.pi/agent/SYSTEM.md`.
          Replaces the default system prompt entirely.
        '';
      };

      appendSystemPrompt = lib.mkOption {
        type = lib.types.nullOr lib.types.lines;
        default = null;
        description = ''
          Content for {file}`~/.pi/agent/APPEND_SYSTEM.md`.
          Appended to the default system prompt.
        '';
      };
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    home.file = lib.mergeAttrsList [
      (lib.optionalAttrs (cfg.settings != { }) {
        ".pi/agent/settings.json".source = jsonFormat.generate "settings.json" cfg.settings;
      })

      (lib.mapAttrs' (name: value:
        lib.nameValuePair ".pi/agent/skills/${name}/SKILL.md" (
          if builtins.isString value
          then { text = value; }
          else { source = value; }
        )
      ) cfg.skills)

      (lib.mapAttrs' (name: value:
        lib.nameValuePair ".pi/agent/prompts/${name}/PROMPT.md" (
          if builtins.isString value
          then { text = value; }
          else { source = value; }
        )
      ) cfg.prompts)

      (lib.mapAttrs' (name: value:
        lib.nameValuePair ".pi/agent/extensions/${name}" { source = value; }
      ) cfg.extensions)

      (lib.optionalAttrs (cfg.context.agents != null) {
        ".pi/agent/AGENTS.md".text = cfg.context.agents;
      })

      (lib.optionalAttrs (cfg.context.systemPrompt != null) {
        ".pi/agent/SYSTEM.md".text = cfg.context.systemPrompt;
      })

      (lib.optionalAttrs (cfg.context.appendSystemPrompt != null) {
        ".pi/agent/APPEND_SYSTEM.md".text = cfg.context.appendSystemPrompt;
      })
    ];
  };
}
