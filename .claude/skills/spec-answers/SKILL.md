---
name: spec-answers
description: Record the user's answers to the open questions in a specs/<folder>/spec.md. Use when the user wants to answer, or go through, the open questions of a spec.
---

# Answer open questions

Each open question in a `spec.md` has an empty `**Answer:**` line. The next round of the spec agent reads every answer that is not empty and treats it as a binding source: it works the answer into the criteria and cites it. The user makes the decision; you record it.

## Which spec

Use the spec the user names. If they name none and the spec.md open in the editor has open questions, use that one. Otherwise list the specs under `specs/` that have unanswered questions and ask which one.

## Write only what the user said

Every answer comes from what the user said in this conversation, in their words. Do not answer a question from your own reasoning, from the code or from other documents, and do not add details, reasons or alternatives the user did not give.

If the user asks for your view, give it in the conversation and mark it as yours; record only what they then decide. If an answer is unclear, or leaves part of the question undecided, ask, one question at a time.

If the user answers with a technical solution, ask what it should achieve, and suggest recording that. A spec cites only what binds the spec, not how it is built. The user decides what is recorded.

## How to ask

- Go through the questions whose answer is empty, in their order. Skip questions that already have an answer, unless the user asks to change one.
- Ask a question before the questions that list it under `_Depends on:_`.
- Ask one question at a time. Show its ID, its text and its context, as they appear in the spec.
- The user may skip a question; its answer stays empty, and the spec agent asks it again in the next round.
- The user may leave a decision open on purpose. Then the answer starts with the word `free`, optionally followed by the user's reason.

## Answer format

The answer goes in the lines between `**Answer:**` and the next heading:

```
### Q-07

<question>

_Context: <context>_

**Answer:**

<the user's answer>
```

- Change nothing else in the spec.md: not the question, the context, the criteria or other answers.
- An answer must not contain a Markdown heading: a line starting with `## ` or `### Q-` ends the answer for the reader in `src/spec/answers.ts`. Use a list or plain lines instead.

## When to write

Write each answer as soon as the user has given it, before you ask the next question. Do not ask for confirmation first; the user reads the answers in the spec.md.

## At the end

Name the questions that are still unanswered. Tell the user that `doppelblind spec <brief>` with the brief linked at the top of the spec starts the next round, which writes the spec afresh from the brief, the sources and every answer.
