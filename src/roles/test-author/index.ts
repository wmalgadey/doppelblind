import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedSpec, SpecCriterion } from "../../spec/parse.ts";

/** A criterion as the test author gets it: no title, reason, rejects or sources. */
export interface HandedCriterion {
  id: string;
  given: string;
  when: string;
  then: string;
  /** For each question answered `free` that concerns the criterion: the aspect left to the implementer. */
  unspecified: string[];
  /** For each decided assumption on the criterion: what the user's decision makes binding. */
  decided: string[];
}

/** The test author's output, as its schema describes it. */
export interface TestAuthorOutput {
  tests: { file: string; criterion: string; assumptions: string[] }[];
  assumptions: { id: string; criterion: string; assumption: string }[];
}

export interface ReviewEntry {
  criterion: string;
  steps: string[];
  where: string;
  observe: string;
}

export interface ReviewOutput {
  entries: ReviewEntry[];
}

const dir = import.meta.dirname;
const read = (file: string) => readFileSync(path.join(dir, file), "utf8");

export const systemPrompt: string = read("prompt.md");
export const schema: object = JSON.parse(read("schema.json"));
export const reviewPrompt: string = read("review-prompt.md");
export const reviewSchema: object = JSON.parse(read("review-schema.json"));

/**
 * The criteria of `spec` proven by `provenBy`, reduced to what the test author may see, each with what the
 * decisions in `decided` (by criterion ID) make binding for it.
 */
export function handOver(spec: ParsedSpec, provenBy: SpecCriterion["provenBy"], decided: Map<string, string[]> = new Map()): HandedCriterion[] {
  return spec.criteria
    .filter((c) => c.provenBy === provenBy)
    .map((c) => ({
      id: c.id,
      given: c.given,
      when: c.when,
      then: c.then,
      unspecified: c.leftOpen.flatMap((q) => (spec.leftOpen.has(q) ? [spec.leftOpen.get(q)!] : [])),
      decided: decided.get(c.id) ?? [],
    }));
}

/**
 * The only spec content the test author gets: ID, Given, When and Then of each criterion proven by test,
 * with the aspects answered `free` and the decided assumptions, and where it writes. Never the spec file, its introduction or its questions.
 */
export function buildUserMessage(criteria: HandedCriterion[], writable: string, visible: string[]): string {
  return [
    `<criteria>\n${criteria.map((c) => renderCriterion(c)).join("\n\n")}\n</criteria>`,
    `<workspace>\nWrite your files into: ${writable}/\n\nFiles in your working directory (read-only):\n` +
      (visible.length > 0 ? visible.map((f) => `- ${f}`).join("\n") : "None.") +
      "\n</workspace>",
    "Write the acceptance tests for these criteria.",
  ].join("\n\n");
}

/** The review guide's input: the criteria proven by review, each with its title. */
export function buildReviewMessage(criteria: (HandedCriterion & { title: string })[]): string {
  const rendered = criteria.map((c) => renderCriterion(c, c.title));
  return `<criteria>\n${rendered.join("\n\n")}\n</criteria>\n\nWrite the review guide for these criteria.`;
}

function renderCriterion(c: HandedCriterion, title?: string): string {
  const lines = [
    `<criterion id="${c.id}">`,
    ...(title ? [`Title: ${title}`] : []),
    `Given: ${c.given}`,
    `When: ${c.when}`,
    `Then: ${c.then}`,
    ...c.unspecified.map((u) => `deliberately unspecified: ${u}`),
    ...c.decided.map((d) => `decided: ${d}`),
    "</criterion>",
  ];
  return lines.join("\n");
}

/**
 * Renders review.md: one section per criterion proven by review, headed by its ID, with its title, Given, When
 * and Then from the spec and the guide's steps, place and observation. It holds no place for a result.
 */
export function renderReview(specPath: string, specLink: string, criteria: SpecCriterion[], entries: ReviewEntry[]): string {
  const lines = [
    "# Review",
    "",
    `Criteria of [${specPath}](${specLink}) that are proven by review. Check each one before the merge.`,
    "",
  ];
  for (const c of criteria) {
    const entry = entries.find((e) => e.criterion === c.id)!;
    lines.push(
      `## ${c.id}: ${c.title}`,
      "",
      `- **Given** ${c.given}`,
      `- **When** ${c.when}`,
      `- **Then** ${c.then}`,
      "",
      "**Steps:**",
      "",
      ...entry.steps.map((s, i) => `${i + 1}. ${s}`),
      "",
      `**Where to check:** ${entry.where}`,
      "",
      `**What must be observed:** ${entry.observe}`,
      "",
    );
  }
  return lines.join("\n").trimEnd() + "\n";
}
