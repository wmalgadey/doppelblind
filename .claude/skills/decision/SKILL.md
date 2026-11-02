---
name: decision
description: Record a new decision in docs/decisions.md or supersede an existing one. Use when the user states a decision or asks to record one.
---

# Record a decision

`docs/decisions.md` lists the decisions of this project. It is a binding source: specs cite its entries by ID. The user makes the decision; you record it.

## Write only what the user said

Every sentence of an entry comes from what the user said in this conversation. If the decision, its scope or its reason is unclear, ask, one question at a time. Do not complete an entry from your own reasoning, from the code or from other documents.

Do not add alternatives, consequences or reasons the user did not give. If the user asks for your view, give it in the conversation and mark it as yours; record only what they then decide.

## Check what it touches

Before drafting, read `docs/decisions.md` and name every entry accepted that the new decision changes, contradicts or replaces. For each, ask whether it is superseded.

## Entry format

```
## DEC-nnn: <title>

Status: accepted
Date: <today>

<the decision, one to three sentences>

Why: <the user's reason>
```

- IDs have three digits, ascend, and are never reused.
- A superseded entry keeps its text; only its status line changes to `Status: superseded by DEC-nnn`.
- The status line is the only place that says whether an entry is in force.

## Before writing

Show the new entry and every status change. Write only after the user confirms.
