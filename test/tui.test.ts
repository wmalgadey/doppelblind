import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { describe, test } from "vitest";
import { terminalUi } from "../src/tui.ts";

/** A terminal of `columns` that keeps what is written to it. */
function terminal(columns: number) {
  const out: string[] = [];
  const stream = Object.assign(
    new Writable({ write: (chunk, _encoding, callback) => (out.push(String(chunk)), callback()) }),
    { isTTY: true, columns },
  ) as unknown as NodeJS.WriteStream;
  return { stream, last: () => out.at(-1)! };
}

describe("tui", () => {
  test("a running step shows what it is doing next to its time, cut to the terminal's width", async () => {
    const { stream, last } = terminal(80);
    const step = terminalUi(stream).step("Test author is writing the acceptance tests");
    step.update("turn 3 · Write tests/acceptance/001-greet-everyone/ac-001.test.mjs");
    await new Promise((r) => setTimeout(r, 150));
    const line = last().replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/^\r/, "");
    assert.match(line, /0s · turn 3 · Write tests\/acc/);
    assert.ok(line.endsWith("…"));
    assert.ok(line.length <= 80, `${line.length}: ${line}`);
    step.done("done");
    assert.doesNotMatch(last(), /turn 3/);
  });
});
