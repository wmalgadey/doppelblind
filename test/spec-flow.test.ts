import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
    return { output, raw: JSON.stringify({ structured_output: output }), costUsd: 0.1, durationMs: 3000 };
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
    assert.match(md, /### AC-01: Greeter greets/);
    assert.match(md, /\[docs\/briefs\/greeting.md\]\(\.\.\/\.\.\/docs\/briefs\/greeting.md\)/);

    assert.equal(calls.length, 1);
    const message = calls[0].userMessage;
    assert.ok(message.includes('<brief path="docs/briefs/greeting.md">'));
    assert.ok(message.includes('<source path="docs/product.md">'));
    assert.ok(!message.includes("implementation the spec agent must not see"));
  });

  test("a second run gets the next number", async () => {
    const root = project();
    const opts = { cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(sampleSpec()) };
    await runSpecFlow(opts);
    const second = await runSpecFlow(opts);
    assert.equal(path.basename(path.dirname(second.specFile)), "002-greet-everyone");
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

  test("invalid agent output writes no spec but keeps the response in the run log", async () => {
    const root = project();
    const ui = recordingUi();
    await assert.rejects(
      runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui, agent: fakeAgent({ title: "x", criteria: [] }) }),
      (err: DoppelblindError) => err.details.some((d) => d.startsWith("Agent response: .doppelblind/runs/")),
    );
    assert.ok(ui.events.includes("fail: Validating output against schema"));
    assert.ok(!existsSync(path.join(root, "specs")));
    assert.equal(readdirSync(path.join(root, ".doppelblind", "runs")).length, 1);
  });

  test("a citation of a non-binding source fails the gate and writes no spec", async () => {
    const root = project();
    const spec = sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "src/secret.ts", anchor: "implementation" }] }] });
    await assert.rejects(
      runSpecFlow({ cwd: root, brief: "docs/briefs/greeting.md", ui: recordingUi(), agent: fakeAgent(spec) }),
      (err: DoppelblindError) => err.details.includes("AC-01 cites src/secret.ts, which is not a binding source."),
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
