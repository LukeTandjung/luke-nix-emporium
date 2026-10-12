{
  pkgs,
  autolithSource,
}:

let
  upstreamPkgs = import autolithSource.inputs.nixpkgs {
    system = pkgs.stdenv.hostPlatform.system;
  };
  # v0.63.0 completes @ paths but still lacks attached file snapshots and
  # Shift-Tab effort cycling.
  # Keep these in order: reasoning cycling extends the inline completion handler.
  patchedSource = upstreamPkgs.applyPatches {
    name = "autolith-0.63.0-patched-source";
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
