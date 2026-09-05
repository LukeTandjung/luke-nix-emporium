{
  pkgs,
  autolithSource,
}:

let
  upstreamPkgs = import autolithSource.inputs.nixpkgs {
    system = pkgs.stdenv.hostPlatform.system;
  };
  patchedSource = upstreamPkgs.applyPatches {
    name = "autolith-patched-source";
    src = autolithSource;
    patches = [
      ./patches/inline-file-context.patch
      ./patches/shift-tab-reasoning.patch
    ];
  };
in
import "${autolithSource}/nix/package.nix" {
  pkgs = upstreamPkgs;
  src = patchedSource;
}
