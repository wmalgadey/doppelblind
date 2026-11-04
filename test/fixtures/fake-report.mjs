// A report command for tests that are plain node scripts: runs each `*.test.mjs` in the folder and writes
// Doppelblind's test result. A file declares its tests in lines `// test <criterion|-> <name>` (or `// skip …`);
// each of them passes when the file exits with 0.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [folder, output] = process.argv.slice(2);
const results = [];
for (const entry of readdirSync(folder, { recursive: true }).sort()) {
  if (!entry.endsWith(".test.mjs")) continue;
  const file = path.posix.join(folder, entry);
  const exit = spawnSync(process.execPath, [file]).status;
  for (const [, kind, criterion, name] of readFileSync(file, "utf8").matchAll(/^\/\/ (test|skip) (\S+) (.+)$/gm)) {
    const status = kind === "skip" ? "skipped" : exit === 0 ? "passed" : "failed";
    results.push({ file, name, criterion: criterion === "-" ? null : criterion, status });
  }
}
writeFileSync(output, JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.status === "failed") ? 1 : 0);
