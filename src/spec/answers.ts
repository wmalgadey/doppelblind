/** An open question the user has answered; its ID names the same question across all spec-create runs of a brief. */
export interface Answer {
  id: string;
  question: string;
  answer: string;
}

export const ANSWERS_FILE = "answers.md";

/** The answer that leaves a decision open on purpose. */
export const FREE = "free";
/** The answer that puts a decision outside this change. */
export const OUT_OF_SCOPE = "out of scope";
/** A marker in spec.md for a question the user has not answered; it is not an answer. */
export const UNANSWERED = "unanswered";

const QUESTION_HEADING = /^### (Q-\d{2,})[ \t]*$/m;
const ANSWER_MARK = "**Answer:**";

/**
 * Reads every question in a rendered spec.md or answers.md whose answer is neither empty, whitespace only,
 * nor the marker `unanswered`.
 */
export function readAnswers(markdown: string): Answer[] {
  const parts = markdown.split(QUESTION_HEADING);
  const answered: Answer[] = [];
  // split with a capture group yields [before, id, body, id, body, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1].split(/^## /m)[0];
    const mark = body.indexOf(ANSWER_MARK);
    if (mark < 0) continue;
    const answer = body.slice(mark + ANSWER_MARK.length).trim();
    if (answer === "" || answer === UNANSWERED) continue;
    const question = body.slice(0, mark).replace(/^_(Context|Depends on): .*_$/gm, "").trim();
    answered.push({ id: parts[i], question, answer });
  }
  return answered;
}

/**
 * Writes answers into the Answer fields of their questions in a rendered spec.md.
 * Only a field that is empty or holds the marker `unanswered` is written; one with an answer is kept.
 */
export function fillAnswers(markdown: string, answers: { id: string; answer: string }[]): string {
  let result = markdown;
  for (const { id, answer } of answers) {
    const heading = result.search(new RegExp(`^### ${id}[ \\t]*$`, "m"));
    if (heading < 0) continue;
    const field = result.indexOf(ANSWER_MARK, heading) + ANSWER_MARK.length;
    const rest = result.slice(field);
    const end = rest.search(/^#{2,3} /m);
    const current = (end < 0 ? rest : rest.slice(0, end)).trim();
    if (current !== "" && current !== UNANSWERED) continue;
    result = result.slice(0, field) + `\n\n${answer}\n\n` + (end < 0 ? "" : rest.slice(end));
  }
  return result.trimEnd() + "\n";
}

/** Renders answers.md: every answer given so far, in the layout `readAnswers` reads back. */
export function renderAnswerLog(answers: Answer[]): string {
  const lines = answers.flatMap((q) => [`### ${q.id}`, "", q.question, "", ANSWER_MARK, "", q.answer, ""]);
  return ["# Answers", "", ...lines].join("\n").trimEnd() + "\n";
}

/** Renders answers as the spec agent gets them: each question's text and its answer, without IDs. */
export function renderAnswerList(answers: Answer[]): string {
  const lines = ["# Answers", ""];
  for (const a of answers) lines.push(`**Question:** ${a.question}`, "", ANSWER_MARK, "", a.answer, "");
  return lines.join("\n").trimEnd() + "\n";
}
