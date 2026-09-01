{
  lib,
  stdenv,
  fetchurl,
}:

let
  version = "2.1.257";
  baseUrl = "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";

  platforms = {
    "aarch64-darwin" = {
      slug = "darwin-arm64";
      hash = "sha256-ZFkNfZ2cGJ0z+z36WMVAjq8qEP5Va9hBVdle+qtGtg4=";
    };
    "x86_64-darwin" = {
      slug = "darwin-x64";
      hash = "sha256-j5DAALHiZdzZKxLG2dE7tdNUxJXmuhXFbrFxACkj2As=";
    };
    "aarch64-linux" = {
      slug = "linux-arm64";
      hash = "sha256-IvfUjxcZOVLDwtC4vy8x2yzQj9X7CaN0+jIUlrcR0Bc=";
    };
    "x86_64-linux" = {
      slug = "linux-x64";
      hash = "sha256-mmS9qdhyKh+gW++aWWHQfgMxuZWX7ani9qcy86D/fwU=";
    };
  };

  platform = platforms.${stdenv.hostPlatform.system};
in
stdenv.mkDerivation {
  pname = "claude-code";
  inherit version;

  src = fetchurl {
    url = "${baseUrl}/${version}/${platform.slug}/claude";
    inherit (platform) hash;
  };

  dontUnpack = true;
  dontFixup = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 "$src" "$out/bin/claude"
    runHook postInstall
  '';

  meta = {
    description = "Agentic coding tool that lives in your terminal";
    homepage = "https://code.claude.com";
    license = lib.licenses.unfree;
    mainProgram = "claude";
    platforms = builtins.attrNames platforms;
  };
}
