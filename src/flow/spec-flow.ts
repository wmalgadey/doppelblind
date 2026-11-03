import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
import { createSpecFolder, SPEC_FILE } from "../spec/folder.ts";
import { highestQuestion, questionNumber, renumberQuestions } from "../spec/questions.ts";
import { questionSections, renderSpec, type QuestionRecord } from "../spec/render.ts";
import { readState, specStatus, STATE_FILE, writeState, type BriefState, type SpecStatus } from "../spec/state.ts";
import type { Ui } from "../tui.ts";
import { describeCost, runAgentWithLimitChoice, startRunLog, step, withLog } from "./run.ts";

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

export const DEFAULT_TIMEOUT_MIN = 15;
export const DEFAULT_BUDGET_USD = 5;

const STOP = "stop";
const FINISH = "finish";
const ANSWER = "answer";
const UNANSWERED = "unanswered";

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
    (s) => s.others.map((x) => x.path).join(", ") || "brief only");
  for (const p of sources.missing) ui.note(`declared source not found, skipped: ${p}`);

  const ctx = { root: contract.root, specsDir: path.join(contract.root, contract.specs), briefPath, sources, options };
  const recorded = readState(contract.root)[briefPath];
  if (recorded?.final) {
    throw new DoppelblindError(`The spec step of ${briefPath} is final; no further spec-create run starts.`, [`Spec: ${recorded.folder}/${SPEC_FILE}`]);
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
 * without one, then starts another spec-create run, after which the user chooses to answer its questions or
 * to record them all as unanswered. Choosing `finish` on a question, once confirmed, finishes the spec step at once.
 * answers.md is written only once the clarify run is over: right before the next spec-create run, or when the
 * spec step finishes. On `stop`, the choices made so far go into the Answer fields of spec.md instead.
 */
async function clarify(ctx: Context, recorded: BriefState, previous: Previous): Promise<SpecFlowResult> {
  const { ui } = ctx.options;
  const last = readOutput(ctx.root, recorded);
  if (!last) {
    throw new DoppelblindError(`No output of the last spec-agent run is recorded for ${ctx.briefPath}.`, [
      `Run \`doppelblind spec ${ctx.briefPath}\` for another spec-create run first.`,
    ]);
  }
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
  const given = previous.answers.length;
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
  }
  if (stopped.length > 0) {
    const chosen = previous.answers.slice(given);
    if (chosen.length > 0) {
      const file = path.join(ctx.root, previous.spec.path);
      writeFileSync(file, fillAnswers(readFileSync(file, "utf8"), chosen));
      ui.note(`${chosen.length} choices written into ${previous.spec.path}`);
    }
    return {
      ...counts(last, { answers: previous.answers, unanswered: [] }),
      specFile: path.join(ctx.root, previous.spec.path),
      status: specStatus(last),
      stopped,
    };
  }

  if (!finishing) {
    ui.note(`spec-create run: starting with ${previous.answers.length} answers`);
    return specCreate(ctx, recorded, previous, false, true);
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
  const { file: specFile } = await step(ui, `Writing ${SPEC_FILE}`, () => writeSpec(ctx, recorded.folder, last, record, previous),
    (written) => describeWrite(ctx.root, written, previous));
  writeState(ctx.root, ctx.briefPath, { ...recorded, final: true });
  return { ...counts(last, record), specFile, status: "final", stopped: [] };
}

/**
 * The next spec-create run of a brief: runs the spec agent and writes its spec.md.
 * In a final run, every open question of the run is recorded as unanswered and the spec step ends.
 * With `ask`, the user chooses afterwards to answer the new spec's questions, which ends the command,
 * or to record them all as unanswered, which ends the spec step.
 */
async function specCreate(
  ctx: Context,
  recorded: BriefState | undefined,
  previous: Previous | undefined,
  finalRun = false,
  ask = false,
): Promise<SpecFlowResult> {
  const { ui, agent = runClaude } = ctx.options;
  const answers = previous && { path: previous.answersPath, content: previous.answers.length > 0 ? renderAnswerList(previous.answers) : "" };
  const request = {
    systemPrompt: specAgent.systemPrompt,
    userMessage: specAgent.buildUserMessage(ctx.sources.brief, ctx.sources.others, answers),
    schema: specAgent.schema,
    timeoutMs: ctx.options.timeoutMs ?? DEFAULT_TIMEOUT_MIN * 60_000,
    maxBudgetUsd: ctx.options.maxBudgetUsd ?? DEFAULT_BUDGET_USD,
  };
  if (previous) writeAnswerLog(ctx.root, previous);

  // each attempt is a run of its own, with its own call and trace
  const { response, runDir, log } = await runAgentWithLimitChoice(ui, request, async (limits) => {
    const runDir = startRunLog(ctx.root, "spec-agent", { ...request, ...limits });
    const log = toProjectPath(ctx.root, path.join(runDir, TRACE_FILE));
    ui.note(`trace: ${log}`);
    const response = await withLog(log, () =>
      step(ui, "Spec agent is writing the spec", () => agent({ ...request, ...limits, runDir }), describeCost));
    return { response, runDir, log };
  });

  const written = await withLog(log, async () => {
    const output = await step(ui, "Validating output against schema",
      () => validateOutput<specAgent.SpecOutput>(specAgent.schema, response.output));

    await step(ui, "Checking criteria and citations", () => {
      const citable = [ctx.sources.brief, ...ctx.sources.others, ...(answers ? [answers] : [])];
      const problems = checkSpec(output, citable);
      if (problems.length > 0) throw new DoppelblindError("The spec does not pass its gates.", problems);
    }, () => `${output.criteria.length} criteria`);
    const lastQuestions = readOutput(ctx.root, recorded)?.open_questions ?? [];
    const used = [...(previous?.answers ?? []), ...lastQuestions].map((q) => q.id);
    const spec = renumberQuestions(output, Math.max(recorded?.lastQuestion ?? 0, highestQuestion(used)));
    writeFileSync(path.join(runDir, OUTPUT_FILE), JSON.stringify(spec, null, 2) + "\n");

    const unanswered = finalRun ? spec.open_questions.map((q) => q.id) : [];
    const record = { answers: previous?.answers ?? [], unanswered };

    const { file } = await step(ui, `Writing ${SPEC_FILE}`, () => writeSpec(ctx, recorded?.folder, spec, record, previous),
      (written) => describeWrite(ctx.root, written, previous));
    return { spec, record, specFile: file };
  });
  const { spec, specFile } = written;
  let { record } = written;

  let final = finalRun;
  if (ask) {
    const question = `A new ${SPEC_FILE} was created from the answers. The new spec contains ${spec.open_questions.length} open questions. ` +
      `Do you want to (1) ${ANSWER} the questions, or should all questions be (2) marked \`${UNANSWERED}\`?`;
    if ((await ui.choose(question, [ANSWER, UNANSWERED])) === UNANSWERED) {
      record = { ...record, unanswered: spec.open_questions.map((q) => q.id) };
      const folder = toProjectPath(ctx.root, path.dirname(specFile));
      await step(ui, `Writing ${SPEC_FILE}`, () => writeSpec(ctx, folder, spec, record), ({ file }) => toProjectPath(ctx.root, file));
      final = true;
    }
  }

  const status = final ? "final" : specStatus(spec);
  if (status === "ready") ui.note("no open question concerns a criterion");
  writeState(ctx.root, ctx.briefPath, {
    folder: toProjectPath(ctx.root, path.dirname(specFile)),
    ...(final && { final: true as const }),
    run: toProjectPath(ctx.root, runDir),
    lastQuestion: Math.max(recorded?.lastQuestion ?? 0, highestQuestion(spec.open_questions.map((q) => q.id))),
  });

  return { ...counts(spec, record), specFile, status, stopped: [] };
}

/** Writes spec.md; refuses if spec.md changed since it was read. */
function writeSpec(ctx: Context, recordedFolder: string | undefined, spec: specAgent.SpecOutput, record: QuestionRecord, previous?: Previous) {
  const folder = recordedFolder ? path.join(ctx.root, recordedFolder) : createSpecFolder(ctx.specsDir, spec.short_name);
  const file = path.join(folder, SPEC_FILE);
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

/** The written spec.md as a step detail: whether a rerun changed it. */
function describeWrite(root: string, { file, unchanged }: { file: string; unchanged: boolean }, previous?: Previous): string {
  return toProjectPath(root, file) + (previous ? (unchanged ? ", unchanged" : ", updated") : "");
}

function counts(spec: specAgent.SpecOutput, record: QuestionRecord) {
  const sections = questionSections(spec, record);
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
  const file = path.join(root, folder, SPEC_FILE);
  if (!existsSync(file)) {
    throw new DoppelblindError(`${folder}/${SPEC_FILE}, recorded for ${brief} in ${STATE_FILE}, does not exist.`);
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

/** The validated output of the brief's last spec-agent run, from the run folder the run state records, if any. */
function readOutput(root: string, recorded: BriefState | undefined): specAgent.SpecOutput | undefined {
  const file = recorded?.run && path.join(root, recorded.run, OUTPUT_FILE);
  if (!file || !existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8"));
}
