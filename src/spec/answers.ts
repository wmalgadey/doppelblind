/** An open question of a spec that the user has answered in spec.md. */
export interface AnsweredQuestion {
  id: string;
  question: string;
  answer: string;
}

/** An answer kept across rounds; its ID is only meaningful within the round it was asked in. */
export interface Answer extends AnsweredQuestion {
  round: number;
}

export const ANSWERS_FILE = "answers.md";

/** The answer that leaves a decision open on purpose. */
export const FREE = "free";
/** The answer that puts a decision outside this change. */
export const OUT_OF_SCOPE = "out of scope";

const QUESTION_HEADING = /^### (Q-\d{2,})[ \t]*$/m;
const ROUND_HEADING = /^## Round (\d+)[ \t]*$/m;
const ANSWER_MARK = "**Answer:**";

/** Reads every question in a rendered spec.md whose answer is not empty or whitespace only. */
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
    const question = body.slice(0, mark).replace(/^_(Context|Depends on): .*_$/gm, "").trim();
    answered.push({ id: parts[i], question, answer });
  }
  return answered;
}

/** Renders answered questions in the layout `readAnswers` reads back. */
export function renderAnswers(answered: AnsweredQuestion[]): string[] {
  return answered.flatMap((q) => [`### ${q.id}`, "", q.question, "", ANSWER_MARK, "", q.answer, ""]);
}

/** Reads the answers of every round from an answers.md that `renderAnswerLog` wrote. */
export function readAnswerLog(markdown: string): Answer[] {
  const parts = markdown.split(ROUND_HEADING);
  const answers: Answer[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const round = Number(parts[i]);
    answers.push(...readAnswers(parts[i + 1]).map((a) => ({ ...a, round })));
  }
  return answers;
}

/** Renders the answers of every round, grouped by the round whose spec asked them. */
export function renderAnswerLog(answers: Answer[]): string {
  const lines = ["# Answers", ""];
  for (const round of [...new Set(answers.map((a) => a.round))].sort((a, b) => a - b)) {
    lines.push(`## Round ${round}`, "", ...renderAnswers(answers.filter((a) => a.round === round)));
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Renders answers as the spec agent gets them: each question's text and its answer, without IDs or rounds. */
export function renderAnswerList(answers: AnsweredQuestion[]): string {
  const lines = ["# Answers", ""];
  for (const a of answers) lines.push(`**Question:** ${a.question}`, "", ANSWER_MARK, "", a.answer, "");
  return lines.join("\n").trimEnd() + "\n";
}
