{
  lib,
  rustPlatform,
  fetchFromGitHub,
  pkg-config,
  python3,
  unzip,
  mupdf,
  freetype,
  harfbuzz,
  openjpeg,
  jbig2dec,
  gumbo,
  zlib,
  fontconfig,
}:

rustPlatform.buildRustPackage rec {
  pname = "bookokrat";
  version = "0.3.9";

  src = fetchFromGitHub {
    owner = "bugzmanov";
    repo = pname;
    rev = "v${version}";
    hash = "sha256-6KqRFtPtmFXQUmG++O5gq6CuGLO7eROacGA4YZVj64k=";
  };

  cargoLock = {
    lockFile = ./Cargo.lock;
  };

  postPatch = ''
    cp ${src}/Cargo.lock Cargo.lock
  '';

  nativeBuildInputs = [
    pkg-config
    python3
    rustPlatform.bindgenHook
    unzip
  ];

  buildInputs = [
    mupdf
    freetype
    harfbuzz
    openjpeg
    jbig2dec
    gumbo
    zlib
    fontconfig
  ];

  checkFlags = [
    "--skip=test_mouse_scroll_file_list_svg"
    "--skip=test_content_view_svg"
    "--skip=test_toc_back_to_books_list_svg"
  ];

  meta = {
    description = "A terminal-based EPUB/PDF/DJVU reader focused on speed, smooth navigation, and Vim-style workflows";
    homepage = "https://github.com/bugzmanov/bookokrat";
    license = lib.licenses.agpl3Plus;
    platforms = lib.platforms.unix;
    mainProgram = "bookokrat";
  };
}
