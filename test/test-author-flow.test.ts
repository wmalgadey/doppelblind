import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import type { Agent, AgentRequest } from "../src/agent/claude.ts";
import { AgentLimitError, DoppelblindError } from "../src/errors.ts";
import { briefIsFinal, runTestAuthor } from "../src/flow/test-author-flow.ts";
import type { SpecOutput } from "../src/roles/spec-agent/index.ts";
import { renderSpec } from "../src/spec/render.ts";
import { BRIEF, makeProject, recordingUi, sampleSpec } from "./helpers.ts";

const BRIEF_PATH = "docs/briefs/greeting.md";
const FOLDER = "specs/001-greet-everyone";
const WRITABLE = "tests/acceptance/001-greet-everyone";
const CONTRACT = {
  sources: ["docs/product.md"],
  specs: "specs",
  implementation: ["src"],
  plan: ["docs/plan"],
  acceptanceTests: {
    path: "tests/acceptance",
    marking: "MARKING RULE: a line `// test <criterion> <name>` per test.",
    report: `node ${path.join(import.meta.dirname, "fixtures", "fake-report.mjs")} {folder} {output}`,
  },
};

const criterion = sampleSpec().criteria[0];
/** A spec with two criteria proven by test, one by review; Q-01 is answered free and concerns AC-001. */
function spec(overrides: Partial<SpecOutput> = {}): SpecOutput {
  return sampleSpec({
    introduction: "INTRODUCTION TEXT",
    wishes: ["WISH TEXT"],
    criteria: [
      { ...criterion, title: "TITLE ONE", rejects: "REJECTS ONE" },
      { ...criterion, id: "AC-002", title: "TITLE TWO", given: "two given", when: "two when", then: "two then" },
      { ...criterion, id: "AC-003", title: "TITLE REVIEW", given: "review given", when: "review when", then: "review then", proven_by: "review" },
    ],
    open_questions: [
      { id: "Q-01", question: "Which words does the greeting use?", concerns: ["AC-001"] },
      { id: "Q-02", question: "OPEN QUESTION TEXT", concerns: ["AC-002"] },
    ],
    ...overrides,
  });
}

function project(options: { contract?: object; spec?: SpecOutput; final?: boolean; files?: Record<string, string> } = {}) {
  const s = options.spec ?? spec();
  const free = s.open_questions.filter((q) => q.id === "Q-01").map((q) => ({ id: q.id, question: q.question, answer: "free" }));
  const unanswered = s.open_questions.filter((q) => q.id !== "Q-01").map((q) => q.id);
  return makeProject({
    ".doppelblind.conf": JSON.stringify(options.contract ?? CONTRACT),
    ".doppelblind/specs.json": JSON.stringify({ [BRIEF_PATH]: { folder: FOLDER, ...(options.final !== false && { final: true }), lastQuestion: 2 } }),
    ".doppelblind/runs/2026-01-01T00-00-00-000Z-spec-agent/input.md": "RUN RECORD",
    [`${FOLDER}/spec.md`]: renderSpec(s, BRIEF_PATH, "../../docs/briefs/greeting.md", { answers: free, unanswered }),
    [`${FOLDER}/answers.md`]: "ANSWERS FILE",
    "specs/002-other/spec.md": "OTHER SPEC",
    [BRIEF_PATH]: BRIEF,
    "docs/product.md": "BINDING SOURCE",
    "docs/plan/plan.md": "PLAN CONTENT",
    "src/greeter.mjs": "IMPLEMENTATION CONTENT",
    "test/greeter.test.mjs": "UNIT TEST CONTENT",
    "test/helpers.mjs": "HELPER CONTENT",
    "test/fixtures/stub.json": "FIXTURE CONTENT",
    "tests/acceptance/000-earlier/ac-001.test.mjs": "EARLIER ACCEPTANCE TEST",
    ...options.files,
  });
}

type ReportedTest = { file: string; name: string; criterion: string; assumptions: string[] };
type ReportedAssumption = { id: string; criterion: string; assumption: string };
const GREETING = `${WRITABLE}/greeting.test.mjs`;
const FAREWELL = `${WRITABLE}/farewell.test.mjs`;
const TESTS: ReportedTest[] = [
  { file: GREETING, name: "prints a greeting", criterion: "AC-001", assumptions: [] },
  { file: FAREWELL, name: "says two", criterion: "AC-002", assumptions: [] },
];
const [ONE, TWO] = TESTS;

/** A test file for the fake report command: its tests, marked with `marks` (`-` for none), exit with `exit`. */
function testFile(tests: { name: string; criterion: string }[], exit = 1, marks?: string[], kind = "test"): string {
  return tests.map((t, i) => `// ${kind} ${marks?.[i] ?? t.criterion} ${t.name}\n`).join("") + `process.exit(${exit});\n`;
}
const FILES: Record<string, string> = { [GREETING]: testFile([ONE]), [FAREWELL]: testFile([TWO]) };

