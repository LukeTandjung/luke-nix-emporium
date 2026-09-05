{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs,
  libreoffice ? null,
  autoPatchelfHook,
  stdenv,
}:

buildNpmPackage {
  pname = "autolith-document-mcp";
  version = "1.0.0";

  src = ./.;
  npmDepsHash = "sha256-twXGSctNjksIwEnEBcte4gGBVz8QtU4ZIquKPN0m+cY=";
  dontNpmBuild = true;
  nativeBuildInputs = [ makeWrapper ] ++ lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc ];

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/autolith-document-mcp $out/bin
    cp -r node_modules src package.json $out/lib/autolith-document-mcp/
    ${lib.optionalString (stdenv.hostPlatform.isLinux && !stdenv.hostPlatform.isMusl) ''
      rm -rf $out/lib/autolith-document-mcp/node_modules/@llamaindex/liteparse-linux-x64-musl
    ''}
      makeWrapper ${nodejs}/bin/node $out/bin/autolith-document-mcp \
        --add-flags "$out/lib/autolith-document-mcp/src/index.js" \
        --prefix PATH : "${lib.makeBinPath (lib.optionals (stdenv.hostPlatform.isLinux && libreoffice != null) [ libreoffice ])}"
    runHook postInstall
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test
    runHook postCheck
  '';

  meta = {
    description = "Workspace-scoped document parsing stdio MCP server";
    license = lib.licenses.mit;
    mainProgram = "autolith-document-mcp";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
