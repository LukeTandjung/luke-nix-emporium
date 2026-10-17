{ autolith }:
{ config, lib, pkgs, ... }:

let
  cfg = config.programs.autolith;
  sharedMcp = import ../pkgs/agent-mcp {
    inherit lib pkgs;
    servers = config.programs.agent-mcp.servers;
  };
  pathOrLines = lib.types.either lib.types.path lib.types.lines;
  approvalType = lib.types.enum [ "prompt" "read-only" "allow" "deny" ];
  skillsDir = ../pkgs/agent-skills;
  defaultSkills = lib.mapAttrs
    (name: _: skillsDir + "/${name}")
    (lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir));
  defaultPackage =
    if builtins.hasAttr pkgs.system autolith.packages
    then import ../pkgs/autolith/package.nix {
      inherit pkgs;
      autolithSource = autolith;
    }
    else throw "Autolith does not provide a package for ${pkgs.system}";
  quintToolchain = pkgs.callPackage ../pkgs/quint-toolchain { };
  mcpEnabled = sharedMcp.forClient "autolith" != { };
  mcpConfig = import ../pkgs/autolith/mcp.nix {
    inherit lib;
    extraServers = sharedMcp.autolithServers;
  };
  fileValue = value:
    if builtins.isPath value
    then { source = value; }
    else { text = value; };
in
{
  imports = [ ./agent-mcp.nix ];

  options.programs.autolith = {
    enable = lib.mkEnableOption "Autolith";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      description = "The Autolith package to install.";
    };

    init = lib.mkOption {
      type = lib.types.nullOr pathOrLines;
      default = ../pkgs/autolith/init.lisp;
      description = "Global executable Autolith initialization source.";
    };

    skills = lib.mkOption {
      type = lib.types.attrsOf pathOrLines;
      default = defaultSkills;
      description = "Autolith skills installed below the global skill root.";
    };

    agents = lib.mkOption {
      type = lib.types.attrsOf pathOrLines;
      default = { };
      description = "Autolith child-agent definitions installed as S-expressions.";
    };

    extraPackages = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = [
        (pkgs.callPackage ../pkgs/effect-solutions { })
        quintToolchain
        pkgs.temurin-jre-bin-17
        pkgs.poppler-utils
        pkgs.imagemagick
        pkgs.typst
      ];
      description = "Packages required by the installed Autolith skills.";
    };

    paddleOcr = {
      enable = lib.mkEnableOption "the local PaddleOCR-VL MCP tool" // {
        default = true;
      };

      package = lib.mkOption {
        type = lib.types.package;
        default = pkgs.callPackage ../pkgs/autolith-paddle-ocr-mcp { };
        description = "The PaddleOCR-VL MCP server package.";
      };

      approval = lib.mkOption {
        type = approvalType;
        default = "prompt";
        description = "Autolith approval policy for the PaddleOCR MCP server.";
      };

      endpointEnvironmentVariable = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "PADDLE_OCR_URL";
        description = "Optional parent environment variable passed to the OCR server as PADDLE_OCR_URL.";
      };
    };

  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.paddleOcr.endpointEnvironmentVariable == null
          || builtins.match "[A-Za-z_][A-Za-z0-9_]*" cfg.paddleOcr.endpointEnvironmentVariable != null;
        message = "programs.autolith.paddleOcr.endpointEnvironmentVariable must be a POSIX environment variable name";
      }
    ];

    home.packages = [ cfg.package ]
      ++ cfg.extraPackages
      ++ sharedMcp.packagesFor "autolith";

    # Keep existing PaddleOCR options working, but register the result through
    # the same catalogue as every other server. Explicit shared values win.
    programs.agent-mcp.servers.paddle-ocr = {
      enable = lib.mkDefault cfg.paddleOcr.enable;
      clients = lib.mkDefault [ "autolith" ];
      package = lib.mkDefault cfg.paddleOcr.package;
      envFrom = lib.mkDefault (lib.optionalAttrs (cfg.paddleOcr.endpointEnvironmentVariable != null) {
        PADDLE_OCR_URL = cfg.paddleOcr.endpointEnvironmentVariable;
      });
      autolith = {
        approval = lib.mkDefault cfg.paddleOcr.approval;
        startupTimeoutSeconds = lib.mkDefault 15;
        toolTimeoutSeconds = lib.mkDefault 1800;
        childTools = lib.mkDefault [ "paddle_ocr" ];
        trustedReadOnlyTools = lib.mkDefault [ "paddle_ocr" ];
      };
    };

    xdg.configFile = lib.mkMerge [
      (lib.optionalAttrs (cfg.init != null) {
        "autolith/init.lisp" = fileValue cfg.init;
      })

      (lib.mapAttrs' (name: value:
        lib.nameValuePair "autolith/skills/${name}" (
          if builtins.isPath value && builtins.pathExists (value + "/SKILL.md")
          then {
            source = value;
            recursive = true;
          }
          else {
            target = "autolith/skills/${name}/SKILL.md";
          } // fileValue value
        )
      ) cfg.skills)

      (lib.mapAttrs' (name: value:
        lib.nameValuePair "autolith/agents/${name}.sexp" (fileValue value)
      ) cfg.agents)

      (lib.optionalAttrs mcpEnabled {
        "autolith/mcp.sexp".text = mcpConfig;
      })
    ];
  };
}
