{
  lib,
  paddleOcrPackage ? null,
  paddleOcrApproval ? "prompt",
  endpointEnvironmentVariable ? null,
}:

let
  approvalKeyword = approval: {
    prompt = ":prompt";
    read-only = ":read-only";
    allow = ":allow";
    deny = ":deny";
  }.${approval};
  quoteTools = tools: lib.concatMapStringsSep " " (tool: "\"${tool}\"") tools;
  renderServer =
    {
      name,
      command,
      approval,
      tools,
      trustedReadOnlyTools ? [ ],
      timeout ? 1800,
      transportExtra ? "",
    }:
    let
      trustedTools = lib.optionalString (approval == "read-only" && trustedReadOnlyTools != [ ])
        "\n     :trusted-read-only-tools (${quoteTools trustedReadOnlyTools})";
    in
    ''
      (:name "${name}"
       :transport
       (:type :stdio
        :command "${command}"
        :directory :workspace${transportExtra})
       :required-p nil
       :startup-timeout-seconds 15
       :tool-timeout-seconds ${toString timeout}
       :approval ${approvalKeyword approval}${trustedTools}
       :child-tools (${quoteTools tools}))
    '';
  endpointEnvironment = lib.optionalString (endpointEnvironmentVariable != null)
    "\n      :environment ((\"PADDLE_OCR_URL\" :environment \"${endpointEnvironmentVariable}\"))";
  servers = lib.optional (paddleOcrPackage != null) (renderServer {
    name = "paddle-ocr";
    command = "${paddleOcrPackage}/bin/autolith-paddle-ocr-mcp";
    approval = paddleOcrApproval;
    tools = [ "paddle_ocr" ];
    trustedReadOnlyTools = [ "paddle_ocr" ];
    transportExtra = endpointEnvironment;
  });
in
''
  (:version 1
   :servers
   (${lib.concatStringsSep "\n  " servers}))
''
