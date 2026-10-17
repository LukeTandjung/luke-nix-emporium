{ config, lib, pkgs, ... }:

let
  inherit (lib) mkOption types;
  variableName = types.strMatching "[A-Za-z_][A-Za-z0-9_]*";
  serverType = types.submodule ({ config, ... }: {
    options = {
      enable = lib.mkEnableOption "this shared MCP server" // { default = true; };
      clients = mkOption {
        type = types.listOf (types.enum [ "pi" "claude-code" "autolith" "delta" ]);
        default = [ "pi" "claude-code" "autolith" "delta" ];
        description = "Clients receiving this server or, for Delta, its CLI/setup guide.";
      };
      package = mkOption {
        type = types.nullOr types.package;
        default = null;
        description = "Optional CLI package installed for selected clients.";
      };
      command = mkOption {
        type = types.nullOr types.str;
        default = if config.package == null then null else lib.getExe config.package;
        description = "Stdio executable; mutually exclusive with url.";
      };
      args = mkOption { type = types.listOf types.str; default = [ ]; };
      url = mkOption { type = types.nullOr types.str; default = null; };
      env = mkOption {
        type = types.attrsOf types.str;
        default = { };
        description = "Public literal environment values. Never put secrets in Nix.";
      };
      envFrom = mkOption {
        type = types.attrsOf variableName;
        default = { };
        description = "Child variable to parent environment-variable name, resolved at runtime.";
      };
      headersFrom = mkOption {
        type = types.attrsOf variableName;
        default = { };
        description = "HTTP header to parent variable containing the entire header value.";
      };
      autolith = {
        childTools = mkOption { type = types.listOf types.str; default = [ ]; };
        trustedReadOnlyTools = mkOption { type = types.listOf types.str; default = [ ]; };
        approval = mkOption {
          type = types.enum [ "prompt" "read-only" "allow" "deny" ];
          default = "prompt";
        };
        startupTimeoutSeconds = mkOption { type = types.ints.positive; default = 60; };
        toolTimeoutSeconds = mkOption { type = types.ints.positive; default = 300; };
      };
    };
  });
  enabled = lib.filterAttrs (_: server: server.enable) config.programs.agent-mcp.servers;
  piNames = map (lib.replaceStrings [ "-" ] [ "_" ]) (builtins.attrNames
    (lib.filterAttrs (_: server: builtins.elem "pi" server.clients) enabled));
in
{
  options.programs.agent-mcp.servers = mkOption {
    type = types.attrsOf serverType;
    default = { };
    description = "Shared MCP catalogue, rendered into each client's supported format.";
  };

  config = {
    programs.agent-mcp.servers.rea = {
      package = lib.mkDefault (pkgs.callPackage ../pkgs/rea { });
      args = lib.mkDefault [ "mcp" ];
      # Keep discovery within Autolith\'s JSON/schema budgets. REA still validates
      # results against its canonical contracts; only advertised prose/output
      # schemas are reduced. Do not relax the client\'s safety limits.
      env.REA_MCP_INPUT_SCHEMA_PROFILE = lib.mkDefault "compact";
      env.REA_MCP_OUTPUT_SCHEMA_PROFILE = lib.mkDefault "off";
    };
    assertions = [
      {
        assertion = builtins.length piNames == builtins.length (lib.unique piNames);
        message = "Shared Pi MCP server names must remain unique after replacing hyphens with underscores.";
      }
    ] ++ lib.concatLists (lib.mapAttrsToList (name: server: [
      {
        assertion = builtins.match "[A-Za-z0-9_][A-Za-z0-9_-]*" name != null;
        message = "Shared MCP server names must contain only letters, digits, underscores, or hyphens: ${name}";
      }
      {
        assertion = (server.command != null) != (server.url != null);
        message = "Shared MCP server ${name} must specify exactly one of command or url.";
      }
      {
        assertion = (server.command == null || server.command != "")
          && (server.url == null || builtins.match "https?://.+" server.url != null);
        message = "Shared MCP server ${name} requires a nonempty command or an HTTP(S) URL.";
      }
      {
        assertion = lib.all (key: builtins.match "[A-Za-z_][A-Za-z0-9_]*" key != null)
          (builtins.attrNames (server.env // server.envFrom));
        message = "Shared MCP server ${name} has an invalid environment variable name.";
      }
      {
        assertion = lib.intersectLists (builtins.attrNames server.env) (builtins.attrNames server.envFrom) == [ ];
        message = "Shared MCP server ${name} cannot define a variable in both env and envFrom.";
      }
      {
        assertion = if server.url == null then server.headersFrom == { }
          else server.args == [ ] && server.env == { } && server.envFrom == { };
        message = "Shared MCP server ${name}: headersFrom is HTTP-only; args/env/envFrom are stdio-only.";
      }
    ]) enabled);
  };
}