/**
 * Stands in for both agents: as the test author (it has tools) it writes `files` into its working directory and
 * reports `tests` and `assumptions`; as the review guide it answers one entry per criterion in its message.
 */
function fakeAgents(
  files: Record<string, string> = FILES,
  calls: AgentRequest[] = [],
  tests: ReportedTest[] = TESTS,
  assumptions: ReportedAssumption[] = [],
): Agent {
  return async (request) => {
    calls.push(request);
    if (!request.tools) {
      const ids = [...request.userMessage.matchAll(/<criterion id="(AC-\d+)">/g)].map((m) => m[1]);
      return { output: { entries: ids.map((criterion) => ({ criterion, steps: ["Run the greeter."], where: "its output", observe: "a greeting" })) } };
    }
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(request.workdir!, file)), { recursive: true });
      writeFileSync(path.join(request.workdir!, file), content);
    }
    return { output: { tests, assumptions }, costUsd: 0.5 };
  };
}

function testAuthorCall(calls: AgentRequest[]): AgentRequest {
  return calls.find((c) => c.tools)!;
}

/** Every file of the project with its content, to show that nothing was created or changed. */
function snapshot(root: string, dir = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, snapshot(root, file));
    else files[file] = readFileSync(path.join(root, file), "utf8");
  }
  return files;
}

