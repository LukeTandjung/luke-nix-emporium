{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  fetchurl,
  fd,
  ripgrep,
  nodejs,
  makeWrapper,
}:

let
  # Snapshots of the model catalog APIs consumed by packages/ai's
  # generate-models script. The script normally fetches these at build time,
  # which the Nix sandbox blocks — without them most provider *.models.ts
  # files are never generated and the CLI crashes at startup
  # (ERR_MODULE_NOT_FOUND on e.g. amazon-bedrock.models.js). Every static
  # src/providers/*.ts imports its generated catalog, so all four sources
  # are load-bearing. Bump the hashes to refresh the catalogs; they change
  # upstream often, so expect to re-pin when bumping the pi version.
  modelsDevData = fetchurl {
    url = "https://models.dev/api.json";
    hash = "sha256-TkJtFxe+fa5qd4LlZSYa6repd4hlWAUtWNHixrcwPco=";
  };
  nvidiaModels = fetchurl {
    url = "https://integrate.api.nvidia.com/v1/models";
    hash = "sha256-V3M9cf0TJD5G1/BDClWB2tmZ2sOeThs2rjoaP2kWIgI=";
  };
  openrouterModels = fetchurl {
    url = "https://openrouter.ai/api/v1/models";
    hash = "sha256-v8ZLJGdo8siPpeJ2eBwBc90YiiZyjdsmzA5CqreXytc=";
  };
  aiGatewayModels = fetchurl {
    url = "https://ai-gateway.vercel.sh/v1/models";
    hash = "sha256-enA8AmUwUUTzX0qjNYuNmyMCHG+q0s1oAiHWO7Voah8=";
  };

  # Reads like `await fetch(...)` but from a store path.
  localResponse = path: ''new Response(await import("node:fs").then((m) => m.readFileSync("${path}", "utf8")))'';
in
buildNpmPackage {
  pname = "pi";
  version = "0.80.6";

  src = fetchFromGitHub {
    owner = "earendil-works";
    repo = "pi";
    rev = "v0.80.6";
    hash = "sha256-e/wcHruEcBAHDF5tKvwew7LXjVp0eraHh2k+QaL2sCA=";
  };

  npmDepsHash = "sha256-xXEOR0epZcfbXayYGyJdBiFVliamBexqA+1Sd7wlGhU=";

  # Point the script's catalog fetches at the pinned snapshots.
  postPatch = ''
    substituteInPlace packages/ai/scripts/generate-models.ts \
      --replace-fail \
        'const response = await fetch("https://models.dev/api.json");' \
        'const response = ${localResponse modelsDevData};' \
      --replace-fail \
        'const response = await fetch(`''${NVIDIA_BASE_URL}/models`);' \
        'const response = ${localResponse nvidiaModels};' \
      --replace-fail \
        'const response = await fetch("https://openrouter.ai/api/v1/models");' \
        'const response = ${localResponse openrouterModels};' \
      --replace-fail \
        'const response = await fetch(`''${AI_GATEWAY_MODELS_URL}/models`);' \
        'const response = ${localResponse aiGatewayModels};'
  '';

  makeCacheWritable = true;

  # Skip lifecycle scripts during install — the monorepo includes packages (e.g. web-ui)
  # with native deps (canvas/pixman) that we don't need for the CLI.
  npmFlags = [ "--ignore-scripts" ];

  # Build workspace deps in dependency order via tsgo (@typescript/native-preview in root devDeps).
  # '|| true' on upstream packages lets us continue past type errors that the dev-preview
  # tsgo flags but upstream tsc did not — tsgo still emits JS when noEmitOnError is unset.
  preBuild = ''
    TSGO="$(pwd)/node_modules/.bin/tsgo"

    (cd packages/tui && "$TSGO" -p tsconfig.build.json || true)
    (cd packages/ai && npm run generate-models && ("$TSGO" -p tsconfig.build.json || true))
    (cd packages/agent && "$TSGO" -p tsconfig.build.json || true)
    (cd packages/coding-agent && "$TSGO" -p tsconfig.build.json && npm run copy-assets)
  '';
  dontNpmBuild = true;

  # Monorepo root is a private package; skip the default npm pack-and-install.
  dontNpmInstall = true;

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    # Prune dev deps to avoid shipping tsgo, biome, etc.
    npm prune --omit=dev --offline

    # Copy the workspace tree. Symlinks in node_modules (e.g. @mariozechner/pi-ai ->
    # ../../packages/ai) remain valid because the relative directory structure is preserved.
    mkdir -p $out/lib/pi-mono
    cp -r node_modules packages $out/lib/pi-mono/

    mkdir -p $out/bin
    makeWrapper ${nodejs}/bin/node $out/bin/pi \
      --add-flags "$out/lib/pi-mono/packages/coding-agent/dist/cli.js" \
      --prefix PATH : ${lib.makeBinPath [fd ripgrep nodejs]} \
      --set PI_SKIP_VERSION_CHECK 1

    runHook postInstall
  '';

  # Startup resolves the full ESM import graph, so a missing generated
  # *.models.js (the failure mode the '|| true' above can mask) fails here
  # with ERR_MODULE_NOT_FOUND instead of shipping a broken CLI.
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck

    HOME=$(mktemp -d) $out/bin/pi --version

    runHook postInstallCheck
  '';

  meta = {
    description = "A terminal-based coding agent with multi-model support";
    homepage = "https://github.com/earendil-works/pi";
    changelog = "https://github.com/earendil-works/pi/releases";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
    mainProgram = "pi";
  };
}
