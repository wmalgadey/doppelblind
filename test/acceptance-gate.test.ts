import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import { parseResults, runReport, type TestResult } from "../src/acceptance/test-run.ts";
import { DoppelblindError } from "../src/errors.ts";
import { checkMapping, legacyCriterion } from "../src/gates/acceptance.ts";
import { makeProject } from "./helpers.ts";

const FOLDER = "tests/acceptance/001-x";
const BY_TEST = new Set(["AC-001", "AC-002"]);
const result = (name: string, criterion: string | null, status: TestResult["status"] = "failed", file = `${FOLDER}/greeting.test.ts`): TestResult =>
  ({ file, name, criterion, status });
const authored = (r: TestResult, criterion = r.criterion!) => ({ file: r.file, name: r.name, criterion });

describe("acceptance gate", () => {
  test("passes tests marked with criteria of the spec proven by test, as listed by the test author", () => {
    const results = [result("one", "AC-001"), result("two", "AC-002", "skipped")];
    const checked = checkMapping(FOLDER, BY_TEST, results.map((r) => authored(r)), results);
    assert.deepEqual(checked.problems, []);
    assert.deepEqual(checked.warnings, []);
    assert.deepEqual(checked.tests, results); // the skipped test counts, as skipped, for AC-002
  });

  test("a test without a criterion fails", () => {
    const results = [result("one", null), result("two", "AC-002"), result("three", "AC-001")];
    assert.deepEqual(checkMapping(FOLDER, BY_TEST, [], results).problems, [`${FOLDER}/greeting.test.ts › one is marked with no criterion.`]);
  });

  test("a test whose ID is not a criterion of the spec proven by test fails", () => {
    const results = [result("one", "AC-003"), result("two", "AC-002"), result("three", "AC-001")];
    assert.deepEqual(checkMapping(FOLDER, BY_TEST, [], results).problems, [
      `${FOLDER}/greeting.test.ts › one is marked AC-003, which is not a criterion of this spec proven by test.`,
    ]);
  });

  test("a test the test author lists for another criterion than it is marked with fails", () => {
    const results = [result("one", "AC-001"), result("two", "AC-002")];
    const checked = checkMapping(FOLDER, BY_TEST, [authored(results[0], "AC-002"), authored(results[1])], results);
    assert.deepEqual(checked.problems, [`${FOLDER}/greeting.test.ts › one is listed by the test author for AC-002 but marked AC-001.`]);
  });

  test("a criterion proven by test without any test in the result fails; tests outside the spec's folder do not count", () => {
    const results = [result("one", "AC-001"), result("elsewhere", "AC-002", "failed", "tests/acceptance/002-y/x.test.ts")];
    const checked = checkMapping(FOLDER, BY_TEST, [], results);
    assert.deepEqual(checked.problems, ["AC-002 has no test in the test result."]);
    assert.deepEqual(checked.tests.map((t) => t.name), ["one"]);
  });

  test("a test the test author lists that is not in the test result is a warning", () => {
    const results = [result("one", "AC-001"), result("two", "AC-002")];
    const checked = checkMapping(FOLDER, BY_TEST, [...results.map((r) => authored(r)), authored(result("ghost", "AC-001"))], results);
    assert.deepEqual(checked.problems, []);
    assert.deepEqual(checked.warnings, [`${FOLDER}/greeting.test.ts › ghost is listed by the test author but not in the test result.`]);
  });
});

describe("legacy criterion mapping", () => {
  test("takes the criterion from a file named after it", () => {
    for (const [file, id] of [["a/ac-006.test.ts", "AC-006"], ["ac-012.test.mjs", "AC-012"], ["x/AC-1234.test.js", "AC-1234"]] as const) {
      assert.equal(legacyCriterion(file), id, file);
    }
    for (const file of ["greeting.test.ts", "ac-06.test.ts", "ac-006.spec.ts", "ac-006-greeting.test.ts"]) assert.equal(legacyCriterion(file), null, file);
  });

  test("a test without a marking in such a file counts for that criterion, with a warning; a marking wins over the file name", () => {
    const legacy = `${FOLDER}/ac-001.test.ts`;
    const results = [result("one", null, "failed", legacy), result("two", "AC-002", "failed", `${FOLDER}/ac-001.test.ts`)];
    const checked = checkMapping(FOLDER, BY_TEST, [], results);
    assert.deepEqual(checked.problems, []);
    assert.deepEqual(checked.tests.map((t) => t.criterion), ["AC-001", "AC-002"]);
    assert.deepEqual(checked.warnings, [`legacy criterion mapping: ${legacy} › one counts for AC-001 by its file name; mark the test instead.`]);
  });

  test("the criterion taken from the file name passes the other rules of the gate", () => {
    const legacy = `${FOLDER}/ac-003.test.ts`;
    const results = [result("one", null, "failed", legacy), result("a", "AC-001"), result("b", "AC-002")];
    assert.deepEqual(checkMapping(FOLDER, BY_TEST, [], results).problems, [
      `${legacy} › one is marked AC-003, which is not a criterion of this spec proven by test.`,
    ]);
  });
});

describe("test result", () => {
  test("reads a valid test result and names each wrong entry", () => {
    assert.deepEqual(parseResults([{ file: "./a/b.test.ts", name: "n", criterion: null, status: "skipped" }], "r.json"),
      [{ file: "a/b.test.ts", name: "n", criterion: null, status: "skipped" }]);
    assert.throws(() => parseResults({}, "r.json"), /r.json is not a test result/);
    assert.throws(() => parseResults([{ file: "a", name: "", criterion: 3, status: "ok" }, 5], "r.json"), (err: DoppelblindError) =>
      err.details.join("\n") === [
        'entry 1: "name" must be the test\'s name.',
        'entry 1: "criterion" must be a criterion ID or null.',
        'entry 1: "status" must be one of passed, failed, skipped.',
        "entry 2 is not an object.",
      ].join("\n"));
  });

  test("the report command gets the folder and the output file; its exit code does not decide", async () => {
    const root = makeProject({});
    const out = path.join(root, "out", "result.json");
    mkdirSync(path.dirname(out));
    const line = `node -e 'require("fs").writeFileSync(process.argv[2], JSON.stringify([{file: process.argv[1] + "/t.test.ts", name: "n", criterion: "AC-001", status: "failed"}])); process.exit(1)' {folder} {output}`;
    const run = await runReport(root, line, "tests/it's", out, 10_000);
    assert.equal(run.exitCode, 1);
    assert.deepEqual(run.results, [{ file: "tests/it's/t.test.ts", name: "n", criterion: "AC-001", status: "failed" }]);
  });

  test("a report command that writes no or no valid result, or runs too long, stops with a message", async () => {
    const root = makeProject({});
    const out = path.join(root, "result.json");
    await assert.rejects(runReport(root, "true {folder} {output}", "t", out, 10_000), /wrote no test result/);
    writeFileSync(out, "not json");
    await assert.rejects(runReport(root, "true {folder} {output}", "t", out, 10_000), /is not valid JSON/);
    await assert.rejects(runReport(root, "sleep 5; true {folder} {output}", "t", out, 200), /did not finish within/);
  });
});
