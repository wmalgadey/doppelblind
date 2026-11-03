import { DoppelblindError } from "../errors.ts";

/** A criterion as spec.md renders it, with what the test author and the review file need. */
export interface SpecCriterion {
  id: string;
  title: string;
  given: string;
  when: string;
  then: string;
  provenBy: "test" | "review";
  /** IDs of the questions answered `free` that concern this criterion. */
  leftOpen: string[];
}

export interface ParsedSpec {
  title: string;
  criteria: SpecCriterion[];
  /** Every question answered `free`, by ID: its text. */
  leftOpen: Map<string, string>;
}

const CRITERION_HEADING = /^### (AC-\d{3,}): (.*)$/m;
const STEPS = /^- \*\*Given\*\* ([\s\S]*?)\n- \*\*When\*\* ([\s\S]*?)\n- \*\*Then\*\* ([\s\S]*?)(?:\n\n|\n?$)/m;
const PROVEN_BY = /^Proven by: (acceptance test|review)$/m;
const LEFT_OPEN = /^Left open: (.*)$/m;

/** Reads the criteria and the questions left open from a spec.md in the layout `renderSpec` writes. */
export function parseSpec(markdown: string, file: string): ParsedSpec {
  const title = /^# (.*)$/m.exec(markdown)?.[1].trim() ?? "";
  const criteriaSection = section(markdown, "Criteria");
  if (criteriaSection === undefined) throw new DoppelblindError(`${file} has no criteria section.`);

  const parts = criteriaSection.split(CRITERION_HEADING);
  const criteria: SpecCriterion[] = [];
  // split with capture groups yields [before, id, title, body, id, title, body, ...]
  for (let i = 1; i < parts.length; i += 3) {
    const [id, heading, body] = [parts[i], parts[i + 1], parts[i + 2]];
    const steps = STEPS.exec(body);
    const provenBy = PROVEN_BY.exec(body);
    if (!steps || !provenBy) throw new DoppelblindError(`${file}: ${id} has no Given, When, Then or Proven by.`);
    const leftOpen = LEFT_OPEN.exec(body)?.[1].split(",").map((q) => q.trim()).filter(Boolean) ?? [];
    criteria.push({
      id,
      title: heading.trim(),
      given: steps[1].trim(),
      when: steps[2].trim(),
      then: steps[3].trim(),
      provenBy: provenBy[1] === "review" ? "review" : "test",
      leftOpen,
    });
  }
  if (criteria.length === 0) throw new DoppelblindError(`${file} has no criteria.`);

  const leftOpen = new Map<string, string>();
  for (const match of (section(markdown, "Left open") ?? "").matchAll(/^- (Q-\d{2,}): (.*)$/gm)) {
    leftOpen.set(match[1], match[2].trim());
  }
  return { title, criteria, leftOpen };
}

/** The body of the `## name` section, up to the next section. */
function section(markdown: string, name: string): string | undefined {
  const start = markdown.search(new RegExp(`^## ${name}[ \\t]*$`, "m"));
  if (start < 0) return undefined;
  const body = markdown.slice(markdown.indexOf("\n", start) + 1);
  const end = body.search(/^## /m);
  return end < 0 ? body : body.slice(0, end);
}
