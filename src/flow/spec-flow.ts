import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runClaude, TRACE_FILE, type Agent } from "../agent/claude.ts";
import { loadContract, toProjectPath } from "../contract.ts";
import { DoppelblindError } from "../errors.ts";
import { validateOutput } from "../gates/schema.ts";
import { checkSpec } from "../gates/spec.ts";
import * as specAgent from "../roles/spec-agent/index.ts";
import { loadSources, type Source } from "../sources.ts";
import { readAnswers, renderAnswers, type AnsweredQuestion } from "../spec/answers.ts";
import { createSpecFolder, findSpecFolder } from "../spec/folder.ts";
import { renderSpec } from "../spec/render.ts";
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

export interface SpecFlowResult {
  specFile: string;
  /** Whether an existing spec for the brief was revised instead of a new one written. */
  revised: boolean;
  criteria: number;
  openQuestions: number;
}

/**
 * Hands a brief to the spec agent and writes the resulting spec.md. No other role runs.
 * If a spec for the brief exists, the agent revises it and its answered questions are kept.
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
  const existing = findSpecFolder(specsDir, briefPath);
  const previous = existing === undefined ? undefined : readPrevious(contract.root, existing);
  if (previous) ui.note(`revising ${previous.spec.path} (${previous.answered.length} answered questions)`);

  const request = {
    systemPrompt: specAgent.systemPrompt,
    userMessage: specAgent.buildUserMessage(sources.brief, sources.all, previous),
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
    const problems = checkSpec(spec, citable, previous?.answered.map((q) => q.id));
    if (problems.length > 0) throw new DoppelblindError("The spec does not pass its gates.", problems);
  }), () => `${spec.criteria.length} criteria`);

  const specFile = await step(ui, "Writing spec.md", () => {
    const folder = existing ?? createSpecFolder(specsDir, spec.short_name);
    const file = path.join(folder, "spec.md");
    const briefLink = path.relative(folder, path.join(contract.root, briefPath)).split(path.sep).join("/");
    writeFileSync(file, renderSpec(spec, briefPath, briefLink, previous?.answered));
    return file;
  }, (file) => toProjectPath(contract.root, file));

  return { specFile, revised: previous !== undefined, criteria: spec.criteria.length, openQuestions: spec.open_questions.length };
}

/** The current spec of a brief, and its answered questions as a source the revised spec may cite. */
function readPrevious(root: string, folder: string): { spec: Source; answers: Source; answered: AnsweredQuestion[] } {
  const file = path.join(folder, "spec.md");
  const spec = { path: toProjectPath(root, file), content: readFileSync(file, "utf8") };
  const answered = readAnswers(spec.content);
  return { spec, answers: { path: spec.path, content: renderAnswers(answered).join("\n") }, answered };
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
