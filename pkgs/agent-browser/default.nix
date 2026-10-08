{
  lib,
  stdenv,
  fetchurl,
  nodejs,
  makeWrapper,
}:

stdenv.mkDerivation {
  pname = "agent-browser";
  version = "0.38.2";

  src = fetchurl {
    url = "https://registry.npmjs.org/agent-browser/-/agent-browser-0.38.2.tgz";
    hash = "sha512-b/7hvo2RrqocvybjB9kwpX12kGkxkFvtdJ4XPDoott5TLK2n3aPX+lYg7ALd+2YvPi2LrTKGzQYu/rxZC2Y7ZA==";
  };

  nativeBuildInputs = [ nodejs makeWrapper ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/node_modules
    cp -r ./* $out/lib/node_modules/
    chmod +x $out/lib/node_modules/bin/agent-browser.js
    makeWrapper $out/lib/node_modules/bin/agent-browser.js $out/bin/agent-browser \
      --prefix PATH : ${nodejs}/bin
    runHook postInstall
  '';

  meta = {
    description = "Standalone browser automation CLI used by pi-agent-browser-native";
    homepage = "https://pi.dev/packages/pi-agent-browser-native?name=browser";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
    mainProgram = "agent-browser";
  };
}
