# Delta

Packages Zed's Delta 0.6.1 from the binary archives downloaded on 2026-09-06.
The macOS bundle's Info.plist says 0.1.0; the embedded application version is 0.6.1.

## Archives

| System | Archive |
|--------|---------|
| x86_64-linux | `delta-linux-x86_64.tar.gz` |
| aarch64-linux | `delta-linux-aarch64.tar.gz` |
| aarch64-darwin | `Delta.app.zip` |

The macOS executable is Apple Silicon only and requires macOS 13 or later.
The package uses `requireFile` with fixed SHA-256 hashes. Import the matching
archive before building. For x86_64 Linux:

```sh
nix-store --add-fixed sha256 ~/Downloads/delta-linux-x86_64.tar.gz
nix build .#delta
nix run .#delta -- --help
```

Linux builds use Nix libraries, include the desktop entry and icons, and wrap
Delta with its Wayland, EGL, and Vulkan runtime libraries. Darwin builds install
`Applications/Delta.app` and a `bin/delta` launcher.

## Home Manager

```nix
{
  imports = [ inputs.luke-pkgs.homeManagerModules.delta ];
  programs.zed-delta.enable = true;
}
```

Use `programs.zed-delta.package` to override the package. The option uses
`zed-delta` to avoid Home Manager's `programs.delta` option for the Git diff tool.
Both tools install a `delta` command, so choose which one to expose in your profile.

## Validation

The x86_64 Linux package was built and its version and CLI help were tested.
The ARM Linux and macOS derivations were evaluated but need runtime tests on
those systems.
