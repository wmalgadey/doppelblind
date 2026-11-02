import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runClaude, TRACE_FILE, type Agent } from "../agent/claude.ts";
import { loadContract, toProjectPath } from "../contract.ts";
import { DoppelblindError } from "../errors.ts";
import { validateOutput } from "../gates/schema.ts";
import { checkSpec } from "../gates/spec.ts";
import * as specAgent from "../roles/spec-agent/index.ts";
import { loadSources, type Source } from "../sources.ts";
import { ANSWERS_FILE, readAnswerLog, readAnswers, renderAnswerLog } from "../spec/answers.ts";
import { createSpecFolder } from "../spec/folder.ts";
import { renderSpec } from "../spec/render.ts";
import { readState, specStatus, STATE_FILE, writeState, type SpecStatus } from "../spec/state.ts";
import type { Ui } from "../tui.ts";

export interface SpecFlowOptions {
  cwd: string;
  /** Path to the brief, relative to `cwd`. */
  brief: string;
  ui: Ui;
  agent?: Agent;
  timeoutMs?: number;
  maxBudgetUsd?: number;
}

/** Spec rounds a brief gets at most. */
export const MAX_ROUNDS = 3;

export interface SpecFlowResult {
  specFile: string;
  /** Which spec round of the brief this run was, counting from 1. */
  round: number;
  status: SpecStatus;
  criteria: number;
  openQuestions: number;
}

/**
 * Hands a brief to the spec agent and writes the resulting spec.md. No other role runs.
 * If the brief has a spec, the agent runs fresh with every answer given so far, never the earlier spec,
 * and the new spec replaces it in the same folder.
 */
export async function runSpecFlow(options: SpecFlowOptions): Promise<SpecFlowResult> {
  const { ui, agent = runClaude } = options;

  const { contract, briefPath } = await step(ui, "Reading brief", () => {
    const contract = loadContract(options.cwd);
    return { contract, briefPath: toProjectPath(contract.root, path.resolve(options.cwd, options.brief)) };
  }, (r) => r.briefPath);

  const sources = await step(ui, "Loading binding sources", () => loadSources(contract, briefPath),
    (s) => s.all.filter((x) => x !== s.brief).map((x) => x.path).join(", ") || "brief only");
  for (const p of sources.missing) ui.note(`declared source not found, skipped: ${p}`);

  const specsDir = path.join(contract.root, contract.specs);
  const recorded = readState(contract.root)[briefPath];
  if (recorded && recorded.rounds >= MAX_ROUNDS) {
    throw new DoppelblindError(`${briefPath} has had its ${MAX_ROUNDS} spec rounds; no further round starts.`, [
      `Status: ${recorded.status}`,
    ]);
  }
  const round = (recorded?.rounds ?? 0) + 1;
  const previous = recorded && readPrevious(contract.root, briefPath, recorded.folder, recorded.rounds);
  if (previous) ui.note(`round ${round} of ${MAX_ROUNDS}: rerunning with ${previous.count} answers, ${previous.added} new from ${previous.spec.path}`);
  if (previous?.added === 0) ui.note(`no answers in ${previous.spec.path}; unsaved answers are not seen`);

  const request = {
    systemPrompt: specAgent.systemPrompt,
    userMessage: specAgent.buildUserMessage(sources.brief, sources.all, previous?.answers),
    schema: specAgent.schema,
    timeoutMs: options.timeoutMs ?? 15 * 60_000,
    maxBudgetUsd: options.maxBudgetUsd ?? 5,
  };
  const runDir = startRunLog(contract.root, request.systemPrompt, request.userMessage);
  const log = toProjectPath(contract.root, path.join(runDir, TRACE_FILE));
  ui.note(`trace: ${log}`);

  const response = await step(ui, "Spec agent is writing the spec",
    () => withLog(log, () => agent({ ...request, runDir })), describeCost);

  const spec = await step(ui, "Validating output against schema",
    () => withLog(log, () => validateOutput<specAgent.SpecOutput>(specAgent.schema, response.output)));

  await step(ui, "Checking criteria and citations", () => withLog(log, () => {
    const citable = previous ? [...sources.all, previous.answers] : sources.all;
    const problems = checkSpec(spec, citable);
    if (problems.length > 0) throw new DoppelblindError("The spec does not pass its gates.", problems);
  }), () => `${spec.criteria.length} criteria`);

  const { file: specFile } = await step(ui, "Writing spec.md", () => withLog(log, () => {
    const folder = recorded ? path.join(contract.root, recorded.folder) : createSpecFolder(specsDir, spec.short_name);
    const file = path.join(folder, "spec.md");
    if (previous && readFileSync(file, "utf8") !== previous.spec.content) {
      throw new DoppelblindError(`${previous.spec.path} changed while the agent was running; it was not overwritten.`, [
        "Run again to rerun with its current answers.",
      ]);
    }
    const briefLink = path.relative(folder, path.join(contract.root, briefPath)).split(path.sep).join("/");
    const markdown = renderSpec(spec, briefPath, briefLink);
    writeFileSync(file, markdown);
    if (previous && previous.count > 0) writeFileSync(path.join(folder, ANSWERS_FILE), previous.answers.content);
    return { file, unchanged: previous?.spec.content === markdown };
  }), ({ file, unchanged }) => toProjectPath(contract.root, file) + (previous ? (unchanged ? ", unchanged" : ", updated") : ""));

  const ready = specStatus(spec);
  const status = ready === "open" && round >= MAX_ROUNDS ? "limit reached" : ready;
  writeState(contract.root, briefPath, { folder: toProjectPath(contract.root, path.dirname(specFile)), rounds: round, status });

  return { specFile, round, status, criteria: spec.criteria.length, openQuestions: spec.open_questions.length };
}

