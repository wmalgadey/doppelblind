import type { SpecOutput } from "../roles/spec-agent/index.ts";
import { renderAnswers, type AnsweredQuestion } from "./answers.ts";

/**
 * Renders a spec as Markdown. `briefLink` is the brief's path relative to the spec file.
 * `answered` are the questions answered in earlier runs; they are kept as they are.
 */
export function renderSpec(spec: SpecOutput, briefPath: string, briefLink: string, answered: AnsweredQuestion[] = []): string {
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
  }

  lines.push("## Wishes", "");
  if (spec.wishes.length === 0) lines.push("None.", "");
  else lines.push(...spec.wishes.map((w) => `- ${w}`), "");

  lines.push("## Open questions", "");
  if (spec.open_questions.length === 0) lines.push("None.", "");
  for (const q of spec.open_questions) {
    lines.push(`### ${q.id}`, "", q.question, "");
    if (q.context) lines.push(`_Context: ${q.context}_`, "");
    lines.push("**Answer:**", "", "");
  }

  if (answered.length > 0) lines.push("## Answered questions", "", ...renderAnswers(answered));

  return lines.join("\n").trimEnd() + "\n";
}
