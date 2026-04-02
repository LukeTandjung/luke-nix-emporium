{
  lib,
  stdenv,
  zig,
  callPackage,
  fetchFromGitHub,
}:
let
  version = "0.5.0";
in
stdenv.mkDerivation {
  inherit version;

  pname = "fancy-cat";
  meta = {
    description = "PDF reader for terminal emulators using the Kitty image protocol";
    homepage = "https://github.com/freref/fancy-cat";
    mainProgram = "fancy-cat";
    platforms = zig.meta.platforms;
    license = lib.licenses.agpl3Only;
  };
  src = fetchFromGitHub {
    owner = "freref";
    repo = "fancy-cat";
    rev = "v${version}";
    hash = "sha256-VR2pNN4+ESWe3MIFAe3sJuHPq7S5XIT6elqCPMDe0GM=";
  };

  nativeBuildInputs = [
    zig.hook
  ];
  dontSetZigDefaultFlags = true;
  zigBuildFlags = [
    "--system"
    (callPackage ./build.zig.zon.nix { })
    "-Doptimize=ReleaseFast"
    "-Dcpu=baseline"
  ];
}
