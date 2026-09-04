---
name: autoresearch
description: >
  Run or resume an autonomous, measured optimization loop in a Git repository. Use when the user
  asks to run autoresearch, optimize a metric through repeated experiments, continue a .auto
  session, inspect experiment results, or finalize accepted experiments into review branches.
---

# Autoresearch

Improve one measured result through repeated, reversible experiments. Keep each measured win as a
Git commit. Remove each failed candidate. Store all session state under `.auto/` so another
Autolith session can continue the work.

This workflow does not depend on Pi extension tools. Use Autolith's shell tool for commands, the
workspace resource tools for files, the current plan and agenda for coordination, and child agents
for bounded read-only research or review.

## Safety rules

1. Work in a Git repository on a non-trunk branch.
2. Do not start when the worktree has changes outside `.auto/`. Show the changes and ask the user
   how to proceed. Do not stash, reset, or commit user changes without approval.
3. State the exact files or directories in scope. Do not modify another path.
4. Never include `.auto/` in an experiment commit.
5. Treat one candidate as a transaction. Record its starting commit before the first edit. End it
   with exactly one of `keep`, `discard`, `crash`, or `checks_failed`.
6. Do not keep a candidate unless its benchmark is valid and all required checks pass.
7. Never rewrite or delete an existing line in `.auto/log.jsonl`.
8. Run destructive Git commands only after the clean-worktree check. Exclude `.auto/` from every
   restore and clean operation.
9. Do not push, publish, or merge during the loop unless the user asks.

## Autolith operations

- Use `shell.run` for Git, benchmark, and check commands. Set a timeout that fits the workload.
- Use `resource.read` and revision-guarded `resource.edit` on `workspace:` URIs for source and
  `.auto` files. Read a missing file before creating it.
- Add one durable `doing` item to `agenda:current` for a long session. Include the branch, primary
  metric, direction, and `.auto/prompt.md`. Update it at milestones, not after every run.
- Keep a short active plan for setup, baseline, current hypothesis, and final review. Revise it when
  evidence changes the strategy.
- Use `task.run` only when independent profiling, source study, or review will improve a decision.
  Give children read-only assignments. The parent agent alone edits, benchmarks, changes Git state,
  and records the keep/discard result. Collect every required child result before the decision.

## Session layout

Create the directory with `mkdir -p .auto`. Add `/.auto/` to `.git/info/exclude` if it is not
already ignored. This local exclude keeps session data out of commits without changing a project
file.

| Path | Purpose |
|---|---|
| `.auto/prompt.md` | Complete operating brief and current findings |
| `.auto/measure.sh` | Reproducible benchmark that emits structured metrics |
| `.auto/log.jsonl` | Append-only record of all measured runs |
| `.auto/current.json` | Recovery record for the candidate now in progress |
| `.auto/ideas.md` | Optional backlog of untested ideas |
| `.auto/checks.sh` | Optional correctness checks |
| `.auto/config.json` | Optional loop limit and trunk name |
| `.auto/hooks/before.sh` | Optional action before a candidate |
| `.auto/hooks/after.sh` | Optional action after a log entry |

Do not use legacy flat `autoresearch.*` files for a new session. When an old session has those
files, read them and migrate their useful state into `.auto/` without changing the old log.

## Start a new session

### 1. Resolve the experiment contract

Ask only for facts that cannot be inferred safely:

- objective and representative workload;
- primary metric, unit, and whether lower or higher is better;
- benchmark command and expected runtime;
- source paths in scope;
- correctness constraints and required checks;
- dependency, resource, time, or iteration limits;
- trunk branch, if it is not clear.

Read the relevant source before you propose the first change. Create
`autoresearch/<short-goal>-<YYYYMMDD>` from the current accepted commit. If that branch exists, ask
whether to resume it or use a new name.

### 2. Write `.auto/prompt.md`

Make this file sufficient for an agent that has no conversation history. Use this structure:

