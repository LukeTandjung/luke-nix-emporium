{ lib, stdenv, buildNpmPackage, fetchurl, makeWrapper, nodejs, procps }:

buildNpmPackage {
  pname = "rea-agents";
  version = "6.5.0";

  src = fetchurl {
    url = "https://registry.npmjs.org/rea-agents/-/rea-agents-6.5.0.tgz";
    hash = "sha512-C6BG7LyrAdR74mSjertM6PrxJkcNZ2bfQNOJornPo9erDEp2tyPRVYPnV5Yodr+1RqewCQla68WulXlVnveD+A==";
  };

  # Use the published compiled runtime, not the upstream development task graph.
  # package.json retains release metadata/dependencies but omits dev scripts/deps.
  postPatch = ''
    cp ${./package.json} package.json
    cp ${./package-lock.json} package-lock.json
  '';
  npmDepsHash = "sha256-bdfLrhcJujMGmMxjnzRolIgaBKD9H6s699nYPlwAwqE=";
  npmFlags = [ "--ignore-scripts" ];
  dontNpmBuild = true;
  nativeBuildInputs = [ makeWrapper ];

  postInstall = ''
    for command in rea rea-agents; do
      wrapProgram "$out/bin/$command" \
        --prefix PATH : ${lib.makeBinPath ([ nodejs ] ++ lib.optionals stdenv.hostPlatform.isLinux [ procps ])}
    done
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$TMPDIR/rea-home"
    mkdir -p "$HOME"
    "$out/bin/rea" --version
    "$out/bin/rea" --help > help.txt
    grep -q mcp help.txt
    runHook postInstallCheck
  '';

  meta = {
    description = "Reverse Engineer Anything CLI and local MCP server";
    homepage = "https://github.com/morluto/rea";
    license = lib.licenses.mit;
    mainProgram = "rea";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
