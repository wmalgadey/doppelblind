---
name: risk-matrix
description: Add, change or remove a question or path rule in docs/risk-matrix.md. Use when the user wants to change which changes need a human approval.
---

# Maintain the risk matrix

`docs/risk-matrix.md` decides which changes need a human approval before implementation or before merge. Only the user changes it. You help phrase and record; the user decides what goes in.

## Write only what the user decided

Every question, path rule and approval in the matrix comes from the user in this conversation. If you think a risk is missing, say so in the conversation and mark it as your suggestion; record it only if the user decides to.

## What a question must satisfy

Check each new or changed question against these points and tell the user where it fails:

- It can be answered with yes or no.
- It can be answered from its input alone: spec and assumptions for a business question, the diff for a technical one. If answering it needs knowledge of the running system, say so.
- It names exactly one approval it triggers: business or technical.
- It does not overlap an existing question. If it does, name the existing one.

A path rule is a glob over changed files and names the approval it triggers.

## When the user brings a reason

If the change comes from a run — a risk a person found later, or approvals that found nothing — ask which run or change it was, and record it with the entry.

## Format

```
## Questions

| ID      | Question | Triggers  | Detected by          | Reason |
| ------- | -------- | --------- | -------------------- | ------ |
| RISK-nn | ...      | business  | classifier           | ...    |

## Path rules

| ID      | Paths         | Triggers  | Reason |
| ------- | ------------- | --------- | ------ |
| PATH-nn | src/Billing/** | business | ...    |
```

- IDs are never reused. A removed entry is deleted; its ID stays unused.

## Before writing

Read `docs/risk-matrix.md` first. Show the changed rows. Write only after the user confirms.