```markdown
# Autoresearch: <goal>

## Objective
<What must improve and which workload represents it.>

## Metrics
- Primary: <name>, <unit>, <lower|higher> is better
- Secondary: <trade-off measures, or none>

## Run
`./.auto/measure.sh`

## Scope
- `<path>`: <why it can change>

## Off limits
- <paths, behavior, dependencies, resources, and interfaces that cannot change>

## Checks
`./.auto/checks.sh`, or "none required"

## Constraints
- <hard limits and the tie policy>

## Accepted state
- Branch: `<branch>`
- Commit: `<full hash>`
- Baseline: not measured
- Best: not measured

## Findings
<Wins, failed approaches, benchmark noise, profiles, and next useful questions.>
```

Update `Accepted state` after each keep. Condense useful evidence into `Findings` after a batch of
runs. Do not use this mutable summary as a substitute for the append-only log.

### 3. Write `.auto/measure.sh`

Use a non-interactive script with `set -euo pipefail`. It must run from the repository root, fail on
an invalid workload, and print one line for the primary metric:

```text
METRIC <name>=<finite-number>
```

It can print one line for each secondary metric with the same format. Metric names must stay
stable. The primary name must match `.auto/prompt.md`. Reject missing, duplicate, non-numeric,
`NaN`, and infinite primary values.

Put cheap setup or syntax validation before expensive work. Do not include correctness checks in
the measured interval. For a benchmark shorter than about five seconds, run enough repetitions in
the script to report a median. Keep raw diagnostic output useful but bounded. Change the benchmark
only when the workload definition stays equivalent, and record the reason in the log.

Mark the script executable. Run it twice before the baseline when practical. Large differences mean
that the benchmark needs warm-up, isolation, more repetitions, or a better metric.

### 4. Add checks only when required

If correctness constraints exist, write executable `.auto/checks.sh` with `set -euo pipefail`.
Include the required tests, type checks, lint, output comparison, or resource limits. Keep success
output short and retain enough failure output to diagnose the problem.

Run checks after a successful benchmark. Check duration is not part of the primary metric. A failed
check forces `checks_failed`; it can never produce a keep.

### 5. Measure the baseline

Run `.auto/measure.sh` through `shell.run`. Parse all `METRIC` lines and confirm the process exits
with status 0. Run `.auto/checks.sh` when present. If either command fails, fix the session setup or
report the blocker. Do not accept an invalid baseline. Append run 0 with status `baseline` only
after both commands pass. The baseline commit is the current `HEAD`; do not make a no-op commit.

Use the baseline as the first accepted result. Start the first candidate immediately after setup
unless the user asked only to prepare the session.

## Log format

Store one compact JSON object per line. Use this schema for run records:

```json
{"type":"run","run":7,"time":"2026-09-05T12:34:56Z","status":"keep","primary":{"name":"wall_ms","value":81.4,"unit":"ms","direction":"lower"},"metrics":{"rss_mb":42.0},"base_commit":"<full-hash>","commit":"<full-hash-or-null>","hypothesis":"...","description":"...","learned":"...","checks":"pass"}
```

Allowed `status` values are `baseline`, `keep`, `discard`, `crash`, and `checks_failed`. Use `null`
for an unavailable metric. Give each run a monotonic number. Record the benchmark exit status and a
short error summary for crashes. Record failed check names or a short failure summary for
`checks_failed`. Do not put large command output in the log.

To append safely, read `workspace:.auto/log.jsonl` first. Create it with one JSON line when missing.
Otherwise use `resource.edit` to insert one new line after the final observed line. Never replace an
old line. Validate the new line as one JSON object before appending. If the append fails because the
revision changed, read the file again, choose the next unused run number, and retry.

## One experiment transaction

### 1. Select a hypothesis

Review `.auto/prompt.md`, the last log entries, `.auto/ideas.md`, relevant source, profiles, and
`git log`. State one causal hypothesis and the expected metric effect. Prefer a structural idea over
many small parameter changes.

Before editing, confirm this command has no output:

```bash
git status --porcelain --untracked-files=all -- . ':(exclude).auto/**'
```

