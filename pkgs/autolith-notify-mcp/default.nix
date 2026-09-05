{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs,
  libnotify,
  stdenv,
}:

buildNpmPackage {
  pname = "autolith-notify-mcp";
  version = "1.0.0";

  src = ./.;
  npmDepsHash = "sha256-D01ntxA1q0QT0fL65BaK5tVPm41jYHAsrj+1bsouk+I=";
  dontNpmBuild = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/autolith-notify-mcp $out/bin
    cp -r node_modules src package.json $out/lib/autolith-notify-mcp/
    makeWrapper ${nodejs}/bin/node $out/bin/autolith-notify-mcp \
      --add-flags "$out/lib/autolith-notify-mcp/src/index.js" \
      --prefix PATH : "${lib.makeBinPath (lib.optionals stdenv.hostPlatform.isLinux [ libnotify ])}"

    runHook postInstall
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test
    runHook postCheck
  '';

  meta = {
    description = "Stdio MCP server for native desktop notifications";
    license = lib.licenses.mit;
    mainProgram = "autolith-notify-mcp";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
