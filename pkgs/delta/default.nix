{
  lib,
  stdenv,
  requireFile,
  autoPatchelfHook,
  makeWrapper,
  unzip,
  libxcb,
  libxkbcommon,
  llvmPackages,
  wayland,
  libglvnd,
  vulkan-loader,
}:

let
  sources = {
    x86_64-linux = {
      name = "delta-linux-x86_64.tar.gz";
      hash = "sha256-Q/CSFKlIDd47DwQk/QatfBs8AtM/ObTA3TFOTvggcsE=";
    };
    aarch64-linux = {
      name = "delta-linux-aarch64.tar.gz";
      hash = "sha256-oYEI6ezR3dFh3WFfEN4R/kjE3kahwje0ngkx9bSbTi8=";
    };
    aarch64-darwin = {
      name = "Delta.app.zip";
      hash = "sha256-qQsFZ+BixGNO9tF6pLliL+qO2S6Kq63KcpJQJLyej+I=";
    };
  };
  source =
    sources.${stdenv.hostPlatform.system}
      or (throw "Unsupported Delta system: ${stdenv.hostPlatform.system}");
  runtimeLibraries = [
    wayland
    libglvnd
    vulkan-loader
  ];
in
stdenv.mkDerivation {
  pname = "zed-delta";
  version = "0.6.1";

  src = requireFile (
    source
    // {
      message = ''
        Add the Delta archive downloaded from Zed to the Nix store:
          nix-store --add-fixed sha256 /path/to/${source.name}
        See docs/DELTA.md for the supported archives.
      '';
    }
  );

  sourceRoot = if stdenv.isDarwin then "." else "Delta";
  nativeBuildInputs = [
    makeWrapper
  ]
  ++ lib.optionals stdenv.isLinux [ autoPatchelfHook ]
  ++ lib.optionals stdenv.isDarwin [ unzip ];
  buildInputs = lib.optionals stdenv.isLinux [
    libxcb
    libxkbcommon
    llvmPackages.libunwind
  ];
  dontBuild = true;
  # Preserve the signed macOS bundle.
  dontStrip = stdenv.isDarwin;
  dontPatchELF = stdenv.isDarwin;

  installPhase =
    if stdenv.isDarwin then
      ''
        runHook preInstall
        mkdir -p "$out/Applications" "$out/bin"
        cp -R Delta.app "$out/Applications/"
        makeWrapper "$out/Applications/Delta.app/Contents/MacOS/delta" "$out/bin/delta"
        runHook postInstall
      ''
    else
      ''
        runHook preInstall
        mkdir -p "$out/bin"
        install -m755 bin/delta "$out/bin/delta"
        cp -R share "$out/share"
        substituteInPlace "$out/share/applications/dev.zed.Delta.desktop" \
          --replace-fail "Exec=delta " "Exec=$out/bin/delta "
        runHook postInstall
      '';

  postFixup = lib.optionalString stdenv.isLinux ''
    wrapProgram "$out/bin/delta" \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath runtimeLibraries}
  '';

  meta = {
    description = "Zed's Delta agent harness";
    homepage = "https://zed.dev/";
    license = lib.licenses.unfree;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
    platforms = builtins.attrNames sources;
    mainProgram = "delta";
  };
}
