{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  fd,
  ripgrep,
  nodejs,
  poppler-utils,
  makeWrapper,
}:

let
  # Vendored snapshots of the model catalog APIs consumed by packages/ai's
  # generate-models script. The script normally fetches these at build time,
  # which is both non-reproducible and blocked by the Nix sandbox. Keep these
  # snapshots in-tree so rebuilds do not depend on mutable live API responses.
  modelsDevData = ./model-catalogs/models-dev-api.json;
  nvidiaModels = ./model-catalogs/nvidia-models.json;
  openrouterModels = ./model-catalogs/openrouter-models.json;
  aiGatewayModels = ./model-catalogs/ai-gateway-models.json;
  radiusConfig = ./model-catalogs/radius-config.json;

  # Reads like `await fetch(...)` but from a store path.
  localResponse = path: ''new Response(await import("node:fs").then((m) => m.readFileSync("${path}", "utf8")))'';
in
buildNpmPackage {
  pname = "pi";
  version = "0.85.1-unstable-2026-09-19";

  src = fetchFromGitHub {
    owner = "earendil-works";
    repo = "pi";
    rev = "4d38031fbdbed43bc481ddf9c3c279005ab24674";
    hash = "sha256-05Uv1Cfb0CPKKfr25nalwGFShEycyts7WjzQjarhzHs=";
  };

  npmDepsHash = "sha256-UHfLj8BVf2rk17+VpTfF0Vrjt/cM+vonYtv8jUn4/mo=";

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
        'const response = ${localResponse aiGatewayModels};' \
      --replace-fail \
        'const config = await loadRadiusGatewayConfig(DEFAULT_RADIUS_GATEWAY);' \
        'const config = await (${localResponse radiusConfig}).json();'
  '';

  makeCacheWritable = true;

  # Skip lifecycle scripts during install — the monorepo includes packages (e.g. web-ui)
  # with native deps (canvas/pixman) that we don't need for the CLI.
  npmFlags = [ "--ignore-scripts" ];

  # Generate catalog data from the pinned snapshots, then use upstream's offline
  # build to compile workspaces in dependency order and copy their runtime assets.
  preBuild = ''
    npm --prefix packages/ai run generate-models
    npm run build:offline
  '';
  dontNpmBuild = true;

  # Monorepo root is a private package; skip the default npm pack-and-install.
  dontNpmInstall = true;

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    # Prune dev deps to avoid shipping tsgo, biome, etc.
    npm prune --omit=dev --offline

    # Copy the workspace tree. Symlinks in node_modules (e.g. @earendil-works/pi-ai ->
    # ../../packages/ai) remain valid because the relative directory structure is preserved.
    mkdir -p $out/lib/pi-mono
    cp -r node_modules packages $out/lib/pi-mono/

    mkdir -p $out/bin
    makeWrapper ${nodejs}/bin/node $out/bin/pi \
      --add-flags "$out/lib/pi-mono/packages/coding-agent/dist/cli.js" \
      --prefix PATH : ${lib.makeBinPath [fd ripgrep nodejs poppler-utils]} \
      --set PI_SKIP_VERSION_CHECK 1

    runHook postInstall
  '';

  # Exercise the installed CLI so missing runtime assets fail the build.
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
