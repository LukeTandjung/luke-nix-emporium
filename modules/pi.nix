{ config, lib, pkgs, ... }:

let
  cfg = config.programs.pi;
  jsonFormat = pkgs.formats.json { };
in
{
  options.programs.pi = {
    enable = lib.mkEnableOption "pi coding agent";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../pkgs/pi { };
      description = "The pi package to use.";
    };

    settings = lib.mkOption {
      type = jsonFormat.type;
      default = { };
      description = ''
        Configuration written to {file}`~/.config/pi/pi.json`.
        See pi documentation for available options.
      '';
      example = lib.literalExpression ''
        {
          model = "claude-sonnet-4-20250514";
          apiKey = "your-api-key";
        }
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    xdg.configFile."pi/pi.json" = lib.mkIf (cfg.settings != { }) {
      source = jsonFormat.generate "pi.json" cfg.settings;
    };
  };
}
