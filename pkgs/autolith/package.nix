{
  pkgs,
  autolithSource,
}:

let
  upstreamPkgs = import autolithSource.inputs.nixpkgs {
    system = pkgs.stdenv.hostPlatform.system;
  };
  # Autolith v0.47.1's Nix pin predates the catalog API used by its source.
  # Match its qlfile.lock without patching Lisp; remove when upstream aligns it.
  buildPkgs = upstreamPkgs // {
    fetchFromGitHub = args:
      upstreamPkgs.fetchFromGitHub (args // upstreamPkgs.lib.optionalAttrs (
        (args.owner or "") == "lambda-symbolics"
        && (args.repo or "") == "cl-skills"
        && (args.rev or "") == "aafcf34e186bf85c8d8e70ab7e86f7259bcbf412"
      ) {
        rev = "ef20ce4bde2eb1d8f483a063788256aad06d0968";
        hash = "sha256-Y4+uUmaQ9tY/J8hf/R3wUS8UJHhwXkQm29oUmk8GcNU=";
      });
  };
in
import "${autolithSource}/nix/package.nix" {
  pkgs = buildPkgs;
  src = autolithSource;
}
