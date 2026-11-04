import type { SpecOutput } from "../roles/spec-agent/index.ts";

/** The number of a question ID such as `Q-07`. */
export function questionNumber(id: string): number {
  return Number(id.slice(2));
}

/** The highest question number among `ids`; 0 if there is none. */
export function highestQuestion(ids: string[]): number {
  return Math.max(0, ...ids.map(questionNumber));
}

/**
 * Renumbers the agent's open questions so that they follow `after`, the highest number of a question the brief still
 * has: one answered so far. The agent numbers from Q-01 in every spec-create run; after renumbering, no new question
 * takes the ID of an answered one. Numbers of questions that were never answered are given out again. `depends_on`
 * follows the new IDs.
 */
export function renumberQuestions(spec: SpecOutput, after: number): SpecOutput {
  const ids = new Map(spec.open_questions.map((q, i) => [q.id, `Q-${String(after + i + 1).padStart(2, "0")}`]));
  const renamed = (id: string) => ids.get(id) ?? id;
  return {
    ...spec,
    open_questions: spec.open_questions.map((q) => ({
      ...q,
      id: renamed(q.id),
      ...(q.depends_on && { depends_on: q.depends_on.map(renamed) }),
    })),
  };
}
