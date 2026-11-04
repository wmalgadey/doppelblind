import { findField } from "./field.ts";

/** The file next to spec.md in which the user decides the test author's assumptions. */
export const ASSUMPTIONS_FILE = "assumptions.md";

export const ACCEPTED = "accepted";
export const REJECTED = "rejected";

/** An assumption the test author made, with the test files that rest on it; its ID is unique within a spec. */
export interface Assumption {
  id: string;
  criterion: string;
  assumption: string;
  files: string[];
}

export type Decision = { kind: "accepted" } | { kind: "rejected"; text: string };

/** An assumption as assumptions.md holds it, with what its Decision field says. */
export interface RecordedAssumption extends Assumption {
  /** The Decision field as written, trimmed; empty when the user has not decided yet. */
  raw: string;
  /** The decision; undefined when the field is empty or not a valid decision. */
  decision?: Decision;
  /** Why the field is not a valid decision; undefined when it is valid. */
  problem?: string;
}

const SECTION_HEADING = /^## (A-\d{3,})[ \t]*$/m;
const CRITERION = /^\*\*Criterion:\*\*[ \t]*(.*)$/m;
const ASSUMPTION_MARK = "**Assumption:**";
const FILES_MARK = "**Test files:**";
const DECISION_MARK = "**Decision:**";
const NO_FILES = "None.";

/**
 * Reads a decision: `accepted`, or `rejected: <text>` with a text of the user's own. Anything else, `rejected`
 * without a text among it, is no valid decision.
 */
export function parseDecision(raw: string): { decision?: Decision; problem?: string } {
  const value = raw.trim();
  if (value === "") return { problem: "no decision" };
  if (value.toLowerCase() === ACCEPTED) return { decision: { kind: "accepted" } };
  const rejected = /^rejected[ \t]*(?::([\s\S]*))?$/i.exec(value);
  if (rejected) {
    const text = (rejected[1] ?? "").trim();
    if (text === "") return { problem: `"${value}" gives no text; write rejected: <what applies instead>` };
    return { decision: { kind: "rejected", text } };
  }
  return { problem: `"${value}" is not a decision; write ${ACCEPTED} or ${REJECTED}: <what applies instead>` };
}

/** Reads every assumption section of an assumptions.md in the layout `renderAssumptions` writes. */
export function readAssumptions(markdown: string): RecordedAssumption[] {
  const parts = markdown.split(SECTION_HEADING);
  const result: RecordedAssumption[] = [];
  // split with a capture group yields [before, id, body, id, body, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1];
    const mark = findField(body, DECISION_MARK);
    const head = mark ? body.slice(0, mark.start) : body;
    const raw = mark ? body.slice(mark.end).trim() : "";
    const assumptionAt = head.indexOf(ASSUMPTION_MARK);
    const filesAt = findField(head, FILES_MARK)?.start ?? -1;
    const assumption = assumptionAt < 0 ? "" : head.slice(assumptionAt + ASSUMPTION_MARK.length, filesAt < 0 ? undefined : filesAt).trim();
    const files = filesAt < 0 ? [] : [...head.slice(filesAt).matchAll(/^- (.+)$/gm)].map((m) => m[1].trim());
    const parsed = !mark ? { problem: `no ${DECISION_MARK} field` } : parseDecision(raw);
    result.push({ id: parts[i], criterion: CRITERION.exec(head)?.[1].trim() ?? "", assumption, files, raw, ...parsed });
  }
  return result;
}

/**
 * Renders assumptions.md: one section per assumption, headed by its ID, with its criterion, its text, the test
 * files that rest on it and its Decision field, empty or as the user wrote it.
 */
export function renderAssumptions(specLink: string, entries: (Assumption & { raw?: string })[]): string {
  const lines = [
    "# Assumptions",
    "",
    `Decisions the test author made that the criteria of [spec.md](${specLink}) do not. Decide each one in its ` +
      `Decision field: \`${ACCEPTED}\`, or \`${REJECTED}: <what applies instead>\`. The acceptance tests are locked ` +
      "only once every assumption is decided; a rejected one starts the test author again. Every decision binds the " +
      "later test author runs and spec-create runs of this spec.",
    "",
  ];
  for (const a of entries) {
    lines.push(
      `## ${a.id}`,
      "",
      `**Criterion:** ${a.criterion}`,
      "",
      `${ASSUMPTION_MARK} ${a.assumption}`,
      "",
      FILES_MARK,
      "",
      ...(a.files.length > 0 ? a.files.map((f) => `- ${f}`) : [NO_FILES]),
      "",
      DECISION_MARK,
      "",
      ...(a.raw ? [a.raw, ""] : []),
    );
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** What a decision makes binding: the assumption's text when accepted, the user's text when rejected. */
export function decidedText(a: RecordedAssumption): string | undefined {
  if (!a.decision) return undefined;
  return a.decision.kind === "accepted" ? a.assumption : a.decision.text;
}

/** One line for each assumption without a valid decision, naming the assumption and what is wrong. */
export function undecided(entries: RecordedAssumption[]): string[] {
  return entries.filter((a) => a.problem).map((a) => `${a.id} (${a.criterion}): ${a.problem}`);
}

/** The number of an assumption ID such as `A-007`. */
export function assumptionNumber(id: string): number {
  return Number(id.slice(2));
}

export function assumptionId(n: number): string {
  return `A-${String(n).padStart(3, "0")}`;
}
