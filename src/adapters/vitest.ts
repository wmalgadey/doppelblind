#!/usr/bin/env node
/**
 * Doppelblind's report adapter for Vitest: runs the acceptance tests of a folder with Vitest's JSON reporter and
 * writes Doppelblind's test result. A test's criterion is its tag that is a criterion ID; tags need no declaration
 * in the Vitest config, since the adapter runs Vitest with `--strictTags=false`.
 *
 * In `.doppelblind.conf`: "report": "doppelblind-vitest {folder} {output}"
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestResult, TestStatus } from "../acceptance/test-run.ts";

const CRITERION_TAG = /^AC-\d{3,}$/;

/** The part of Vitest's JSON report the adapter reads. */
export interface VitestReport {
  testResults: {
    /** Absolute path of the test file. */
    name: string;
    assertionResults: { ancestorTitles: string[]; title: string; status: string; tags?: string[] }[];
  }[];
}

/** A test that carries more than one criterion tag: the adapter reports it as an error, never as one of them. */
export class MarkingError extends Error {
  readonly tests: string[];
  constructor(tests: string[]) {
    super(`${tests.length} tests are marked with more than one criterion; mark each with exactly one:\n${tests.map((t) => `- ${t}`).join("\n")}`);
    this.tests = tests;
  }
}

/**
 * Translates Vitest's JSON report into Doppelblind's test result: file paths relative to `root`, the name of each test
 * with the titles of its describe blocks, joined by ` > `, its criterion from its tag, or null without a criterion tag.
 */
export function translate(report: VitestReport, root: string): TestResult[] {
  const results: TestResult[] = [];
  const ambiguous: string[] = [];
  for (const file of report.testResults) {
    const relative = path.relative(root, file.name).split(path.sep).join("/");
    for (const t of file.assertionResults) {
      const name = [...t.ancestorTitles, t.title].join(" > ");
      const criteria = [...new Set((t.tags ?? []).filter((tag) => CRITERION_TAG.test(tag)))];
      if (criteria.length > 1) ambiguous.push(`${relative} › ${name}: ${criteria.join(", ")}`);
      results.push({ file: relative, name, criterion: criteria[0] ?? null, status: status(t.status) });
    }
  }
  if (ambiguous.length > 0) throw new MarkingError(ambiguous);
  return results;
}

/** Vitest's `pending`, `todo` and `disabled` count as skipped. */
function status(vitest: string): TestStatus {
  return vitest === "passed" || vitest === "failed" ? vitest : "skipped";
}

/** Runs Vitest on `folder` from the current directory and writes the test result to `output`. Returns the exit code. */
export function main(args: string[], cwd = process.cwd()): number {
  const [folder, output] = args;
  if (!folder || !output) {
    process.stderr.write("usage: doppelblind-vitest <folder> <output>\n");
    return 2;
  }
  const dir = mkdtempSync(path.join(tmpdir(), "doppelblind-vitest-"));
  const json = path.join(dir, "vitest.json");
  try {
    // test failures are expected; only a missing report is an error
    const run = spawnSync("npx", ["--no-install", "vitest", "run", folder, "--reporter=json", `--outputFile=${json}`, "--strictTags=false", "--passWithNoTests"], {
      cwd,
      stdio: ["ignore", "inherit", "inherit"],
    });
    let report: VitestReport;
    try {
      report = JSON.parse(readFileSync(json, "utf8"));
    } catch {
      process.stderr.write(`Vitest wrote no JSON report (exit code ${run.status ?? run.error?.message}).\n`);
      return 1;
    }
    for (const f of report.testResults) {
      if (f.assertionResults.length === 0) process.stderr.write(`Vitest reports no tests for ${path.relative(cwd, f.name)}; it may not have loaded.\n`);
    }
    writeFileSync(path.resolve(cwd, output), JSON.stringify(translate(report, cwd), null, 2) + "\n");
    return 0;
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
