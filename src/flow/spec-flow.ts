import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runClaude, TRACE_FILE, type Agent } from "../agent/claude.ts";
import { loadContract, toProjectPath } from "../contract.ts";
import { DoppelblindError } from "../errors.ts";
import { validateOutput } from "../gates/schema.ts";
import { checkSpec } from "../gates/spec.ts";
import * as specAgent from "../roles/spec-agent/index.ts";
import { loadSources, type LoadedSources } from "../sources.ts";
import {
  ANSWERS_FILE,
  FREE,
  OUT_OF_SCOPE,
  readAnswerLog,
  readAnswers,
  renderAnswerList,
  renderAnswerLog,
  type Answer,
} from "../spec/answers.ts";
import { createSpecFolder } from "../spec/folder.ts";
import { questionSections, renderSpec, type QuestionRecord } from "../spec/render.ts";
import { readState, specStatus, STATE_FILE, writeState, type BriefState, type SpecStatus } from "../spec/state.ts";
import type { Ui } from "../tui.ts";

export interface SpecFlowOptions {
  cwd: string;
  /** Path to the brief, relative to `cwd`. */
  brief: string;
  ui: Ui;
  agent?: Agent;
  timeoutMs?: number;
  maxBudgetUsd?: number;
  /**
   * Continue a brief that has a spec as the complete flow does: ask about every open question without an answer
   * and whether another clarify round runs, instead of rerunning straight away.
   */
  clarify?: boolean;
}

export interface SpecFlowResult {
  specFile: string;
  /** Which spec round of the brief wrote spec.md, counting from 1. */
  round: number;
  status: SpecStatus;
  criteria: number;
  openQuestions: number;
  leftOpen: number;
  outOfScope: number;
  unanswered: number;
  /** IDs of the questions the user chose `stop` for; the flow ended without writing anything for them. */
  stopped: string[];
}

/** The validated output of a spec-agent run, kept in its run folder. */
const OUTPUT_FILE = "output.json";

const ANOTHER_ROUND = "Another clarify round?";

interface Context {
  root: string;
  specsDir: string;
  briefPath: string;
  sources: LoadedSources;
  options: SpecFlowOptions;
}

/**
 * Hands a brief to the spec agent and writes the resulting spec.md. No other role runs.
 * If the brief has a spec, the agent runs fresh with every answer given so far, never the earlier spec,
 * and the new spec replaces it in the same folder.
 */
export async function runSpecFlow(options: SpecFlowOptions): Promise<SpecFlowResult> {
  const { ui } = options;

  const { contract, briefPath } = await step(ui, "Reading brief", () => {
    const contract = loadContract(options.cwd);
    return { contract, briefPath: toProjectPath(contract.root, path.resolve(options.cwd, options.brief)) };
  }, (r) => r.briefPath);

  const sources = await step(ui, "Loading binding sources", () => loadSources(contract, briefPath),
    (s) => s.all.filter((x) => x !== s.brief).map((x) => x.path).join(", ") || "brief only");
  for (const p of sources.missing) ui.note(`declared source not found, skipped: ${p}`);

  const ctx = { root: contract.root, specsDir: path.join(contract.root, contract.specs), briefPath, sources, options };
  const recorded = readState(contract.root)[briefPath];
  if (recorded?.status === "final") {
    throw new DoppelblindError(`The spec step of ${briefPath} is final; no further round starts.`, [`Spec: ${recorded.folder}/spec.md`]);
  }
  const previous = recorded && readPrevious(contract.root, briefPath, recorded.folder, recorded.rounds);
  if (!previous || !options.clarify) {
    if (previous) noteRerun(ui, recorded.rounds + 1, previous);
    return specRound(ctx, recorded, previous);
  }
  return clarify(ctx, recorded, previous);
}

/**
 * Continues a brief that has a spec: records its answers, asks for a choice on every open question without one,
 * then either runs another round, or finishes the spec step.
 */
