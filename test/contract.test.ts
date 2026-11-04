import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { loadContract, requireAcceptance } from "../src/contract.ts";
import { DoppelblindError } from "../src/errors.ts";
import { makeProject } from "./helpers.ts";

const withLimits = (limits: unknown) => makeProject({ ".doppelblind.conf": JSON.stringify({ limits }) });

describe("contract limits", () => {
  test("a contract without limits declares none, and so does a project without a contract", () => {
    assert.deepEqual(loadContract(makeProject({ ".doppelblind.conf": "{}" })).limits, {});
    assert.deepEqual(loadContract(makeProject({})).limits, {});
  });

  test("reads every limit a project may declare", () => {
    const limits = { specAgent: { timeoutMin: 5, budgetUsd: 1 }, testAuthor: { timeoutMin: 15, budgetUsd: 5, maxTurns: 80 }, testFileTimeoutMin: 2, maxFreeAnswers: 0 };
    assert.deepEqual(loadContract(withLimits(limits)).limits, limits);
    assert.deepEqual(loadContract(withLimits({ testAuthor: { maxTurns: 3 } })).limits, { testAuthor: { maxTurns: 3 } });
  });

  test("rejects a limit that is not a positive number, a turn or free-answer limit that is not whole, and unknown keys", () => {
    for (const [limits, message] of [
      [[], /"limits" must be an object/],
      [{ specAgent: 5 }, /"limits.specAgent" must be an object/],
      [{ specAgent: { timeoutMin: 0 } }, /"limits.specAgent.timeoutMin" must be a number above 0/],
      [{ testAuthor: { budgetUsd: "5" } }, /"limits.testAuthor.budgetUsd" must be a number above 0/],
      [{ testAuthor: { maxTurns: 2.5 } }, /"limits.testAuthor.maxTurns" must be a whole number above 0/],
      [{ testFileTimeoutMin: -1 }, /"limits.testFileTimeoutMin" must be a number above 0/],
      [{ maxFreeAnswers: -1 }, /"limits.maxFreeAnswers" must be a whole number of 0 or more/],
      [{ specAgent: { maxTurns: 3 } }, /"limits.specAgent.maxTurns" is not a limit; known: timeoutMin, budgetUsd/],
      [{ clarifyRounds: 3 }, /"limits.clarifyRounds" is not a limit/],
    ] as const) {
      assert.throws(() => loadContract(withLimits(limits)), (err: DoppelblindError) => message.test(err.message), JSON.stringify(limits));
    }
  });
});

describe("contract acceptance tests", () => {
  const withAcceptance = (acceptanceTests: unknown, extra: object = {}) =>
    makeProject({ ".doppelblind.conf": JSON.stringify({ acceptanceTests, ...extra }) });
  const REPORT = "doppelblind-vitest {folder} {output}";

  test("reads the path, the marking and the report command", () => {
    const contract = loadContract(withAcceptance({ path: "tests/acceptance/", marking: "Tag it.", report: REPORT }));
    assert.deepEqual(contract.acceptanceTests, { path: "tests/acceptance", marking: "Tag it.", report: REPORT });
    assert.equal(requireAcceptance(contract, "marking", "how", "stops"), "Tag it.");
    assert.equal(requireAcceptance(contract, "report", "how", "stops"), REPORT);
  });

  test("a path alone is read as before", () => {
    assert.deepEqual(loadContract(withAcceptance("tests/acceptance")).acceptanceTests, { path: "tests/acceptance" });
  });

  test("a missing marking or report command stops the step that needs it with a message naming the entry", () => {
    for (const contract of [loadContract(withAcceptance({ path: "t" })), loadContract(makeProject({ ".doppelblind.conf": "{}" }))]) {
      for (const key of ["marking", "report"] as const) {
        assert.throws(() => requireAcceptance(contract, key, "what it is", "the step stops"), (err: DoppelblindError) =>
          err.message === `.doppelblind.conf declares no "acceptanceTests.${key}"; the step stops.` && err.details[0] === `"acceptanceTests.${key}": what it is`);
      }
    }
  });

  test("rejects wrong entries, a report command without its placeholders and the replaced testCommand", () => {
    for (const [conf, message] of [
      [withAcceptance(["t"]), /"acceptanceTests" must be an object/],
      [withAcceptance({ path: "t", marking: "" }), /"acceptanceTests.marking" must be a text/],
      [withAcceptance({ report: 3 }), /"acceptanceTests.report" must be a command/],
      [withAcceptance({ command: "x" }), /"acceptanceTests.command" is not known; known: path, marking, report/],
      [withAcceptance({ report: "vitest {folder}" }), /"acceptanceTests.report" must contain \{folder\} and \{output\}/],
      [withAcceptance("t", { testCommand: "node {file}" }), /"testCommand" is replaced by "acceptanceTests.report"/],
    ] as const) {
      assert.throws(() => loadContract(conf), (err: DoppelblindError) => message.test(err.message), String(message));
    }
  });
});
