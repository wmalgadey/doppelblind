import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "vitest";
import { parseResponse, runClaude } from "../src/agent/claude.ts";
import { DoppelblindError } from "../src/errors.ts";

const FAKE = path.join(import.meta.dirname, "fixtures", "fake-claude.mjs");
const SUCCESS = JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: { ok: true }, total_cost_usd: 0.25, duration_ms: 1200 });
const request = { systemPrompt: "role prompt", userMessage: "the brief", schema: { type: "object" }, timeoutMs: 10_000, maxBudgetUsd: 2 };

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function useFake(stdout: string, exit = 0): string {
  const record = path.join(mkdtempSync(path.join(tmpdir(), "fake-claude-")), "call.json");
  Object.assign(process.env, { DOPPELBLIND_CLAUDE_BIN: FAKE, FAKE_CLAUDE_STDOUT: stdout, FAKE_CLAUDE_EXIT: String(exit), FAKE_CLAUDE_RECORD: record });
  return record;
}

describe("claude", () => {
  test("runs the CLI headless without tools or settings, outside the project, with the message on stdin", async () => {
    const record = useFake(SUCCESS);
    const response = await runClaude(request);
    assert.deepEqual(response.output, { ok: true });
    assert.equal(response.costUsd, 0.25);
    assert.equal(response.durationMs, 1200);

    const call = JSON.parse(readFileSync(record, "utf8"));
    const flag = (name: string) => call.args[call.args.indexOf(name) + 1];
    assert.ok(call.args.includes("--print"));
    assert.equal(flag("--output-format"), "stream-json");
    assert.ok(call.args.includes("--verbose"));
    assert.equal(flag("--tools"), "");
    assert.equal(flag("--setting-sources"), "");
    assert.equal(flag("--system-prompt"), "role prompt");
    assert.equal(flag("--json-schema"), JSON.stringify({ type: "object" }));
    assert.equal(flag("--max-budget-usd"), "2");
    assert.equal(call.stdin, "the brief");
    assert.ok(path.basename(call.cwd).startsWith("doppelblind-agent-"));
    assert.notEqual(call.cwd, process.cwd());
  });

  test("every event is appended to the trace, and the result is read from the last result event", async () => {
    const events = [{ type: "system", subtype: "init" }, { type: "assistant", message: { content: [] } }];
    const stdout = [...events.map((e) => JSON.stringify(e)), SUCCESS, ""].join("\n");
    useFake(stdout);
    const trace = path.join(mkdtempSync(path.join(tmpdir(), "trace-")), "trace.jsonl");
    const response = await runClaude({ ...request, trace });
    assert.deepEqual(response.output, { ok: true });
    assert.equal(readFileSync(trace, "utf8"), stdout);
  });

  test("a failed run still leaves its trace", async () => {
    useFake(JSON.stringify({ type: "system", subtype: "init" }) + "\n", 1);
    const trace = path.join(mkdtempSync(path.join(tmpdir(), "trace-")), "trace.jsonl");
    await assert.rejects(runClaude({ ...request, trace }), /no JSON result/);
    assert.equal(readFileSync(trace, "utf8"), '{"type":"system","subtype":"init"}\n');
  });

  test("a missing CLI is reported with a hint", async () => {
    process.env.DOPPELBLIND_CLAUDE_BIN = "/nonexistent/claude";
    await assert.rejects(runClaude(request), (err: DoppelblindError) => err.message.includes("not found"));
  });

  test("a run that exceeds its time limit fails", async () => {
    useFake(SUCCESS);
    process.env.FAKE_CLAUDE_SLEEP_MS = "5000";
    await assert.rejects(runClaude({ ...request, timeoutMs: 200 }), /did not finish within/);
  });

  test("non-JSON output, error results and missing structured output fail", () => {
    assert.throws(() => parseResponse("garbage", "boom", 1), /no JSON result/);
    assert.throws(() => parseResponse(JSON.stringify({ type: "result", subtype: "error_max_budget_usd", is_error: true }), "", 1), /Agent run failed/);
    assert.throws(() => parseResponse(JSON.stringify({ type: "result", subtype: "success", is_error: false }), "", 0), /no structured output/);
  });
});
