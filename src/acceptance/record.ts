import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DoppelblindError } from "../errors.ts";
import { STATE_DIR } from "../spec/state.ts";
import type { TestResult } from "./test-run.ts";

/** Where the orchestrator records the last completed test author run of each spec, out of the test author's reach. */
export const RECORDS_DIR = `${STATE_DIR}/test-author`;

/** The last completed test author run of a spec: what it produced, and which decisions it received. */
export interface TestAuthorRecord {
  /** Project path of the run folder. */
  run: string;
  tests: { file: string; name: string; criterion: string; assumptions: string[] }[];
  helpers: string[];
  review?: string;
  /** The orchestrator's own test result before any implementation, each test with the criterion it counts for. */
  results: TestResult[];
  /** Every decided assumption the run received, by ID: its Decision field as the user wrote it. */
  handed: Record<string, string>;
  /** Set while the lock waits for decisions on assumptions in assumptions.md. */
  awaitingDecisions?: true;
}

export function recordPath(specFolderName: string): string {
  return `${RECORDS_DIR}/${specFolderName}.json`;
}

export function readRecord(root: string, specFolderName: string): TestAuthorRecord | undefined {
  const file = path.join(root, recordPath(specFolderName));
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new DoppelblindError(`${recordPath(specFolderName)} is not valid JSON.`, [(err as Error).message]);
  }
}

export function writeRecord(root: string, specFolderName: string, record: TestAuthorRecord): void {
  const file = path.join(root, recordPath(specFolderName));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
}

