{
  lib,
  fetchurl,
  stdenv,
  autoPatchelfHook,
}:

let
  version = "1.1.1";
  binaries = builtins.fromJSON (builtins.readFile ./urls.json);
  hashes = builtins.fromJSON (builtins.readFile ./hashes.json);
in
stdenv.mkDerivation {
  inherit version;

  pname = "leetgpu_cli";
  src = fetchurl {
    url = "https://cli.leetgpu.com/dist/${version}/${binaries.${stdenv.hostPlatform.system} or (throw "Unsupported system: ${stdenv.hostPlatform.system}")}";
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
