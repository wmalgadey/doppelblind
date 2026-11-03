import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import type { Agent, AgentRequest } from "../src/agent/claude.ts";
import { AgentLimitError, DoppelblindError } from "../src/errors.ts";
import { runSpecFlow } from "../src/flow/spec-flow.ts";
import { fillAnswers } from "../src/spec/answers.ts";
import { readState } from "../src/spec/state.ts";
import { BRIEF, makeProject, recordingUi, sampleSpec } from "./helpers.ts";

const CONTRACT = JSON.stringify({ sources: ["docs/product.md", "docs/decisions.md"], specs: "specs" });

function fakeAgent(output: unknown, calls: AgentRequest[] = []): Agent {
  return async (request) => {
    calls.push(request);
    if (request.runDir) writeFileSync(path.join(request.runDir, "trace.jsonl"), JSON.stringify({ type: "result", structured_output: output }) + "\n");
    return { output, costUsd: 0.1, durationMs: 3000 };
  };
}

/** Writes `text` into the Answer field of question `id` in spec.md. */
function answer(file: string, id: string, text: string) {
  writeFileSync(file, fillAnswers(readFileSync(file, "utf8"), [{ id, answer: text }]));
}

function project() {
  return makeProject({
    ".doppelblind.conf": CONTRACT,
    "docs/product.md": "| OUT-01 | turn a brief into a spec |",
    "docs/briefs/greeting.md": BRIEF,
    "src/secret.ts": "implementation the spec agent must not see",
  });
}

