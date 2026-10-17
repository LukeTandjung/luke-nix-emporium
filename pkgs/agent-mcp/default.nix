{ lib, pkgs, servers }:

let
  forClient = client: lib.filterAttrs (_: server:
    server.enable && builtins.elem client server.clients
  ) servers;
  packagesFor = client: lib.unique (lib.filter (package: package != null)
    (lib.mapAttrsToList (_: server: server.package) (forClient client)));
  environmentReference = variable: "\${${variable}}";
  references = lib.mapAttrs (_: environmentReference);
  jsonServer = server:
    if server.url != null then {
      type = "http";
      inherit (server) url;
    } // lib.optionalAttrs (server.headersFrom != { }) {
      headers = references server.headersFrom;
    } else {
      inherit (server) command args;
      env = server.env // references server.envFrom;
    };
  jsonFor = client: lib.mapAttrs (_: jsonServer) (forClient client);

  # Lisp strings escape quotes/backslashes, not JSON's \n/\t sequences.
  quote = value: "\"${lib.replaceStrings [ "\\" "\"" ] [ "\\\\" "\\\"" ] value}\"";
  quotedList = values: "(${lib.concatMapStringsSep " " quote values})";
  bindings = values: "(${lib.concatStringsSep " " (lib.mapAttrsToList
    (name: variable: "(${quote name} :environment ${quote variable})") values)})";
  autolithServer = name: server:
    let
      # Autolith's transport accepts environment references, not literal values.
      command = if server.env == { } then server.command else
        toString (pkgs.writeShellScript "${name}-mcp" ''
          ${lib.concatStringsSep "\n" (lib.mapAttrsToList
            (key: value: "export ${key}=${lib.escapeShellArg value}") server.env)}
          exec ${lib.escapeShellArg server.command} "$@"
        '');
      transport = if server.url != null then ''
        (:type :http :url ${quote server.url}
         :headers ${bindings server.headersFrom})
      '' else ''
        (:type :stdio :command ${quote command}
         :arguments ${quotedList server.args}
         :directory :workspace
         :environment ${bindings server.envFrom})
      '';
    in ''
      (:name ${quote name}
       :transport ${transport}
       :required-p nil
       :startup-timeout-seconds ${toString server.autolith.startupTimeoutSeconds}
       :tool-timeout-seconds ${toString server.autolith.toolTimeoutSeconds}
       :approval :${server.autolith.approval}
       :child-tools ${quotedList server.autolith.childTools}${lib.optionalString
         (server.autolith.approval == "read-only" && server.autolith.trustedReadOnlyTools != [ ])
         "\n :trusted-read-only-tools ${quotedList server.autolith.trustedReadOnlyTools}"})
    '';
in
{
  inherit forClient packagesFor jsonFor;
  autolithServers = lib.mapAttrsToList autolithServer (forClient "autolith");
  deltaGuide = ''
    # Shared tools for Delta

    Delta currently supports only remote HTTPS MCP through Settings → MCP.
    This file is a setup guide, not a Delta configuration file. It is not loaded
    by Delta. Local MCP servers are not registered; their CLI packages are
    installed so Delta can use them through its normal shell tool.

    Remote servers below require manual registration. OAuth sign-in is interactive.
    Delta does not support manually supplied tokens or API keys.

    ${lib.concatStringsSep "\n" (lib.mapAttrsToList (name: server:
      if server.url != null then
        "- ${name}: ${server.url}" + lib.optionalString (server.headersFrom != { } || !(lib.hasPrefix "https://" server.url))
          " — requires headers or non-HTTPS transport; not supported by Delta."
      else "- ${name}: local MCP unsupported; CLI: `${server.command}`."
    ) (forClient "delta"))}
  '';
}
