import type { OpenQuestion, SpecOutput } from "../roles/spec-agent/index.ts";
import { FREE, OUT_OF_SCOPE, type Answer } from "./answers.ts";

/** What the orchestrator records about a spec's questions, besides the agent's output. */
export interface QuestionRecord {
  /** Every answer given so far, as answers.md holds them. */
  answers: Answer[];
  /** IDs of the spec's questions that the spec step finished without an answer. */
  unanswered: string[];
}

export interface QuestionSections {
  open: OpenQuestion[];
  leftOpen: Answer[];
  outOfScope: Answer[];
  unanswered: OpenQuestion[];
}

const NO_RECORD: QuestionRecord = { answers: [], unanswered: [] };

/**
 * Sorts questions into the sections of spec.md: a question of the spec is open until it has an answer
 * or is recorded as unanswered; every answer `free` or `out of scope`, to any spec-create run, is listed as such.
 */
export function questionSections(spec: SpecOutput, record: QuestionRecord = NO_RECORD): QuestionSections {
  const answered = new Set(record.answers.map((a) => a.id));
  return {
    open: spec.open_questions.filter((q) => !answered.has(q.id) && !record.unanswered.includes(q.id)),
    leftOpen: record.answers.filter((a) => a.answer === FREE),
    outOfScope: record.answers.filter((a) => a.answer === OUT_OF_SCOPE),
    unanswered: spec.open_questions.filter((q) => record.unanswered.includes(q.id)),
  };
}

/** Renders a spec as Markdown. `briefLink` is the brief's path relative to the spec file. */
export function renderSpec(spec: SpecOutput, briefPath: string, briefLink: string, record: QuestionRecord = NO_RECORD): string {
  const sections = questionSections(spec, record);
  // only the spec's own questions concern its criteria
  const own = new Set(spec.open_questions.map((q) => q.id));
  const current = (answers: Answer[]) => answers.filter((a) => own.has(a.id)).map((a) => a.id);
  const byCriterion: [string, string[]][] = [
    ["Open questions", sections.open.map((q) => q.id)],
    ["Left open", current(sections.leftOpen)],
    ["Out of scope", current(sections.outOfScope)],
    ["Unanswered", sections.unanswered.map((q) => q.id)],
  ];

  const lines = [`# ${spec.title}`, "", `Brief: [${briefPath}](${briefLink})`, "", "## Criteria", ""];

  for (const c of spec.criteria) {
    lines.push(
      `### ${c.id}: ${c.title}`,
      "",
      `- **Given** ${c.given}`,
      `- **When** ${c.when}`,
      `- **Then** ${c.then}`,
      "",
      `Sources: ${c.sources.map((s) => `\`${s.path}\` › ${s.anchor}`).join("; ")}`,
      "",
    );
    for (const [section, ids] of byCriterion) {
      const questions = spec.open_questions.filter((q) => q.concerns.includes(c.id) && ids.includes(q.id)).map((q) => q.id);
      if (questions.length > 0) lines.push(`${section}: ${questions.join(", ")}`, "");
    }
  }

  lines.push("## Wishes", "");
  if (spec.wishes.length === 0) lines.push("None.", "");
  else lines.push(...spec.wishes.map((w) => `- ${w}`), "");

  for (const [section, answers] of [["Left open", sections.leftOpen], ["Out of scope", sections.outOfScope]] as const) {
    lines.push(`## ${section}`, "");
    if (answers.length === 0) lines.push("None.", "");
    else lines.push(...answers.map((a) => `- ${a.id}: ${a.question}`), "");
  }

  lines.push("## Unanswered", "");
  if (sections.unanswered.length === 0) lines.push("None.", "");
  else lines.push(...sections.unanswered.map((q) => `- ${q.id}: ${q.question}`), "");

  lines.push("## Open questions", "");
  if (sections.open.length === 0) lines.push("None.", "");
  for (const q of sections.open) {
    lines.push(`### ${q.id}`, "", q.question, "");
    if (q.context) lines.push(`_Context: ${q.context}_`, "");
    if (q.depends_on?.length) lines.push(`_Depends on: ${q.depends_on.join(", ")}_`, "");
    lines.push("**Answer:**", "", "");
  }

  return lines.join("\n").trimEnd() + "\n";
}
