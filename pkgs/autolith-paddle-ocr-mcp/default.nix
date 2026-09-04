{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs,
  poppler-utils,
}:

buildNpmPackage {
  pname = "autolith-paddle-ocr-mcp";
  version = "1.0.0";

  src = ./.;
  npmDepsHash = "sha256-f62XCoHzUzygTq5S9K536l0OUgA+9sx7qcNd3o0VIt8=";
  dontNpmBuild = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/autolith-paddle-ocr-mcp $out/bin
    cp -r node_modules src package.json $out/lib/autolith-paddle-ocr-mcp/
    makeWrapper ${nodejs}/bin/node $out/bin/autolith-paddle-ocr-mcp \
      --add-flags "$out/lib/autolith-paddle-ocr-mcp/src/index.js" \
      --prefix PATH : ${lib.makeBinPath [ poppler-utils ]}

    runHook postInstall
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test
    runHook postCheck
  '';

  meta = {
    description = "Stdio MCP server for a local PaddleOCR-VL endpoint";
    license = lib.licenses.mit;
    mainProgram = "autolith-paddle-ocr-mcp";
    platforms = lib.platforms.all;
  };
}
