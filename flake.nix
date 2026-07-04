{
  description = "Luke's Nix Emporium";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
      ...
    }:
    let
      inherit (nixpkgs.lib) genAttrs;

      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
    in
    {
      packages = genAttrs supportedSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
        in
        {
          bookokrat = pkgs.callPackage ./pkgs/bookokrat { };
          leetgpu_cli = pkgs.callPackage ./pkgs/leetgpu-cli { };
          pencil = pkgs.callPackage ./pkgs/pencil { };
          pi = pkgs.callPackage ./pkgs/pi { };
          terminal_grotesque = pkgs.callPackage ./pkgs/terminal-grotesque { };
          default = self.packages.${system}.leetgpu_cli;
        } // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          claude_desktop = pkgs.callPackage ./pkgs/claude-desktop { };
        }
      );

      homeManagerModules = {
        bookokrat = import ./modules/bookokrat.nix;
        claude-desktop = import ./modules/claude-desktop.nix;
        leetgpu = import ./modules/leetgpu.nix;
        pencil = import ./modules/pencil.nix;
        pi = import ./modules/pi.nix;
        default = {
          imports = [
            self.homeManagerModules.bookokrat
            self.homeManagerModules.claude-desktop
            self.homeManagerModules.leetgpu
            self.homeManagerModules.pencil
            self.homeManagerModules.pi
          ];
        };
      };

      nixosModules = {
        pencil = import ./modules/nixos-pencil.nix;
        default = {
          imports = [
            self.nixosModules.pencil
          ];
        };
      };
    };
}
