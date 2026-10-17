{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
}:

let
  platform =
    {
      x86_64-linux = "linux-x64";
      aarch64-linux = "linux-arm64";
      x86_64-darwin = "darwin-x64";
      aarch64-darwin = "darwin-arm64";
    }
    .${stdenv.hostPlatform.system};
in
stdenv.mkDerivation {
  pname = "effect-solutions";
  version = "0.5.3";

  src = fetchurl {
    url = "https://registry.npmjs.org/effect-solutions/-/effect-solutions-0.5.3.tgz";
    hash = "sha512-JIG7XV0gJF5eVV+9un5Yp7MEFMGNfuTYxbiV/HzS80zH/9qx9ZOoXd6Mlw0FXdbC41LGcpWYZJG3MnzxYawEWg==";
  };

  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  dontBuild = true;
  # Bun's standalone executable embeds the program and offline documentation.
  dontStrip = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 dist/effect-solutions-${platform} "$out/bin/effect-solutions"
    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$TMPDIR/effect-solutions-home"
    mkdir -p "$HOME"
    "$out/bin/effect-solutions" list > topics.txt
    grep -q services-and-layers topics.txt
    "$out/bin/effect-solutions" show services-and-layers > topic.txt
    test -s topic.txt
    runHook postInstallCheck
  '';

  meta = {
    description = "Offline Effect patterns and documentation CLI";
    homepage = "https://www.effect.solutions";
    license = lib.licenses.mit;
    mainProgram = "effect-solutions";
    platforms = builtins.attrNames {
      x86_64-linux = null;
      aarch64-linux = null;
      x86_64-darwin = null;
      aarch64-darwin = null;
    };
  };
}
