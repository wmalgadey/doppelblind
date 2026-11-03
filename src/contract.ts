import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DoppelblindError } from "./errors.ts";

export const CONTRACT_FILE = ".doppelblind.conf";

/** What a project declares in its `.doppelblind.conf`. Paths are relative to `root`. */
export interface Contract {
  root: string;
  /** Binding sources a criterion may cite, besides the brief itself. */
  sources: string[];
  /** Directory that holds the numbered spec folders. */
  specs: string;
}

const DEFAULTS = { sources: ["docs/product.md", "docs/decisions.md"], specs: "specs" };

/** Finds the project root (the nearest directory with a contract file) and loads its contract. */
export function loadContract(cwd: string): Contract {
  const root = findRoot(cwd);
  if (!root) return { root: cwd, ...DEFAULTS };

  const file = path.join(root, CONTRACT_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new DoppelblindError(`${file} is not valid JSON.`, [(err as Error).message]);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DoppelblindError(`${file} must contain a JSON object.`);
  }

  const { sources = DEFAULTS.sources, specs = DEFAULTS.specs } = raw as Record<string, unknown>;
  if (!Array.isArray(sources) || !sources.every((s) => typeof s === "string")) {
    throw new DoppelblindError(`${file}: "sources" must be a list of paths.`);
  }
  if (typeof specs !== "string" || specs.trim() === "") {
    throw new DoppelblindError(`${file}: "specs" must be a path.`);
  }
  return {
    root,
    sources: sources.map((s) => toProjectPath(root, path.resolve(root, s))),
    specs: toProjectPath(root, path.resolve(root, specs)),
  };
}

/** Converts an absolute path to a project-relative POSIX path; rejects paths outside the project. */
export function toProjectPath(root: string, absolute: string): string {
  const relative = path.relative(root, absolute);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DoppelblindError(`${absolute} is outside the project at ${root}.`);
  }
  return relative.split(path.sep).join("/");
}

function findRoot(start: string): string | undefined {
  let dir = path.resolve(start);
  while (true) {
    if (existsSync(path.join(dir, CONTRACT_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
