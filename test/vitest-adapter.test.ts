import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import { MarkingError, translate, type VitestReport } from "../src/adapters/vitest.ts";
import { makeProject } from "./helpers.ts";

const ROOT = "/project";
const assertion = (title: string, status: string, tags?: string[], ancestorTitles: string[] = []) => ({ ancestorTitles, title, status, ...(tags && { tags }) });
const report = (...assertionResults: ReturnType<typeof assertion>[]): VitestReport => ({
  testResults: [{ name: `${ROOT}/tests/acceptance/001-x/greeting.test.ts`, assertionResults }],
});
const FILE = "tests/acceptance/001-x/greeting.test.ts";

describe("vitest adapter", () => {
  test("takes the criterion from the test's tag, with the file relative to the project and the describe titles in the name", () => {
    assert.deepEqual(translate(report(assertion("greets", "passed", ["AC-006"], ["greeter"])), ROOT), [
      { file: FILE, name: "greeter > greets", criterion: "AC-006", status: "passed" },
    ]);
  });

  test("a test without a criterion tag has the criterion null; tags that are no criterion ID do not count", () => {
    assert.deepEqual(translate(report(assertion("plain", "failed"), assertion("slow", "failed", ["slow"])), ROOT).map((t) => t.criterion), [null, null]);
    assert.equal(translate(report(assertion("both", "failed", ["slow", "AC-002"])), ROOT)[0].criterion, "AC-002");
  });

  test("a test with more than one criterion tag is an error that names it, not one of its criteria", () => {
    assert.throws(() => translate(report(assertion("ok", "passed", ["AC-001"]), assertion("twice", "failed", ["AC-001", "AC-002"])), ROOT),
      (err: MarkingError) => err instanceof MarkingError && err.tests.length === 1 && err.tests[0] === `${FILE} › twice: AC-001, AC-002`);
  });

  test("skipped, todo and pending tests are skipped with their criterion", () => {
    const results = translate(report(assertion("s", "skipped", ["AC-001"]), assertion("t", "todo", ["AC-002"]), assertion("p", "pending", ["AC-003"])), ROOT);
    assert.deepEqual(results.map((t) => [t.criterion, t.status]), [["AC-001", "skipped"], ["AC-002", "skipped"], ["AC-003", "skipped"]]);
  });

  test("runs Vitest on a folder and writes the test result, with tags not declared in the Vitest config", { timeout: 60_000 }, () => {
    const root = makeProject({
      "package.json": JSON.stringify({ type: "module" }),
      "vitest.config.ts": "export default { test: { include: ['tests/**/*.test.ts'] } };",
      "tests/acceptance/001-x/greeting.test.ts": [
        'import { describe, expect, test } from "vitest";',
        'test("greets", { tags: ["AC-006"] }, () => expect(1).toBe(1));',
        'test.skip("waits", { tags: ["AC-007"] }, () => {});',
        'describe("greeter", () => { test("fails", () => expect(1).toBe(2)); });',
      ].join("\n"),
      "tests/acceptance/002-other/other.test.ts": 'import { test } from "vitest"; test("other", () => {});',
      "tests/acceptance/003-twice/both.test.ts": 'import { test } from "vitest"; test("both", { tags: ["AC-001", "AC-002"] }, () => {});',
    });
    symlinkSync(path.resolve(import.meta.dirname, "..", "node_modules"), path.join(root, "node_modules"));
    const adapter = path.resolve(import.meta.dirname, "..", "src", "adapters", "vitest.ts");
    const run = spawnSync(process.execPath, [adapter, "tests/acceptance/001-x", "result.json"], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "result.json"), "utf8")), [
      { file: "tests/acceptance/001-x/greeting.test.ts", name: "greets", criterion: "AC-006", status: "passed" },
      { file: "tests/acceptance/001-x/greeting.test.ts", name: "waits", criterion: "AC-007", status: "skipped" },
      { file: "tests/acceptance/001-x/greeting.test.ts", name: "greeter > fails", criterion: null, status: "failed" },
    ]);

    // more than one criterion tag: an error, and no test result
    const twice = spawnSync(process.execPath, [adapter, "tests/acceptance/003-twice", "twice.json"], { cwd: root, encoding: "utf8" });
    assert.equal(twice.status, 1);
    assert.match(twice.stderr, /tests\/acceptance\/003-twice\/both.test.ts › both: AC-001, AC-002/);
    assert.ok(!existsSync(path.join(root, "twice.json")));
  });
});
