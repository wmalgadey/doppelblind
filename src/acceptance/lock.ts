import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DoppelblindError } from "../errors.ts";
import { STATE_DIR } from "../spec/state.ts";

/** Where the locks live: in the run state, out of reach of the test author's writes. */
export const LOCKS_DIR = `${STATE_DIR}/locks`;

/** Freezes a spec's acceptance tests and review file: their inventory with the hash of each file. */
export interface Lock {
  spec: string;
  specSha256: string;
  lockedAt: string;
  /** The test author run that wrote the files. */
  run: string;
  files: { path: string; sha256: string }[];
  /** Every acceptance test with the criterion it counts for, from the orchestrator's own test result. */
  tests: { file: string; name: string; criterion: string }[];
}

/** Project path of the lock of the spec in folder `specFolderName`. */
export function lockPath(specFolderName: string): string {
  return `${LOCKS_DIR}/${specFolderName}.json`;
}

export function readLock(root: string, specFolderName: string): Lock | undefined {
  const file = path.join(root, lockPath(specFolderName));
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new DoppelblindError(`${lockPath(specFolderName)} is not valid JSON.`, [(err as Error).message]);
  }
}

export function writeLock(root: string, specFolderName: string, lock: Lock): string {
  const file = path.join(root, lockPath(specFolderName));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(lock, null, 2) + "\n");
  return lockPath(specFolderName);
}
