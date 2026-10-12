{
  pkgs,
  autolithSource,
}:

let
  upstreamPkgs = import autolithSource.inputs.nixpkgs {
    system = pkgs.stdenv.hostPlatform.system;
  };
in
import "${autolithSource}/nix/package.nix" {
  pkgs = upstreamPkgs;
  src = autolithSource;
}
