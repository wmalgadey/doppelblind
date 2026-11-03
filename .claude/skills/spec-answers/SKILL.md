---
name: spec-answers
description: Walk through the open questions of a spec.md and write the user's answers into its Answer fields. Use when the user wants to answer the open questions of a spec.
model: sonnet
---

# Answer the open questions of a spec

Answers are binding sources: the spec agent turns every answer into criteria, including examples and side remarks. You ask and may offer suggested answers; the user decides. You never complete or rephrase an answer the user wrote.

## Unanswered questions

An open question is unanswered when its **Answer:** field is empty or holds only the marker `unanswered`. Every other text in the field is an answer.

## Which spec

If the user names no spec, list the folders under `specs/` that have a spec.md with at least one unanswered question, and ask which one.

## Order

Go through the unanswered open questions. Ask a question only after every question in its "Depends on" line has been asked.

At the start, count the open questions in spec.md and how many of them are not unanswered. The position of a question is that number of answered questions plus one for each question asked in this session so far; the total is the number of open questions. Count again from the file when the skill is run again.

## Each question

Ask with the AskUserQuestion tool, one question per call:

- `header`: the question ID, e.g. `Q-03`.
- `question`: starts with the position, e.g. `Question 4 of 21:`, then the question's text exactly as in spec.md, then its context line, then the IDs of the criteria whose "Open questions" line lists this question. If none does, say so.
- `options`, in this order:
  - one or two suggested answers (see below)
  - label `free`, description `Left open on purpose; nobody tests it.`
  - label `out of scope`, description `Not part of this change.`

The tool adds a free text field itself and allows at most four options, so offer at most two suggestions. Add no other options.

## Suggested answers

Once, before the first question, read spec.md, its brief, `docs/product.md`, `docs/decisions.md` and the answers.md of the other specs. Do not search the code, and do not read these files again for each question. Build one or two suggestions per question from what you read; where it says nothing, use a reasonable best guess.

Each suggestion:

- `label`: a short name for the answer, 1 to 5 words.
- `preview`: the full answer text, exactly as it would be written into spec.md. It answers the question asked and contains no example ("e.g.", "for example", "such as", "z. B."), since the spec agent may make an example binding.
- `description`: where the suggestion comes from, as a file path with the section or line, or `Best guess; nothing found in the project.`

Never present a suggestion as decided: two suggestions must differ in substance, and you never pick one for the user.

## Chosen suggestions

When the user chooses a suggestion, its answer is the suggestion's `preview` text, unchanged. Do not write its label or description. If the user adds notes to the choice, ask whether the notes replace the suggestion, are appended to it, or are dropped, and treat any text that ends up in the answer as a free text answer.

## Free text answers

Take the user's text exactly as written. Do not shorten, translate, correct or complete it.

Before you accept it, check two things and tell the user only what you find, in one sentence each:

- It contains an example ("e.g.", "for example", "such as", "z. B."). Say that the spec agent may make the example binding, and ask whether to keep the text as it is.
- It does not answer the question that was asked. Say which question it seems to answer, and ask whether to keep it here.

If the user keeps the text, keep it unchanged.

## Writing

Write each answer into spec.md as soon as the user has given it, before you ask the next question. Do not collect answers.

Write it with the Edit tool on the line after its **Answer:** field, followed by an empty line; if the field holds the marker `unanswered`, replace the marker with the answer. Change nothing else in spec.md: no criterion, no question, no heading. Do not read spec.md again before each write; if the Edit fails because the file changed, read it once and retry.

## Stopping

The user may stop at any time: by dismissing a question, or by typing `stop` as the answer. Then write nothing for that question and end. Answers already written stay. Running the skill again continues with the first question that is still unanswered.