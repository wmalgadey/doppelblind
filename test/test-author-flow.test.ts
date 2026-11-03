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
  acceptanceTests: "tests/acceptance",
  testCommand: "node {file}",
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

const FAIL = "process.exit(1);\n";
const PASS = "process.exit(0);\n";

/**
 * Stands in for both agents: as the test author (it has tools) it writes `files` into its working directory and
 * reports `tests`; as the review guide it answers one entry per criterion in its message.
 */
function fakeAgents(
  files: Record<string, string> = { [`${WRITABLE}/ac-001.test.mjs`]: FAIL, [`${WRITABLE}/ac-002.test.mjs`]: FAIL },
  calls: AgentRequest[] = [],
  tests = [{ file: `${WRITABLE}/ac-001.test.mjs`, criterion: "AC-001" }, { file: `${WRITABLE}/ac-002.test.mjs`, criterion: "AC-002" }],
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
    return { output: { tests, assumptions: [{ criterion: "AC-002", assumption: "The greeter is called greet." }] }, costUsd: 0.5 };
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

    assert.deepEqual(result.tests.map((t) => t.file), [`${WRITABLE}/ac-001.test.mjs`, `${WRITABLE}/ac-002.test.mjs`]);
    for (const t of result.tests) assert.equal(readFileSync(path.join(root, t.file), "utf8"), FAIL);
    assert.deepEqual(result.passing, []);
    assert.equal(result.lock, ".doppelblind/locks/001-greet-everyone.json");

    const lock = JSON.parse(readFileSync(lockFile(root), "utf8"));
    assert.deepEqual(lock.files.map((f: { path: string; criterion: string | null }) => [f.path, f.criterion]), [
      [`${WRITABLE}/ac-001.test.mjs`, "AC-001"],
      [`${WRITABLE}/ac-002.test.mjs`, "AC-002"],
      [`${WRITABLE}/review.md`, null],
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
      "Writing the lock",
    ]);
    assert.ok(ui.events.includes("done: Running the acceptance tests (2 of 2 fail before any implementation)"));
  });

  test("a test that passes before any implementation is reported with its criterion ID", async () => {
    const root = project();
    const ui = recordingUi(["keep unlocked"]);
    const result = await runTestAuthor({
      cwd: root,
      target: BRIEF_PATH,
      ui,
      agent: fakeAgents({ [`${WRITABLE}/ac-001.test.mjs`]: FAIL, [`${WRITABLE}/ac-002.test.mjs`]: PASS }),
    });
    assert.deepEqual(result.passing?.map((p) => p.criterion), ["AC-002"]);
    assert.ok(ui.events.includes(`note: AC-002: ${WRITABLE}/ac-002.test.mjs passes before any implementation`));
    assert.ok(ui.events.some((e) => e === `detail: AC-002 passes before any implementation: ${WRITABLE}/ac-002.test.mjs`));
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
    assert.deepEqual(readdirSync(path.join(root, WRITABLE)).sort(), ["ac-001.test.mjs", "ac-002.test.mjs", "review.md"]);
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
    const files = { [`${WRITABLE}/ac-001.test.mjs`]: FAIL, "src/greeter.mjs": "OVERWRITTEN", "escape.mjs": "x" };
    await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui, agent: fakeAgents(files) }), (err: DoppelblindError) =>
      /wrote outside tests\/acceptance\/001-greet-everyone\//.test(err.message) &&
      err.details.includes("rejected: escape.mjs") &&
      err.details.includes("rejected: src/greeter.mjs") &&
      err.details.includes(`incomplete, not locked: ${WRITABLE}/ac-001.test.mjs`));
    assert.equal(readFileSync(path.join(root, "src/greeter.mjs"), "utf8"), "IMPLEMENTATION CONTENT");
    assert.ok(!existsSync(path.join(root, "escape.mjs")));
    assert.ok(ui.events.some((e) => e.startsWith("fail: Checking its writes (The test author wrote outside")));

    assert.ok(existsSync(path.join(root, WRITABLE, "ac-001.test.mjs")));
    assert.ok(!existsSync(lockFile(root)));
    const run = runs(root).find((r) => r.endsWith("-test-author"))!;
    assert.deepEqual(readdirSync(path.join(root, ".doppelblind/runs", run)).sort(), ["guardrails.json", "input.md", "output.json", "system-prompt.md", "trace.jsonl"]);

    // the incomplete files are not frozen: the next run starts
    await runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(["keep unlocked"]), agent: fakeAgents() });
  });

  test("a criterion without a test file fails the run", async () => {
    const root = project();
    const tests = [{ file: `${WRITABLE}/ac-001.test.mjs`, criterion: "AC-001" }];
    await assert.rejects(runTestAuthor({ cwd: root, target: BRIEF_PATH, ui: recordingUi(), agent: fakeAgents(undefined, [], tests) }),
      (err: DoppelblindError) => err.details.includes("AC-002 has no acceptance test."));
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
          writeFileSync(path.join(request.workdir!, WRITABLE, "ac-001.test.mjs"), FAIL);
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
