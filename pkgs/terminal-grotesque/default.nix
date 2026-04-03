{
  lib,
  stdenvNoCC,
  fetchFromGitLab,
}:
stdenvNoCC.mkDerivation {
  pname = "terminal-grotesque";
  version = "unstable-2020-06-20";

  src = fetchFromGitLab {
    owner = "raphaelbastide";
    repo = "Terminal-Grotesque";
    rev = "master";
    hash = "sha256-/NxkJpZGdqIrd32EmV1v0ZDsWYJl7+5TABeSMJ7vAUg=";
  };

  installPhase = ''
    runHook preInstall

    install -Dm644 *.ttf -t $out/share/fonts/truetype
    install -Dm644 *.otf -t $out/share/fonts/opentype

    runHook postInstall
  '';

  meta = {
    description = "Terminal Grotesque, a typeface by Raphaël Bastide";
    homepage = "https://gitlab.com/raphaelbastide/Terminal-Grotesque";
    license = lib.licenses.ofl;
    platforms = lib.platforms.all;
  };
}
