import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import type { Agent, AgentRequest } from "../src/agent/claude.ts";
import { DoppelblindError } from "../src/errors.ts";
import { runSpecFlow } from "../src/flow/spec-flow.ts";
import { BRIEF, makeProject, recordingUi, sampleSpec } from "./helpers.ts";

const CONTRACT = JSON.stringify({ sources: ["docs/product.md", "docs/decisions.md"], specs: "specs" });

function fakeAgent(output: unknown, calls: AgentRequest[] = []): Agent {
  return async (request) => {
    calls.push(request);
    if (request.runDir) writeFileSync(path.join(request.runDir, "trace.jsonl"), JSON.stringify({ type: "result", structured_output: output }) + "\n");
    return { output, costUsd: 0.1, durationMs: 3000 };
  };
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
    assert.equal(first.round, 1);
    writeFileSync(first.specFile, readFileSync(first.specFile, "utf8").replace("**Answer:**\n", "**Answer:**\n\nHello and welcome.\n"));

    const calls: AgentRequest[] = [];
    const rerun = sampleSpec({
      short_name: "other-name",
      criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "specs/001-greet-everyone/answers.md", anchor: "Hello and welcome." }] }],
      open_questions: [{ id: "Q-01", question: "In which language is the greeting?", concerns: [] }],
    });
    const ui = recordingUi();
    const second = await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui, agent: fakeAgent(rerun, calls) });

    assert.equal(second.specFile, first.specFile);
    assert.equal(second.round, 2);
    assert.deepEqual(readdirSync(path.join(root, "specs")), ["001-greet-everyone"]);
    assert.ok(ui.events.includes("note: round 2: rerunning with 1 answers, 1 new from specs/001-greet-everyone/spec.md"));

    const message = calls[0].userMessage;
    assert.ok(!message.includes("<spec"));
    assert.ok(!message.includes("Greeter greets"));
    assert.ok(message.includes('<answers path="specs/001-greet-everyone/answers.md">\n# Answers\n\n**Question:** Which words does the greeting use?\n\n**Answer:**\n\nHello and welcome.\n</answers>'));
    assert.ok(message.endsWith("Write the specification for this brief."));

    const md = readFileSync(second.specFile, "utf8");
    assert.match(md, /## Open questions\n\n### Q-01\n\nIn which language is the greeting\?\n\n\*\*Answer:\*\*\n$/);
    assert.ok(!md.includes("Answered questions"));
    assert.match(readFileSync(path.join(root, "specs/001-greet-everyone/answers.md"), "utf8"), /Hello and welcome\./);
  });

  test("a brief's spec is recognised from the run state, not from what spec.md says", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const first = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    writeFileSync(first.specFile, "# Something else entirely\n");
    const second = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ short_name: "other-name" })) });
    assert.equal(second.specFile, first.specFile);
    assert.equal(second.round, 2);
    const state = JSON.parse(readFileSync(path.join(root, ".doppelblind/specs.json"), "utf8"));
    assert.deepEqual(Object.keys(state), ["docs/briefs/greeting.md"]);
    assert.equal(state["docs/briefs/greeting.md"].folder, "specs/001-greet-everyone");
    assert.equal(state["docs/briefs/greeting.md"].rounds, 2);
    assert.equal(state["docs/briefs/greeting.md"].status, "open");
  });

  test("answers accumulate across rounds with their question's text", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const answer = (file: string, text: string) => writeFileSync(file, readFileSync(file, "utf8").replace("**Answer:**\n", `**Answer:**\n\n${text}\n`));
    const first = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    answer(first.specFile, "Hello.");
    await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ open_questions: [{ id: "Q-01", question: "Which colour?", concerns: ["AC-001"] }] })) });
    answer(first.specFile, "free the user picks it");

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

    const unchanged = recordingUi();
    await runSpecFlow({ ...opts, ui: unchanged, agent: fakeAgent(sampleSpec()) });
    assert.ok(unchanged.events.includes("done: Writing spec.md (specs/001-greet-everyone/spec.md, unchanged)"));
  });

  test("answers saved while the agent runs are not overwritten", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const first = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    const saved = readFileSync(first.specFile, "utf8").replace("**Answer:**\n", "**Answer:**\n\nHello.\n");
    const savingAgent: Agent = async (request) => {
      writeFileSync(first.specFile, saved);
      return fakeAgent(sampleSpec({ open_questions: [] }))(request);
    };
    await assert.rejects(runSpecFlow({ ...opts, agent: savingAgent }), /changed while the agent was running; it was not overwritten/);
    assert.equal(readFileSync(first.specFile, "utf8"), saved);
    assert.equal(JSON.parse(readFileSync(path.join(root, ".doppelblind/specs.json"), "utf8"))["docs/briefs/greeting.md"].rounds, 1);
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
    assert.equal(second.round, 1);
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

  test("each run keeps the agent's prompt, input and trace in a run folder", async () => {
    const root = project();
    const ui = recordingUi();
    const calls: AgentRequest[] = [];
    await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui, agent: fakeAgent(sampleSpec(), calls) });

    const runs = path.join(root, ".doppelblind", "runs");
    const [run] = readdirSync(runs);
    assert.match(run, /-spec-agent$/);
    assert.deepEqual(readdirSync(path.join(runs, run)).sort(), ["input.md", "output.json", "system-prompt.md", "trace.jsonl"]);
    assert.equal(readFileSync(path.join(runs, run, "input.md"), "utf8"), calls[0].userMessage);
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
    assert.ok(ui.events.includes("fail: Validating output against schema"));
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

  /** Writes `text` into the Answer field of question `id` in spec.md. */
  function answer(file: string, id: string, text: string) {
    const md = readFileSync(file, "utf8");
    const at = md.indexOf("**Answer:**\n", md.indexOf(`### ${id}\n`));
    writeFileSync(file, md.slice(0, at) + `**Answer:**\n\n${text}\n` + md.slice(at + "**Answer:**\n".length));
  }

  function state(root: string) {
    return JSON.parse(readFileSync(path.join(root, ".doppelblind/specs.json"), "utf8"))[BRIEF_PATH];
  }

  function answersMd(root: string) {
    const file = path.join(root, "specs/001-greet-everyone/answers.md");
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  }

  /** Every answer in answers.md, as "<round> <id> <answer>". */
  function loggedAnswers(root: string) {
    return [...answersMd(root).matchAll(/^## Round (\d+)$|^### (Q-\d+)\n\n.*\n\n\*\*Answer:\*\*\n\n(.*)$/gm)].reduce(
      (acc, m) => (m[1] ? { ...acc, round: m[1] } : { ...acc, list: [...acc.list, `${acc.round} ${m[2]} ${m[3]}`] }),
      { round: "", list: [] as string[] },
    ).list;
  }

  async function firstRound(output = TWO_QUESTIONS) {
    const root = project();
    const first = await runSpecFlow({ cwd: root, brief: BRIEF_PATH, ui: recordingUi(), agent: fakeAgent(output), clarify: true });
    return { root, specFile: first.specFile };
  }

  function feature(root: string, choices: string[], agent: Agent) {
    const ui = recordingUi(choices);
    return { ui, run: runSpecFlow({ cwd: root, brief: BRIEF_PATH, ui, agent, clarify: true }) };
  }

  test("there is no round limit and no status limit reached", async () => {
    const { root } = await firstRound();
    for (let round = 2; round <= 5; round++) {
      const result = await runSpecFlow({ cwd: root, brief: BRIEF_PATH, ui: recordingUi(), agent: fakeAgent(TWO_QUESTIONS) });
      assert.equal(result.round, round);
      assert.equal(result.status, "open");
    }
    const { run } = feature(root, ["free", "free", "yes"], fakeAgent(TWO_QUESTIONS));
    const sixth = await run;
    assert.equal(sixth.round, 6);
    assert.equal(sixth.status, "open");
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
    const { run } = feature(root, ["free", "yes"], fakeAgent(unconcerned, calls));
    assert.equal((await run).round, 2);
    assert.equal(calls.length, 1);
  });

  test("answers in spec.md are added to answers.md, and each unanswered question is listed with the titles of its criteria", async () => {
    const { root, specFile } = await firstRound();
    answer(specFile, "Q-02", "Blue.");
    const { ui, run } = feature(root, ["free", "yes"], fakeAgent(TWO_QUESTIONS));
    await run;
    assert.deepEqual(loggedAnswers(root), ["1 Q-01 free", "1 Q-02 Blue."]);
    const listing = ui.events.filter((e) => e.startsWith("note: Q-0") || e.startsWith("note:   concerns"));
    assert.deepEqual(listing, ["note: Q-01: Which words does the greeting use?", "note:   concerns AC-001: Greeter greets"]);
    assert.deepEqual(ui.events.filter((e) => e.startsWith("choose:")), [
      "choose: Q-01: Which words does the greeting use? -> free",
      "choose: Another clarify round? -> yes",
    ]);
  });

  test("free is stored in answers.md as the user's answer and the next round receives it", async () => {
    const { root } = await firstRound();
    const calls: AgentRequest[] = [];
    const { run } = feature(root, ["free", "free", "yes"], fakeAgent(sampleSpec({ open_questions: [] }), calls));
    const result = await run;
    assert.deepEqual(loggedAnswers(root), ["1 Q-01 free", "1 Q-02 free"]);
    assert.ok(calls[0].userMessage.includes("**Question:** Which words does the greeting use?\n\n**Answer:**\n\nfree\n"));
    assert.equal(result.leftOpen, 2);
    const md = readFileSync(result.specFile, "utf8");
    assert.match(md, /## Left open\n\n- Q-01 \(round 1\): Which words does the greeting use\?\n- Q-02 \(round 1\): Which colour is the greeting\?\n/);
  });

  test("out of scope is stored in answers.md as the user's answer", async () => {
    const { root } = await firstRound();
    const { run } = feature(root, ["out of scope", "free", "yes"], fakeAgent(sampleSpec({ open_questions: [] })));
    const result = await run;
    assert.deepEqual(loggedAnswers(root), ["1 Q-01 out of scope", "1 Q-02 free"]);
    assert.equal(result.outOfScope, 1);
    assert.match(readFileSync(result.specFile, "utf8"), /## Out of scope\n\n- Q-01 \(round 1\): Which words does the greeting use\?\n/);
  });

  test("stop writes nothing for that question, ends the command, and the user can answer it in spec.md and run again", async () => {
    const { root, specFile } = await firstRound();
    const before = readFileSync(specFile, "utf8");
    const calls: AgentRequest[] = [];
    // no answer to "Another clarify round?" is scripted: asking it would fail the test
    const { run } = feature(root, ["free", "stop"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;
    assert.deepEqual(result.stopped, ["Q-02"]);
    assert.equal(calls.length, 0);
    assert.deepEqual(loggedAnswers(root), ["1 Q-01 free"]);
    assert.equal(readFileSync(specFile, "utf8"), before);
    assert.equal(state(root).rounds, 1);
    assert.equal(state(root).status, "open");

    answer(specFile, "Q-02", "Blue.");
    const again = feature(root, ["yes"], fakeAgent(TWO_QUESTIONS, calls));
    await again.run;
    assert.deepEqual(again.ui.events.filter((e) => e.startsWith("choose:")), ["choose: Another clarify round? -> yes"]);
    assert.deepEqual(loggedAnswers(root), ["1 Q-01 free", "1 Q-02 Blue."]);
    assert.equal(calls.length, 1);
  });

  test("no with an answer the agent has not received runs the agent once more and records its questions as unanswered", async () => {
    const { root, specFile } = await firstRound();
    answer(specFile, "Q-01", "Hello.");
    const calls: AgentRequest[] = [];
    const { run } = feature(root, ["free", "no"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;

    assert.equal(calls.length, 1);
    assert.ok(calls[0].userMessage.includes("Hello."));
    assert.equal(result.status, "final");
    assert.equal(result.round, 2);
    assert.equal(result.unanswered, 2);
    assert.equal(result.leftOpen, 1);
    assert.equal(result.outOfScope, 0);
    assert.equal(result.openQuestions, 0);
    assert.equal(state(root).status, "final");
    assert.deepEqual(state(root).events, [{ event: "unanswered", round: 2, count: 2, questions: ["Q-01", "Q-02"] }]);

    const md = readFileSync(result.specFile, "utf8");
    assert.match(md, /## Unanswered\n\n- Q-01: Which words does the greeting use\?\n- Q-02: Which colour is the greeting\?\n\n## Open questions\n\nNone\.\n$/);
    assert.match(md, /### AC-001: Greeter greets\n[\s\S]*?Unanswered: Q-01\n/);
  });

  test("no with only free and out of scope answers does not run the agent and renders spec.md from the last output", async () => {
    const { root, specFile } = await firstRound();
    const calls: AgentRequest[] = [];
    const { run } = feature(root, ["free", "out of scope", "no"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;

    assert.equal(calls.length, 0);
    assert.equal(result.specFile, specFile);
    assert.equal(result.status, "final");
    assert.equal(result.round, 1);
    assert.deepEqual([result.leftOpen, result.outOfScope, result.unanswered, result.openQuestions], [1, 1, 0, 0]);
    assert.equal(state(root).events, undefined);

    const md = readFileSync(specFile, "utf8");
    assert.match(md, /### AC-001: Greeter greets\n[\s\S]*?Left open: Q-01\n\n## Wishes/);
    assert.match(md, /## Left open\n\n- Q-01: Which words does the greeting use\?\n\n## Out of scope\n\n- Q-02: Which colour is the greeting\?\n\n## Unanswered\n\nNone\.\n\n## Open questions\n\nNone\.\n$/);
  });

  test("an answer free written in spec.md counts as free when finishing", async () => {
    const { root, specFile } = await firstRound();
    answer(specFile, "Q-01", "free");
    answer(specFile, "Q-02", "out of scope");
    const calls: AgentRequest[] = [];
    const { run } = feature(root, ["no"], fakeAgent(TWO_QUESTIONS, calls));
    const result = await run;
    assert.equal(calls.length, 0);
    assert.deepEqual([result.leftOpen, result.outOfScope, result.unanswered], [1, 1, 0]);
  });

  test("after finishing, every open question is in exactly one of left open, out of scope or unanswered", async () => {
    const { root, specFile } = await firstRound();
    const three = sampleSpec({
      open_questions: [...TWO_QUESTIONS.open_questions, { id: "Q-03", question: "How loud is the greeting?", concerns: ["AC-001"] }],
    });
    // round 2 asks three questions; Q-01 and Q-02 of round 1 are left open and out of scope
    await feature(root, ["free", "out of scope", "yes"], fakeAgent(three)).run;
    answer(specFile, "Q-03", "Quietly.");
    const result = await feature(root, ["free", "out of scope", "no"], fakeAgent(TWO_QUESTIONS)).run;

    const md = readFileSync(result.specFile, "utf8");
    const section = (name: string) => md.split(`## ${name}\n\n`)[1].split("\n\n")[0].trimEnd();
    assert.equal(section("Left open"), "- Q-01 (round 1): Which words does the greeting use?\n- Q-01 (round 2): Which words does the greeting use?");
    assert.equal(section("Out of scope"), "- Q-02 (round 1): Which colour is the greeting?\n- Q-02 (round 2): Which colour is the greeting?");
    assert.equal(section("Unanswered"), "- Q-01: Which words does the greeting use?\n- Q-02: Which colour is the greeting?");
    assert.equal(section("Open questions"), "None.");
    assert.ok(!md.includes("Q-03"));
  });

  test("unanswered questions never appear in answers.md or in the agent's input", async () => {
    const { root, specFile } = await firstRound();
    answer(specFile, "Q-01", "Hello.");
    await feature(root, ["free", "no"], fakeAgent(TWO_QUESTIONS)).run;
    assert.deepEqual(loggedAnswers(root), ["1 Q-01 Hello.", "1 Q-02 free"]);
    assert.ok(!/unanswered/i.test(answersMd(root)));
    for (const run of readdirSync(path.join(root, ".doppelblind/runs"))) {
      assert.ok(!/unanswered/i.test(readFileSync(path.join(root, ".doppelblind/runs", run, "input.md"), "utf8")));
    }
  });

  test("the orchestrator writes no answer the user did not choose", async () => {
    const { root, specFile } = await firstRound();
    answer(specFile, "Q-01", "Hello.");
    await feature(root, ["stop"], fakeAgent(TWO_QUESTIONS)).run;
    assert.deepEqual(loggedAnswers(root), ["1 Q-01 Hello."]);
    await feature(root, ["free", "no"], fakeAgent(TWO_QUESTIONS)).run;
    assert.deepEqual(loggedAnswers(root), ["1 Q-01 Hello.", "1 Q-02 free"]);
    assert.ok(!readFileSync(specFile, "utf8").includes("**Answer:**\n\nfree"));
  });

  test("the agent's input contains no round information and is the same in a final run as in any other", async () => {
    const inputs: string[] = [];
    for (const last of ["yes", "no"]) {
      const { root, specFile } = await firstRound();
      answer(specFile, "Q-01", "Hello.");
      await feature(root, ["free", "yes"], fakeAgent(TWO_QUESTIONS)).run;
      answer(specFile, "Q-01", "Welcome.");
      const calls: AgentRequest[] = [];
      await feature(root, ["out of scope", last], fakeAgent(TWO_QUESTIONS, calls)).run;
      assert.equal(calls.length, 1);
      inputs.push(calls[0].userMessage);
    }
    assert.equal(inputs[0], inputs[1]);
    for (const input of inputs) {
      assert.ok(!/round|last|final/i.test(input), input);
      assert.ok(input.includes("Hello.") && input.includes("Welcome.") && input.includes("free") && input.includes("out of scope"));
    }
  });

  test("a final spec step starts no further round", async () => {
    const { root } = await firstRound();
    await feature(root, ["free", "free", "no"], fakeAgent(TWO_QUESTIONS)).run;
    const calls: AgentRequest[] = [];
    await assert.rejects(feature(root, [], fakeAgent(TWO_QUESTIONS, calls)).run, /The spec step of docs\/briefs\/greeting.md is final/);
    assert.equal(calls.length, 0);
  });
});
