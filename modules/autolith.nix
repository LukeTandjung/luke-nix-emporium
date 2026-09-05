{ autolith }:
{ config, lib, pkgs, ... }:

let
  cfg = config.programs.autolith;
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
  paddleOcrPackage = cfg.paddleOcr.package;
  documentPackage = cfg.document.package;
  mcpEnabled = cfg.paddleOcr.enable || cfg.document.enable;
  mcpConfig = import ../pkgs/autolith/mcp.nix {
    inherit lib;
    paddleOcrPackage = if cfg.paddleOcr.enable then paddleOcrPackage else null;
    paddleOcrApproval = cfg.paddleOcr.approval;
    endpointEnvironmentVariable = cfg.paddleOcr.endpointEnvironmentVariable;
    documentPackage = if cfg.document.enable then documentPackage else null;
    documentApproval = cfg.document.approval;
  };
  fileValue = value:
    if builtins.isPath value
    then { source = value; }
    else { text = value; };
in
{
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

    document = {
      enable = lib.mkEnableOption "the MarkItDown document conversion MCP tool" // {
        default = true;
      };

      package = lib.mkOption {
        type = lib.types.package;
        default = pkgs.callPackage ../pkgs/markitdown-mcp { };
        description = "The Microsoft MarkItDown MCP server package.";
      };

      approval = lib.mkOption {
        type = approvalType;
        default = "prompt";
        description = "Autolith approval policy for the MarkItDown MCP server.";
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
      ++ lib.optional cfg.paddleOcr.enable paddleOcrPackage
      ++ lib.optional cfg.document.enable documentPackage;

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
