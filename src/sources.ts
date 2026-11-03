import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Contract } from "./contract.ts";
import { DoppelblindError } from "./errors.ts";

export interface Source {
  /** Project-relative POSIX path; this is how a criterion cites it. */
  path: string;
  content: string;
}

export interface LoadedSources {
  brief: Source;
  /** Every declared source that exists, besides the brief. */
  others: Source[];
  /** Declared sources that do not exist (yet). */
  missing: string[];
}

export function loadSources(contract: Contract, briefPath: string): LoadedSources {
  const brief = { path: briefPath, content: readBrief(contract.root, briefPath) };
  const others: Source[] = [];
  const missing: string[] = [];
  for (const p of contract.sources) {
    if (p === briefPath) continue;
    const file = path.join(contract.root, p);
    if (isFile(file)) {
      others.push({ path: p, content: readFileSync(file, "utf8") });
    } else {
      missing.push(p);
    }
  }
  return { brief, others, missing };
}

function readBrief(root: string, briefPath: string): string {
  const file = path.join(root, briefPath);
  if (!isFile(file)) {
    throw new DoppelblindError(`Brief not found: ${briefPath}`);
  }
  const content = readFileSync(file, "utf8");
  if (content.trim() === "") throw new DoppelblindError(`Brief is empty: ${briefPath}`);
  return content;
}

function isFile(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}
