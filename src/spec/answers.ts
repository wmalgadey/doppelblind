/** An open question of an earlier spec that the user has answered in spec.md. */
export interface AnsweredQuestion {
  id: string;
  question: string;
  answer: string;
}

const QUESTION_HEADING = /^### (Q-\d{2,})[ \t]*$/m;
const ANSWER_MARK = "**Answer:**";

/** Reads every question in a rendered spec.md whose answer is not empty, open or answered in an earlier run. */
export function readAnswers(markdown: string): AnsweredQuestion[] {
  const parts = markdown.split(QUESTION_HEADING);
  const answered: AnsweredQuestion[] = [];
  // split with a capture group yields [before, id, body, id, body, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1].split(/^## /m)[0];
    const mark = body.indexOf(ANSWER_MARK);
    if (mark < 0) continue;
    const answer = body.slice(mark + ANSWER_MARK.length).trim();
    if (answer === "") continue;
    const question = body.slice(0, mark).replace(/^_Context: .*_$/m, "").trim();
    answered.push({ id: parts[i], question, answer });
  }
  return answered;
}

/** Renders answered questions in the layout `readAnswers` reads back. */
export function renderAnswers(answered: AnsweredQuestion[]): string[] {
  return answered.flatMap((q) => [`### ${q.id}`, "", q.question, "", ANSWER_MARK, "", q.answer, ""]);
}
