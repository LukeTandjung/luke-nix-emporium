{
  lib,
  paddleOcrPackage,
  approval ? "prompt",
  endpointEnvironmentVariable ? null,
}:

let
  approvalKeyword = {
    prompt = ":prompt";
    read-only = ":read-only";
    allow = ":allow";
    deny = ":deny";
  }.${approval};
  environment = lib.optionalString (endpointEnvironmentVariable != null)
    "\n      :environment ((\"PADDLE_OCR_URL\" :environment \"${endpointEnvironmentVariable}\"))";
  trustedTools = lib.optionalString (approval == "read-only")
    "\n     :trusted-read-only-tools (\"paddle_ocr\")";
in
''
  (:version 1
   :servers
   ((:name "paddle-ocr"
     :transport
     (:type :stdio
      :command "${paddleOcrPackage}/bin/autolith-paddle-ocr-mcp"
      :directory :workspace${environment})
     :required-p nil
     :startup-timeout-seconds 15
     :tool-timeout-seconds 1800
     :approval ${approvalKeyword}${trustedTools}
     :child-tools ("paddle_ocr"))))
''
