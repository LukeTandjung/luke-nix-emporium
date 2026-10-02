{
  pkgs,
  autolithSource,
}:

let
  upstreamPkgs = import autolithSource.inputs.nixpkgs {
    system = pkgs.stdenv.hostPlatform.system;
  };
  # Extend v0.55.0's native path selection with bounded file snapshots.
  # No separate completion UI or asynchronous search scheduler.
  # Reasoning cycling follows native completion and recalled queue editing.
  patchedSource = upstreamPkgs.applyPatches {
    name = "autolith-0.55.0-patched-source";
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