async function clarify(ctx: Context, recorded: BriefState, previous: Previous): Promise<SpecFlowResult> {
  const { ui } = ctx.options;
  const last = readOutput(ctx.root, ctx.briefPath, recorded);
  writeAnswerLog(ctx.root, previous);
  ui.note(`round ${recorded.rounds}: ${previous.added} answers from ${previous.spec.path} added to ${previous.answersPath}`);

  const answered = new Set(previous.answers.filter((a) => a.round === recorded.rounds).map((a) => a.id));
  const pending = last.open_questions.filter((q) => !answered.has(q.id));
  if (pending.length > 0) {
    ui.note(`${pending.length} open questions have no answer:`);
    for (const q of pending) {
      const titles = q.concerns.map((id) => `${id}: ${last.criteria.find((c) => c.id === id)?.title ?? id}`);
      ui.note(`${q.id}: ${q.question}`);
      ui.note(`  concerns ${titles.length > 0 ? titles.join("; ") : "no criterion"}`);
    }
  }
  const stopped: string[] = [];
  for (const q of pending) {
    const choice = await ui.choose(`${q.id}: ${q.question}`, [FREE, OUT_OF_SCOPE, "stop"]);
    if (choice === "stop") stopped.push(q.id);
    else previous.answers.push({ round: recorded.rounds, id: q.id, question: q.question, answer: choice });
  }
  writeAnswerLog(ctx.root, previous);
  if (stopped.length > 0) {
    const sections = questionSections(last, { round: recorded.rounds, answers: previous.answers, unanswered: [] });
    return {
      ...counts(last, sections),
      specFile: path.join(ctx.root, recorded.folder, "spec.md"),
      round: recorded.rounds,
      status: recorded.status,
      stopped,
    };
  }

  if ((await ui.choose(ANOTHER_ROUND, ["yes", "no"])) === "yes") {
    noteRerun(ui, recorded.rounds + 1, previous);
    return specRound(ctx, recorded, previous);
  }
  // each run receives every answer of the rounds before it, so only this round's answers are new
  const unreceived = previous.answers.filter((a) => a.round === recorded.rounds && a.answer !== FREE && a.answer !== OUT_OF_SCOPE);
  if (unreceived.length > 0) {
    ui.note(`${unreceived.length} answers have not been worked into the spec yet; the spec agent runs once more`);
    return specRound(ctx, recorded, previous, true);
  }

  const record = { round: recorded.rounds, answers: previous.answers, unanswered: [] };
  const specFile = await step(ui, "Writing spec.md", () => writeSpec(ctx, recorded.folder, last, record, previous),
    ({ file, unchanged }) => toProjectPath(ctx.root, file) + (unchanged ? ", unchanged" : ", updated"));
  writeState(ctx.root, ctx.briefPath, { ...recorded, status: "final" });
  return { ...counts(last, questionSections(last, record)), specFile: specFile.file, round: recorded.rounds, status: "final", stopped: [] };
}

/**
 * Runs the spec agent for the next round of a brief and writes its spec.md.
 * In a final round, every open question of the run is recorded as unanswered and the spec step ends.
 */
async function specRound(ctx: Context, recorded: BriefState | undefined, previous: Previous | undefined, final = false): Promise<SpecFlowResult> {
  const { ui, agent = runClaude } = ctx.options;
  const round = (recorded?.rounds ?? 0) + 1;
  const answers = previous && { path: previous.answersPath, content: previous.answers.length > 0 ? renderAnswerList(previous.answers) : "" };
  const request = {
    systemPrompt: specAgent.systemPrompt,
    userMessage: specAgent.buildUserMessage(ctx.sources.brief, ctx.sources.all, answers),
    schema: specAgent.schema,
    timeoutMs: ctx.options.timeoutMs ?? 15 * 60_000,
    maxBudgetUsd: ctx.options.maxBudgetUsd ?? 5,
  };
  const runDir = startRunLog(ctx.root, request.systemPrompt, request.userMessage);
  const log = toProjectPath(ctx.root, path.join(runDir, TRACE_FILE));
  ui.note(`trace: ${log}`);

  const response = await step(ui, "Spec agent is writing the spec",
    () => withLog(log, () => agent({ ...request, runDir })), describeCost);

  const spec = await step(ui, "Validating output against schema",
    () => withLog(log, () => validateOutput<specAgent.SpecOutput>(specAgent.schema, response.output)));

  await step(ui, "Checking criteria and citations", () => withLog(log, () => {
    const citable = answers ? [...ctx.sources.all, answers] : ctx.sources.all;
    const problems = checkSpec(spec, citable);
    if (problems.length > 0) throw new DoppelblindError("The spec does not pass its gates.", problems);
  }), () => `${spec.criteria.length} criteria`);
  writeFileSync(path.join(runDir, OUTPUT_FILE), JSON.stringify(spec, null, 2) + "\n");

  const unanswered = final ? spec.open_questions.map((q) => q.id) : [];
  const events = [...(recorded?.events ?? []), ...(final ? [{ event: "unanswered" as const, round, count: unanswered.length, questions: unanswered }] : [])];
  const record = { round, answers: previous?.answers ?? [], unanswered: events.filter((e) => e.round === round).flatMap((e) => e.questions) };

  const { file: specFile } = await step(ui, "Writing spec.md",
    () => withLog(log, () => writeSpec(ctx, recorded?.folder, spec, record, previous)),
    ({ file, unchanged }) => toProjectPath(ctx.root, file) + (previous ? (unchanged ? ", unchanged" : ", updated") : ""));

  const status = final ? "final" : specStatus(spec);
  if (status === "ready") ui.note("no open question concerns a criterion");
  writeState(ctx.root, ctx.briefPath, {
    folder: toProjectPath(ctx.root, path.dirname(specFile)),
    rounds: round,
    status,
    run: toProjectPath(ctx.root, runDir),
    ...(events.length > 0 && { events }),
  });

  return { ...counts(spec, questionSections(spec, record)), specFile, round, status, stopped: [] };
}

