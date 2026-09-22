{
  lib,
  stdenv,
  fetchurl,
  makeWrapper,
  autoPatchelfHook,
  clang,
}:

let
  version = "2.0.25";
  releases = {
    aarch64-darwin = {
      platform = "darwin-arm64";
      sha256 = "c5bb22ba029d5909da9c6db82aa037278a66d1cf8a5572f433879f7dcd866c31";
    };
    x86_64-darwin = {
      platform = "darwin-x64";
      sha256 = "78e70cda4068f83736649c760575f4382259d5817be96d2eb04b9d078d943af0";
    };
    aarch64-linux = {
      platform = "linux-arm64";
      sha256 = "c7cce7508fd13201d544180cca531a87a89c41829876c431cdfa0ea7f5308481";
    };
    x86_64-linux = {
      platform = "linux-x64";
      sha256 = "91c0e2640f8d2e3e73fd3dd62ed4d178ce9a6f7ce8f8980b4dc4abf7a6f9ccd4";
    };
  };
  release = releases.${stdenv.hostPlatform.system}
    or (throw "Bend is not supported on ${stdenv.hostPlatform.system}");
in
stdenv.mkDerivation {
  pname = "bend";
  inherit version;

  # Pinned release archives and checksums from bend-lang.com's install.sh.
  src = fetchurl {
    url = "https://github.com/bendlang/bend/releases/download/v${version}/bend-${version}-${release.platform}.tar.gz";
    inherit (release) sha256;
  };

  nativeBuildInputs = [ makeWrapper ]
    ++ lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];
  dontBuild = true;
  # Preserve the embedded Bun executable.
  dontStrip = true;

  installPhase = ''
    runHook preInstall

    # Bend resolves bend2/ and guide/ relative to its real executable path.
    mkdir -p "$out/libexec/bend" "$out/bin"
    cp -R bin bend2 guide "$out/libexec/bend/"
    makeWrapper "$out/libexec/bend/bin/bend" "$out/bin/bend" \
      --set BEND_NO_TELEMETRY 1 \
      --suffix PATH : ${lib.makeBinPath [ clang ]} \
      --run 'if [ "$#" -eq 1 ] && [ "$1" = update ]; then echo "Bend is managed by Nix; update the package and rebuild your configuration." >&2; exit 1; fi'

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"
    "$out/bin/bend" version | grep -Fx "bend ${version}"
    "$out/bin/bend" guide > guide.txt
    grep -F "Parallelism" guide.txt
    "$out/bin/bend" base > base.txt
    test -s base.txt
    cat > smoke.bend <<'EOF'
    import Base

    def main() -> IO(Unit):
      IO.print("Hello, world!")
    EOF
    "$out/bin/bend" smoke.bend | grep -Fx "Hello, world!"
    "$out/bin/bend" smoke.bend -o smoke
    ./smoke | grep -Fx "Hello, world!"
    if "$out/bin/bend" update > update.txt 2>&1; then
      echo "bend update must not run the upstream installer" >&2
      exit 1
    fi
    grep -F "Bend is managed by Nix" update.txt
    test ! -e "$HOME/.bend"
    runHook postInstallCheck
  '';

  meta = {
    description = "Bend 2 programming language with formal proofs and CPU/GPU parallelism";
    homepage = "https://bend-lang.com";
    license = lib.licenses.asl20;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
    platforms = builtins.attrNames releases;
    mainProgram = "bend";
  };
}
