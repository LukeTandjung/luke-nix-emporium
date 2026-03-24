{
  description = "Luke's Nix Emporium";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    inputs@{
      self,
      nixpkgs,
      ...
    }:
    let
      inherit (nixpkgs.lib) genAttrs;
      inherit (builtins) filter hasAttr;

      supportedSystems = filter (system: hasAttr system leetgpuUrls) nixpkgs.lib.systems.flakeExposed;

      leetgpuUrls = {
        "x86_64-linux" = true;
        "aarch64-linux" = true;
        "x86_64-darwin" = true;
        "aarch64-darwin" = true;
      };
    in {
      packages = genAttrs supportedSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
        in {
          leetgpu_cli = pkgs.callPackage ./pkgs/leetgpu-cli { };
          default = self.packages.${system}.leetgpu_cli;
        }
      );

      homeManagerModules.default = import ./modules/leetgpu.nix;
    };
}
