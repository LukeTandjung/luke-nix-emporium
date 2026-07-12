---
name: autism-mode
description: Strict literal ticket/spec readiness review. Use when the user asks for autism-mode, wants a ticket scored for implementation readiness, or needs contradictions, gaps, ambiguities, edge cases, and clarification questions identified before implementation.
---

# Autism Mode

You are running a literal implementation-readiness review, not implementing the ticket.

## Required behavior

1. If the user has not provided a ticket/spec, ask for it before continuing.
   - Prefer the `ask_user_question` tool when available.
   - Offer structured options such as: paste the ticket now, point to a file/issue, or cancel.
2. Start a separate, non-interactive Pi process so the review does not pollute the parent context window.
   - Do not use subagents.
   - Write a fresh, self-contained prompt containing the ticket/spec and the rubric below to a temporary file.
   - Run `pi --print --no-session --no-extensions --no-skills --no-prompt-templates --model <current-provider/current-model> @<prompt-file>` with the exact provider and model used by the current Pi session. Preserve the current thinking level by adding it to the model argument or passing `--thinking <current-level>`.
   - Capture the child Pi process's stdout, then delete the temporary prompt file.
   - If the current provider, model, or thinking level cannot be determined, ask the user rather than silently using a different model.
3. The separate Pi instance must pretend to be a hyper-literal implementer:
   - It can only implement exactly what is written.
   - It must not infer intent, fill gaps silently, or assume product context not in the ticket.
   - It should be pedantic about contradictions, undefined terms, missing acceptance criteria, and edge cases.
4. Ask the user clarifying questions for unresolved issues.
   - Use `ask_user_question` where it fits, especially for choosing between resolution options.
   - Each question should include sensible default recommendations as options.
   - Keep each tool call to 1-4 questions and 2-4 options per question.
5. Do not use `ask_user_question` only for this skill. It is a general-purpose structured-question tool and may be used whenever typed, structured clarification is better than a free-form chat reply.

## Separate Pi prompt rubric

Ask the separate Pi instance to return:

```markdown
# Autism Mode Ticket Readiness Review

## Readiness Score

Score: <1-10>/10

Explain the score in 2-5 bullets. A 10 means an implementer can start with no meaningful product/technical questions. A 1 means the ticket is mostly unusable.

## Blocking Contradictions

- <contradiction, why it blocks implementation, exact text references if possible>

## Implementation Gaps

- <missing detail needed to implement literally>

## Ambiguities

- <term, behavior, scope, or ownership that can be interpreted multiple ways>

## Edge Cases To Decide

- <edge case and why it matters>

## Clarifying Questions

For each question:
- Question
- Why it matters
- Recommended default answer
- Alternative answers/trade-offs

## Suggested Ticket Patch

A concise rewrite or patch list that would raise the ticket readiness score.
```

## Parent response after the separate Pi instance returns

Summarize the separate Pi instance's output concisely, then ask the user the highest-impact unresolved questions first using `ask_user_question` when available. Prefer grouped decision questions with recommended defaults over a long free-form list.
