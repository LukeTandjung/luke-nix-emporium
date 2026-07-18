{ lib, buildNpmPackage }:

buildNpmPackage {
  pname = "pi-rlm-extension";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ./.;
    filter = path: _type: baseNameOf path != "node_modules";
  };

  npmDepsHash = "sha256-WiJC48S6Sd0BO7ViOlg7psDN6t+IT2kQBZkL8ZUgKgY=";
  npmDepsFetcherVersion = 2;
  dontNpmBuild = true;

  installPhase = ''
    runHook preInstall
    npm prune --omit=dev --ignore-scripts
    mkdir -p $out
    cp -r app package.json package-lock.json node_modules $out/
    cp app/index.ts $out/index.ts
    runHook postInstall
  '';
}