function runs(root: string): string[] {
  const dir = path.join(root, ".doppelblind/runs");
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

const lockFile = (root: string) => path.join(root, ".doppelblind/locks/001-greet-everyone.json");

describe("test-author-flow", () => {
  test("a brief's final spec is recognised for continuing the flow", () => {
    assert.ok(briefIsFinal(project(), BRIEF_PATH));
    assert.ok(!briefIsFinal(project({ final: false }), BRIEF_PATH));
  });

  test("starts on the spec connected to a brief, on a spec.md or on a spec folder", async () => {
    for (const target of [BRIEF_PATH, `${FOLDER}/spec.md`, FOLDER]) {
      const root = project();
      const calls: AgentRequest[] = [];
      const result = await runTestAuthor({ cwd: root, target, ui: recordingUi(["keep unlocked"]), agent: fakeAgents(undefined, calls) });
      assert.equal(result.spec, `${FOLDER}/spec.md`);
      const run = runs(root).find((r) => r.endsWith("-test-author"))!;
      assert.match(readFileSync(path.join(root, ".doppelblind/runs", run, "input.md"), "utf8"), /<criterion id="AC-001">/);
    }
  });

  test("hands over only ID, Given, When and Then of the criteria proven by test, with the aspects answered free", async () => {
    const root = project();
    const calls: AgentRequest[] = [];
    await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents(undefined, calls) });
    const run = runs(root).find((r) => r.endsWith("-test-author"))!;
    const input = readFileSync(path.join(root, ".doppelblind/runs", run, "input.md"), "utf8");
    assert.equal(input, testAuthorCall(calls).userMessage);

    assert.ok(input.includes(`<criterion id="AC-001">\nGiven: the greeter is installed\nWhen: I run it\nThen: it prints a greeting\n` +
      "deliberately unspecified: Which words does the greeting use?\n</criterion>"));
    assert.ok(input.includes(`<criterion id="AC-002">\nGiven: two given\nWhen: two when\nThen: two then\n</criterion>`));
    assert.ok(input.includes("<test-marking>\nMARKING RULE: a line `// test <criterion> <name>` per test.\n</test-marking>"));
    for (const hidden of ["AC-003", "review given", "TITLE", "REJECTS", "INTRODUCTION", "WISH", "OPEN QUESTION", "Being greeted", "Q-0"]) {
      assert.ok(!input.includes(hidden), `${hidden} was handed over`);
    }
  });

  test("the test author sees acceptance tests and test infrastructure, never implementation, plan, brief, sources, answers, unit tests, other specs or run records", async () => {
    const root = project();
    let seen: Record<string, string> = {};
    const agent = fakeAgents();
    await runTestAuthor({
      cwd: root,
      target: BRIEF_PATH,
      ui: recordingUi(["keep unlocked"]),
      agent: async (request) => {
        if (request.tools) seen = snapshot(request.workdir!);
        return agent(request);
      },
    });
    const contents = Object.values(seen);
    for (const visible of ["EARLIER ACCEPTANCE TEST", "HELPER CONTENT", "FIXTURE CONTENT"]) assert.ok(contents.includes(visible), visible);
    for (const hidden of ["IMPLEMENTATION", "PLAN", "BRIEF", "Greeting", "BINDING SOURCE", "ANSWERS FILE", "UNIT TEST", "OTHER SPEC", "RUN RECORD", "INTRODUCTION"]) {
      assert.ok(!contents.some((c) => c.includes(hidden)), `${hidden} is visible`);
    }
    assert.ok(statSync(path.join(root, "test/helpers.mjs")).isFile());
  });

  test("writes the tests into the spec's folder under the contract's path, runs them, and locks them on the user's word", async () => {
    const root = project();
    const ui = recordingUi(["lock"]);
    const result = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui, agent: fakeAgents() });

    assert.deepEqual(result.tests.map((t) => [t.file, t.name]), [[GREETING, ONE.name], [FAREWELL, TWO.name]]);
    for (const t of result.tests) assert.equal(readFileSync(path.join(root, t.file), "utf8"), FILES[t.file]);
    assert.deepEqual(result.results.map((t) => t.status), ["failed", "failed"]);
    assert.equal(result.lock, ".doppelblind/locks/001-greet-everyone.json");

    const lock = JSON.parse(readFileSync(lockFile(root), "utf8"));
    assert.deepEqual(lock.files.map((f: { path: string }) => f.path), [GREETING, FAREWELL, `${WRITABLE}/review.md`]);
    // the inventory comes from the test result; the report command lists the files in name order
    assert.deepEqual(lock.tests, [
      { file: FAREWELL, name: TWO.name, criterion: "AC-002" },
      { file: GREETING, name: ONE.name, criterion: "AC-001" },
    ]);
    const labels = ui.events.filter((e) => e.startsWith("start: ")).map((e) => e.slice(7));
    assert.deepEqual(labels, [
      "Reading the final spec",
      "Preparing what the test author may see",
      "Test author is writing the review file",
      "Validating the review file",
      "Test author is writing the acceptance tests",
      "Validating its output",
      "Checking its writes",
      "Running the acceptance tests",
      "Checking the criterion of each test",
      "Writing the lock",
    ]);
    assert.ok(ui.events.includes("done: Checking the criterion of each test (2 of 2 fail before any implementation)"));
  });

  test("the TUI names the folder the agent writes into and shows its progress on the running step", async () => {
    const root = project();
    const ui = recordingUi(["lock"]);
    const calls: AgentRequest[] = [];
    const inner = fakeAgents(undefined, calls);
    const agent: Agent = (request) => {
      request.onProgress?.({ turns: 2, action: `Write ${GREETING}` });
      return inner(request);
    };
    await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui, agent });

    assert.ok(ui.events.includes(`note: workspace: ${testAuthorCall(calls).workdir}/${WRITABLE}`), ui.events.join("\n"));
    assert.ok(ui.events.includes(`update: Test author is writing the acceptance tests (turn 2 · Write ${GREETING})`));
    assert.ok(ui.events.includes(`update: Test author is writing the review file (turn 2 · Write ${GREETING})`));
  });

  test("a test that passes before any implementation is reported with its criterion ID", async () => {
    const root = project();
    const ui = recordingUi(["keep unlocked"]);
    const result = await runTestAuthor({
      cwd: root,
      target: BRIEF_PATH,
      ui,
      agent: fakeAgents({ [GREETING]: testFile([ONE]), [FAREWELL]: testFile([TWO], 0) }),
    });
    assert.deepEqual(result.results.filter((t) => t.status === "passed").map((p) => p.criterion), ["AC-002"]);
    assert.ok(ui.events.includes(`note: AC-002: ${FAREWELL} › ${TWO.name} passes before any implementation`));
    assert.ok(ui.events.some((e) => e === `detail: AC-002 passes before any implementation: ${FAREWELL} › ${TWO.name}`));
    assert.equal(result.lock, undefined);
    assert.ok(!existsSync(lockFile(root)));
  });

  test("the review file has one section per criterion proven by review, and none is written without such a criterion", async () => {
    const root = project();
    const result = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents() });
    assert.equal(result.review, `${WRITABLE}/review.md`);
    const md = readFileSync(path.join(root, WRITABLE, "review.md"), "utf8");
    assert.deepEqual(md.match(/^## .*$/gm), ["## AC-003: TITLE REVIEW"]);
    assert.ok(md.includes("- **Given** review given\n- **When** review when\n- **Then** review then"));
    assert.ok(md.includes("**Steps:**\n\n1. Run the greeter."));
    assert.ok(md.includes("[specs/001-greet-everyone/spec.md](../../../specs/001-greet-everyone/spec.md)"));

    const onlyTests = spec({ criteria: spec().criteria.slice(0, 2) });
    const root2 = project({ spec: onlyTests });
    const ui = recordingUi(["keep unlocked"]);
    const calls: AgentRequest[] = [];
    const result2 = await runTestAuthor({ cwd: root2, target: BRIEF_PATH, ui, agent: fakeAgents(undefined, calls) });
    assert.equal(result2.review, undefined);
    assert.ok(!existsSync(path.join(root2, WRITABLE, "review.md")));
    assert.ok(ui.events.includes(`note: ${FOLDER}/spec.md has no criterion proven by review; no review file is written`));
    assert.equal(calls.length, 1);
  });

  test("an unlocked earlier run's files are replaced", async () => {
    const root = project({ files: { [`${WRITABLE}/ac-009.test.mjs`]: "old", [`${WRITABLE}/review.md`]: "old review" } });
    await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents() });
    assert.deepEqual(readdirSync(path.join(root, WRITABLE)).sort(), ["farewell.test.mjs", "greeting.test.mjs", "review.md"]);
    assert.notEqual(readFileSync(path.join(root, WRITABLE, "review.md"), "utf8"), "old review");
  });

  test("locked tests stop a new run before the test author starts and stay unchanged", async () => {
    const root = project();
    await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["lock"]), agent: fakeAgents() });
    const before = snapshot(root);
    const calls: AgentRequest[] = [];
    await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents(undefined, calls) }), /are frozen/);
    assert.equal(calls.length, 0);
    assert.deepEqual(snapshot(root), before);
  });

  const stops: [string, () => string, string, RegExp][] = [
    ["a spec that is not final", () => project({ final: false }), BRIEF_PATH, /is not final yet/],
    ["a spec that does not exist", () => project(), "specs/009-missing", /No spec found/],
    ["a brief with no connected spec", () => project({ files: { "docs/briefs/other.md": BRIEF } }), "docs/briefs/other.md", /No spec is connected/],
    ["a contract without implementation and plan paths", () => project({ contract: { ...CONTRACT, implementation: undefined, plan: [] } }), BRIEF_PATH, /does not declare what the test author must not see/],
    ["a contract without the test author's path", () => project({ contract: { ...CONTRACT, acceptanceTests: undefined } }), BRIEF_PATH, /declares no path for the test author/],
    ["a contract without the test marking", () => project({ contract: { ...CONTRACT, acceptanceTests: { ...CONTRACT.acceptanceTests, marking: undefined } } }), BRIEF_PATH,
      /declares no "acceptanceTests.marking"; the test author does not start/],
    ["a contract without the report command", () => project({ contract: { ...CONTRACT, acceptanceTests: { ...CONTRACT.acceptanceTests, report: undefined } } }), BRIEF_PATH,
      /declares no "acceptanceTests.report"; the acceptance tests cannot be run/],
    ["a project without tests", () => {
      const root = project();
      for (const f of ["test/greeter.test.mjs", "tests/acceptance/000-earlier/ac-001.test.mjs"]) spawnSync("rm", [path.join(root, f)]);
      return root;
    }, BRIEF_PATH, /has no tests yet/],
    ["a spec without criteria proven by test", () => project({ spec: spec({ criteria: [spec().criteria[2]], open_questions: [] }) }), BRIEF_PATH, /has no criterion proven by test/],
  ];
  for (const [name, setup, target, message] of stops) {
    test(`${name} stops with a message before anything is written`, async () => {
      const root = setup();
      const before = snapshot(root);
      const calls: AgentRequest[] = [];
      const ui = recordingUi();
      await assert.rejects(runTestAuthor({ cwd: root, target, ui, agent: fakeAgents(undefined, calls) }),
        (err) => err instanceof DoppelblindError && message.test(err.message));
      assert.equal(calls.length, 0);
      assert.deepEqual(snapshot(root), before);
      assert.ok(ui.events.some((e) => e.startsWith("fail: ")));
    });
  }

  test("a write outside the allowed path is rejected, fails the run naming it, and keeps the run folder and the files written so far, unlocked", async () => {
    const root = project();
    const ui = recordingUi();
    const files = { [GREETING]: testFile([ONE]), "src/greeter.mjs": "OVERWRITTEN", "escape.mjs": "x" };
    await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui, agent: fakeAgents(files) }), (err: DoppelblindError) =>
      /wrote outside tests\/acceptance\/001-greet-everyone\//.test(err.message) &&
      err.details.includes("rejected: escape.mjs") &&
      err.details.includes("rejected: src/greeter.mjs") &&
      err.details.includes(`incomplete, not locked: ${GREETING}`));
    assert.equal(readFileSync(path.join(root, "src/greeter.mjs"), "utf8"), "IMPLEMENTATION CONTENT");
    assert.ok(!existsSync(path.join(root, "escape.mjs")));
    assert.ok(ui.events.some((e) => e.startsWith("fail: Checking its writes (The test author wrote outside")));

    assert.ok(existsSync(path.join(root, GREETING)));
    assert.ok(!existsSync(lockFile(root)));
    const run = runs(root).find((r) => r.endsWith("-test-author"))!;
    assert.deepEqual(readdirSync(path.join(root, ".doppelblind/runs", run)).sort(), ["guardrails.json", "input.md", "output.json", "system-prompt.md", "trace.jsonl"]);

    // the incomplete files are not frozen: the next run starts
    await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents() });
  });

  test("a criterion without a test file fails the run", async () => {
    const root = project();
    const tests = [TESTS[0]];
    await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents(undefined, [], tests) }),
      (err: DoppelblindError) => err.details.includes("AC-002 has no acceptance test."));
  });

  test("one test file may hold the tests of several criteria; the lock lists each test with its criterion", async () => {
    const root = project();
    const both = `${WRITABLE}/greeter.test.mjs`;
    const tests = TESTS.map((t) => ({ ...t, file: both }));
    const result = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["lock"]), agent: fakeAgents({ [both]: testFile(tests) }, [], tests) });
    assert.deepEqual(result.results.map((t) => [t.name, t.criterion]), [[ONE.name, "AC-001"], [TWO.name, "AC-002"]]);
    const lock = JSON.parse(readFileSync(lockFile(root), "utf8"));
    assert.deepEqual(lock.files.map((f: { path: string }) => f.path), [both, `${WRITABLE}/review.md`]);
    assert.deepEqual(lock.tests.map((t: { criterion: string }) => t.criterion), ["AC-001", "AC-002"]);
  });

  const gateFailures: [string, Record<string, string>, string][] = [
    ["a test without a criterion marking", { [GREETING]: testFile([ONE], 1, ["-"]), [FAREWELL]: testFile([TWO]) },
      `${GREETING} › ${ONE.name} is marked with no criterion.`],
    ["a test marked with a criterion proven by review", { [GREETING]: testFile([ONE], 1, ["AC-003"]), [FAREWELL]: testFile([TWO]) },
      `${GREETING} › ${ONE.name} is marked AC-003, which is not a criterion of this spec proven by test.`],
    ["a test marked with an ID that is not a criterion of the spec", { [GREETING]: testFile([ONE], 1, ["AC-099"]), [FAREWELL]: testFile([TWO]) },
      `${GREETING} › ${ONE.name} is marked AC-099, which is not a criterion of this spec proven by test.`],
    ["a test marked with another criterion than the test author lists", { [GREETING]: testFile([ONE], 1, ["AC-002"]), [FAREWELL]: testFile([TWO]) },
      `${GREETING} › ${ONE.name} is listed by the test author for AC-001 but marked AC-002.`],
  ];
  for (const [name, files, problem] of gateFailures) {
    test(`${name} fails the gate, leaves its files unlocked and writes no assumptions`, async () => {
      const root = project();
      const ui = recordingUi();
      const assumption = { id: "A-001", criterion: "AC-002", assumption: "The greeter is called greet." };
      const tests = [ONE, { ...TWO, assumptions: ["A-001"] }];
      await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui, agent: fakeAgents(files, [], tests, [assumption]) }),
        (err: DoppelblindError) => /not mapped to the spec's criteria/.test(err.message) && err.details.includes(problem) &&
          err.details.includes(`incomplete, not locked: ${GREETING}`));
      assert.ok(ui.events.some((e) => e.startsWith("fail: Checking the criterion of each test")));
      assert.ok(!existsSync(path.join(root, FOLDER, "assumptions.md")));
      assert.ok(!existsSync(lockFile(root)));
      // nothing waits for a decision: the next run starts the test author
      const calls: AgentRequest[] = [];
      await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents(undefined, calls) });
      assert.ok(calls.some((c) => c.tools));
    });
  }

  test("a report command that writes no test result stops the run with its output", async () => {
    const root = project({ contract: { ...CONTRACT, acceptanceTests: { ...CONTRACT.acceptanceTests, report: "echo cannot run {folder} >&2; true {output}" } } });
    await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents() }),
      (err: DoppelblindError) => /The report command wrote no test result/.test(err.message) &&
        err.details.some((d) => d.includes(`cannot run ${WRITABLE}`)));
  });

  test("a skipped test counts as skipped for its criterion and is shown before the lock", async () => {
    const root = project();
    const ui = recordingUi(["lock"]);
    const result = await runTestAuthor({
      cwd: root, target: BRIEF_PATH, ui,
      agent: fakeAgents({ [GREETING]: testFile([ONE]), [FAREWELL]: testFile([TWO], 1, undefined, "skip") }),
    });
    assert.deepEqual(result.results.find((t) => t.criterion === "AC-002")?.status, "skipped");
    assert.ok(ui.events.includes(`note: AC-002: ${FAREWELL} › ${TWO.name} is skipped`));
    assert.ok(ui.events.includes(`detail: AC-002 is skipped: ${FAREWELL} › ${TWO.name}`));
    assert.ok(ui.events.includes("done: Checking the criterion of each test (1 of 2 fail before any implementation, 1 skipped)"));
    assert.ok(result.lock);
  });

  test("a test without a marking in a file named after a criterion counts for that criterion, with a warning", async () => {
    const root = project();
    const ui = recordingUi(["lock"]);
    const legacy = `${WRITABLE}/ac-001.test.mjs`;
    const tests = [{ ...ONE, file: legacy }, TWO];
    await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui, agent: fakeAgents({ [legacy]: testFile([ONE], 1, ["-"]), [FAREWELL]: testFile([TWO]) }, [], tests) });
    assert.ok(ui.events.includes(`note: legacy criterion mapping: ${legacy} › ${ONE.name} counts for AC-001 by its file name; mark the test instead.`));
    const lock = JSON.parse(readFileSync(lockFile(root), "utf8"));
    assert.deepEqual(lock.tests.find((t: { file: string }) => t.file === legacy).criterion, "AC-001");
  });

  test("each run keeps its own folder with input, guardrails and the limits given at the start", async () => {
    const root = project();
    const calls: AgentRequest[] = [];
    await runTestAuthor({
      cwd: root, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents(undefined, calls),
      timeoutMs: 120_000, maxBudgetUsd: 3, maxTurns: 12,
    });
    const run = runs(root).find((r) => r.endsWith("-test-author"))!;
    const dir = path.join(root, ".doppelblind/runs", run);
    const guardrails = JSON.parse(readFileSync(path.join(dir, "guardrails.json"), "utf8"));
    assert.equal(guardrails.timeoutMs, 120_000);
    assert.equal(guardrails.maxBudgetUsd, 3);
    assert.equal(guardrails.maxTurns, 12);
    assert.equal(guardrails.writable, `${WRITABLE}/`);
    assert.deepEqual(guardrails.hidden.implementation, ["src"]);
    assert.equal(testAuthorCall(calls).maxTurns, 12);
    assert.ok(runs(root).some((r) => r.endsWith("-spec-agent")));
    assert.ok(existsSync(path.join(dir, "test-run.json")));
  });

  test("the test author's limits and the time limit of each test file come from the contract unless given as options", async () => {
    const root = project({ contract: { ...CONTRACT, limits: { testAuthor: { timeoutMin: 4, budgetUsd: 2, maxTurns: 9 }, testFileTimeoutMin: 1 } } });
    const calls: AgentRequest[] = [];
    await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents(undefined, calls) });
    const call = testAuthorCall(calls);
    assert.deepEqual([call.timeoutMs, call.maxBudgetUsd, call.maxTurns], [4 * 60_000, 2, 9]);

    const given: AgentRequest[] = [];
    const other = project({ contract: { ...CONTRACT, limits: { testAuthor: { timeoutMin: 4, budgetUsd: 2, maxTurns: 9 } } } });
    await runTestAuthor({ cwd: other, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents(undefined, given), timeoutMs: 60_000, maxBudgetUsd: 3, maxTurns: 20 });
    const overridden = testAuthorCall(given);
    assert.deepEqual([overridden.timeoutMs, overridden.maxBudgetUsd, overridden.maxTurns], [60_000, 3, 20]);

    // without a contract value or an option, the defaults apply
    const plain: AgentRequest[] = [];
    await runTestAuthor({ cwd: project(), target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents(undefined, plain) });
    const defaults = testAuthorCall(plain);
    assert.deepEqual([defaults.timeoutMs, defaults.maxBudgetUsd, defaults.maxTurns], [15 * 60_000, 5, 80]);
  });

  test("at the time or cost limit the user is asked; a raise retries from scratch, a refusal writes nothing to the project", async () => {
    for (const limit of ["time", "budget"] as const) {
      const root = project();
      const calls: AgentRequest[] = [];
      const agent = fakeAgents(undefined, calls);
      let attempts = 0;
      const ui = recordingUi(["yes", "keep unlocked"]);
      await runTestAuthor({
        cwd: root, target: BRIEF_PATH, ui, maxBudgetUsd: 2, timeoutMs: 60_000,
        agent: async (request) => {
          if (request.tools && attempts++ === 0) throw new AgentLimitError(limit, "limit reached");
          return agent(request);
        },
      });
      const retry = calls.filter((c) => c.tools)[0];
      assert.equal(limit === "time" ? retry.timeoutMs : retry.maxBudgetUsd, limit === "time" ? 120_000 : 4);
      assert.ok(ui.events.some((e) => e.startsWith(`choose: Agent reached the ${limit === "time" ? "time" : "cost"} limit`)));

      const declined = project({ files: { [`${WRITABLE}/ac-009.test.mjs`]: "old" } });
      await assert.rejects(runTestAuthor({
        cwd: declined, target: BRIEF_PATH, ui: recordingUi(["no"]),
        agent: async (request) => {
          if (!request.tools) return fakeAgents()(request);
          writeFileSync(path.join(request.workdir!, GREETING), testFile([ONE]));
          throw new AgentLimitError(limit, "limit reached");
        },
      }), AgentLimitError);
      assert.deepEqual(readdirSync(path.join(declined, WRITABLE)), ["ac-009.test.mjs"]);
    }
  });

  test("the turn limit is never offered for raising", async () => {
    const root = project();
    const ui = recordingUi();
    await assert.rejects(runTestAuthor({
      cwd: root, target: BRIEF_PATH, ui,
      agent: async (request) => {
        if (!request.tools) return fakeAgents()(request);
        throw new AgentLimitError("turns", "Agent reached its turn limit.");
      },
    }), (err) => err instanceof AgentLimitError && err.limit === "turns");
    assert.ok(!ui.events.some((e) => e.startsWith("choose:")));
  });
});

