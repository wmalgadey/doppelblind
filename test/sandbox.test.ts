import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "vitest";
import { runClaude } from "../src/agent/claude.ts";
import { makeProject } from "./helpers.ts";

const FAKE = path.join(import.meta.dirname, "fixtures", "fake-claude.mjs");
const SUCCESS = JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: { ok: true } });
const request = { systemPrompt: "role prompt", userMessage: "the criteria", schema: { type: "object" }, timeoutMs: 20_000, maxBudgetUsd: 2 };
const bwrap = spawnSync("bwrap", ["--version"]).status === 0;

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe.skipIf(!bwrap)("sandbox", () => {
  test("an agent with a working directory sees nothing of the project, the user's home or the host's temporary files", async () => {
    const project = makeProject({ "src/greeter.ts": "implementation", "docs/plan/plan.md": "plan" });
    const workdir = mkdtempSync(path.join(tmpdir(), "doppelblind-view-"));
    writeFileSync(path.join(workdir, "visible.txt"), "test infrastructure");
    const outside = [
      path.join(project, "src/greeter.ts"),
      path.join(project, "docs/plan/plan.md"),
      path.join(import.meta.dirname, "..", "src", "cli.ts"),
      path.join(import.meta.dirname, "helpers.ts"),
      path.join(homedir(), ".claude", ".credentials.json"),
      `/proc/1/root${project}/src/greeter.ts`,
    ];
    Object.assign(process.env, {
      DOPPELBLIND_CLAUDE_BIN: FAKE,
      FAKE_CLAUDE_STDOUT: SUCCESS,
      FAKE_CLAUDE_RECORD: path.join(workdir, "call.json"),
      FAKE_CLAUDE_PROBE: JSON.stringify([path.join(workdir, "visible.txt"), ...outside]),
    });

    const response = await runClaude({ ...request, workdir, tools: ["Read", "Write"], maxTurns: 5 });
    assert.deepEqual(response.output, { ok: true });
    const probe = JSON.parse(readFileSync(path.join(workdir, "probe.json"), "utf8"));
    assert.equal(probe[path.join(workdir, "visible.txt")], true);
    for (const file of outside) assert.equal(probe[file], false, `${file} is readable in the sandbox`);

    const call = JSON.parse(readFileSync(path.join(workdir, "call.json"), "utf8"));
    assert.equal(call.cwd, workdir);
    const flag = (name: string) => call.args[call.args.indexOf(name) + 1];
    assert.equal(flag("--tools"), "Read,Write");
    assert.equal(flag("--permission-mode"), "acceptEdits");
    assert.equal(flag("--max-turns"), "5");
  });
});
