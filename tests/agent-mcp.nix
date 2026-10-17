{ pkgs }:

let
  inherit (pkgs) lib;
  evaluate = definitions: (lib.evalModules {
    specialArgs = { inherit pkgs; };
    modules = [
      ../modules/agent-mcp.nix
      {
        options.assertions = lib.mkOption { type = lib.types.listOf lib.types.attrs; default = [ ]; };
        config.programs.agent-mcp.servers = definitions;
      }
    ];
  }).config;
  valid = config: lib.all (entry: entry.assertion) config.assertions;
  config = evaluate {
    hidden = { enable = false; command = "hidden"; };
    local = {
      command = "/bin/example";
      args = [ "argument with spaces" "quote\"backslash\\" ];
      env.PUBLIC_OPTION = "public value";
      envFrom.API_KEY = "MCP_API_KEY";
      clients = [ "pi" "autolith" ];
    };
    remote = {
      url = "https://example.invalid/mcp";
      headersFrom.Authorization = "MCP_AUTHORIZATION";
      clients = [ "claude-code" "autolith" "delta" ];
    };
  };
  rendered = import ../pkgs/agent-mcp { inherit lib pkgs; servers = config.programs.agent-mcp.servers; };
  pi = rendered.jsonFor "pi";
  claude = rendered.jsonFor "claude-code";
  autolith = lib.concatStringsSep "\n" rendered.autolithServers;
in
assert valid config;
assert builtins.attrNames pi == [ "local" "rea" ];
assert builtins.attrNames claude == [ "rea" "remote" ];
assert pi.local.args == [ "argument with spaces" "quote\"backslash\\" ];
assert pi.local.env.API_KEY == "\${MCP_API_KEY}";
assert pi.local.env.PUBLIC_OPTION == "public value";
assert pi.rea.env.REA_MCP_INPUT_SCHEMA_PROFILE == "compact";
assert pi.rea.env.REA_MCP_OUTPUT_SCHEMA_PROFILE == "off";
assert claude.remote.headers.Authorization == "\${MCP_AUTHORIZATION}";
assert lib.hasInfix "(:type :http" autolith;
assert lib.hasInfix "(\"API_KEY\" :environment \"MCP_API_KEY\")" autolith;
assert lib.hasInfix "quote\\\"backslash\\\\" autolith;
assert lib.hasInfix "not supported by Delta" rendered.deltaGuide;
assert builtins.length (rendered.packagesFor "pi") == 1;
assert !(valid (evaluate { rea.url = "https://example.invalid/mcp"; }));
assert !(valid (evaluate { broken = { }; }));
assert !(valid (evaluate { bad.command = ""; }));
assert !(valid (evaluate { bad.url = "file:///tmp/mcp"; }));
assert !(valid (evaluate { "same-name".command = "one"; same_name.command = "two"; }));
assert !(valid (evaluate { bad = { command = "example"; env."BAD-NAME" = "x"; }; }));
assert !(valid (evaluate { bad = { command = "example"; env.TOKEN = "literal"; envFrom.TOKEN = "TOKEN"; }; }));
assert !(valid (evaluate { bad = { command = "example"; headersFrom.Authorization = "TOKEN"; }; }));
assert !(valid (evaluate { bad = { url = "https://example.invalid/mcp"; args = [ "bad" ]; }; }));
pkgs.runCommand "agent-mcp-check" { } ''
  touch "$out"
''
