#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { DoppelblindError } from "./errors.ts";
import { DEFAULT_BUDGET_USD, DEFAULT_TIMEOUT_MIN, runSpecFlow, type BriefGaps } from "./flow/spec-flow.ts";
import {
  briefIsFinal,
  DEFAULT_TEST_AUTHOR_BUDGET_USD,
  DEFAULT_TEST_AUTHOR_MAX_TURNS,
  DEFAULT_TEST_AUTHOR_TIMEOUT_MIN,
  runTestAuthor,
  type TestAuthorResult,
} from "./flow/test-author-flow.ts";
import { briefTarget, specTarget } from "./flow/target.ts";
import { terminalUi } from "./tui.ts";

const USAGE = `Usage: doppelblind <command> <path>

Commands:
  feature <brief|spec>  Start the flow for a new feature, or continue it: the spec agent until the spec
                        is final, then the test author; a spec names the brief connected to it
  spec <brief|spec>     Hand the brief to the spec agent
  tests <brief|spec>    Hand a final spec to the test author

A spec is its spec.md, its folder or its number (2, 02 or 002). Paths are relative to the current directory.

Options:
  --timeout <min>   Time limit for each agent run in minutes
                    (default: spec agent ${DEFAULT_TIMEOUT_MIN}, test author ${DEFAULT_TEST_AUTHOR_TIMEOUT_MIN})
  --budget <usd>    Cost limit for each agent run in USD
                    (default: spec agent ${DEFAULT_BUDGET_USD}, test author ${DEFAULT_TEST_AUTHOR_BUDGET_USD})
  --max-turns <n>   Turn limit for the test author (default: ${DEFAULT_TEST_AUTHOR_MAX_TURNS}); it is never raised

A project changes these defaults in the "limits" object of .doppelblind.conf:
  { "limits": { "specAgent": { "timeoutMin": 5, "budgetUsd": 1 },
                "testAuthor": { "timeoutMin": 15, "budgetUsd": 5, "maxTurns": 80 },
                "testFileTimeoutMin": 2, "maxFreeAnswers": 5 } }
An option given at the start of a run overrides the project's default.
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
      "max-turns": { type: "string" },
    },
  });

  const [command, target, ...rest] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return values.help ? 0 : 2;
  }
  if (command !== "feature" && command !== "spec" && command !== "tests") return usageError(`Unknown command: ${command}`);
  if (!target || rest.length > 0) return usageError(`${command} expects exactly one path.`);
  // the tests command takes a spec as it is; the spec agent's commands work on the brief connected to it
  const brief = command === "tests" ? specTarget(process.cwd(), target) : briefTarget(process.cwd(), target);

  const ui = terminalUi();
  ui.banner();
  // continuing the flow of a brief whose spec is final is the test author's step
  if (command === "tests" || (command === "feature" && briefIsFinal(process.cwd(), brief))) {
    const result = await runTestAuthor({
      cwd: process.cwd(),
      target: brief,
      ui,
      ...limitOptions(values),
      maxTurns: positiveInteger("--max-turns", values["max-turns"]),
    });
    reportTests(result);
    return 0;
  }
  if (values["max-turns"] !== undefined) return usageError("--max-turns applies only to the test author.");

  const result = await runSpecFlow({
    cwd: process.cwd(),
    brief,
    ui,
    ...limitOptions(values),
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
      (result.status === "final" ? `  Next: run \`doppelblind feature ${brief}\` again; the test author writes the acceptance tests.\n` : ""),
  );
  if (result.briefGaps) reportBriefGaps(brief, result.briefGaps, result.status === "final");
  process.stdout.write(`${specFile}\n`);
  return 0;
}

/**
 * The brief leaves too much undecided: names each question answered `free`, grouped by the step of the brief it is
 * about, as the decisions to add to the brief.
 */
