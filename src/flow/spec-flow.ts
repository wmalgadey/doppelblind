import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runClaude, type Agent } from "../agent/claude.ts";
import { loadContract, toProjectPath } from "../contract.ts";
import { DoppelblindError } from "../errors.ts";
import { validateOutput } from "../gates/schema.ts";
import { checkSpec } from "../gates/spec.ts";
import * as specAgent from "../roles/spec-agent/index.ts";
import { loadSources } from "../sources.ts";
import { createSpecFolder } from "../spec/folder.ts";
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
  criteria: number;
  openQuestions: number;
}

/** Hands a brief to the spec agent and writes the resulting spec.md. No other role runs. */
export async function runSpecFlow(options: SpecFlowOptions): Promise<SpecFlowResult> {
  const { ui, agent = runClaude } = options;

  const { contract, briefPath } = await step(ui, "Reading brief", () => {
    const contract = loadContract(options.cwd);
    return { contract, briefPath: toProjectPath(contract.root, path.resolve(options.cwd, options.brief)) };
  }, (r) => r.briefPath);

  const sources = await step(ui, "Loading binding sources", () => loadSources(contract, briefPath),
    (s) => s.all.filter((x) => x !== s.brief).map((x) => x.path).join(", ") || "brief only");
  for (const p of sources.missing) ui.note(`declared source not found, skipped: ${p}`);

  const response = await step(ui, "Spec agent is writing the spec", () =>
    agent({
      systemPrompt: specAgent.systemPrompt,
      userMessage: specAgent.buildUserMessage(sources.brief, sources.all),
      schema: specAgent.schema,
      timeoutMs: options.timeoutMs ?? 15 * 60_000,
      maxBudgetUsd: options.maxBudgetUsd ?? 5,
    }), describeCost);
  const log = writeRunLog(contract.root, response.raw);

  const spec = await step(ui, "Validating output against schema",
    () => withLog(log, () => validateOutput<specAgent.SpecOutput>(specAgent.schema, response.output)));

  await step(ui, "Checking criteria and citations", () => withLog(log, () => {
    const problems = checkSpec(spec, sources.all);
    if (problems.length > 0) throw new DoppelblindError("The spec does not pass its gates.", problems);
  }), () => `${spec.criteria.length} criteria`);

  const specFile = await step(ui, "Writing spec.md", () => {
    const folder = createSpecFolder(path.join(contract.root, contract.specs), spec.short_name);
    const file = path.join(folder, "spec.md");
    const briefLink = path.relative(folder, path.join(contract.root, briefPath)).split(path.sep).join("/");
    writeFileSync(file, renderSpec(spec, briefPath, briefLink));
    return file;
  }, (file) => toProjectPath(contract.root, file));

  return { specFile, criteria: spec.criteria.length, openQuestions: spec.open_questions.length };
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

/** Keeps the agent's raw response in the project's run state, so a failed run can be inspected. */
function writeRunLog(root: string, raw: string): string {
  const dir = path.join(root, ".doppelblind", "runs");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-spec-agent.json`);
  writeFileSync(file, raw);
  return toProjectPath(root, file);
}

function withLog<T>(log: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof DoppelblindError) err.details.push(`Agent response: ${log}`);
    throw err;
  }
}
