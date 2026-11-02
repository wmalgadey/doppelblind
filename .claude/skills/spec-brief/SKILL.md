---
name: spec-brief
description: Write a brief in docs/briefs/<slug>.md from what the user wants a change to achieve. Use when the user wants to start a new feature or change.
---

# Write a brief

A brief is the user's wish, in the user's words. The spec agent turns it into binding criteria later; a brief does not contain criteria.

## Write only what the user said

Every sentence of the brief comes from what the user said in this conversation. Where a section stays empty, leave it empty. Do not complete the brief from your own reasoning, from the code or from other documents. An empty section is a valid result: the spec agent turns what the brief does not decide into open questions.

## How to ask

Ask one question at a time. Ask about what the user wants to be able to do, not how it should be built. If the user answers with a technical solution, ask what it should achieve, and record that.

## Sections

```
# <title>

## Outcome
Which outcome in docs/product.md this advances (OUT-nn), and what the user can do afterwards.

## Walkthrough
What the user does and sees, step by step, in their words.

## Wishes
What the user would like, without insisting on it.

## Not included
What this change does not do.

## Already applies
Decisions, outcomes or other sources this change must respect, by ID.
```

For "Outcome" and "Already applies" you may look up IDs in the project's sources; show the user what you found and let them confirm.

## Before writing

Show the brief. Write only after the user confirms.