function reportBriefGaps(brief: string, gaps: BriefGaps, final: boolean): void {
  const byStep = new Map<string, BriefGaps["questions"]>();
  for (const q of gaps.questions) {
    const step = q.context ?? "No step named";
    byStep.set(step, [...(byStep.get(step) ?? []), q]);
  }
  const lines = [
    "",
    `  ${brief} is too vague: ${gaps.questions.length} questions were answered free, more than the ${gaps.maxFreeAnswers} the project allows.`,
    "  Nobody tests a decision left free. Add to the brief what applies for these questions:",
  ];
  for (const [step, questions] of byStep) {
    lines.push(`    ${step}`);
    for (const q of questions) lines.push(`      - ${q.id}: ${q.question}`);
  }
  lines.push(final
    ? "  The spec step is already final: the extended brief reaches the spec agent only in a new spec-create run."
    : `  Then run \`doppelblind spec ${brief}\` for a new spec-create run with the extended brief.`);
  process.stderr.write(lines.join("\n") + "\n");
}

/** The time and cost limits given as options; a limit not given is left to the project's contract or the default. */
function limitOptions(values: { timeout?: string; budget?: string }): { timeoutMs?: number; maxBudgetUsd?: number } {
  const timeout = positiveNumber("--timeout", values.timeout);
  const budget = positiveNumber("--budget", values.budget);
  return { ...(timeout !== undefined && { timeoutMs: timeout * 60_000 }), ...(budget !== undefined && { maxBudgetUsd: budget }) };
}

/** The final output of a test author run: what it produced, what it assumed, and what the user must decide. */
function reportTests(result: TestAuthorResult): void {
  const lines = ["", `  The test author produced for ${result.spec}:`];
  for (const t of result.tests) lines.push(`    ${t.file}  (${t.criterion})`);
  for (const h of result.helpers) lines.push(`    ${h}  (helper)`);
  lines.push(result.review ? `    ${result.review}  (review file)` : "  The spec has no criterion proven by review; no review file was written.");
  if (result.assumptions.length > 0) {
    lines.push(`  Assumptions (${result.assumptions.length}), in ${result.assumptionsFile}:`);
    for (const a of result.assumptions) lines.push(`    - ${a.id} (${a.criterion}): ${a.assumption}`);
  }
  if (!result.passing) lines.push("  The tests were not run: the project declares no test command.");
  else if (result.passing.length > 0) {
    lines.push("  Passing before any implementation; decide whether the behaviour exists or the test must be rejected:");
    for (const p of result.passing) lines.push(`    - ${p.criterion}: ${p.file}`);
  }
  if (result.lock) lines.push(`  Locked: ${result.lock}`);
  else if (result.undecided > 0) {
    lines.push(
      `  Not locked: ${result.undecided} assumptions wait for a decision in ${result.assumptionsFile}.`,
      "  Write accepted or rejected: <what applies instead> into each Decision field, then run the test author again:",
      "  with every assumption accepted it offers the lock; a rejected one starts the test author again.",
    );
  } else lines.push("  Not locked: run the test author again to replace these files.");
  process.stderr.write(lines.join("\n") + "\n");
  const produced = [...result.tests.map((t) => t.file), ...result.helpers, ...(result.review ? [result.review] : [])];
  process.stdout.write(produced.map((f) => `${f}\n`).join(""));
}

function positiveNumber(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new DoppelblindError(`${flag} expects a positive number.`);
  return n;
}

function positiveInteger(flag: string, value: string | undefined): number | undefined {
  const n = positiveNumber(flag, value);
  if (n !== undefined && !Number.isInteger(n)) throw new DoppelblindError(`${flag} expects a positive whole number.`);
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
      // a message the failed step already showed is not repeated
      if (!(err as DoppelblindError).shown) process.stderr.write(`\n  ${(err as Error).message}\n`);
      for (const line of (err as DoppelblindError).details ?? []) process.stderr.write(`    - ${line}\n`);
    } else {
      process.stderr.write(`\n${(err as Error).stack ?? err}\n`);
    }
    process.exit(1);
  },
);
