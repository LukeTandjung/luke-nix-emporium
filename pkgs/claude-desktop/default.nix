{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  dpkg,
  makeWrapper,
  wrapGAppsHook3,
  alsa-lib,
  at-spi2-atk,
  at-spi2-core,
  cairo,
  cups,
  dbus,
  expat,
  fontconfig,
  freetype,
  gdk-pixbuf,
  glib,
  gtk3,
  libcap_ng,
  libdrm,
  libgbm,
  libglvnd,
  libnotify,
  libpulseaudio,
  libseccomp,
  libsecret,
  libuuid,
  libxcb,
  libxkbcommon,
  mesa,
  nspr,
  nss,
  pango,
  pipewire,
  systemd,
  wayland,
  xdg-utils,
  xorg,
}:

let
  sources = {
    x86_64-linux = {
      arch = "amd64";
      hash = "sha256-jzFK0agKq1JxGo6qvAaq5I+zQfCt6koNcmTbXKudBTY=";
    };
    aarch64-linux = {
      arch = "arm64";
      hash = "sha256-SCC5iankMzlWtsvq7icy3StJkE+6VAtHKWPIADyAhsc=";
    };
  };

  source = sources.${stdenv.hostPlatform.system} or (throw "Unsupported system: ${stdenv.hostPlatform.system}");
in
stdenv.mkDerivation (finalAttrs: {
  pname = "claude-desktop";
  version = "1.18286.0";

  src = fetchurl {
    url = "https://downloads.claude.ai/claude-desktop/apt/stable/pool/main/c/claude-desktop/claude-desktop_${finalAttrs.version}_${source.arch}.deb";
    inherit (source) hash;
  };

  nativeBuildInputs = [
    autoPatchelfHook
    dpkg
    makeWrapper
    wrapGAppsHook3
  ];

  dontWrapGApps = true;

  buildInputs = [
    alsa-lib
    at-spi2-atk
    at-spi2-core
    cairo
    cups
    dbus
    expat
    fontconfig
    freetype
    gdk-pixbuf
    glib
    gtk3
    libcap_ng
    libdrm
    libgbm
    libglvnd
    libnotify
    libpulseaudio
    libseccomp
    libsecret
    libuuid
    libxcb
    libxkbcommon
    mesa
    nspr
    nss
    pango
    pipewire
    stdenv.cc.cc.lib
    systemd
    wayland
    xorg.libX11
    xorg.libXScrnSaver
    xorg.libXcomposite
    xorg.libXcursor
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXrandr
    xorg.libXrender
    xorg.libXtst
    xorg.libxkbfile
    xorg.libxshmfence
  ];

  runtimePrograms = [
    glib
    xdg-utils
  ];

  unpackPhase = ''
    runHook preUnpack

    dpkg --fsys-tarfile "$src" | tar --extract

    runHook postUnpack
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out"
    cp -R usr/* "$out/"
    rm -rf "$out/share/lintian" "$out/share/doc"

    # The Debian package ships this as a symlink to the Electron binary.
    # Replace it with a Nix wrapper so GTK/GIO settings, helper programs, and
    # Chromium flags are available at runtime.
    rm "$out/bin/claude-desktop"
    chmod 0755 "$out/lib/claude-desktop/chrome-sandbox"
    makeWrapper "$out/lib/claude-desktop/claude-desktop" "$out/bin/claude-desktop" \
      "''${gappsWrapperArgs[@]}" \
      --suffix PATH : ${lib.makeBinPath finalAttrs.runtimePrograms} \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath [ libglvnd mesa ]} \
      --add-flags "--no-sandbox"

    substituteInPlace "$out/share/applications/claude-desktop.desktop" \
      --replace-fail "Exec=claude-desktop" "Exec=$out/bin/claude-desktop"

    runHook postInstall
  '';

  meta = {
    description = "Desktop application for Claude.ai";
    homepage = "https://claude.ai";
    downloadPage = "https://code.claude.com/docs/en/desktop-linux";
    license = lib.licenses.unfree;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
    mainProgram = "claude-desktop";
  };
})
