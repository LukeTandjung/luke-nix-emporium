---
name: land
description: >-
  Land requested changes in LukeTandjung/luke-nix-emporium, coordinating its
  nix-darwin consumer when requested. Invoke only for an explicit landing or
  merge request, including /land, not for review, preparation, or installation.
metadata:
  delta-action: land
---

# Land emporium changes

An explicit invocation supplies permission to perform this workflow. Do not
ask for merge permission again. Installing this skill is not a landing request.
This skill applies only to LukeTandjung/luke-nix-emporium.

## Preflight and preparation

1. Read applicable project instructions and inspect status, staged and unstaged
   diffs, untracked files, remotes, and recent history. Establish the requested
   scope from the conversation. Preserve unrelated work; never stage everything
   blindly, discard edits, or include secrets or generated private state.
2. Confirm `origin` is the GitHub repository above and the destination is still
   `master`. Use Git, Nix, and `gh`; check authentication without printing tokens.
   Do not publish through Delta's `local` backlink.
3. Check current GitHub branch protection, rulesets, contribution policy, and
   required checks/reviews. At setup there were no protections, CI workflows,
   PR requirements, or mandatory commit format. These are observations, not
   exemptions from future policy. If settings cannot be verified, stop.
4. Fetch `origin`, prepare scoped commits with descriptive messages and configured
   identity/signing, and integrate `origin/master`. Use `GIT_EDITOR=true` for
   commits and merges. Use a private working branch or isolated checkout when
   necessary to avoid touching unrelated work. Do not rewrite shared history.
5. Resolve conflicts automatically when intent is clear, preserving both intended
   changes. Pause for ambiguous intent, unsafe changes, or failed verification.
   Reverify the resulting tree after any integration or resolution.

## Verification

Run checks against the exact final tree to be landed, with new required files
tracked. Do not update unrelated dependencies as part of verification.

- For Nix/package changes, run `nix flake check --no-write-lock-file`.
  Source: `flake.nix` defines the package and module outputs; there is no custom
  check runner or `checks` suite. This is evaluation, not a substitute for builds.
- Build affected exported packages with
  `nix build .#autolith .#pi --no-link --no-write-lock-file` when both are affected;
  use only the affected attributes otherwise.
  Source: `flake.nix`, `packages` exports `autolith` and `pi`;
  `pkgs/autolith/package.nix` applies the two vendored patches in order;
  `pkgs/pi/default.nix` includes installed CLI version validation.
  For other packages, select their actual exported attributes from `flake.nix`.
- For changes to Autolith source patches, preserve their order and custom
  behavior, check application to the locked upstream release, and run relevant
  behavioral tests using that release's actual test definitions. Do not reuse
  stale Lisp test commands without inspecting the pinned source. Source:
  `docs/AUTOLITH.md`, "Skills" and "Packaged source patches"; the actual pin and
  patch list in `flake.nix` and `pkgs/autolith/package.nix` override stale version
  descriptions. Preserve documentation obligations and update affected docs.
- For skill-only or documentation-only commits, inspect content, references,
  frontmatter where applicable, and scoped diff whitespace instead of rebuilding
  unrelated packages. Blank context lines in valid vendored unified patches are
  not source whitespace defects; do not corrupt patch syntax to silence checks.
- Report platform coverage accurately. If a necessary build needs an unavailable
  platform or credentials, stop rather than claiming success. Do not install
  tools or activate a system to work around a blocker.
- Every required remote check must pass for the final candidate under current
  repository rules before landing. Pending, missing, failing, or unverifiable
  checks are blockers. Earlier-tree results do not qualify.

## Publish and verify

With today's unprotected direct-push workflow, push the verified candidate using
`git push origin HEAD:refs/heads/master`. Never force-push. If the remote advanced,
fetch, integrate, reverify, and retry safely.

If current policy requires a PR, publish a topic branch, create the PR with
`gh pr create --body-file` and explicit base `master`, satisfy applicable reviews
and checks, then merge using a permitted method. Do not treat publication or an
open PR as completion; stop and report blocked if a required human action is
unavailable. Do not invent required authorship or bypass contribution policies.

Verify the landed commit is reachable from the fetched `origin/master` and confirm
the remote ref with `git ls-remote`. Record the actual resulting commit and any
actual CI result URLs. Do not delete branches or alter the user's primary checkout
as an automatic cleanup step.

## Coordinated dotfiles changes

Only coordinate the consumer when the user's requested scope includes it; a
package update alone is not permission to change or activate dotfiles.
Land emporium first and record its verified published revision. Then follow the
project-local `.agents/skills/land/SKILL.md` in LukeTandjung/nix-darwin for its
input pin, verification, and publication; read that exact file if duplicate skill
names would make loading ambiguous. The existing landing request covers the
coordinated scope; do not request routine permission again.
Do not roll back published emporium commits if dotfiles landing is blocked.

## Outcome

Only report success after verifying all requested destinations. In a subthread,
use `report_subthread_status` when available; otherwise report in the conversation.
Use `success` for verified landing, `failure` for an actual blocker or failed
attempt. Keep the title a few sentence-case words and the description one short
line with verified short-SHA commit links and actual CI result links when available.
Never invent a CI link when no CI ran. For a partial coordinated landing, state
which repository landed and which did not. Ask questions in the conversation,
not status events. Continue safe recovery when possible and report the updated
verified outcome. Builds, commits, topic pushes, and skill installation alone
are not landing success. Never activate NixOS, Darwin, or Home Manager here.