/**
 * The current spec of a brief and every answer given so far: those of earlier rounds from answers.md,
 * and those written into the current spec.md, which belong to the round that asked them.
 */
function readPrevious(root: string, brief: string, folder: string, round: number) {
  const file = path.join(root, folder, "spec.md");
  if (!existsSync(file)) {
    throw new DoppelblindError(`${folder}/spec.md, recorded for ${brief} in ${STATE_FILE}, does not exist.`);
  }
  const spec = { path: toProjectPath(root, file), content: readFileSync(file, "utf8") };
  const log = path.join(root, folder, ANSWERS_FILE);
  // answers of the current round may already be in the log if writing spec.md failed after it
  const earlier = existsSync(log) ? readAnswerLog(readFileSync(log, "utf8")).filter((a) => a.round !== round) : [];
  const added = readAnswers(spec.content).map((a) => ({ ...a, round }));
  const all = [...earlier, ...added];
  const answers = { path: toProjectPath(root, log), content: all.length > 0 ? renderAnswerLog(all) : "" };
  return { spec, answers, count: all.length, added: added.length };
}

async function step<T>(ui: Ui, label: string, fn: () => T | Promise<T>, detail?: (result: T) => string): Promise<T> {
  const s = ui.step(label);
  try {
    const result = await fn();
    s.done(detail?.(result));
    return result;
  } catch (err) {
    s.fail();
    throw err;
  }
}

function describeCost(response: { costUsd?: number; durationMs?: number }): string {
  const parts = [];
  if (response.durationMs !== undefined) parts.push(`${Math.round(response.durationMs / 1000)}s`);
  if (response.costUsd !== undefined) parts.push(`$${response.costUsd.toFixed(2)}`);
  return parts.join(", ");
}

/**
 * Starts a run folder in the project's run state with the agent's prompt and input,
 * which the agent completes with its call and trace, so any run can be inspected.
 */
function startRunLog(root: string, systemPrompt: string, userMessage: string): string {
  const dir = path.join(root, ".doppelblind", "runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-spec-agent`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "system-prompt.md"), systemPrompt);
  writeFileSync(path.join(dir, "input.md"), userMessage);
  writeFileSync(path.join(dir, TRACE_FILE), "");
  return dir;
}

async function withLog<T>(log: string, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DoppelblindError) err.details.push(`Agent trace: ${log}`);
    throw err;
  }
}
