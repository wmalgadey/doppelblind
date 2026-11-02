#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { DoppelblindError } from "./errors.ts";
import { MAX_ROUNDS, runSpecFlow } from "./flow/spec-flow.ts";
import { terminalUi } from "./tui.ts";

const USAGE = `Usage: doppelblind <command> <brief>

Commands:
  feature <brief>   Start the flow for a new feature (for now: spec agent only)
  spec <brief>      Hand the brief to the spec agent

<brief> is a path relative to the current directory.

Options:
  --timeout <min>   Time limit for the agent run in minutes (default: 15)
  --budget <usd>    Cost limit for the agent run in USD (default: 5)
  -h, --help        Show this help

Environment:
  DOPPELBLIND_CLAUDE_BIN   Path to the Claude Code CLI (default: claude)
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      timeout: { type: "string" },
      budget: { type: "string" },
    },
  });

  const [command, brief, ...rest] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return values.help ? 0 : 2;
  }
  if (command !== "feature" && command !== "spec") return usageError(`Unknown command: ${command}`);
  if (!brief || rest.length > 0) return usageError(`${command} expects exactly one brief path.`);

  const ui = terminalUi();
  ui.banner();
  const result = await runSpecFlow({
    cwd: process.cwd(),
    brief,
    ui,
    timeoutMs: positiveNumber("--timeout", values.timeout, 15) * 60_000,
    maxBudgetUsd: positiveNumber("--budget", values.budget, 5),
  });

  const specFile = path.relative(process.cwd(), result.specFile);
  process.stderr.write(
    `\n  ${result.criteria} criteria, ${result.openQuestions} open questions.\n` +
      `  Status: ${result.status} (round ${result.round} of ${MAX_ROUNDS})\n` +
      (result.status === "limit reached"
        ? "  The spec is not ready and the brief has no rounds left; no further round starts.\n"
        : result.openQuestions > 0
          ? `  Answer the open questions in ${specFile}, then run again.\n`
          : "") +
      "  The flow ends here: no further role exists yet.\n",
  );
  process.stdout.write(`${specFile}\n`);
  return 0;
}

function positiveNumber(flag: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new DoppelblindError(`${flag} expects a positive number.`);
  return n;
}

function usageError(message: string): number {
  process.stderr.write(`${message}\n\n${USAGE}`);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    if (err instanceof DoppelblindError || (err as NodeJS.ErrnoException).code?.startsWith("ERR_PARSE_ARGS")) {
      process.stderr.write(`\n  ${(err as Error).message}\n`);
      for (const line of (err as DoppelblindError).details ?? []) process.stderr.write(`    - ${line}\n`);
    } else {
      process.stderr.write(`\n${(err as Error).stack ?? err}\n`);
    }
    process.exit(1);
  },
);
