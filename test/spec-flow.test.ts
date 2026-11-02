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
    assert.ok(ui.events.includes("note: round 2 of 3: rerunning with 1 answers, 1 new from specs/001-greet-everyone/spec.md"));

    const message = calls[0].userMessage;
    assert.ok(!message.includes("<spec"));
    assert.ok(!message.includes("Greeter greets"));
    assert.ok(message.includes('<answers path="specs/001-greet-everyone/answers.md">\n# Answers\n\n## Round 1\n\n### Q-01\n\nWhich words does the greeting use?\n\n**Answer:**\n\nHello and welcome.\n</answers>'));
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
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, ".doppelblind/specs.json"), "utf8")), {
      "docs/briefs/greeting.md": { folder: "specs/001-greet-everyone", rounds: 2, status: "open" },
    });
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
    assert.ok(message.includes("## Round 1\n\n### Q-01\n\nWhich words does the greeting use?\n\n**Answer:**\n\nHello.\n"));
    assert.ok(message.includes("## Round 2\n\n### Q-01\n\nWhich colour?\n\n**Answer:**\n\nfree the user picks it\n"));
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

  test("a brief gets at most three rounds; an open third round is limit reached and no fourth starts", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    for (let round = 1; round <= 3; round++) {
      const result = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
      assert.equal(result.round, round);
      assert.equal(result.status, round < 3 ? "open" : "limit reached");
    }
    const calls: AgentRequest[] = [];
    await assert.rejects(
      runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec(), calls) }),
      (err: DoppelblindError) =>
        err.message === "docs/briefs/greeting.md has had its 3 spec rounds; no further round starts." && err.details.includes("Status: limit reached"),
    );
    assert.equal(calls.length, 0);
  });

  test("a third round that is ready is ready, not limit reached", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    const third = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ open_questions: [] })) });
    assert.equal(third.status, "ready");
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
    assert.deepEqual(readdirSync(path.join(runs, run)).sort(), ["input.md", "system-prompt.md", "trace.jsonl"]);
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
