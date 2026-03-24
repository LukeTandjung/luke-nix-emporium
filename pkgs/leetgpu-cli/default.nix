{
  lib,
  fetchurl,
  stdenv,
  autoPatchelfHook,
}:

let
  version = "v1.0.0";
  urls = {
    "x86_64-linux" = "https://cli.leetgpu.com/dist/${version}/leetgpu-linux-amd64";
    "aarch64-linux" = "https://cli.leetgpu.com/dist/${version}/leetgpu-linux-arm64";
    "x86_64-darwin" = "https://cli.leetgpu.com/dist/${version}/leetgpu-macos-amd64";
    "aarch64-darwin" = "https://cli.leetgpu.com/dist/${version}/leetgpu-macos-arm64";
  };
  hashes = {
    "x86_64-linux" = "sha256-GlJzzXkHTrW7Yg4nC1tD1hAlj4YMeveG7DibKu5UDxM=";
    "aarch64-linux" = "sha256-PA6u/xecC0FWQKECH+GwZJrRTr382RG+tWhLm08IlW0=";
    "x86_64-darwin" = "sha256-HMP042zVK3DmVxHsPx/sgZr+0k5mFcJD6XiihLqN7wg=";
    "aarch64-darwin" = "sha256-jEiSHDsLopiYmdsXx36SJKxv1xEI2PRRI6H7ienCskU=";
  };
in
stdenv.mkDerivation {
  inherit version;

  pname = "leetgpu_cli";
  src = fetchurl {
    url = urls.${stdenv.hostPlatform.system} or (throw "Unsupported system: ${stdenv.hostPlatform.system}");
    sha256 = hashes.${stdenv.hostPlatform.system} or (throw "Unsupported system: ${stdenv.hostPlatform.system}");
  };
  dontUnpack = true;
  nativeBuildInputs = lib.optionals stdenv.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.isLinux [
    stdenv.cc.cc.lib
  ];

  installPhase = ''
    mkdir -p "$out/bin"
    cp "$src" "$out/bin/leetgpu"
    chmod +x "$out/bin/leetgpu"
  '';

  meta = with lib; {
    description = "LeetGPU CLI";
    license = licenses.unfree;
    platforms = platforms.all;
    mainProgram = "leetgpu";
  };
}
