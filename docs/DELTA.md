# Delta skills and instructions

The Delta Home Manager module manages personal skills and instructions. It does not package
or install the Delta app. Install Delta separately on macOS or Linux.

## Home Manager

```nix
{
  imports = [ inputs.luke-pkgs.homeManagerModules.delta ];
  programs.zed-delta.skills.enable = true;
  programs.zed-delta.context.enable = true;
}
```

This installs Home Manager-managed links at `~/.agents/skills/<name>` from
the shared `pkgs/agent-skills` collection used by Pi, Claude Code, and Autolith.
The option is disabled by default and does not require Pi to be enabled.

Per-skill links use the same sources as Pi, allowing Pi to deduplicate skills
discovered through both personal skill locations. Unrelated personal skills
can coexist in `~/.agents/skills`; existing conflicting files are not forcibly
overwritten.

## Personal instructions

`programs.zed-delta.context.enable` links `~/.config/delta/AGENT.md` to
`pkgs/pi/context/AGENTS.md`, the same source used by Pi and Claude Code.
It is disabled by default and independent of the skills option.

Delta reads the first non-empty file of `AGENT.md` and `AGENTS.md` in that
directory, so the module uses the preferred singular filename. Existing
conflicting files are not forcibly overwritten. These instructions supplement
Delta's built-in prompt; they do not replace it. If you relocate Delta's
configuration with `DELTA_CONFIG_DIR`, this fixed destination must be adjusted.

The option uses `zed-delta` to avoid Home Manager's `programs.delta` option
for the Git diff tool. This module adds no executable to your profile.