describe("spec-flow", () => {
  test("hands the brief and the binding sources to the spec agent and writes a numbered spec.md", async () => {
    const root = project();
    const calls: AgentRequest[] = [];
    const result = await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(sampleSpec(), calls) });

    assert.equal(result.specFile, path.join(root, "specs", "001-greet-everyone", "spec.md"));
    assert.equal(result.criteria, 1);
    assert.equal(result.openQuestions, 1);
    const md = readFileSync(result.specFile, "utf8");
    assert.match(md, /### AC-001: Greeter greets/);
    assert.match(md, /\[docs\/briefs\/greeting.md\]\(\.\.\/\.\.\/docs\/briefs\/greeting.md\)/);

    assert.equal(calls.length, 1);
    const message = calls[0].userMessage;
    assert.ok(message.includes('<brief path="docs/briefs/greeting.md">'));
    assert.ok(message.includes('<source path="docs/product.md">'));
    assert.ok(!message.includes("implementation the spec agent must not see"));
  });

  test("a second run for the same brief reruns the agent with the answers, never the earlier spec, and replaces spec.md", async () => {
    const root = project();
    const first = await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(sampleSpec()) });
    writeFileSync(first.specFile, readFileSync(first.specFile, "utf8").replace("**Answer:**\n", "**Answer:**\n\nHello and welcome.\n"));

    const calls: AgentRequest[] = [];
    const rerun = sampleSpec({
      short_name: "other-name",
      criteria: [{ ...sampleSpec().criteria[0], reason_in_source: null, reason_anchor: null, sources: [{ path: "specs/001-greet-everyone/answers.md", anchor: "Hello and welcome." }] }],
      open_questions: [{ id: "Q-01", question: "In which language is the greeting?", concerns: [] }],
    });
    const ui = recordingUi();
    const second = await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui, agent: fakeAgent(rerun, calls) });

    assert.equal(second.specFile, first.specFile);
    assert.deepEqual(readdirSync(path.join(root, "specs")), ["001-greet-everyone"]);
    assert.ok(ui.events.includes("note: spec-create run: rerunning with 1 answers, 1 new from specs/001-greet-everyone/spec.md"));

    const message = calls[0].userMessage;
    assert.ok(!message.includes("<spec"));
    assert.ok(!message.includes("Greeter greets"));
    assert.ok(message.includes('<answers path="specs/001-greet-everyone/answers.md">\n# Answers\n\n**Question:** Which words does the greeting use?\n\n**Answer:**\n\nHello and welcome.\n</answers>'));
    assert.ok(message.endsWith("Write the specification for this brief."));

    const md = readFileSync(second.specFile, "utf8");
    // the second run's question follows the brief's highest question number instead of reusing Q-01
    assert.match(md, /## Open questions\n\n### Q-02\n\nIn which language is the greeting\?\n\n\*\*Answer:\*\*\n$/);
    assert.ok(!md.includes("Answered questions"));
    assert.match(readFileSync(path.join(root, "specs/001-greet-everyone/answers.md"), "utf8"), /Hello and welcome\./);
  });

  test("a question number is never reused, even after a run without questions", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ open_questions: [] })) });
    const third = await runSpecFlow({
      ...opts,
      agent: fakeAgent(sampleSpec({ open_questions: [{ id: "Q-01", question: "Which colour?", concerns: [] }] })),
    });
    assert.match(readFileSync(third.specFile, "utf8"), /### Q-02\n\nWhich colour\?/);
    assert.equal(readState(root)["docs/briefs/greeting.md"].lastQuestion, 2);
  });

  test("a brief's spec is recognised from the run state, not from what spec.md says", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const first = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    writeFileSync(first.specFile, "# Something else entirely\n");
    const second = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ short_name: "other-name" })) });
    assert.equal(second.specFile, first.specFile);
    const state = readState(root);
    assert.deepEqual(Object.keys(state), ["docs/briefs/greeting.md"]);
    assert.equal(state["docs/briefs/greeting.md"].folder, "specs/001-greet-everyone");
    // ready or open is computed from the spec, never stored
    assert.deepEqual(Object.keys(state["docs/briefs/greeting.md"]).sort(), ["folder", "lastQuestion", "run"]);
  });

  test("answers accumulate across spec-create runs with their question's text", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const first = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    answer(first.specFile, "Q-01", "Hello.");
    await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ open_questions: [{ id: "Q-01", question: "Which colour?", concerns: ["AC-001"] }] })) });
    answer(first.specFile, "Q-02", "free the user picks it");

    const calls: AgentRequest[] = [];
    await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ open_questions: [] }), calls) });
    const message = calls[0].userMessage;
    assert.ok(message.includes("**Question:** Which words does the greeting use?\n\n**Answer:**\n\nHello.\n\n**Question:** Which colour?\n\n**Answer:**\n\nfree the user picks it\n"));
  });

  test("a rerun without answers warns that unsaved answers are not seen and says whether spec.md changed", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md" };
    const first = await runSpecFlow({ ...opts, ui: recordingUi(), agent: fakeAgent(sampleSpec()) });
    writeFileSync(first.specFile, readFileSync(first.specFile, "utf8").replace("**Answer:**\n", "**Answer:**\n \t\n"));

    const calls: AgentRequest[] = [];
    const same = recordingUi();
    await runSpecFlow({ ...opts, ui: same, agent: fakeAgent(sampleSpec(), calls) });
    assert.ok(same.events.includes("note: no answers in specs/001-greet-everyone/spec.md; unsaved answers are not seen"));
    assert.ok(same.events.includes("done: Writing spec.md (specs/001-greet-everyone/spec.md, updated)"));
    assert.ok(calls[0].userMessage.includes('<answers path="specs/001-greet-everyone/answers.md">\nNone.\n</answers>'));
    assert.ok(!existsSync(path.join(root, "specs/001-greet-everyone/answers.md")));

    // a spec with open questions changes on every rerun, since new questions get new IDs; one without stays the same
    const noQuestions = sampleSpec({ open_questions: [] });
    await runSpecFlow({ ...opts, ui: recordingUi(), agent: fakeAgent(noQuestions) });
    const unchanged = recordingUi();
    await runSpecFlow({ ...opts, ui: unchanged, agent: fakeAgent(noQuestions) });
    assert.ok(unchanged.events.includes("done: Writing spec.md (specs/001-greet-everyone/spec.md, unchanged)"));
  });

  test("answers saved while the agent runs are not overwritten", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const first = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    const stateFile = path.join(root, ".doppelblind/specs.json");
    const stateBefore = readFileSync(stateFile, "utf8");
    const saved = readFileSync(first.specFile, "utf8").replace("**Answer:**\n", "**Answer:**\n\nHello.\n");
    const savingAgent: Agent = async (request) => {
      writeFileSync(first.specFile, saved);
      return fakeAgent(sampleSpec({ open_questions: [] }))(request);
    };
    await assert.rejects(runSpecFlow({ ...opts, agent: savingAgent }), /changed while the agent was running; it was not overwritten/);
    assert.equal(readFileSync(first.specFile, "utf8"), saved);
    assert.equal(readFileSync(stateFile, "utf8"), stateBefore);
  });

  test("a spec is ready when no open question concerns a criterion, and open otherwise", async () => {
    const opts = { brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const open = await runSpecFlow({ ...opts, cwd: project(), agent: fakeAgent(sampleSpec()) });
    assert.equal(open.status, "open");
    const unconcerned = sampleSpec({ open_questions: [{ id: "Q-01", question: "Which colour?", concerns: [] }] });
    const ready = await runSpecFlow({ ...opts, cwd: project(), agent: fakeAgent(unconcerned) });
    assert.equal(ready.status, "ready");
    assert.equal(ready.openQuestions, 1);
  });

  test("a different brief gets the next number", async () => {
    const root = project();
    writeFileSync(path.join(root, "docs/briefs/farewell.md"), BRIEF);
    const spec = sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "docs/briefs/farewell.md", anchor: "## Walkthrough" }] }] });
    await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(sampleSpec()) });
    const second = await runSpecFlow({ cwd: root, brief: "docs/briefs/farewell.md", ui: recordingUi(), agent: fakeAgent(spec) });
    assert.equal(path.basename(path.dirname(second.specFile)), "002-greet-everyone");
    // question numbers are per brief: the other brief's first spec starts at Q-01 again
    assert.match(readFileSync(second.specFile, "utf8"), /### Q-01\n/);
  });

  test("the brief path is relative to the current directory", async () => {
    const root = project();
    const result = await runSpecFlow({ cwd: path.join(root, "docs"), brief: "briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(sampleSpec()) });
    assert.ok(result.specFile.startsWith(path.join(root, "specs")));
  });

  test("reports each step and notes declared sources that are missing", async () => {
    const ui = recordingUi();
    await runSpecFlow({ cwd: project(), brief: "docs/briefs/greeting.md", ui, agent: fakeAgent(sampleSpec()) });
    assert.ok(ui.events.includes("note: declared source not found, skipped: docs/decisions.md"));
    assert.deepEqual(ui.events.filter((e) => e.startsWith("done:")).map((e) => e.replace(/ \(.*/, "")), [
      "done: Reading brief",
      "done: Loading binding sources",
      "done: Spec agent is writing the spec",
      "done: Validating output against schema",
      "done: Checking criteria and citations",
      "done: Writing spec.md",
    ]);
  });

  test("each run keeps the agent's prompt, input, guardrails and trace in a run folder", async () => {
    const root = project();
    const ui = recordingUi();
    const calls: AgentRequest[] = [];
    await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui, agent: fakeAgent(sampleSpec(), calls) });

    const runs = path.join(root, ".doppelblind", "runs");
    const [run] = readdirSync(runs);
    assert.match(run, /-spec-agent$/);
    assert.deepEqual(readdirSync(path.join(runs, run)).sort(), ["guardrails.json", "input.md", "output.json", "system-prompt.md", "trace.jsonl"]);
    assert.equal(readFileSync(path.join(runs, run, "input.md"), "utf8"), calls[0].userMessage);
    const guardrails = JSON.parse(readFileSync(path.join(runs, run, "guardrails.json"), "utf8"));
    assert.deepEqual(guardrails, { timeoutMs: 15 * 60_000, maxBudgetUsd: 5, maxTurns: null, tools: [] });
    assert.equal(readFileSync(path.join(runs, run, "system-prompt.md"), "utf8"), calls[0].systemPrompt);
    assert.equal(calls[0].runDir, path.join(runs, run));
    assert.ok(ui.events.includes(`note: trace: .doppelblind/runs/${run}/trace.jsonl`));
  });

  test("invalid agent output writes no spec but names the trace", async () => {
    const root = project();
    const ui = recordingUi();
    await assert.rejects(
      runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui, agent: fakeAgent({ title: "x", criteria: [] }) }),
      (err: DoppelblindError) => err.details.some((d) => /^Agent trace: \.doppelblind\/runs\/.*-spec-agent\/trace\.jsonl$/.test(d)),
    );
    assert.ok(ui.events.includes("fail: Validating output against schema (Agent output does not match its schema.)"));
    assert.ok(!existsSync(path.join(root, "specs")));
    assert.equal(readdirSync(path.join(root, ".doppelblind", "runs")).length, 1);
  });

  test("a failed agent run names the trace", async () => {
    const failing: Agent = async () => {
      throw new DoppelblindError("Agent run failed.", ["error_max_budget_usd"]);
    };
    await assert.rejects(
      runSpecFlow({ cwd: project(), brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: failing }),
      (err: DoppelblindError) => err.details.some((d) => d.startsWith("Agent trace: .doppelblind/runs/")),
    );
  });

  test.each([
    ["time", 60_000, 120_000, "1 minute", "2 minutes"],
    ["budget", 2, 4, "$2.00", "$4.00"],
  ] as const)("increases the %s limit and retries only after approval", async (limit, initial, increased, from, to) => {
    const root = project();
    const calls: AgentRequest[] = [];
    const agent: Agent = async (request) => {
      calls.push(request);
      if (calls.length === 1) throw new AgentLimitError(limit, "limit reached");
      return { output: sampleSpec() };
    };
    const ui = recordingUi(["yes"]);

    await runSpecFlow({
      cwd: root,
      brief: "docs/briefs/greeting.md",
      ui,
      agent,
      timeoutMs: limit === "time" ? initial : 60_000,
      maxBudgetUsd: limit === "budget" ? initial : 2,
    });

    assert.equal(calls.length, 2);
    assert.notEqual(calls[0].runDir, calls[1].runDir);
    assert.equal(calls[0][limit === "time" ? "timeoutMs" : "maxBudgetUsd"], initial);
    assert.equal(calls[1][limit === "time" ? "timeoutMs" : "maxBudgetUsd"], increased);
    assert.ok(ui.events.includes(
      `choose: Agent reached the ${limit === "time" ? "time" : "cost"} limit (${from}). Increase it to ${to} and retry? -> yes`,
    ));
  });

  test("does not retry after the user declines a limit increase", async () => {
    const calls: AgentRequest[] = [];
    const agent: Agent = async (request) => {
      calls.push(request);
      throw new AgentLimitError("budget", "limit reached");
    };
    const ui = recordingUi(["no"]);

    await assert.rejects(
      runSpecFlow({ cwd: project(), brief: "docs/briefs/greeting.md", ui, agent }),
      /limit reached/,
    );
    assert.equal(calls.length, 1);
    assert.ok(ui.events.some((event) => event.endsWith("retry? -> no")));
  });

  test("a citation of a non-binding source fails the gate and writes no spec", async () => {
    const root = project();
    const spec = sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "src/secret.ts", anchor: "implementation" }] }] });
    await assert.rejects(
      runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(spec) }),
      (err: DoppelblindError) => err.details.includes("AC-001 cites src/secret.ts, which is not a binding source."),
    );
    assert.ok(!existsSync(path.join(root, "specs")));
  });

  test("a missing brief fails before the agent runs", async () => {
    const calls: AgentRequest[] = [];
    await assert.rejects(
      runSpecFlow({ cwd: project(), brief: "docs/briefs/nope.md", ui: recordingUi(), agent: fakeAgent(sampleSpec(), calls) }),
      /Brief not found: docs\/briefs\/nope.md/,
    );
    assert.equal(calls.length, 0);
  });

  test("without a contract file the defaults apply in the current directory", async () => {
    const root = makeProject({ "brief.md": BRIEF });
    const spec = sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "brief.md", anchor: "## Walkthrough" }] }] });
    const result = await runSpecFlow({ cwd: root, brief: "brief.md", ui: recordingUi(), agent: fakeAgent(spec) });
    assert.equal(result.specFile, path.join(root, "specs", "001-greet-everyone", "spec.md"));
  });
});

