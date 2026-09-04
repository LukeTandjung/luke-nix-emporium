{
  description = "Luke's Nix Emporium";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    autolith.url = "path:./vendor/autolith";
  };

  outputs =
    {
      self,
      autolith,
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
          claude_code = pkgs.callPackage ./pkgs/claude-code { };
          leetgpu_cli = pkgs.callPackage ./pkgs/leetgpu-cli { };
          pencil = pkgs.callPackage ./pkgs/pencil { };
          pi = pkgs.callPackage ./pkgs/pi { };
          pi_quint_toolchain = pkgs.callPackage ./pkgs/quint-toolchain { };
          autolith_paddle_ocr_mcp = pkgs.callPackage ./pkgs/autolith-paddle-ocr-mcp { };
          terminal_grotesque = pkgs.callPackage ./pkgs/terminal-grotesque { };
          default = self.packages.${system}.leetgpu_cli;
        }
        // pkgs.lib.optionalAttrs (builtins.hasAttr system autolith.packages) {
          autolith = autolith.packages.${system}.autolith;
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          claude_desktop = pkgs.callPackage ./pkgs/claude-desktop { };
        }
      );

      homeManagerModules = {
        autolith = import ./modules/autolith.nix { inherit autolith; };
        bookokrat = import ./modules/bookokrat.nix;
        claude-code = import ./modules/claude-code.nix;
        claude-desktop = import ./modules/claude-desktop.nix;
        leetgpu = import ./modules/leetgpu.nix;
        pencil = import ./modules/pencil.nix;
        pi = import ./modules/pi.nix;
        default = {
          imports = [
            self.homeManagerModules.autolith
            self.homeManagerModules.bookokrat
            self.homeManagerModules.claude-code
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
