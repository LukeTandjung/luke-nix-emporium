{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs,
  temurin-jre-bin-17,
}:

buildNpmPackage {
  pname = "pi-quint-toolchain";
  version = "0.32.0";

  src = ./.;
  npmDepsHash = "sha256-25VvGbrSupR+OXQe7k8pfdrkiPIQeuApFexaaKxI32E=";
  npmFlags = [ "--legacy-peer-deps" ];
  dontNpmBuild = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/pi-quint-toolchain $out/bin
    cp -r node_modules $out/lib/pi-quint-toolchain/
    cp ${./d2-render.mjs} $out/lib/pi-quint-toolchain/d2-render.mjs

    makeWrapper ${nodejs}/bin/node $out/bin/quint \
      --add-flags "$out/lib/pi-quint-toolchain/node_modules/@informalsystems/quint/dist/src/cli.js" \
      --prefix PATH : ${lib.makeBinPath [ temurin-jre-bin-17 ]}
    makeWrapper ${nodejs}/bin/node $out/bin/d2-render \
      --add-flags "$out/lib/pi-quint-toolchain/d2-render.mjs"

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    $out/bin/quint --version
    echo 'x -> y' | $out/bin/d2-render | grep -q '<svg'
    PATH=${lib.makeBinPath [ temurin-jre-bin-17 ]}:$PATH java -version
  '';

  meta = {
    description = "Vendored Quint CLI and D2 renderer for pi formal planning";
    homepage = "https://quint-lang.org";
    license = with lib.licenses; [ asl20 mpl20 ];
    platforms = lib.platforms.all;
  };
}
