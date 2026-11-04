---
name: approve-test
description: Help the user approve a spec's acceptance tests before implementation - decide the test author's assumptions, and review the criteria that signals point to. Use when the user wants to decide assumptions, or approve or review the acceptance tests of a spec.
model: sonnet
allowed-tools: Read, Edit, Write, Glob, Grep, AskUserQuestion, Task, Bash(node .claude/skills/approve-test/scripts/approval-tools.mjs:*)
---

# Approve the acceptance tests of a spec

The test author wrote acceptance tests from the criteria of spec.md and listed the assumptions it had to make in assumptions.md. Before implementation the user approves both: every assumption gets a decision, and the tests are reviewed where a signal points to a problem. The user does not read every test. Doppelblind reads the result: it writes again the tests of every criterion with a rejected assumption or a verdict other than `ok`.

You prepare, ask and write down; the user decides. Every text that binds a later run is the user's: you write `accepted`, a verdict the user chose, or the user's text unchanged. You never write a decision text or a suggestion for one, and you never change a test, a helper, spec.md, or a section of assumptions.md other than its decision lines.

## Paths

- Spec folder: `specs/<spec>/`, holding spec.md, assumptions.md and approval.md.
- Test folder: the path `.doppelblind.conf` declares for the test author, followed by `<spec>/`.
- Tools: `node .claude/skills/approve-test/scripts/approval-tools.mjs <command>`.

## Before you start

If the user names no spec, list the folders under `specs/` that have an assumptions.md, and ask which one. If the spec's acceptance tests are locked, say so and stop.

Read spec.md, assumptions.md, approval.md if it exists, `docs/product.md`, `docs/decisions.md` and the answers.md of this spec once. Do not read the implementation, and do not read these files again for each question.

## Part 1: Assumptions

A Decision field holds exactly one of:

- `accepted`
- `rejected: <what applies instead>`, with a text of the user's own after the colon

An assumption is undecided when its **Decision:** field is empty or holds anything else, `rejected` without a text among it. Go through the undecided assumptions in the order of assumptions.md. The position of an assumption is the number of decided assumptions at the start plus one for each assumption asked so far; the total is the number of assumptions.

`accepted` binds the assumption's **Assumed:** answer as written. If an assumption has no **Assumed:** line, say in the question that `accepted` binds the assumption's text as it stands.

Ask with the AskUserQuestion tool, one assumption per call, with two questions:

1. `header`: the assumption ID. `question`: `Assumption <position> of <total>:`, the criterion ID with its Given, When and Then from spec.md, the assumption's question and its assumed answer exactly as in assumptions.md, and the number of test files that carry the criterion's ID (count them with Grep in the test folder; do not take the number from assumptions.md). If one of the files you read says something about this assumption, add `Source: <path> › <heading or line>:` and quote that line verbatim, one line at most. Do not paraphrase it, and do not say what it means for the decision. Options:
   - `accepted`, description `The assumed answer binds the tests as written.`
   - `rejected`, description `You write what applies instead.`
2. `header`: `Binds`. `question`: `Does this decision decide how the product behaves, or only how a test observes it?` Options:
   - `spec and tests`, description `It decides how the product behaves.`
   - `tests only`, description `It decides only how a test observes the behaviour.`

When the user chooses `rejected`, ask in a plain message what applies instead. A free text in the first question is also a rejection: if it is `accepted` (any case), the decision is `accepted`; if it starts with `rejected:`, take it as it is; otherwise the decision is `rejected: ` followed by the text. Take every text exactly as written. Do not shorten, translate, correct or complete it.

Before you accept a rejection text, check three things and tell the user only what you find, one sentence each:

- It contains an example ("e.g.", "for example", "such as", "z. B."): the test author may make the example binding. Ask whether to keep the text.
- It only refuses, like `no` or `wrong`: the test author needs what applies instead. Ask for it.
- It is about something other than this assumption: name the assumption or criterion it seems to be about, and ask whether to keep it here.

If the user keeps the text, keep it unchanged.

Write each decision as soon as it is given, before the next question: the decision on the line after **Decision:**, then a line `**Binds:** spec and tests` or `**Binds:** tests only`, then an empty line. If the field held an invalid decision, replace it.

## Part 2: Tests

The user reviews only the criteria a signal points to, plus a sample. Go through the criteria proven by acceptance test that have no rejected assumption; criteria with a rejected assumption are written again anyway. For each one:

1. Find its test files: Grep for the criterion ID in quotes in the test folder.
2. Literals: run `literals --spec specs/<spec> --id <ID> -- <test files>`. It lists strings and patterns in assertions that appear neither in the criterion nor in its assumptions and decisions.
3. Blind copies: run `blind-copy <test files>`. It writes copies without test titles, tags, comments and criterion IDs, and prints their paths.
4. Back-translation: start the `test-back-translator` agent with only the paths of the blind copies. Give it nothing else: no criterion, no ID, no spec name, no hint at what to look for.
5. Compare the back-translation with the criterion's Then and Rejects. Flag the criterion if the back-translation does not check what Rejects says the wrong implementation fails on, if it checks something that neither the criterion nor a decision says, if it observes a record the system writes about itself instead of the behaviour, or if step 2 found literals.

Then pick the sample: run `sample 2 <IDs of the unflagged criteria>`. Use exactly the IDs it prints; do not choose them yourself.

Ask the user about every flagged and every sampled criterion, one per AskUserQuestion call. `header`: the criterion ID. `question`: the criterion's Given, When, Then and Rejects, the back-translation, the literals with file and line, and your comparison in at most two sentences, starting with `Comparison, not a verdict:`. For a sampled criterion, say that it was sampled and not flagged. Options:

- `ok`, description `The tests decide the criterion as written.`
- `too weak`, description `The wrong implementation from Rejects would pass.`
- `too strict`, description `The tests check something the criterion does not say.`
- `wrong channel`, description `The tests observe a record or an internal instead of the behaviour.`

If the user writes a free text instead, ask which of the four verdicts it is. For any verdict other than `ok`, ask in a plain message what the tests of this criterion must observe instead, and apply the same three checks as for a rejection text.

Write approval.md in the spec folder after each answer, one section per criterion proven by acceptance test, in this format:

```markdown
## AC-007

**Reviewed:** flagged | sample | not reviewed
**Verdict:** ok | too weak | too strict | wrong channel
**Observe:** <the user's text, only when the verdict is not ok>
```

A criterion that was neither flagged nor sampled gets `**Reviewed:** not reviewed` and an empty verdict. Do not ask about it, and do not count it as approved.

## Stopping

The user may stop at any time, by dismissing a question or typing `stop`. Write nothing for the open question and end. What is written stays; running the skill again continues with the first undecided assumption, then with the first flagged or sampled criterion in approval.md without a verdict.

## End

Say how many assumptions are accepted and rejected, how many criteria were flagged, sampled and not reviewed, and which criteria Doppelblind will write again: those with a rejected assumption or a verdict other than `ok`. The next step is to start the test author on this spec again.