describe("assumption decisions", () => {
  const ASSUMPTIONS = `${FOLDER}/assumptions.md`;
  const greet = { id: "A-001", criterion: "AC-002", assumption: "The greeter is called greet." };
  const exit = { id: "A-002", criterion: "AC-001", assumption: "The greeter exits with 0." };
  const resting = (ids: string[][]): ReportedTest[] => TESTS.map((t, i) => ({ ...t, assumptions: ids[i] }));

  /** Writes `decision` into the Decision field of assumption `id` in assumptions.md. */
  function decide(root: string, id: string, decision: string) {
    const file = path.join(root, ASSUMPTIONS);
    const md = readFileSync(file, "utf8");
    const at = md.indexOf("**Decision:**", md.indexOf(`## ${id}\n`)) + "**Decision:**".length;
    writeFileSync(file, `${md.slice(0, at)}\n\n${decision}${md.slice(at)}`);
  }

  /** A project whose first test author run reported `greet` (AC-002) and `exit` (AC-001). */
  async function afterFirstRun() {
    const root = project();
    const result = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents(undefined, [], resting([["A-002"], ["A-001"]]), [greet, exit]) });
    return { root, result };
  }

  test("a run with assumptions writes assumptions.md next to spec.md and does not offer the lock", async () => {
    // recordingUi() without choices throws if the lock is offered
    const { root, result } = await afterFirstRun();
    assert.equal(result.assumptionsFile, ASSUMPTIONS);
    assert.equal(result.undecided, 2);
    assert.equal(result.lock, undefined);
    assert.ok(!existsSync(lockFile(root)));
    assert.deepEqual(result.tests.map((t) => t.assumptions), [["A-002"], ["A-001"]]);

    const md = readFileSync(path.join(root, ASSUMPTIONS), "utf8");
    assert.ok(md.includes(`## A-001\n\n**Criterion:** AC-002\n\n**Assumption:** The greeter is called greet.\n\n**Test files:**\n\n- ${FAREWELL}\n\n**Decision:**\n\n## A-002`));
    assert.ok(md.endsWith(`## A-002\n\n**Criterion:** AC-001\n\n**Assumption:** The greeter exits with 0.\n\n**Test files:**\n\n- ${GREETING}\n\n**Decision:**\n`));
  });

  test("a run without assumptions writes no assumptions.md and offers the lock at once", async () => {
    const root = project();
    const result = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["lock"]), agent: fakeAgents() });
    assert.ok(!existsSync(path.join(root, ASSUMPTIONS)));
    assert.equal(result.assumptionsFile, undefined);
    assert.ok(result.lock);
  });

  test("an assumption without a valid decision stops the next run before the test author starts and locks nothing", async () => {
    for (const decision of [undefined, "rejected", "rejected:", "maybe"]) {
      const { root } = await afterFirstRun();
      decide(root, "A-002", "accepted");
      if (decision !== undefined) decide(root, "A-001", decision);
      const calls: AgentRequest[] = [];
      await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents(undefined, calls) }),
        (err: DoppelblindError) => /1 assumptions in specs\/001-greet-everyone\/assumptions.md have no valid decision/.test(err.message) &&
          err.details[0].startsWith("A-001 (AC-002): "));
      assert.equal(calls.length, 0);
      assert.ok(!existsSync(lockFile(root)));
    }
  });

  test("once every assumption is accepted, the next run offers the lock of those tests without another test author run", async () => {
    const { root, result: first } = await afterFirstRun();
    decide(root, "A-001", "accepted");
    decide(root, "A-002", "accepted");
    const calls: AgentRequest[] = [];
    const ui = recordingUi(["lock"]);
    const result = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui, agent: fakeAgents(undefined, calls) });

    assert.equal(calls.length, 0);
    assert.deepEqual(result.tests, first.tests);
    assert.deepEqual(result.results, first.results);
    assert.equal(result.lock, ".doppelblind/locks/001-greet-everyone.json");
    const lock = JSON.parse(readFileSync(lockFile(root), "utf8"));
    assert.deepEqual(lock.files.map((f: { path: string }) => f.path), [GREETING, FAREWELL, `${WRITABLE}/review.md`, ASSUMPTIONS]);
    assert.ok(ui.events.includes("note: every assumption in specs/001-greet-everyone/assumptions.md is decided: 2 accepted, 0 rejected and already applied"));
  });

  test("a rejected assumption starts the test author again with every decision as decided on its criterion", async () => {
    const { root } = await afterFirstRun();
    decide(root, "A-001", "rejected: the greeter is called hello");
    decide(root, "A-002", "accepted");
    const calls: AgentRequest[] = [];
    const ui = recordingUi(["lock"]);
    const result = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui, agent: fakeAgents(undefined, calls) });

    const input = testAuthorCall(calls).userMessage;
    assert.ok(input.includes("Then: it prints a greeting\ndeliberately unspecified: Which words does the greeting use?\ndecided: The greeter exits with 0.\n</criterion>"));
    assert.ok(input.includes("Then: two then\ndecided: the greeter is called hello\n</criterion>"));
    assert.ok(!input.includes("The greeter is called greet."));
    assert.ok(ui.events.includes("note: A-001 rejected in specs/001-greet-everyone/assumptions.md: the test author starts again for specs/001-greet-everyone/spec.md"));
    // no new assumption: the gate passes and the lock is offered at once
    assert.equal(result.undecided, 0);
    assert.ok(result.lock);
    // the decisions stay in assumptions.md: they bind every later run
    const md = readFileSync(path.join(root, ASSUMPTIONS), "utf8");
    assert.ok(md.includes("**Decision:**\n\nrejected: the greeter is called hello\n"));
    assert.ok(md.includes("**Decision:**\n\naccepted\n"));
  });

  test("new assumptions follow the earlier IDs; once decided, an already applied rejection does not start the test author again", async () => {
    const { root } = await afterFirstRun();
    decide(root, "A-001", "rejected: the greeter is called hello");
    decide(root, "A-002", "accepted");
    const another = { id: "A-001", criterion: "AC-001", assumption: "The greeting ends with a newline." };
    const second = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents(undefined, [], resting([["A-001"], []]), [another]) });

    assert.deepEqual(second.assumptions.map((a) => a.id), ["A-003"]);
    assert.deepEqual(second.tests.map((t) => t.assumptions), [["A-003"], []]);
    assert.equal(second.undecided, 1);
    assert.deepEqual([...readFileSync(path.join(root, ASSUMPTIONS), "utf8").matchAll(/^## (A-\d+)$/gm)].map((m) => m[1]), ["A-001", "A-002", "A-003"]);

    decide(root, "A-003", "accepted");
    const calls: AgentRequest[] = [];
    const third = await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["lock"]), agent: fakeAgents(undefined, calls) });
    assert.equal(calls.length, 0);
    assert.ok(third.lock);

    // changing a rejection's text is a new rejection: the test author starts again
    const rerun = project();
    await runTestAuthor({ cwd: rerun, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents(undefined, [], resting([[], ["A-001"]]), [greet]) });
    decide(rerun, "A-001", "rejected: hello");
    await runTestAuthor({ cwd: rerun, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents() });
    const file = path.join(rerun, ASSUMPTIONS);
    writeFileSync(file, readFileSync(file, "utf8").replace("rejected: hello", "rejected: hi"));
    const again: AgentRequest[] = [];
    await runTestAuthor({ cwd: rerun, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents(undefined, again) });
    assert.ok(testAuthorCall(again).userMessage.includes("decided: hi\n"));
  });

  test("a test file resting on an assumption that is not reported fails the run", async () => {
    const root = project();
    await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents(undefined, [], resting([["A-007"], []]), [greet]) }),
      (err: DoppelblindError) => err.details.includes(`${GREETING} › ${ONE.name} rests on A-007, which is not a reported assumption.`));
    assert.ok(!existsSync(path.join(root, ASSUMPTIONS)));
  });
});

describe("cli", () => {
  test.each([BRIEF_PATH, "1", "001", FOLDER])("continuing the flow of a brief whose spec is final starts the test author: %s", (target) => {
    const root = project({ spec: spec({ criteria: spec().criteria.slice(0, 2) }) });
    const cli = path.join(import.meta.dirname, "..", "src", "cli.ts");
    const fake = path.join(import.meta.dirname, "fixtures", "fake-claude.mjs");
    const stdout = JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: { tests: [], assumptions: [] } });
    const result = spawnSync(process.execPath, [cli, "feature", target], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DOPPELBLIND_CLAUDE_BIN: fake, FAKE_CLAUDE_STDOUT: stdout },
    });
    assert.match(result.stderr, /Reading the final spec/);
    assert.ok(runs(root).some((r) => r.endsWith("-test-author")), result.stderr);
    assert.equal(result.status, 1); // the fake's output lists no test
  });
});
