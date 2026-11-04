import path from "node:path";
import type { TestResult } from "../acceptance/test-run.ts";

/** A test as the test author lists it in its answer. */
export interface AuthoredTest {
  file: string;
  name: string;
  criterion: string;
}

export interface MappingCheck {
  /** The tests under the spec's folder, each with the criterion it counts for. */
  tests: TestResult[];
  /** What fails the gate. */
  problems: string[];
  /** What the user should see but does not fail the gate. */
  warnings: string[];
}

/**
 * The gate on the criterion mapping of the acceptance tests in `folder`: every test in the test result carries the
 * ID of a criterion of the spec proven by test, the same one the test author lists it under, and every such criterion
 * has a test. A skipped test counts, as skipped, for its criterion.
 */
export function checkMapping(folder: string, byTest: Set<string>, authored: AuthoredTest[], results: TestResult[]): MappingCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const tests: TestResult[] = [];
  const listed = new Map(authored.map((t) => [key(t), t]));
  const found = new Set<string>();
  for (const result of results.filter((r) => r.file.startsWith(`${folder}/`))) {
    const at = `${result.file} › ${result.name}`;
    found.add(key(result));
    let { criterion } = result;
    if (criterion === null) {
      criterion = legacyCriterion(result.file);
      if (criterion) warnings.push(`legacy criterion mapping: ${at} counts for ${criterion} by its file name; mark the test instead.`);
    }
    if (criterion === null) {
      problems.push(`${at} is marked with no criterion.`);
      continue;
    }
    if (!byTest.has(criterion)) problems.push(`${at} is marked ${criterion}, which is not a criterion of this spec proven by test.`);
    const entry = listed.get(key(result));
    if (entry && entry.criterion !== criterion) problems.push(`${at} is listed by the test author for ${entry.criterion} but marked ${criterion}.`);
    tests.push({ ...result, criterion });
  }
  for (const t of authored) {
    if (!found.has(key(t))) warnings.push(`${t.file} › ${t.name} is listed by the test author but not in the test result.`);
  }
  for (const id of byTest) {
    if (!tests.some((t) => t.criterion === id)) problems.push(`${id} has no test in the test result.`);
  }
  return { tests, problems, warnings };
}

/**
 * The criterion of a test without a marking in a file named after a criterion, e.g. `ac-006.test.ts` for AC-006: the
 * way tests were mapped before they were marked. Only for the transition; drop it once no such file is left.
 */
export function legacyCriterion(file: string): string | null {
  const match = /^ac-(\d{3,})\.test\.[cm]?[jt]sx?$/i.exec(path.posix.basename(file));
  return match ? `AC-${match[1]}` : null;
}

function key(t: { file: string; name: string }): string {
  return `${t.file}\u0000${t.name}`;
}