/** Writes spec.md, and answers.md if there are answers; refuses if spec.md changed since it was read. */
function writeSpec(ctx: Context, recordedFolder: string | undefined, spec: specAgent.SpecOutput, record: QuestionRecord, previous?: Previous) {
  const folder = recordedFolder ? path.join(ctx.root, recordedFolder) : createSpecFolder(ctx.specsDir, spec.short_name);
  const file = path.join(folder, "spec.md");
  if (previous && readFileSync(file, "utf8") !== previous.spec.content) {
    throw new DoppelblindError(`${previous.spec.path} changed while the agent was running; it was not overwritten.`, [
      "Run again to rerun with its current answers.",
    ]);
  }
  const briefLink = path.relative(folder, path.join(ctx.root, ctx.briefPath)).split(path.sep).join("/");
  const markdown = renderSpec(spec, ctx.briefPath, briefLink, record);
  writeFileSync(file, markdown);
  if (previous) writeAnswerLog(ctx.root, previous);
  return { file, unchanged: previous?.spec.content === markdown };
}

function counts(spec: specAgent.SpecOutput, sections: ReturnType<typeof questionSections>) {
  return {
    criteria: spec.criteria.length,
    openQuestions: sections.open.length,
    leftOpen: sections.leftOpen.length,
    outOfScope: sections.outOfScope.length,
    unanswered: sections.unanswered.length,
  };
}

function noteRerun(ui: Ui, round: number, previous: Previous): void {
  ui.note(`round ${round}: rerunning with ${previous.answers.length} answers, ${previous.added} new from ${previous.spec.path}`);
  if (previous.added === 0) ui.note(`no answers in ${previous.spec.path}; unsaved answers are not seen`);
}

interface Previous {
  spec: { path: string; content: string };
  answersPath: string;
  /** Every answer given so far; the flow adds the user's choices to it. */
  answers: Answer[];
  /** How many answers were read from spec.md. */
  added: number;
}

/**
 * The current spec of a brief and every answer given so far: those of earlier rounds from answers.md,
 * and those written into the current spec.md, which belong to the round that asked them.
 */
function readPrevious(root: string, brief: string, folder: string, round: number): Previous {
  const file = path.join(root, folder, "spec.md");
  if (!existsSync(file)) {
    throw new DoppelblindError(`${folder}/spec.md, recorded for ${brief} in ${STATE_FILE}, does not exist.`);
  }
  const spec = { path: toProjectPath(root, file), content: readFileSync(file, "utf8") };
  const log = path.join(root, folder, ANSWERS_FILE);
  const added = readAnswers(spec.content).map((a) => ({ ...a, round }));
  // the log may already hold answers of the current round, from spec.md or from the user's choices;
  // an answer in spec.md replaces the one logged for the same question
  const logged = existsSync(log) ? readAnswerLog(readFileSync(log, "utf8")) : [];
  const kept = logged.filter((a) => a.round !== round || !added.some((b) => b.id === a.id));
  const answers = [...kept, ...added];
  return { spec, answersPath: toProjectPath(root, log), answers, added: added.length };
}

function writeAnswerLog(root: string, previous: Previous): void {
  previous.answers.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  if (previous.answers.length > 0) writeFileSync(path.join(root, previous.answersPath), renderAnswerLog(previous.answers));
}

/** The validated output of the brief's last spec-agent run, from the run folder the run state records. */
function readOutput(root: string, brief: string, recorded: BriefState): specAgent.SpecOutput {
  const file = recorded.run && path.join(root, recorded.run, OUTPUT_FILE);
  if (!file || !existsSync(file)) {
    throw new DoppelblindError(`No output of the last spec-agent run is recorded for ${brief}.`, [
      `Run \`doppelblind spec ${brief}\` for another round first.`,
    ]);
  }
  return JSON.parse(readFileSync(file, "utf8"));
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