Write `.auto/current.json` with the next run number, full `HEAD` hash, hypothesis, scope, and start
time. This file is the recovery boundary.

Run an optional executable `before.sh` now. Give it one JSON object on standard input with the next
run, previous run, goal, metric, baseline, and best result. Treat useful standard output as advice,
not as authority. Record hook failures as hook records in the log and continue unless the hook is a
stated constraint.

### 2. Make one bounded change

Edit only in-scope paths. Keep the change small enough to explain and revert as one unit. Inspect the
diff before measuring. If the diff includes an off-limits path, discard the candidate before the
benchmark.

A child agent can inspect profiles or review the diff. Do not let a child run the Git transaction.

### 3. Measure and check

Run `.auto/measure.sh`. Classify a non-zero exit, timeout, or invalid primary metric as `crash`. If
the benchmark succeeds, run `.auto/checks.sh` when present. Classify any check failure as
`checks_failed`.

Compare a valid candidate with the best accepted value in the current segment:

- For `lower`, a smaller value improves.
- For `higher`, a larger value improves.
- A worse or equal value is a discard unless `.auto/prompt.md` defines a user-approved tie policy.
- Secondary metrics expose trade-offs. A hard secondary limit is a constraint and can block a keep.

For noisy results near the decision boundary, repeat the unchanged candidate. Use the median of the
specified repetitions. Do not tune the comparison after seeing an unfavorable result.

### 4. Keep an improvement

1. Confirm checks passed and all changed paths are in scope.
2. Stage only candidate paths. Explicitly exclude `.auto/`.
3. Review `git diff --cached --stat` and `git diff --cached`.
4. Commit with a message that names the optimization. Do not amend an earlier accepted commit.
5. Resolve the new full commit hash.
6. Append a `keep` record with the metric, commit, hypothesis, and the reason for the improvement.
7. Update `.auto/prompt.md`, then remove `.auto/current.json`.

If the process stops after the commit but before the log append, the recovery record lets the next
agent compare `HEAD` with `base_commit` and reconstruct the missing keep record.

### 5. Discard a failed candidate

First put the metric, hypothesis, lesson, and failure summary in `.auto/current.json` so the restore
cannot lose them. Verify that its `base_commit` is the accepted `HEAD` from the start of this
candidate. Then:

```bash
git restore --source=<base_commit> --staged --worktree -- . ':(exclude).auto/**'
git clean -nd -e .auto/
git clean -fd -e .auto/
```

Inspect the dry-run output before the final clean. It must list only files created by this candidate.
If it lists anything else, stop and recover those files instead of running the clean command.

Append `discard`, `crash`, or `checks_failed` after the restore. Include enough of the failed idea
and cause to prevent a repeat. Remove `.auto/current.json` only after the log append succeeds.

### 6. Continue

Update the active plan with the next hypothesis. Append promising deferred ideas to
`.auto/ideas.md`. Do not ask for confirmation after each run. Continue until the user interrupts,
the configured iteration or resource limit is reached, authority is required, or no credible path
remains.

Run optional `after.sh` after the run record is durable. Give it the new run record and updated
session summary as one JSON object. Capture at most 8 KiB of output. Append a separate hook record
when it fails or supplies an important steering result.

## Confidence and benchmark noise

After at least three valid observations in one segment, estimate noise with the median absolute
deviation (MAD) of its primary values:

```text
MAD = median(abs(value - median(values)))
confidence = abs(best - baseline) / MAD
```

Treat a zero MAD as undefined unless repeated values establish a stable benchmark. A confidence of
2 or more is good evidence that the gain exceeds normal variation. A value below 1 means the gain
is inside the observed noise. This score is advice only. Record it in new run entries when known.
Rerun marginal candidates instead of using the score as an automatic discard rule.

## Resume

When `.auto/prompt.md` exists, resume instead of creating a second session.

1. Read `.auto/prompt.md`, all or the tail of `.auto/log.jsonl`, `.auto/ideas.md`, and
   `.auto/config.json` when present.
