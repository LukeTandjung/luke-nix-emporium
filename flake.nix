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

      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
    in {
      packages = genAttrs supportedSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
        in {
          leetgpu_cli = pkgs.callPackage ./pkgs/leetgpu-cli { };
          pi = pkgs.callPackage ./pkgs/pi { };
          default = self.packages.${system}.leetgpu_cli;
        }
      );

      homeManagerModules = {
        leetgpu = import ./modules/leetgpu.nix;
        pi = import ./modules/pi.nix;
        default = {
          imports = [
            self.homeManagerModules.leetgpu
            self.homeManagerModules.pi
          ];
        };
      };
    };
}
