{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  fd,
  ripgrep,
  nodejs,
  makeWrapper,
}:

buildNpmPackage {
  pname = "pi";
  version = "0.70.2";

  src = fetchFromGitHub {
    owner = "badlogic";
    repo = "pi-mono";
    rev = "v0.70.2";
    hash = "sha256-qqmJloTp3mWuZBGgpwoyoFyXx6QD8xhJEwCZb7xFabM=";
  };

  npmDepsHash = "sha256-ImDvTC0Nm+IGYJuqjwUUfnOtA65uJvjlpP4h2Xt/2vE=";

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
      --prefix PATH : ${lib.makeBinPath [fd ripgrep]} \
      --set PI_SKIP_VERSION_CHECK 1 \
      --prefix NODE_PATH : "$out/lib/pi-mono/node_modules"

    runHook postInstall
  '';

  meta = {
    description = "A terminal-based coding agent with multi-model support";
    homepage = "https://github.com/badlogic/pi-mono";
    changelog = "https://github.com/badlogic/pi-mono/releases";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
    mainProgram = "pi";
  };
}