describe("spec-flow: continuing a feature", () => {
  const BRIEF_PATH = "docs/briefs/greeting.md";
  const TWO_QUESTIONS = sampleSpec({
    open_questions: [
      { id: "Q-01", question: "Which words does the greeting use?", concerns: ["AC-001"] },
      { id: "Q-02", question: "Which colour is the greeting?", concerns: [] },
    ],
  });

  function state(root: string) {
    return readState(root)[BRIEF_PATH];
  }

  function answersMd(root: string) {
    const file = path.join(root, "specs/001-greet-everyone/answers.md");
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  }

  /** Every answer in answers.md, as "<id> <answer>". */
  function loggedAnswers(root: string) {
    return [...answersMd(root).matchAll(/^### (Q-\d+)\n\n.*\n\n\*\*Answer:\*\*\n\n(.*)$/gm)].map((m) => `${m[1]} ${m[2]}`);
  }

  async function firstSpecCreateRun(output = TWO_QUESTIONS) {
    const root = project();
    const first = await runSpecFlow({ cwd: root, brief: BRIEF_PATH, ui: recordingUi(), agent: fakeAgent(output), clarify: true });
    return { root, specFile: first.specFile };
  }

  /** The choice asked after a spec-create run that followed a clarify run. */
  function newSpec(openQuestions: number) {
    return `A new spec.md was created from the answers. The new spec contains ${openQuestions} open questions. ` +
      "Do you want to (1) answer the questions, or should all questions be (2) marked `unanswered`?";
  }

  function feature(root: string, choices: string[], agent: Agent) {
    const ui = recordingUi(choices);
    return { ui, run: runSpecFlow({ cwd: root, brief: BRIEF_PATH, ui, agent, clarify: true }) };
  }

  test("there is no limit on spec-create runs and no status limit reached", async () => {
    const { root } = await firstSpecCreateRun();
    for (let run = 2; run <= 5; run++) {
      const result = await runSpecFlow({ cwd: root, brief: BRIEF_PATH, ui: recordingUi(), agent: fakeAgent(TWO_QUESTIONS) });
      assert.equal(result.status, "open");
    }
    const { run } = feature(root, ["free", "free", "answer"], fakeAgent(TWO_QUESTIONS));
    const sixth = await run;
    assert.equal(sixth.status, "open");
    // six runs of two questions each: the sixth asks Q-11 and Q-12
    assert.match(readFileSync(sixth.specFile, "utf8"), /### Q-11\n[\s\S]*### Q-12\n/);
    assert.ok(!readFileSync(path.join(root, ".doppelblind/specs.json"), "utf8").includes("limit reached"));
  });

  test("a spec where no open question concerns a criterion is shown as ready but does not end the spec step", async () => {
    const unconcerned = sampleSpec({ open_questions: [{ id: "Q-01", question: "Which colour?", concerns: [] }] });
    const root = project();
    const ui = recordingUi();
    const first = await runSpecFlow({ cwd: root, brief: BRIEF_PATH, ui, agent: fakeAgent(unconcerned), clarify: true });
    assert.equal(first.status, "ready");
    assert.ok(ui.events.includes("note: no open question concerns a criterion"));

    const calls: AgentRequest[] = [];
    const { run } = feature(root, ["free", "answer"], fakeAgent(unconcerned, calls));
    assert.equal((await run).status, "ready");
    assert.equal(calls.length, 1);
  });

  test("answers in spec.md are added to answers.md, and each unanswered question is asked with the titles of its criteria", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    answer(specFile, "Q-02", "Blue.");
    const { ui, run } = feature(root, ["free", "answer"], fakeAgent(TWO_QUESTIONS));
    await run;
    assert.deepEqual(loggedAnswers(root), ["Q-01 free", "Q-02 Blue."]);
    assert.ok(ui.events.includes("note: 1 of 2 open questions have no answer."));
    assert.ok(!ui.events.some((e) => e.startsWith("note: Q-0")));
    assert.ok(ui.events.includes("detail: concerns AC-001: Greeter greets"));
    assert.deepEqual(ui.events.filter((e) => e.startsWith("choose:")), [
      "choose: Q-01 (1/1 unanswered): Which words does the greeting use? -> free",
      `choose: ${newSpec(2)} -> answer`,
    ]);
  });

  test("free is stored in answers.md as the user's answer and the next spec-create run receives it", async () => {
    const { root } = await firstSpecCreateRun();
    const calls: AgentRequest[] = [];
    const { run } = feature(root, ["free", "free", "answer"], fakeAgent(sampleSpec({ open_questions: [] }), calls));
    const result = await run;
    assert.deepEqual(loggedAnswers(root), ["Q-01 free", "Q-02 free"]);
    assert.ok(calls[0].userMessage.includes("**Question:** Which words does the greeting use?\n\n**Answer:**\n\nfree\n"));
    assert.equal(result.leftOpen, 2);
    const md = readFileSync(result.specFile, "utf8");
    assert.match(md, /## Left open\n\n- Q-01: Which words does the greeting use\?\n- Q-02: Which colour is the greeting\?\n/);
  });

  test("out of scope is stored in answers.md as the user's answer", async () => {
    const { root } = await firstSpecCreateRun();
    const { run } = feature(root, ["out of scope", "free", "answer"], fakeAgent(sampleSpec({ open_questions: [] })));
    const result = await run;
    assert.deepEqual(loggedAnswers(root), ["Q-01 out of scope", "Q-02 free"]);
    assert.equal(result.outOfScope, 1);
    assert.match(readFileSync(result.specFile, "utf8"), /## Out of scope\n\n- Q-01: Which words does the greeting use\?\n/);
  });

  test("stop writes nothing for that question, keeps earlier choices in spec.md, and the user can answer it there and run again", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    const before = readFileSync(specFile, "utf8");
    const calls: AgentRequest[] = [];
    // nothing is scripted after stop: starting a spec-create run would ask a choice and fail the test
    const { run } = feature(root, ["free", "stop"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;
    assert.deepEqual(result.stopped, ["Q-02"]);
    assert.equal(calls.length, 0);
    assert.deepEqual(loggedAnswers(root), []);
    assert.equal(readFileSync(specFile, "utf8"), before.replace("use?\n\n**Answer:**\n\n\n### Q-02", "use?\n\n**Answer:**\n\nfree\n\n### Q-02"));
    assert.equal(state(root).final, undefined);

    answer(specFile, "Q-02", "Blue.");
    const again = feature(root, ["answer"], fakeAgent(TWO_QUESTIONS, calls));
    await again.run;
    assert.deepEqual(again.ui.events.filter((e) => e.startsWith("choose:")), [`choose: ${newSpec(2)} -> answer`]);
    assert.deepEqual(loggedAnswers(root), ["Q-01 free", "Q-02 Blue."]);
    assert.equal(calls.length, 1);
  });

  test("once every question has an answer, the agent runs at once, and unanswered records its questions as unanswered", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    answer(specFile, "Q-01", "Hello.");
    const calls: AgentRequest[] = [];
    const { ui, run } = feature(root, ["free", "unanswered"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;

    assert.equal(calls.length, 1);
    assert.ok(calls[0].userMessage.includes("Hello."));
    assert.deepEqual(ui.events.filter((e) => e.startsWith("choose:")).at(-1), `choose: ${newSpec(2)} -> unanswered`);
    // the choice is asked only once the new spec.md is written
    assert.ok(ui.events.indexOf("done: Writing spec.md (specs/001-greet-everyone/spec.md, updated)") < ui.events.findIndex((e) => e.startsWith(`choose: ${newSpec(2)}`)));
    assert.equal(result.status, "final");
    assert.equal(result.unanswered, 2);
    assert.equal(result.leftOpen, 1);
    assert.equal(result.outOfScope, 0);
    assert.equal(result.openQuestions, 0);
    assert.equal(state(root).final, true);
    // the extra run's questions follow Q-01 and Q-02 of the first run
    assert.deepEqual(state(root), { folder: "specs/001-greet-everyone", run: state(root).run, final: true, lastQuestion: 4 });

    const md = readFileSync(result.specFile, "utf8");
    assert.match(md, /## Unanswered\n\n- Q-03: Which words does the greeting use\?\n- Q-04: Which colour is the greeting\?\n\n## Open questions\n\nNone\.\n$/);
    assert.match(md, /### AC-001: Greeter greets\n[\s\S]*?Unanswered: Q-03\n/);
  });

  test("answer ends the command with the new spec's questions open, and the spec step stays open", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    const calls: AgentRequest[] = [];
    const { run } = feature(root, ["free", "out of scope", "answer"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;

    assert.equal(calls.length, 1);
    assert.equal(result.specFile, specFile);
    assert.equal(result.status, "open");
    assert.deepEqual([result.leftOpen, result.outOfScope, result.unanswered, result.openQuestions], [1, 1, 0, 2]);
    assert.equal(state(root).final, undefined);
    assert.match(readFileSync(specFile, "utf8"), /### Q-03\n[\s\S]*\*\*Answer:\*\*\n\n\n### Q-04\n/);
  });

  test("an answer free written in spec.md counts as free", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    answer(specFile, "Q-01", "free");
    answer(specFile, "Q-02", "out of scope");
    const calls: AgentRequest[] = [];
    const { run } = feature(root, ["unanswered"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;
    assert.equal(calls.length, 1);
    assert.deepEqual([result.leftOpen, result.outOfScope, result.unanswered], [1, 1, 2]);
  });

  test("after finishing, every open question is in exactly one of left open, out of scope or unanswered", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    const three = sampleSpec({
      open_questions: [...TWO_QUESTIONS.open_questions, { id: "Q-03", question: "How loud is the greeting?", concerns: ["AC-001"] }],
    });
    // Q-01 and Q-02 are left open and out of scope; the second run asks Q-03 to Q-05, the third Q-06 and Q-07
    await feature(root, ["free", "out of scope", "answer"], fakeAgent(three)).run;
    answer(specFile, "Q-05", "Quietly.");
    const result = await feature(root, ["free", "out of scope", "unanswered"], fakeAgent(TWO_QUESTIONS)).run;

    const md = readFileSync(result.specFile, "utf8");
    const section = (name: string) => md.split(`## ${name}\n\n`)[1].split("\n\n")[0].trimEnd();
    assert.equal(section("Left open"), "- Q-01: Which words does the greeting use?\n- Q-03: Which words does the greeting use?");
    assert.equal(section("Out of scope"), "- Q-02: Which colour is the greeting?\n- Q-04: Which colour is the greeting?");
    assert.equal(section("Unanswered"), "- Q-06: Which words does the greeting use?\n- Q-07: Which colour is the greeting?");
    assert.equal(section("Open questions"), "None.");
    assert.ok(!md.includes("Q-05"));
  });

  test("unanswered questions never appear in answers.md or in the agent's input", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    answer(specFile, "Q-01", "Hello.");
    await feature(root, ["free", "unanswered"], fakeAgent(TWO_QUESTIONS)).run;
    assert.deepEqual(loggedAnswers(root), ["Q-01 Hello.", "Q-02 free"]);
    assert.ok(!/unanswered/i.test(answersMd(root)));
    for (const run of readdirSync(path.join(root, ".doppelblind/runs"))) {
      assert.ok(!/unanswered/i.test(readFileSync(path.join(root, ".doppelblind/runs", run, "input.md"), "utf8")));
    }
  });

  test("stop ends the command at once: later questions are not asked and nothing is written for them", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    const before = readFileSync(specFile, "utf8");
    const calls: AgentRequest[] = [];
    // only one choice is scripted: asking Q-02 or starting a spec-create run would fail the test
    const { ui, run } = feature(root, ["stop"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;
    assert.deepEqual(result.stopped, ["Q-01", "Q-02"]);
    assert.deepEqual(ui.events.filter((e) => e.startsWith("choose:")), ["choose: Q-01 (1/2 unanswered): Which words does the greeting use? -> stop"]);
    assert.equal(calls.length, 0);
    assert.deepEqual(loggedAnswers(root), []);
    assert.equal(readFileSync(specFile, "utf8"), before);
  });

  test("finish, once confirmed, ends the spec step at once and records every question still without an answer as unanswered", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    const calls: AgentRequest[] = [];
    // nothing is scripted after finish: starting a spec-create run would ask a choice and fail the test
    const { ui, run } = feature(root, ["free", "finish", "yes"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;

    assert.deepEqual(ui.events.filter((e) => e.startsWith("choose:")), [
      "choose: Q-01 (1/2 unanswered): Which words does the greeting use? -> free",
      "choose: Q-02 (2/2 unanswered): Which colour is the greeting? -> finish",
      "choose: Finish the spec step? 1 questions still without an answer are recorded as unanswered. -> yes",
    ]);
    assert.equal(calls.length, 0);
    assert.equal(result.status, "final");
    assert.deepEqual([result.leftOpen, result.outOfScope, result.unanswered, result.openQuestions], [1, 0, 1, 0]);
    assert.equal(state(root).final, true);
    assert.deepEqual(Object.keys(state(root)).sort(), ["final", "folder", "lastQuestion", "run"]);
    assert.deepEqual(loggedAnswers(root), ["Q-01 free"]);
    const md = readFileSync(specFile, "utf8");
    assert.match(md, /## Left open\n\n- Q-01: Which words does the greeting use\?\n\n## Out of scope\n\nNone\.\n\n## Unanswered\n\n- Q-02: Which colour is the greeting\?\n\n## Open questions\n\nNone\.\n$/);
  });

  test("finish with an answer the agent has not received runs the agent once more and records its questions as unanswered", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    answer(specFile, "Q-01", "Hello.");
    const calls: AgentRequest[] = [];
    const result = await feature(root, ["finish", "yes"], fakeAgent(TWO_QUESTIONS, calls)).run;
    assert.equal(calls.length, 1);
    assert.ok(calls[0].userMessage.includes("Hello."));
    assert.equal(result.status, "final");
    assert.match(readFileSync(result.specFile, "utf8"), /## Unanswered\n\n- Q-03: Which words does the greeting use\?\n- Q-04: Which colour is the greeting\?\n/);
    assert.deepEqual(loggedAnswers(root), ["Q-01 Hello."]);
  });

  test("finish that is not confirmed asks the same question again", async () => {
    const { root } = await firstSpecCreateRun();
    const { ui, run } = feature(root, ["finish", "no", "free", "out of scope", "unanswered"], fakeAgent(TWO_QUESTIONS));
    const result = await run;
    assert.deepEqual(ui.events.filter((e) => e.startsWith("choose:")), [
      "choose: Q-01 (1/2 unanswered): Which words does the greeting use? -> finish",
      "choose: Finish the spec step? 2 questions still without an answer are recorded as unanswered. -> no",
      "choose: Q-01 (1/2 unanswered): Which words does the greeting use? -> free",
      "choose: Q-02 (2/2 unanswered): Which colour is the greeting? -> out of scope",
      `choose: ${newSpec(2)} -> unanswered`,
    ]);
    assert.equal(result.unanswered, 2);
  });

  test("answers.md is written only after the clarify run, right before the next spec-create run", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    answer(specFile, "Q-01", "Hello.");
    const seen: string[] = [];
    const ui = recordingUi(["free", "answer"]);
    const choose = ui.choose;
    ui.choose = async (...args) => {
      seen.push(`asked: ${answersMd(root) === "" ? "no answers.md" : "answers.md"}`);
      return choose(...args);
    };
    const agent: Agent = async (request) => {
      seen.push(`agent: ${loggedAnswers(root).join(", ")}`);
      return fakeAgent(TWO_QUESTIONS)(request);
    };
    await runSpecFlow({ cwd: root, brief: BRIEF_PATH, ui, agent, clarify: true });
    assert.deepEqual(seen, ["asked: no answers.md", "agent: Q-01 Hello., Q-02 free", "asked: answers.md"]);
  });

  test("answers.md is written when unanswered finishes the spec step", async () => {
    const { root } = await firstSpecCreateRun();
    await feature(root, ["free", "out of scope", "unanswered"], fakeAgent(TWO_QUESTIONS)).run;
    assert.deepEqual(loggedAnswers(root), ["Q-01 free", "Q-02 out of scope"]);
  });

  test("the orchestrator writes no answer the user did not choose", async () => {
    const { root, specFile } = await firstSpecCreateRun();
    answer(specFile, "Q-01", "Hello.");
    await feature(root, ["stop"], fakeAgent(TWO_QUESTIONS)).run;
    assert.deepEqual(loggedAnswers(root), []);
    await feature(root, ["free", "unanswered"], fakeAgent(TWO_QUESTIONS)).run;
    assert.deepEqual(loggedAnswers(root), ["Q-01 Hello.", "Q-02 free"]);
    assert.ok(!readFileSync(specFile, "utf8").includes("**Answer:**\n\nfree"));
  });

  test("the agent's input contains no run information and is the same in a final run as in any other", async () => {
    const inputs: string[] = [];
    for (const last of ["answer", "unanswered"]) {
      const { root, specFile } = await firstSpecCreateRun();
      answer(specFile, "Q-01", "Hello.");
      await feature(root, ["free", "answer"], fakeAgent(TWO_QUESTIONS)).run;
      answer(specFile, "Q-03", "Welcome.");
      const calls: AgentRequest[] = [];
      await feature(root, ["out of scope", last], fakeAgent(TWO_QUESTIONS, calls)).run;
      assert.equal(calls.length, 1);
      inputs.push(calls[0].userMessage);
    }
    assert.equal(inputs[0], inputs[1]);
    for (const input of inputs) {
      assert.ok(!/round|spec-create|run \d|last|final/i.test(input), input);
      assert.ok(input.includes("Hello.") && input.includes("Welcome.") && input.includes("free") && input.includes("out of scope"));
    }
  });

  test("a final spec step starts no further spec-create run", async () => {
    const { root } = await firstSpecCreateRun();
    await feature(root, ["free", "free", "unanswered"], fakeAgent(TWO_QUESTIONS)).run;
    const calls: AgentRequest[] = [];
    await assert.rejects(feature(root, [], fakeAgent(TWO_QUESTIONS, calls)).run, /The spec step of docs\/briefs\/greeting.md is final/);
    assert.equal(calls.length, 0);
  });
});
