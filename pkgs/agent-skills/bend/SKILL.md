---
name: bend
description: Use when writing, reviewing, or changing Bend code. Learn the language with bend guide, preserve important rules in LAWS.bend, verify PROOF.bend before committing, and parallelize code whenever possible.
---

# Bend

- Run `bend guide` to learn Bend before working on Bend code.
- Use `LAWS.bend` to keep important rules. Read existing rules before making changes and update them as important rules emerge.
- Run `bend PROOF.bend` before committing Bend changes. Resolve failures before committing; if the command cannot run, report the blocker rather than claiming verification passed.
- Parallelize the code whenever possible while preserving correctness and the rules in `LAWS.bend`.
