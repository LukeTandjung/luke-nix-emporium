{ config, lib, pkgs, ... }:

let
  cfg = config.programs.pi;
  jsonFormat = pkgs.formats.json { };
  pathOrLines = lib.types.either lib.types.path lib.types.lines;

  skillsDir = ../pkgs/agent-skills;
  promptsDir = ../pkgs/pi/prompts;
  extensionsDir = ../pkgs/pi/extensions;
  contextDir = ../pkgs/pi/context;

  quintToolchain = pkgs.callPackage ../pkgs/quint-toolchain { };
  agentBrowser = pkgs.callPackage ../pkgs/agent-browser { };

  defaultSkills = lib.mapAttrs
    (name: _: skillsDir + "/${name}")
    (lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir));

  defaultPrompts = lib.mapAttrs
    (name: _: promptsDir + "/${name}/PROMPT.md")
    (lib.filterAttrs (_: type: type == "directory") (builtins.readDir promptsDir));

  defaultExtensions = lib.mapAttrs
    (name: type:
      let
        extensionPath = extensionsDir + "/${name}";
        packagePath = extensionPath + "/package.nix";
      in
      if type == "directory" then pkgs.callPackage packagePath { } else extensionPath)
    (lib.filterAttrs
      (name: type:
        type == "regular"
        || (type == "directory" && builtins.pathExists (extensionsDir + "/${name}/package.nix")))
      (builtins.readDir extensionsDir));

  mcpConfig = cfg.mcp.extraConfig
    // lib.optionalAttrs (cfg.mcp.servers != { }) { mcpServers = cfg.mcp.servers; };

  # Moves host-provided dependencies (typebox, @earendil-works/*) from
  # dependencies to peerDependencies with a "*" range in installed extension
  # packages. Installed copies of host modules create duplicate runtime
  # instances, which the extension loader reports as warnings.
  extensionPeerDepPatch = pkgs.writeText "pi-extension-peer-dependencies.mjs" ''
    import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
    import { join } from "node:path";

    const root = join(process.env.HOME, ".pi", "agent", "npm", "node_modules");
    if (!existsSync(root)) process.exit(0);

    const hostProvided = (name) => name === "typebox" || name.startsWith("@earendil-works/");

    const topLevel = readdirSync(root);
    const packages = [
      ...topLevel.filter((entry) => !entry.startsWith("@")),
      ...topLevel
        .filter((entry) => entry.startsWith("@"))
        .flatMap((scope) => readdirSync(join(root, scope)).map((name) => scope + "/" + name)),
    ];

    for (const pkg of packages) {
      const manifestPath = join(root, pkg, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const dependencies = manifest.dependencies;
      if (!dependencies) continue;
      let changed = false;
      for (const name of Object.keys(dependencies)) {
        if (hostProvided(name)) {
          delete dependencies[name];
          manifest.peerDependencies = { ...(manifest.peerDependencies ?? {}), [name]: "*" };
          changed = true;
        }
      }
      if (changed) {
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
        console.log("normalized peer dependencies in " + pkg);
      }
    }
  '';

  # Bare "typebox" (v1.x) is a dependency of the Nix-packaged pi but may not be
  # available when a third-party pi binary (e.g. Architect's bundled copy) loads
  # extensions from ~/.pi/agent/extensions/.  Symlinking the package into a
  # node_modules directory next to the extensions ensures Node resolution finds it
  # regardless of which pi binary is in use.
  typebox = cfg.package + "/lib/pi-mono/node_modules/typebox";
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
        See https://github.com/badlogic/pi-mono for available options.
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

    mcp = {
      enable = lib.mkEnableOption "MCP support through the built-in mcp extension";

      servers = lib.mkOption {
        type = jsonFormat.type;
        default = { };
        description = ''
          MCP servers written under `mcpServers` in `~/.pi/agent/mcp.json`, consumed by
          pi's built-in `mcp` extension. Keep third-party MCP extensions such as
          pi-mcp-adapter out of `settings.packages`; two MCP extensions cannot both
          register `/mcp`.
        '';
        example = lib.literalExpression ''
          {
            chrome-devtools = {
              command = "npx";
              args = [ "-y" "chrome-devtools-mcp@latest" ];
            };
          }
        '';
      };

      extraConfig = lib.mkOption {
        type = jsonFormat.type;
        default = { };
        description = "Additional raw configuration merged into `~/.pi/agent/mcp.json`.";
      };
    };

    skills = lib.mkOption {
      type = lib.types.attrsOf pathOrLines;
      default = defaultSkills;
      description = ''
        Skills to install. Each key is a skill name, and the value is either
        a skill directory, a path to a SKILL.md file, or its content as a
        multi-line string. Skill directories are linked in full so references,
        scripts, and assets remain available. Written beneath
        {file}`~/.pi/agent/skills/<name>`.
      '';
      example = lib.literalExpression ''
        {
          my-skill = '''
            # My Skill
            Description of what this skill does.
          ''';
          imported-skill = ./skills/other-skill;
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
        is a path to the extension file (.ts) or a directory with a Pi extension entrypoint.
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
    # Remove the backup left when this skill changed from an unmanaged directory
    # to a Home Manager-managed symlink. Pi scans backup directories as skills.
    home.activation.removeStalePiSkillBackups = lib.hm.dag.entryBefore [ "checkLinkTargets" ] ''
      rm -rf "$HOME/.pi/agent/skills/feature-formal-planning.hm-backup"
    '';

    # Keep the formal-planning toolchain private to the user's Home Manager
    # profile. The JRE is explicit so Apalache and `java` both work in pi
    # sessions without a system-wide Java installation.
    home.packages = [
      cfg.package
      quintToolchain
      agentBrowser
      pkgs.temurin-jre-bin-17
    ];

    home.file = lib.mergeAttrsList [
      (lib.optionalAttrs (cfg.settings != { }) {
        ".pi/agent/settings.json".source = jsonFormat.generate "settings.json" cfg.settings;
      })

      (lib.optionalAttrs (mcpConfig != { }) {
        ".pi/agent/mcp.json".source = jsonFormat.generate "mcp.json" mcpConfig;
      })

      (lib.mapAttrs' (name: value:
        if builtins.isString value && !builtins.pathExists value then
          lib.nameValuePair ".pi/agent/skills/${name}/SKILL.md" { text = value; }
        else if builtins.pathExists (value + "/SKILL.md") then
          lib.nameValuePair ".pi/agent/skills/${name}" {
            source = value;
            force = true;
          }
        else
          lib.nameValuePair ".pi/agent/skills/${name}/SKILL.md" { source = value; }
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

      {
        ".pi/agent/extensions/node_modules/typebox".source = typebox;
      }

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

    # Keep npm extension packages current after every rebuild, then normalize
    # their manifests. Best effort: an offline rebuild must not fail because
    # of this step.
    home.activation.updatePiExtensions = lib.hm.dag.entryAfter [ "checkLinkTargets" ] ''
      export PATH="${pkgs.nodejs}/bin:$PATH"
      if ! "${cfg.package}/bin/pi" update --extensions >"$HOME/.pi/agent/extensions-update.log" 2>&1; then
        echo "warning: pi extension update failed; see $HOME/.pi/agent/extensions-update.log" >&2
      fi
      "${pkgs.nodejs}/bin/node" ${extensionPeerDepPatch}
    '';
  };
}
