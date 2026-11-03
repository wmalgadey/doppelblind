#!/usr/bin/env node
// Stands in for the Claude Code CLI: records how it was called and prints FAKE_CLAUDE_STDOUT.
// With FAKE_CLAUDE_PROBE, a JSON list of paths, it records in probe.json in its working directory which it can read.
import { readFileSync, writeFileSync } from "node:fs";

const stdin = readFileSync(0, "utf8");
if (process.env.FAKE_CLAUDE_IGNORE_SIGTERM) process.on("SIGTERM", () => {});
if (process.env.FAKE_CLAUDE_RECORD) {
  writeFileSync(process.env.FAKE_CLAUDE_RECORD, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), stdin }));
}
if (process.env.FAKE_CLAUDE_PROBE) {
  const readable = (file) => {
    try {
      readFileSync(file);
      return true;
    } catch {
      return false;
    }
  };
  const paths = JSON.parse(process.env.FAKE_CLAUDE_PROBE);
  writeFileSync("probe.json", JSON.stringify(Object.fromEntries(paths.map((p) => [p, readable(p)]))));
}
if (process.env.FAKE_CLAUDE_SLEEP_MS) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_CLAUDE_SLEEP_MS)));
process.stdout.write(process.env.FAKE_CLAUDE_STDOUT ?? "");
process.exit(Number(process.env.FAKE_CLAUDE_EXIT ?? 0));
