---
name: delta-handoff
description: Picks up work planned in a Delta thread and implements it in that thread's Delta worktree, using the `delta` CLI. Use when Luke asks to continue, implement, or hand off work from a Delta thread (a Delta thread ID, share link, or "the Delta plan"), or to read context from past Delta threads before coding.
---

# Delta handoff

Delta holds the plan, the review, and the history. You do the implementation inside the same Delta worktree, so Delta can review and merge your edits afterwards.

Add `--json` to every `delta` command and parse the result. Do not guess thread IDs or worktree references; discover them with the commands below. Most commands start the Delta app in the background if it is not running.

## 1. Find the thread

- Luke gives an ID or link: use it.
- Otherwise search: `delta thread search "<keywords>" --json`, or `delta thread list --json`.
- Unsure which thread? Ask Luke. Do not pick one yourself.

## 2. Read the context

- Summary first: `delta thread show <id> --format summarize --json`.
- Full plan when needed: `delta thread show <id> --format messages --json`. Use `--messages <FIRST-LAST>` to read a range of a long thread.
- Related history: `delta thread find-relevant <id> --json`, or ask a question with `delta thread query "<question>" --json`.

Treat the latest agreed plan, spec, and review comments in the thread as your requirements. If they conflict or leave a real decision open, ask Luke before coding.

## 3. Mount the worktree

1. List the thread's worktrees: `delta thread list-worktrees <id> --json`. This only works for shared threads; if it fails, ask Luke to share the thread in Delta.
2. Check whether it is already mounted: `delta worktree list --json`. Reuse an existing mount.
3. Otherwise mount it into a new directory: `delta worktree mount <reference> <directory> --json`. Use `--existing-checkout` only when Luke asks to adopt a checkout he already has.

The mount is shared and live: your edits appear in the Delta thread's worktree. Work only inside the mounted directory.

## 4. Implement

- Follow the repository's own `AGENTS.md` / `AGENT.md` and build checks.
- Run the tests and builds the plan names.
- Do not commit or push unless the plan or Luke asks for it.

## 5. Hand back to Delta

1. Tell Luke what you changed, which checks you ran, and anything left open, so he can review it in the Delta thread.
2. When he no longer needs the mount: `delta worktree unmount <reference> <directory> --json`. This deletes Delta-owned directories only; adopted checkouts are kept.

Only merge histories (`delta worktree merge <source> --into <destination>`) when Luke asks. `--version` takes a Delta history frontier, not a Git revision.
