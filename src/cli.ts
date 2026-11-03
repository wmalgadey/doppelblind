#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { DoppelblindError } from "./errors.ts";
import { DEFAULT_BUDGET_USD, DEFAULT_TIMEOUT_MIN, runSpecFlow } from "./flow/spec-flow.ts";
import { terminalUi } from "./tui.ts";

const USAGE = `Usage: doppelblind <command> <brief>

Commands:
  feature <brief>   Start the flow for a new feature, or continue it (for now: spec agent only)
  spec <brief>      Hand the brief to the spec agent

<brief> is a path relative to the current directory.

Options:
  --timeout <min>   Time limit for the agent run in minutes (default: ${DEFAULT_TIMEOUT_MIN})
  --budget <usd>    Cost limit for the agent run in USD (default: ${DEFAULT_BUDGET_USD})
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
    timeoutMs: positiveNumber("--timeout", values.timeout, DEFAULT_TIMEOUT_MIN) * 60_000,
    maxBudgetUsd: positiveNumber("--budget", values.budget, DEFAULT_BUDGET_USD),
    clarify: command === "feature",
  });

  const specFile = path.relative(process.cwd(), result.specFile);
  // with questions still open, answering them is the next step of the flow
  const next =
    `  Next: answer the open questions in ${specFile}; leave empty what you do not want to answer.\n` +
    `  Then run \`doppelblind feature ${brief}\` again. For each question still without an answer it asks:\n` +
    `  free, out of scope, stop (answer it later) or finish (end the spec step). Then the spec agent writes\n` +
    `  the spec again with all answers, and you choose to answer its new questions or to mark them all\n` +
    `  unanswered. Once you want to give no more answers, choose finish or unanswered: the spec step is then final.\n`;
  process.stderr.write(
    `\n  ${result.criteria} criteria, ${result.openQuestions} open questions.\n` +
      `  Status: ${result.status}\n` +
      (result.status === "final"
        ? `  The spec step is final: ${result.leftOpen} questions left open, ${result.outOfScope} out of scope, ${result.unanswered} unanswered.\n`
        : result.stopped.length > 0
          ? `  Stopped at ${result.stopped[0]}: ${result.stopped.length} questions still have no answer.\n` + next
          : result.openQuestions > 0
            ? next
            : "") +
      (result.status === "final" || (result.openQuestions === 0 && result.stopped.length === 0)
        ? "  The flow ends here: no further role exists yet.\n"
        : ""),
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
