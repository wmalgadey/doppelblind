#!/usr/bin/env node
// Stands in for the Claude Code CLI: records how it was called and prints FAKE_CLAUDE_STDOUT.
import { readFileSync, writeFileSync } from "node:fs";

const stdin = readFileSync(0, "utf8");
if (process.env.FAKE_CLAUDE_RECORD) {
  writeFileSync(process.env.FAKE_CLAUDE_RECORD, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), stdin }));
}
if (process.env.FAKE_CLAUDE_SLEEP_MS) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_CLAUDE_SLEEP_MS)));
process.stdout.write(process.env.FAKE_CLAUDE_STDOUT ?? "");
process.exit(Number(process.env.FAKE_CLAUDE_EXIT ?? 0));
