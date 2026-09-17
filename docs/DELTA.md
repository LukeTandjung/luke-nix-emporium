# Delta skills

The Delta Home Manager module manages personal skills only. It does not package
or install the Delta app. Install Delta separately on macOS or Linux.

## Home Manager

```nix
{
  imports = [ inputs.luke-pkgs.homeManagerModules.delta ];
  programs.zed-delta.skills.enable = true;
}
```

This installs Home Manager-managed links at `~/.agents/skills/<name>` from
the shared `pkgs/agent-skills` collection used by Pi, Claude Code, and Autolith.
The option is disabled by default and does not require Pi to be enabled.

Per-skill links use the same sources as Pi, allowing Pi to deduplicate skills
discovered through both personal skill locations. Unrelated personal skills
can coexist in `~/.agents/skills`; existing conflicting files are not forcibly
overwritten.

The option uses `zed-delta` to avoid Home Manager's `programs.delta` option
for the Git diff tool. This module adds no executable to your profile.
