{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  makeWrapper,
  undmg,
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
  libdrm,
  libglvnd,
  libnotify,
  libpulseaudio,
  libuuid,
  libx11,
  libxscrnsaver,
  libxcomposite,
  libxcursor,
  libxdamage,
  libxext,
  libxfixes,
  libxi,
  libxkbcommon,
  libxrandr,
  libxrender,
  libxtst,
  libxcb,
  mesa,
  nspr,
  nss,
  pango,
  systemd,
}:

let
  sources = {
    x86_64-linux = {
      url = "https://www.pencil.dev/download/Pencil-linux-x64.tar.gz";
      hash = "sha256-2HLsqSDewIySzCmDX6iGDL6RKa1scNQft/6XlQERMuc=";
    };
    aarch64-linux = {
      url = "https://www.pencil.dev/download/Pencil-linux-arm64.tar.gz";
      hash = "sha256-Osg3eeSFLovAgSnbww8CTCTDb09kaUa3nqMFsgHs2mg=";
    };
    x86_64-darwin = {
      url = "https://www.pencil.dev/download/Pencil-mac-x64.dmg";
      hash = "sha256-5BEXJT3XCQ/312h9BQiZj32EQoyGe4MJqIvEWSegEHs=";
    };
    aarch64-darwin = {
      url = "https://www.pencil.dev/download/Pencil-mac-arm64.dmg";
      hash = "sha256-67FVAHfm7XrYzl9DLGYzg9bu7C6KXQJAhpX038mhhDU=";
    };
  };

  source = sources.${stdenv.hostPlatform.system} or (throw "Unsupported system: ${stdenv.hostPlatform.system}");
in
stdenv.mkDerivation (finalAttrs: {
  pname = "pencil";
  # Pencil's download URLs are unversioned. Bump this if upstream publishes
  # versioned release artifacts and update the fixed-output hashes above.
  version = "unstable-2026-05-18";

  src = fetchurl source;

  nativeBuildInputs = [
    makeWrapper
  ] ++ lib.optionals stdenv.isLinux [
    autoPatchelfHook
  ] ++ lib.optionals stdenv.isDarwin [
    undmg
  ];

  autoPatchelfIgnoreMissingDeps = [
    "libc++.so.9.0"
    "libc++abi.so.6.0"
    "libc.musl-x86_64.so.1"
    "libm.so.10.1"
    "libpthread.so.26.1"
  ];

  buildInputs = lib.optionals stdenv.isLinux [
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
    libdrm
    libglvnd
    libnotify
    libpulseaudio
    libuuid
    libxkbcommon
    mesa
    nspr
    nss
    pango
    stdenv.cc.cc.lib
    systemd
    libx11
    libxscrnsaver
    libxcomposite
    libxcursor
    libxdamage
    libxext
    libxfixes
    libxi
    libxrandr
    libxrender
    libxtst
    libxcb
  ];

  installPhase = if stdenv.isDarwin then ''
    runHook preInstall

    mkdir -p "$out/Applications" "$out/bin"
    cp -R *.app "$out/Applications/"

    makeWrapper "$out/Applications/Pencil.app/Contents/MacOS/Pencil" "$out/bin/pencil"

    runHook postInstall
  '' else ''
    runHook preInstall

    mkdir -p "$out/opt/pencil" "$out/bin"
    cp -R . "$out/opt/pencil"

    chmod +x "$out/opt/pencil/pencil"
    makeWrapper "$out/opt/pencil/pencil" "$out/bin/pencil" \
      --add-flags "--no-sandbox"

    runHook postInstall
  '';

  meta = {
    description = "Pencil desktop app";
    homepage = "https://www.pencil.dev/";
    license = lib.licenses.unfree;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = "pencil";
  };
})
