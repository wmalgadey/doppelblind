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
    if (request.trace) writeFileSync(request.trace, JSON.stringify({ type: "result", structured_output: output }) + "\n");
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

  test("a second run for the same brief revises its spec in place", async () => {
    const root = project();
    const first = await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(sampleSpec()) });
    assert.equal(first.revised, false);
    writeFileSync(first.specFile, readFileSync(first.specFile, "utf8").replace("**Answer:**\n", "**Answer:**\n\nHello and welcome.\n"));

    const calls: AgentRequest[] = [];
    const revision = sampleSpec({
      short_name: "other-name",
      criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "specs/001-greet-everyone/spec.md", anchor: "Hello and welcome." }] }],
      open_questions: [{ id: "Q-02", question: "In which language is the greeting?" }],
    });
    const ui = recordingUi();
    const second = await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui, agent: fakeAgent(revision, calls) });

    assert.equal(second.specFile, first.specFile);
    assert.equal(second.revised, true);
    assert.deepEqual(readdirSync(path.join(root, "specs")), ["001-greet-everyone"]);
    assert.ok(ui.events.includes("note: revising specs/001-greet-everyone/spec.md (1 answered questions)"));

    const message = calls[0].userMessage;
    assert.ok(message.includes('<spec path="specs/001-greet-everyone/spec.md">\n# Grüße für alle'));
    assert.ok(message.includes('<answers path="specs/001-greet-everyone/spec.md">\n### Q-01\n\nWhich words does the greeting use?\n\n**Answer:**\n\nHello and welcome.'));
    assert.ok(message.endsWith("Revise the specification for this brief."));

    const md = readFileSync(second.specFile, "utf8");
    assert.match(md, /## Open questions\n\n### Q-02\n/);
    assert.match(md, /## Answered questions\n\n### Q-01\n\nWhich words does the greeting use\?\n\n\*\*Answer:\*\*\n\nHello and welcome\.\n$/);
  });

  test("answers survive further revisions", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const first = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    writeFileSync(first.specFile, readFileSync(first.specFile, "utf8").replace("**Answer:**\n", "**Answer:**\n\nHello.\n"));
    await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ open_questions: [] })) });
    const third = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec({ open_questions: [] })) });
    assert.match(readFileSync(third.specFile, "utf8"), /## Answered questions\n\n### Q-01\n\nWhich words does the greeting use\?\n\n\*\*Answer:\*\*\n\nHello\.\n$/);
  });

  test("a revision may not ask an answered question again under its ID", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi() };
    const first = await runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) });
    const answered = readFileSync(first.specFile, "utf8").replace("**Answer:**\n", "**Answer:**\n\nHello.\n");
    writeFileSync(first.specFile, answered);
    await assert.rejects(
      runSpecFlow({ ...opts, agent: fakeAgent(sampleSpec()) }),
      (err: DoppelblindError) => err.details.includes("Open question Q-01 reuses the ID of an answered question."),
    );
    assert.equal(readFileSync(first.specFile, "utf8"), answered);
  });

  test("a different brief gets the next number", async () => {
    const root = project();
    writeFileSync(path.join(root, "docs/briefs/farewell.md"), BRIEF);
    const spec = sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "docs/briefs/farewell.md", anchor: "## Walkthrough" }] }] });
    await runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(sampleSpec()) });
    const second = await runSpecFlow({ cwd: root, brief: "docs/briefs/farewell.md", ui: recordingUi(), agent: fakeAgent(spec) });
    assert.equal(path.basename(path.dirname(second.specFile)), "002-greet-everyone");
    assert.equal(second.revised, false);
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
    assert.equal(calls[0].trace, path.join(runs, run, "trace.jsonl"));
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
