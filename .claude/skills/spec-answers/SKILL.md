---
name: spec-answer
description: Walk through the open questions of a spec.md and write the user's answers into its Answer fields. Use when the user wants to answer the open questions of a spec.
---

# Answer the open questions of a spec

Answers are binding sources: the spec agent turns every answer into criteria, including examples and side remarks. You ask; the user decides. You never suggest, complete or rephrase an answer.

## Which spec

If the user names no spec, list the folders under `specs/` that have a spec.md with at least one empty **Answer:** field, and ask which one.

## Order

Go through the open questions that have an empty **Answer:** field. Ask a question only after every question in its "Depends on" line has been asked.

At the start, count the open questions in spec.md and how many of them already have an answer. The position of a question is that number of answered questions plus one for each question asked in this session so far; the total is the number of open questions. Count again from the file when the skill is run again.

## Each question

Ask with the AskUserQuestion tool, one question per call:

- `header`: the question ID, e.g. `Q-03`.
- `question`: starts with the position, e.g. `Question 4 of 21:`, then the question's text exactly as in spec.md, then its context line, then the IDs of the criteria whose "Open questions" line lists this question. If none does, say so.
- `options`, exactly these two, in this order:
  - label `free`, description `Left open on purpose; nobody tests it.`
  - label `out of scope`, description `Not part of this change.`

The tool adds a free text field itself. Add no other options, and never an option that answers the question.

## Free text answers

Take the user's text exactly as written. Do not shorten, translate, correct or complete it.

Before you accept it, check two things and tell the user only what you find, in one sentence each:

- It contains an example ("e.g.", "for example", "such as", "z. B."). Say that the spec agent may make the example binding, and ask whether to keep the text as it is.
- It does not answer the question that was asked. Say which question it seems to answer, and ask whether to keep it here.

If the user keeps the text, keep it unchanged.

## Writing

Write each answer into spec.md as soon as the user has given it, before you ask the next question. Do not collect answers.

Write it on the line after its **Answer:** field, followed by an empty line. Change nothing else in spec.md: no criterion, no question, no heading. Read spec.md again before each write, so that you never overwrite a change made in between.

## Stopping

The user may stop at any time: by dismissing a question, or by typing `stop` as the answer. Then write nothing for that question and end. Answers already written stay. Running the skill again continues with the first question whose **Answer:** field is still empty.