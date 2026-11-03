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
  /** Paths that hold implementation code; absent from what the test author can access. */
  implementation?: string[];
  /** Paths that hold the plan; absent from what the test author can access. */
  plan?: string[];
  /** The test author's path: each spec's acceptance tests and review file go into a folder named after the spec's. */
  acceptanceTests?: string;
  /** Command that runs one test file, with `{file}` for its path; without `{file}`, the path is appended. */
  testCommand?: string;
  /** The project's defaults for the limits; an option given at the start of a run overrides them. */
  limits: ContractLimits;
}

/** Limits a project may declare; each one left out falls back to Doppelblind's own default. */
export interface ContractLimits {
  specAgent?: { timeoutMin?: number; budgetUsd?: number };
  testAuthor?: { timeoutMin?: number; budgetUsd?: number; maxTurns?: number };
  /** Time limit for each test file in the orchestrator's own test run. */
  testFileTimeoutMin?: number;
  /** How many questions of a spec may be answered `free` before the brief counts as too vague. */
  maxFreeAnswers?: number;
}

const DEFAULTS = { sources: ["docs/product.md", "docs/decisions.md"], specs: "specs" };

/** Finds the project root (the nearest directory with a contract file) and loads its contract. */
export function loadContract(cwd: string): Contract {
  const root = findRoot(cwd);
  if (!root) return { root: cwd, ...DEFAULTS, limits: {} };

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

  const { sources = DEFAULTS.sources, specs = DEFAULTS.specs, implementation, plan, acceptanceTests, testCommand, limits } =
    raw as Record<string, unknown>;
  if (!Array.isArray(sources) || !sources.every((s) => typeof s === "string")) {
    throw new DoppelblindError(`${file}: "sources" must be a list of paths.`);
  }
  if (typeof specs !== "string" || specs.trim() === "") {
    throw new DoppelblindError(`${file}: "specs" must be a path.`);
  }
  for (const [key, value] of Object.entries({ implementation, plan })) {
    if (value !== undefined && (!Array.isArray(value) || !value.every((s) => typeof s === "string"))) {
      throw new DoppelblindError(`${file}: "${key}" must be a list of paths.`);
    }
  }
  for (const [key, value] of Object.entries({ acceptanceTests, testCommand })) {
    if (value !== undefined && (typeof value !== "string" || value.trim() === "")) {
      throw new DoppelblindError(`${file}: "${key}" must be a ${key === "testCommand" ? "command" : "path"}.`);
    }
  }
  const project = (p: string) => toProjectPath(root, path.resolve(root, p));
  return {
    root,
    limits: parseLimits(file, limits),
    sources: sources.map(project),
    specs: project(specs),
    ...(implementation !== undefined && { implementation: (implementation as string[]).map(project) }),
    ...(plan !== undefined && { plan: (plan as string[]).map(project) }),
    ...(acceptanceTests !== undefined && { acceptanceTests: project(acceptanceTests as string) }),
    ...(testCommand !== undefined && { testCommand: testCommand as string }),
  };
}

const LIMIT_KEYS = {
  specAgent: { timeoutMin: "number", budgetUsd: "number" },
  testAuthor: { timeoutMin: "number", budgetUsd: "number", maxTurns: "integer" },
} as const;

/** Reads the `limits` object: every value is a positive number, turn limits whole; `maxFreeAnswers` may be 0. */
function parseLimits(file: string, raw: unknown): ContractLimits {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new DoppelblindError(`${file}: "limits" must be an object.`);
  const value = (key: string, v: unknown, kind: "number" | "integer", min = Number.MIN_VALUE): number => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || (kind === "integer" && !Number.isInteger(v))) {
      throw new DoppelblindError(`${file}: "limits.${key}" must be a ${kind === "integer" ? "whole number" : "number"} ${min === 0 ? "of 0 or more" : "above 0"}.`);
    }
    return v;
  };
  const result: ContractLimits = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (key === "specAgent" || key === "testAuthor") {
      if (typeof v !== "object" || v === null || Array.isArray(v)) throw new DoppelblindError(`${file}: "limits.${key}" must be an object.`);
      const fields = LIMIT_KEYS[key] as Record<string, "number" | "integer">;
      const parsed: Record<string, number> = {};
      for (const [field, fv] of Object.entries(v as Record<string, unknown>)) {
        if (!(field in fields)) throw new DoppelblindError(`${file}: "limits.${key}.${field}" is not a limit; known: ${Object.keys(fields).join(", ")}.`);
        parsed[field] = value(`${key}.${field}`, fv, fields[field]);
      }
      result[key] = parsed;
    } else if (key === "testFileTimeoutMin") {
      result.testFileTimeoutMin = value(key, v, "number");
    } else if (key === "maxFreeAnswers") {
      result.maxFreeAnswers = value(key, v, "integer", 0);
    } else {
      throw new DoppelblindError(`${file}: "limits.${key}" is not a limit; known: specAgent, testAuthor, testFileTimeoutMin, maxFreeAnswers.`);
    }
  }
  return result;
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
