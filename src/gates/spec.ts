import type { SpecOutput } from "../roles/spec-agent/index.ts";
import type { Source } from "../sources.ts";

/**
 * Deterministic checks on a spec that its schema cannot express:
 * IDs are unique, no open question reuses the ID of an answered one or depends on an unknown question,
 * and every citation names an allowed source and an anchor present in it.
 * Returns one message per problem; an empty list means the spec passes.
 */
export function checkSpec(spec: SpecOutput, sources: Source[], answeredIds: string[] = []): string[] {
  const problems: string[] = [];
  problems.push(...duplicates("criterion", spec.criteria.map((c) => c.id)));
  problems.push(...duplicates("open question", spec.open_questions.map((q) => q.id)));
  for (const q of spec.open_questions) {
    if (answeredIds.includes(q.id)) problems.push(`Open question ${q.id} reuses the ID of an answered question.`);
  }
  const questionIds = [...spec.open_questions.map((q) => q.id), ...answeredIds];
  for (const q of spec.open_questions) {
    for (const id of q.depends_on ?? []) {
      if (id === q.id) problems.push(`Open question ${q.id} depends on itself.`);
      else if (!questionIds.includes(id)) problems.push(`Open question ${q.id} depends on ${id}, which is not a question of this spec.`);
    }
  }

  const byPath = new Map(sources.map((s) => [s.path, s.content]));
  for (const criterion of spec.criteria) {
    for (const { path, anchor } of criterion.sources) {
      const content = byPath.get(path);
      if (content === undefined) {
        problems.push(`${criterion.id} cites ${path}, which is not a binding source.`);
      } else if (!content.includes(anchor)) {
        problems.push(`${criterion.id} cites "${anchor}" in ${path}, which does not appear there.`);
      }
    }
  }
  return problems;
}

function duplicates(kind: string, ids: string[]): string[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) reported.add(id);
    seen.add(id);
  }
  return [...reported].map((id) => `Duplicate ${kind} ID ${id}.`);
}
