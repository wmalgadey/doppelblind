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
  fillAnswers,
  FREE,
  OUT_OF_SCOPE,
  readAnswers,
  renderAnswerList,
  renderAnswerLog,
  type Answer,
} from "../spec/answers.ts";
import { createSpecFolder } from "../spec/folder.ts";
import { highestQuestion, questionNumber, renumberQuestions } from "../spec/questions.ts";
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
   * Continue a brief that has a spec with a clarify run, as the complete flow does: ask about every open question
   * without an answer and whether another spec-create run starts, instead of starting one straight away.
   */
  clarify?: boolean;
}

export interface SpecFlowResult {
  specFile: string;
  status: SpecStatus;
  criteria: number;
  openQuestions: number;
  leftOpen: number;
  outOfScope: number;
  unanswered: number;
  /**
   * When the user chose `stop`: the ID of that question, then of every question not asked after it.
   * The flow ended there without writing anything for them.
   */
  stopped: string[];
}

/** The validated output of a spec-agent run with its questions renumbered for the brief, kept in its run folder. */
const OUTPUT_FILE = "output.json";

const ANOTHER_SPEC_CREATE_RUN = "Start another spec-create run?";
const STOP = "stop";
const FINISH = "finish";

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
  if (recorded?.final) {
    throw new DoppelblindError(`The spec step of ${briefPath} is final; no further spec-create run starts.`, [`Spec: ${recorded.folder}/spec.md`]);
  }
  const previous = recorded && readPrevious(contract.root, briefPath, recorded.folder);
  if (!previous || !options.clarify) {
    if (previous) noteRerun(ui, previous);
    return specCreate(ctx, recorded, previous);
  }
  return clarify(ctx, recorded, previous);
}

/**
 * The clarify run of a brief that has a spec: reads its answers, asks for a choice on every open question
 * without one, then either starts another spec-create run, or finishes the spec step.
 * Choosing `finish` on a question, once confirmed, finishes the spec step at once.
 * answers.md is written only once the clarify run is over: right before the next spec-create run, or when the
 * spec step finishes. On `stop`, the choices made so far go into the Answer fields of spec.md instead.
 */
async function clarify(ctx: Context, recorded: BriefState, previous: Previous): Promise<SpecFlowResult> {
  const { ui } = ctx.options;
  const last = readOutput(ctx.root, ctx.briefPath, recorded);
  ui.note(`clarify run: found ${previous.added} answers`);

  const answered = new Set(previous.answers.map((a) => a.id));
  const pending = last.open_questions.filter((q) => !answered.has(q.id));
  if (pending.length > 0) {
    ui.note(`${pending.length} of ${last.open_questions.length} open questions have no answer.`);
    ui.note(`For each, choose ${FREE} (left open on purpose), ${OUT_OF_SCOPE} (not part of this change) ` +
      `${STOP} (ends here; answer it in ${previous.spec.path} and run again) ` +
      `or ${FINISH} (ends the spec step; every question still without an answer is recorded as unanswered).`);
  }
  let stopped: string[] = [];
  let finishing: string[] | undefined;
  const chosen: { id: string; answer: string }[] = [];
  for (let i = 0; i < pending.length; i++) {
    const q = pending[i];
    const titles = q.concerns.map((id) => `${id}: ${last.criteria.find((c) => c.id === id)?.title ?? id}`);
    const choice = await ui.choose(`${q.id} (${i + 1}/${pending.length} unanswered): ${q.question}`, [FREE, OUT_OF_SCOPE, STOP, FINISH],
      [`concerns ${titles.length > 0 ? titles.join("; ") : "no criterion"}`]);
    if (choice === STOP) {
      stopped = pending.slice(i).map((p) => p.id);
      break;
    }
    if (choice === FINISH) {
      const rest = pending.length - i;
      const confirm = `Finish the spec step? ${rest} questions still without an answer are recorded as unanswered.`;
      if ((await ui.choose(confirm, ["yes", "no"])) === "no") {
        i--; // ask the same question again
        continue;
      }
      finishing = pending.slice(i).map((p) => p.id);
      break;
    }
    previous.answers.push({ id: q.id, question: q.question, answer: choice });
    chosen.push({ id: q.id, answer: choice });
  }
  if (stopped.length > 0) {
    if (chosen.length > 0) {
      const file = path.join(ctx.root, previous.spec.path);
      writeFileSync(file, fillAnswers(readFileSync(file, "utf8"), chosen));
      ui.note(`${chosen.length} choices written into ${previous.spec.path}`);
    }
    const sections = questionSections(last, { answers: previous.answers, unanswered: [] });
    return {
      ...counts(last, sections),
      specFile: path.join(ctx.root, recorded.folder, "spec.md"),
      status: specStatus(last),
      stopped,
    };
  }

  if (!finishing && (await ui.choose(ANOTHER_SPEC_CREATE_RUN, ["yes", "no"])) === "yes") {
    ui.note(`spec-create run: starting with ${previous.answers.length} answers`);
    return specCreate(ctx, recorded, previous);
  }
  // each spec-create run receives every answer given before it, so only answers to the current spec are new
  const own = new Set(last.open_questions.map((q) => q.id));
  const unreceived = previous.answers.filter((a) => own.has(a.id) && a.answer !== FREE && a.answer !== OUT_OF_SCOPE);
  if (unreceived.length > 0) {
    ui.note(`${unreceived.length} answers have not been worked into the spec yet; the spec agent runs once more`);
    return specCreate(ctx, recorded, previous, true);
  }

  const unanswered = finishing ?? [];
  const record = { answers: previous.answers, unanswered };
  writeAnswerLog(ctx.root, previous);
  const specFile = await step(ui, "Writing spec.md", () => writeSpec(ctx, recorded.folder, last, record, previous),
    ({ file, unchanged }) => toProjectPath(ctx.root, file) + (unchanged ? ", unchanged" : ", updated"));
  writeState(ctx.root, ctx.briefPath, { ...recorded, final: true });
  return { ...counts(last, questionSections(last, record)), specFile: specFile.file, status: "final", stopped: [] };
}

