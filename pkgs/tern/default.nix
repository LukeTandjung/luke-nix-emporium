{
  lib,
  stdenv,
  requireFile,
  makeWrapper,
  patchelf,
  binutils,
  bashInteractive,
  nushell,
  vulkan-loader,
  libglvnd,
  wayland,
  libxkbcommon,
  libxcb,
  glib,
  gtk3,
  webkitgtk_4_1,
  libwpe,
  libwpe-fdo,
  pipewire,
  zenity,
  perf,
  glib-networking,
  gsettings-desktop-schemas,
  gst_all_1,
  undmg,
  writeShellScript,
  runCommand,
}:

let
  version = "0.6.3";

  archName =
    {
      "x86_64-linux" = "linux-x86_64";
      "aarch64-linux" = "linux-arm64";
      "x86_64-darwin" = "macos-x86_64";
      "aarch64-darwin" = "macos-arm64";
    }
    .${stdenv.hostPlatform.system}
    or (throw "Unsupported platform: ${stdenv.hostPlatform.system}");

  ext = if stdenv.isDarwin then ".dmg" else ".tar.gz";
  filename = "Tern-${version}-${archName}${ext}";

  # Hashes per platform (update when bumping versions)
  hashes = {
    "linux-x86_64" = "611cf3892635a2f55c1d84db9ed772a1b8fa1d36fe12e0d33d4012483dd9ea2d";
    "linux-arm64" = "2453ef47bb1b3c3edf027bb442996765f8c1f1d32dfa64047f656fc38b5626e7";
    "macos-x86_64" = "836f9733b48f4af80afda398bd0592c460b1e961aef40b4fa9f6d9fa4262bd5f";
    "macos-arm64" = "b94ed041b2219a00caae23415087c4d242ab2f57a36584abbe6ecf6fa8a514b5";
  };

  # Tern is an auth-gated closed-beta product and cannot be fetched
  # automatically. requireFile resolves to the artifact already present in
  # the local store (added via nix-prefetch-url); on machines without it the
  # build fails with the instructions below instead of leaking credentials
  # into this repo.
  src = requireFile {
    name = filename;
    sha256 = hashes.${archName};
    message = ''
      Tern is an auth-gated closed-beta product and cannot be fetched automatically.

      1. Download '${filename}' from https://build.stencil.so/tern (via Stencil login).
      2. Add the archive to your local Nix store:

         nix-prefetch-url file://\$HOME/Downloads/${filename}

      3. Re-run your nix build or system rebuild.
    '';
  };

  # Linux-only runtime dependencies. The Tauri binary dlopen's WebKitGTK & co
  # at runtime (they do not show up in ldd), so they are wired in via rpath
  # and LD_LIBRARY_PATH.
  runtimeLibs = [
    stdenv.cc.cc.lib
    vulkan-loader
    libglvnd
    wayland
    libxkbcommon
    libxcb
    glib
    gtk3
    webkitgtk_4_1
    libwpe
    libwpe-fdo
    pipewire
  ];

  runtimePrograms = [
    zenity
    glib.bin
    perf
  ];

  webkitRuntimeEnv = [
    "--prefix GIO_EXTRA_MODULES : ${glib-networking}/lib/gio/modules"
    "--prefix XDG_DATA_DIRS : ${gsettings-desktop-schemas}/share/gsettings-schemas/${gsettings-desktop-schemas.name}"
    "--prefix GST_PLUGIN_SYSTEM_PATH_1_0 : ${lib.getLib gst_all_1.gst-plugins-base}/lib/gstreamer-1.0"
  ];

  runtimeLibraryPath = lib.makeLibraryPath runtimeLibs;

  # Tern spawns $SHELL with a __tern_login_path__ marker; this probe hands
  # that case to a plain interactive bash and passes everything else to
  # nushell.
  loginProbe = writeShellScript "tern-login-shell-probe" ''
    case " $* " in
      *__tern_login_path__*)
        exec ${lib.getExe bashInteractive} "$@"
        ;;
    esac
    exec ${lib.getExe nushell} "$@"
  '';

  loginShell = runCommand "tern-login-shell" { } ''
    install -Dm755 ${loginProbe} $out/bin/nu
  '';

in
stdenv.mkDerivation (finalAttrs: {
  pname = "tern";
  inherit version src;

  nativeBuildInputs = [
    makeWrapper
  ]
  ++ lib.optionals stdenv.isLinux [
    patchelf
    binutils
  ]
  ++ lib.optionals stdenv.isDarwin [
    undmg
  ];

  dontConfigure = true;
  dontBuild = true;
  dontPatchELF = true;

  installPhase = if stdenv.isDarwin then ''
    runHook preInstall

    # The DMG volume root contains a single `Tern` directory with
    # `Tern.app` plus a dangling `Applications` symlink.
    mkdir -p "$out/Applications" "$out/bin"
    cp -R *.app "$out/Applications/"

    makeWrapper "$out/Applications/Tern.app/Contents/MacOS/tern" "$out/bin/tern"

    runHook postInstall
  '' else ''
    runHook preInstall

    appDir="$out/opt/tern"
    mkdir -p "$appDir" "$out/bin"
    cp -a . "$appDir/"
    chmod -R u+w "$appDir"

    strip --strip-unneeded "$appDir/tern" || true

    rpath="${runtimeLibraryPath}:\$ORIGIN/../lib:\$ORIGIN"
    patchelf --set-rpath "$rpath" "$appDir/tern"
    patchelf --set-interpreter "${stdenv.cc.bintools.dynamicLinker}" "$appDir/tern"

    makeWrapper "$appDir/tern" "$out/bin/tern" \
      --prefix LD_LIBRARY_PATH : "${runtimeLibraryPath}" \
      --prefix PATH : "${lib.makeBinPath runtimePrograms}" \
      --set SHELL ${loginShell}/bin/nu \
      ${lib.concatStringsSep " " webkitRuntimeEnv}

    runHook postInstall
  '';

  passthru = {
    inherit loginShell;
  };

  meta = {
    description = "Rust-native, Kitty-compatible terminal multiplexer";
    homepage = "https://stencil.so/tern";
    license = lib.licenses.unfree;
    mainProgram = "tern";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
})
