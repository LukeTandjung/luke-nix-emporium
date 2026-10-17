{
  lib,
  stdenv,
  fetchurl,
}:

let
  version = "2.1.302";
  baseUrl = "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";

  platforms = {
    "aarch64-darwin" = {
      slug = "darwin-arm64";
      hash = "sha256-UmLOnehiQ/7Q0h7cObJxVV1WeA0BEuKxlEOf4cZmLTc=";
    };
    "x86_64-darwin" = {
      slug = "darwin-x64";
      hash = "sha256-uakTEU9Chw7I44hIyIyFXXP3MYeHHsLhrQW75UAp2aw=";
    };
    "aarch64-linux" = {
      slug = "linux-arm64";
      hash = "sha256-K9T05e1csJlVtJAJj3RTIctUkefqjHUroeO7AQza2xA=";
    };
    "x86_64-linux" = {
      slug = "linux-x64";
      hash = "sha256-YNfrfxL7sopSUz/ovliECXQDViqgLcc5kaAhxwZ+KaU=";
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
