import { readFileSync } from "node:fs";
import path from "node:path";
import type { Source } from "../../sources.ts";

export interface Citation {
  path: string;
  anchor: string;
}

export interface Criterion {
  id: string;
  title: string;
  given: string;
  when: string;
  then: string;
  sources: Citation[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  /** IDs of the criteria whose behaviour the answer would change. */
  concerns: string[];
  /** The step of the brief the question is about. */
  context?: string;
  /** IDs of the questions whose answers this one depends on. */
  depends_on?: string[];
}

/** The spec agent's output, as its schema describes it. */
export interface SpecOutput {
  title: string;
  short_name: string;
  criteria: Criterion[];
  wishes: string[];
  open_questions: OpenQuestion[];
  /** Decisions the user left open on purpose. */
  left_open: string[];
}

const dir = import.meta.dirname;

export const systemPrompt: string = readFileSync(path.join(dir, "prompt.md"), "utf8");
export const schema: object = JSON.parse(readFileSync(path.join(dir, "schema.json"), "utf8"));

/**
 * The only input the spec agent gets: the brief, the binding sources and,
 * when the brief was specified before, every answer given so far. Never an earlier spec.
 */
export function buildUserMessage(brief: Source, sources: Source[], answers?: Source): string {
  const parts = [`<brief path="${brief.path}">\n${brief.content.trim()}\n</brief>`];
  for (const s of sources) {
    if (s.path === brief.path) continue;
    parts.push(`<source path="${s.path}">\n${s.content.trim()}\n</source>`);
  }
  if (answers) parts.push(`<answers path="${answers.path}">\n${answers.content.trim() || "None."}\n</answers>`);
  parts.push("Write the specification for this brief.");
  return parts.join("\n\n");
}