/**
 * The next spec-create run of a brief: runs the spec agent and writes its spec.md.
 * In a final run, every open question of the run is recorded as unanswered and the spec step ends.
 */
async function specCreate(ctx: Context, recorded: BriefState | undefined, previous: Previous | undefined, final = false): Promise<SpecFlowResult> {
  const { ui, agent = runClaude } = ctx.options;
  const answers = previous && { path: previous.answersPath, content: previous.answers.length > 0 ? renderAnswerList(previous.answers) : "" };
  const request = {
    systemPrompt: specAgent.systemPrompt,
    userMessage: specAgent.buildUserMessage(ctx.sources.brief, ctx.sources.all, answers),
    schema: specAgent.schema,
    timeoutMs: ctx.options.timeoutMs ?? 15 * 60_000,
    maxBudgetUsd: ctx.options.maxBudgetUsd ?? 5,
  };
  if (previous) writeAnswerLog(ctx.root, previous);
  const runDir = startRunLog(ctx.root, request.systemPrompt, request.userMessage);
  const log = toProjectPath(ctx.root, path.join(runDir, TRACE_FILE));
  ui.note(`trace: ${log}`);

  const response = await step(ui, "Spec agent is writing the spec",
    () => withLog(log, () => agent({ ...request, runDir })), describeCost);

  const output = await step(ui, "Validating output against schema",
    () => withLog(log, () => validateOutput<specAgent.SpecOutput>(specAgent.schema, response.output)));

  await step(ui, "Checking criteria and citations", () => withLog(log, () => {
    const citable = answers ? [...ctx.sources.all, answers] : ctx.sources.all;
    const problems = checkSpec(output, citable);
    if (problems.length > 0) throw new DoppelblindError("The spec does not pass its gates.", problems);
  }), () => `${output.criteria.length} criteria`);
  const used = [...(previous?.answers ?? []).map((a) => a.id), ...questionIds(ctx.root, recorded)];
  const spec = renumberQuestions(output, highestQuestion(used));
  writeFileSync(path.join(runDir, OUTPUT_FILE), JSON.stringify(spec, null, 2) + "\n");

  const unanswered = final ? spec.open_questions.map((q) => q.id) : [];
  const record = { answers: previous?.answers ?? [], unanswered };

  const { file: specFile } = await step(ui, "Writing spec.md",
    () => withLog(log, () => writeSpec(ctx, recorded?.folder, spec, record, previous)),
    ({ file, unchanged }) => toProjectPath(ctx.root, file) + (previous ? (unchanged ? ", unchanged" : ", updated") : ""));

  const status = final ? "final" : specStatus(spec);
  if (status === "ready") ui.note("no open question concerns a criterion");
  writeState(ctx.root, ctx.briefPath, {
    folder: toProjectPath(ctx.root, path.dirname(specFile)),
    ...(final && { final: true as const }),
    run: toProjectPath(ctx.root, runDir),
  });

  return { ...counts(spec, questionSections(spec, record)), specFile, status, stopped: [] };
}

/** Writes spec.md; refuses if spec.md changed since it was read. */
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

function noteRerun(ui: Ui, previous: Previous): void {
  ui.note(`spec-create run: rerunning with ${previous.answers.length} answers, ${previous.added} new from ${previous.spec.path}`);
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
 * The current spec of a brief and every answer given so far: those in answers.md, and those written into
 * the current spec.md; an answer in spec.md replaces the one answers.md holds for the same question.
 */
function readPrevious(root: string, brief: string, folder: string): Previous {
  const file = path.join(root, folder, "spec.md");
  if (!existsSync(file)) {
    throw new DoppelblindError(`${folder}/spec.md, recorded for ${brief} in ${STATE_FILE}, does not exist.`);
  }
  const spec = { path: toProjectPath(root, file), content: readFileSync(file, "utf8") };
  const log = path.join(root, folder, ANSWERS_FILE);
  const added = readAnswers(spec.content);
  const logged = existsSync(log) ? readAnswers(readFileSync(log, "utf8")) : [];
  const kept = logged.filter((a) => !added.some((b) => b.id === a.id));
  const answers = [...kept, ...added];
  return { spec, answersPath: toProjectPath(root, log), answers, added: added.length };
}

function writeAnswerLog(root: string, previous: Previous): void {
  previous.answers.sort((a, b) => questionNumber(a.id) - questionNumber(b.id));
  if (previous.answers.length > 0) writeFileSync(path.join(root, previous.answersPath), renderAnswerLog(previous.answers));
}

/** IDs of the open questions of the brief's last spec-create run, so that new ones are numbered after them. */
function questionIds(root: string, recorded: BriefState | undefined): string[] {
  const file = recorded?.run && path.join(root, recorded.run, OUTPUT_FILE);
  if (!file || !existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf8")) as specAgent.SpecOutput).open_questions.map((q) => q.id);
}

/** The validated output of the brief's last spec-agent run, from the run folder the run state records. */
function readOutput(root: string, brief: string, recorded: BriefState): specAgent.SpecOutput {
  const file = recorded.run && path.join(root, recorded.run, OUTPUT_FILE);
  if (!file || !existsSync(file)) {
    throw new DoppelblindError(`No output of the last spec-agent run is recorded for ${brief}.`, [
      `Run \`doppelblind spec ${brief}\` for another spec-create run first.`,
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
