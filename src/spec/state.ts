import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SpecOutput } from "../roles/spec-agent/index.ts";
import { DoppelblindError } from "../errors.ts";

export const STATE_FILE = ".doppelblind/specs.json";

export type SpecStatus = "ready" | "open" | "limit reached";

/** What the orchestrator records about the spec of one brief; nothing in it comes from the spec agent. */
export interface BriefState {
  /** Project-relative path of the folder that holds the brief's spec.md. */
  folder: string;
  /** Spec rounds run so far for the brief. */
  rounds: number;
  status: SpecStatus;
}

/** The recorded state of every brief that has a spec, keyed by the brief's project-relative path. */
export function readState(root: string): Record<string, BriefState> {
  const file = path.join(root, STATE_FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new DoppelblindError(`${STATE_FILE} is not valid JSON.`, [(err as Error).message]);
  }
}

export function writeState(root: string, brief: string, state: BriefState): void {
  const all = { ...readState(root), [brief]: state };
  mkdirSync(path.join(root, path.dirname(STATE_FILE)), { recursive: true });
  writeFileSync(path.join(root, STATE_FILE), JSON.stringify(all, null, 2) + "\n");
}

/** `ready` when no open question concerns a criterion; `open` otherwise. */
export function specStatus(spec: SpecOutput): "ready" | "open" {
  return spec.open_questions.some((q) => q.concerns.length > 0) ? "open" : "ready";
}