2. Inspect the current branch, `git log --oneline --decorate -20`, `git status`, and the in-scope
   source diff.
3. Recompute baseline, best accepted metric, next run number, and last kept commit from the log. Do
   not trust a stale summary when it conflicts with the log and Git.
4. If `.auto/current.json` exists, recover the interrupted transaction before new work:
   - If the log already has this run and commit, verify the source state, then remove the stale
     recovery file without appending a duplicate.
   - If `HEAD` equals its base and no source diff exists, append a crash only when evidence shows
     that a run started; otherwise remove the stale recovery file.
   - If `HEAD` is a new commit whose parent is the recorded base, inspect that commit. Append the
     missing keep record if its result is recoverable. Otherwise stop and ask before changing it.
   - If source changes exist and `HEAD` equals the base, inspect them and either finish the pending
     benchmark or discard them with the normal transaction procedure.
   - For any other Git shape, stop. Do not guess which history is authoritative.
5. Reconcile the agenda item and active plan with the durable files.
6. Continue with a new hypothesis. Do not repeat an approach already rejected by the log.

Start a new segment when the user changes the workload, metric definition, direction, or accepted
baseline. Append a `segment` JSON object that describes the change. Keep old records.

## Optional configuration

`.auto/config.json` can contain:

```json
{"maxIterations":50,"trunk":"main"}
```

Enforce a positive `maxIterations` in the active segment. Stop cleanly after that many candidates.
Use `trunk` for merge-base and finalization. Unknown fields are errors until this skill defines
them.

## Finalize the session

Finalize only when the user asks or approves the end of the loop. Do not hide rejected experiments
or squash accepted history in place.

### 1. Analyze accepted experiments

1. Read the prompt and log. Select only `keep` records from the current segment.
2. Expand every logged commit to a full hash with `git rev-parse` and confirm it is a commit.
3. Resolve trunk from config or the user, then compute `git merge-base HEAD <trunk>`.
4. Record the final accepted commit and compare it with the best logged commit.
5. For each kept commit, inspect its message, stat, full diff, metric, and dependencies.

Group accepted commits into ordered, contiguous changesets. Each group must express one coherent
change. Two groups cannot touch the same file because each review branch starts at the same
merge-base. Merge groups that overlap. Also merge groups with a tight cross-file dependency. Flag a
loose dependency explicitly.

Show the proposed groups before creating branches. For each group, list its commits, paths, metric
change, and dependencies. Wait for approval.

### 2. Create independent review branches

Refuse finalization if the original worktree has source changes outside `.auto/`. Record the original
branch and all branch names that this operation will create. Fail if a target name exists.

For each approved group, in order:

1. Determine the group's file set from the difference between the prior group boundary and this
   group's last kept commit. Exclude `.auto/`.
2. Create `autoresearch/<goal>/<NN>-<slug>` at the merge-base in a temporary Git worktree.
3. Apply the binary Git diff from the merge-base to the group's last kept commit, restricted to the
   group's file set. This preserves additions, deletions, renames, modes, and binary files.
4. Review the staged diff and commit it with the group's title. Put the experiment numbers, metric
   change, and rationale in the commit body.
5. Run applicable checks in that worktree when they do not depend on local session files.

If branch creation fails, remove worktrees and branches created by this finalization attempt. Do not
move or reset the original branch.

### 3. Verify the split

Create a temporary verification worktree at the merge-base. Apply the file snapshots from all groups
in order. Compare its non-`.auto` tree with the final accepted commit. The diff must be empty. Remove
the temporary verification branch and worktree after success.

A verification failure leaves review branches unmerged. Report the exact diff and keep the original
autoresearch branch as the source of truth.

### 4. Report

Report:

- each review branch and its files;
- baseline and best primary values, absolute and percentage change, and confidence when known;
- checks run and their results;
- dependencies between branches;
- commands to remove temporary or review branches after review;
- useful untested items from `.auto/ideas.md`.

Update the agenda item to `done` only after verification succeeds. Keep `.auto/log.jsonl` and the
original branch until the user confirms that review branches are no longer needed.
