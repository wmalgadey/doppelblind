import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lockPath, readLock, writeLock } from "../acceptance/lock.ts";
import { readRecord, writeRecord, type TestAuthorRecord } from "../acceptance/record.ts";
import { passes, runTestFile, testCommand, type TestFileResult } from "../acceptance/test-run.ts";
import { runClaude, TRACE_FILE, type Agent, type AgentRequest, type AgentResponse } from "../agent/claude.ts";
import { checkWrites, copyWritten, createWorkspace, hash, hasTests, planView, removeWorkspace, type ViewPlan, type Workspace } from "../boundary/view.ts";
import { CONTRACT_FILE, loadContract, toProjectPath, type Contract } from "../contract.ts";
import { AgentLimitError, DoppelblindError } from "../errors.ts";
import { validateOutput } from "../gates/schema.ts";
import * as testAuthor from "../roles/test-author/index.ts";
import {
  ACCEPTED,
  ASSUMPTIONS_FILE,
  assumptionId,
  assumptionNumber,
  decidedText,
  readAssumptions,
  REJECTED,
  renderAssumptions,
  undecided,
  type Assumption,
  type RecordedAssumption,
} from "../spec/assumptions.ts";
import { SPEC_FILE } from "../spec/folder.ts";
import { parseSpec, type ParsedSpec } from "../spec/parse.ts";
import { readState, STATE_DIR } from "../spec/state.ts";
import type { Ui } from "../tui.ts";
import { describeCost, runAgentWithLimitChoice, showProgress, startRunLog, step, withLog, type Limits } from "./run.ts";

export interface TestAuthorOptions {
  cwd: string;
  /** A brief whose spec is final, or a final spec: its spec.md or its folder; relative to `cwd`. */
  target: string;
  ui: Ui;
  agent?: Agent;
  timeoutMs?: number;
  maxBudgetUsd?: number;
  maxTurns?: number;
  /** Time limit for each test file in the orchestrator's own test run. */
  testTimeoutMs?: number;
}

export interface TestAuthorResult {
  /** Project path of the spec.md the tests were written for. */
  spec: string;
  tests: { file: string; criterion: string; assumptions: string[] }[];
  /** Other files the test author wrote next to its tests, such as helpers. */
  helpers: string[];
  /** Project path of review.md; undefined when the spec has no criterion proven by review. */
  review?: string;
  /** The assumptions this run reported, with the IDs they have in assumptions.md; none when no agent ran. */
  assumptions: Assumption[];
  /** Project path of assumptions.md; undefined when the spec has no assumption. */
  assumptionsFile?: string;
  /** How many assumptions in assumptions.md wait for a decision; the tests are not locked while any does. */
  undecided: number;
  /** Test files that pass before any implementation; undefined when the project declares no test command. */
  passing?: TestFileResult[];
  /** Project path of the lock; undefined when the user kept the tests unlocked. */
  lock?: string;
}

export const DEFAULT_TEST_AUTHOR_TIMEOUT_MIN = 15;
export const DEFAULT_TEST_AUTHOR_BUDGET_USD = 5;
export const DEFAULT_TEST_AUTHOR_MAX_TURNS = 80;
export const DEFAULT_TEST_FILE_TIMEOUT_MIN = 2;

/** The test author reads and writes files; it has no shell, so it cannot run anything, not even its tests. */
const TOOLS = ["Read", "Glob", "Grep", "Write", "Edit"];
const REVIEW_FILE = "review.md";
const OUTPUT_FILE = "output.json";
const TEST_RUN_FILE = "test-run.json";
const LOCK = "lock";
const KEEP_UNLOCKED = "keep unlocked";

/** Whether the flow of `brief` has passed the spec step, so that continuing it starts the test author. */
export function briefIsFinal(cwd: string, brief: string): boolean {
  const contract = loadContract(cwd);
  return readState(contract.root)[toProjectPath(contract.root, path.resolve(cwd, brief))]?.final === true;
}

/**
 * Hands a final spec to the test author, which writes the acceptance tests for its criteria proven by test, and has
 * the review file written for its criteria proven by review. The test author runs in a sandbox that holds only the
 * existing acceptance tests and the test infrastructure; only what it wrote into the spec's folder under the test
 * author's path reaches the project. The orchestrator runs the tests itself and writes the assumptions the test
 * author made into assumptions.md next to spec.md. Only once the user has decided every assumption there can the
 * tests be locked; a rejected assumption starts the test author again, and every decision binds the later runs.
 */
export async function runTestAuthor(options: TestAuthorOptions): Promise<TestAuthorResult> {
  const { ui } = options;

  const { contract, folder, spec } = await step(ui, "Reading the final spec", () => {
    const contract = loadContract(options.cwd);
    const folder = resolveSpec(contract, path.resolve(options.cwd, options.target));
    const file = `${folder}/${SPEC_FILE}`;
    const spec = parseSpec(readFileSync(path.join(contract.root, file), "utf8"), file);
    if (!spec.criteria.some((c) => c.provenBy === "test")) {
      throw new DoppelblindError(`${file} has no criterion proven by test; the test author does not start.`);
    }
    if (readLock(contract.root, path.posix.basename(folder))) {
      throw new DoppelblindError(`The acceptance tests of ${file} are frozen; the test author does not start.`, [
        `They were locked by an earlier test author run: ${lockPath(path.posix.basename(folder))}`,
      ]);
    }
    return { contract, folder, spec };
  }, ({ folder, spec }) => {
    const byTest = spec.criteria.filter((c) => c.provenBy === "test").length;
    return `${folder}/${SPEC_FILE}: ${byTest} criteria proven by test, ${spec.criteria.length - byTest} by review`;
  });
  const { root } = contract;
  const specPath = `${folder}/${SPEC_FILE}`;
  const name = path.posix.basename(folder);
  const assumptionsPath = `${folder}/${ASSUMPTIONS_FILE}`;

  const decisions = existsSync(path.join(root, assumptionsPath))
    ? await step(ui, "Reading the decisions on the assumptions", () => readDecisions(root, assumptionsPath),
      (d) => `${d.length} assumptions decided in ${assumptionsPath}`)
    : [];
  const record = readRecord(root, name);
  // a rejection the last completed run did not receive starts the test author again
  const rejections = decisions.filter((a) => a.decision?.kind === "rejected" && record?.handed[a.id] !== a.raw);
  if (rejections.length > 0) {
    ui.note(`${rejections.map((a) => a.id).join(", ")} rejected in ${assumptionsPath}: the test author starts again for ${specPath}`);
  } else if (record?.awaitingDecisions) {
    return lockDecided(ui, root, folder, assumptionsPath, record, decisions);
  }

  const plan = await step(ui, "Preparing what the test author may see", () => planFor(contract, folder),
    (p) => `${p.acceptanceTests.length + p.infrastructure.length} files visible, ${p.unitTests.length} unit tests hidden`);

  const limits: Limits = {
    timeoutMs: options.timeoutMs ?? (contract.limits.testAuthor?.timeoutMin ?? DEFAULT_TEST_AUTHOR_TIMEOUT_MIN) * 60_000,
    maxBudgetUsd: options.maxBudgetUsd ?? contract.limits.testAuthor?.budgetUsd ?? DEFAULT_TEST_AUTHOR_BUDGET_USD,
    maxTurns: options.maxTurns ?? contract.limits.testAuthor?.maxTurns ?? DEFAULT_TEST_AUTHOR_MAX_TURNS,
  };
  const reviewCriteria = spec.criteria.filter((c) => c.provenBy === "review");
  const review = reviewCriteria.length === 0 ? undefined : await writeReviewGuide(options, root, specPath, spec, limits, plan.writable);
  if (!review) ui.note(`${specPath} has no criterion proven by review; no review file is written`);

  const handed = testAuthor.handOver(spec, "test", decidedByCriterion(decisions));
  const request: AgentRequest = {
    systemPrompt: testAuthor.systemPrompt,
    userMessage: testAuthor.buildUserMessage(handed, plan.writable, [...plan.acceptanceTests, ...plan.infrastructure]),
    schema: testAuthor.schema,
    tools: TOOLS,
    ...limits,
  };
  const guardrails = {
    sandbox: "bwrap",
    writable: `${plan.writable}/`,
    visible: [...plan.acceptanceTests, ...plan.infrastructure],
    hidden: { implementation: contract.implementation, plan: contract.plan, unitTests: plan.unitTests.length },
  };

  let ws: Workspace | undefined;
  let copied: string[] | undefined;
  try {
    const { response, runDir, log } = await runAgentWithLimitChoice(ui, limits, async (attempt) => {
      // every attempt starts from the same view, so a retry starts over
      if (ws) removeWorkspace(ws);
      ws = createWorkspace(root, plan);
      const run = { ...request, ...attempt, workdir: ws.dir };
      const runDir = startRunLog(root, "test-author", run, guardrails);
      const log = toProjectPath(root, path.join(runDir, TRACE_FILE));
      ui.note(`trace: ${log}`);
      // the agent writes its files here while it works; they reach the project only after the check
      ui.note(`workspace: ${ws.dir}/${plan.writable}`);
      const response = await withLog(log, () =>
        step(ui, "Test author is writing the acceptance tests", (s) => (options.agent ?? runClaude)({ ...run, runDir, onProgress: showProgress(s) }), describeCost));
      return { response, runDir, log };
    });

    const written = await withLog(log, async () => {
      const output = await step(ui, "Validating its output", () => validateOutput<testAuthor.TestAuthorOutput>(testAuthor.schema, response.output),
        (o) => `${o.tests.length} test files, ${o.assumptions.length} assumptions`);
      writeFileSync(path.join(runDir, OUTPUT_FILE), JSON.stringify(output, null, 2) + "\n");

      const files = await step(ui, "Checking its writes", () => {
        const files = checkedWrites(ws!, spec, output);
        copyWritten(ws!, root, files);
        copied = files;
        if (review) writeFileSync(path.join(root, plan.writable, REVIEW_FILE), review);
        return files;
      }, (files) => `${files.length} files in ${plan.writable}/`);
      return { output, files };
    });
    // the agent numbers its assumptions from A-001 in every run; in assumptions.md they follow the earlier ones
    const ids = renumbered(written.output.assumptions, decisions);
    const tests = written.output.tests.map((t) => ({ file: normalize(t.file), criterion: t.criterion, assumptions: t.assumptions.map((a) => ids.get(a)!) }));
    for (const t of tests) ui.note(`wrote ${t.file} (${t.criterion})`);
    const added: Assumption[] = written.output.assumptions.map((a) => ({
      id: ids.get(a.id)!,
      criterion: a.criterion,
      assumption: a.assumption,
      files: tests.filter((t) => t.assumptions.includes(ids.get(a.id)!)).map((t) => t.file),
    }));
    const entries = [...decisions, ...added];
    if (entries.length > 0) writeFileSync(path.join(root, assumptionsPath), renderAssumptions(SPEC_FILE, entries));
    for (const a of added) ui.note(`assumption ${a.id} (${a.criterion}): ${a.assumption}`);

    const passing = await ownTestRun(options, contract, runDir, tests);
    const reviewPath = review && `${plan.writable}/${REVIEW_FILE}`;
    const helpers = written.files.filter((f) => !tests.some((t) => t.file === f));
    const result: TestAuthorResult = {
      spec: specPath,
      tests,
      helpers,
      ...(reviewPath && { review: reviewPath }),
      assumptions: added,
      ...(entries.length > 0 && { assumptionsFile: assumptionsPath }),
      undecided: added.length,
      ...(passing && { passing }),
    };
    const completed: TestAuthorRecord = {
      run: toProjectPath(root, runDir),
      tests,
      helpers,
      ...(reviewPath && { review: reviewPath }),
      ...(passing && { passing }),
      handed: Object.fromEntries(decisions.map((a) => [a.id, a.raw])),
    };

    // the gate before the lock: every assumption needs a decision first
    if (added.length > 0) {
      writeRecord(root, name, { ...completed, awaitingDecisions: true });
      ui.note(`not locked: ${added.length} assumptions wait for a decision in ${assumptionsPath}; ` +
        `write ${ACCEPTED} or ${REJECTED}: <what applies instead> into each Decision field and run the test author again`);
      return result;
    }
    writeRecord(root, name, completed);
    result.lock = await offerLock(ui, root, folder, completed, entries.length > 0 ? assumptionsPath : undefined, [
      `${tests.length} test files${reviewPath ? ` and ${reviewPath}` : ""} in ${plan.writable}/`,
      `no new assumptions${decisions.length > 0 ? `; ${decisions.length} decided in ${assumptionsPath}` : ""}`,
    ]);
    return result;
  } catch (err) {
    // the user declined to raise a limit: nothing of the run reaches the project
    if (err instanceof AgentLimitError && err.limit !== "turns") throw err;
    const kept = keepIncomplete(err, ws, root, copied);
    // the files of the run that waits for decisions were replaced: they are no longer the ones to lock
    const last = readRecord(root, name);
    if (kept.length > 0 && last?.awaitingDecisions) writeRecord(root, name, { ...last, awaitingDecisions: undefined });
    throw err;
  } finally {
    if (ws) removeWorkspace(ws);
  }
}

/** Reads assumptions.md; stops when an assumption has no valid decision, since neither a run nor the lock may go on. */
function readDecisions(root: string, file: string): RecordedAssumption[] {
  const entries = readAssumptions(readFileSync(path.join(root, file), "utf8"));
  const problems = undecided(entries);
  if (problems.length > 0) {
    throw new DoppelblindError(`${problems.length} assumptions in ${file} have no valid decision; the acceptance tests are not locked.`, [
      ...problems,
      `Write ${ACCEPTED} or ${REJECTED}: <what applies instead> into each Decision field, then run the test author again.`,
    ]);
  }
  return entries;
}

/** What the decided assumptions make binding, by criterion ID. */
function decidedByCriterion(decisions: RecordedAssumption[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const a of decisions) {
    const text = decidedText(a);
    if (text !== undefined) result.set(a.criterion, [...(result.get(a.criterion) ?? []), text]);
  }
  return result;
}

/** New IDs for the agent's assumptions, following the highest ID assumptions.md holds, in the order reported. */
function renumbered(assumptions: testAuthor.TestAuthorOutput["assumptions"], earlier: RecordedAssumption[]): Map<string, string> {
  const after = Math.max(0, ...earlier.map((a) => assumptionNumber(a.id)));
  return new Map(assumptions.map((a, i) => [a.id, assumptionId(after + i + 1)]));
}

/**
 * The gate has passed for the tests of the run that waited for decisions: every assumption is decided and none
 * rejected anew. Offers to lock those tests without another run.
 */
async function lockDecided(
  ui: Ui,
  root: string,
  folder: string,
  assumptionsPath: string,
  record: TestAuthorRecord,
  decisions: RecordedAssumption[],
): Promise<TestAuthorResult> {
  const files = [...record.tests.map((t) => t.file), ...record.helpers, ...(record.review ? [record.review] : [])];
  const missing = files.filter((f) => !existsSync(path.join(root, f)));
  if (missing.length > 0) {
    writeRecord(root, path.posix.basename(folder), { ...record, awaitingDecisions: undefined });
    throw new DoppelblindError(`Files of the test author run ${record.run} are missing; they cannot be locked.`, [
      ...missing.map((f) => `missing: ${f}`),
      "Run the test author again to write the acceptance tests anew.",
    ]);
  }
  const accepted = decisions.filter((a) => a.decision?.kind === "accepted").length;
  ui.note(`every assumption in ${assumptionsPath} is decided: ${accepted} accepted, ${decisions.length - accepted} rejected and already applied`);
  const lock = await offerLock(ui, root, folder, record, assumptionsPath, [
    `${record.tests.length} test files of ${record.run}`,
    `${decisions.length} assumptions decided in ${assumptionsPath}`,
  ]);
  writeRecord(root, path.posix.basename(folder), { ...record, awaitingDecisions: undefined });
  return {
    spec: `${folder}/${SPEC_FILE}`,
    tests: record.tests,
    helpers: record.helpers,
    ...(record.review && { review: record.review }),
    assumptions: [],
    assumptionsFile: assumptionsPath,
    undecided: 0,
    ...(record.passing && { passing: record.passing }),
    ...(lock && { lock }),
  };
}

/** Asks whether to lock the files of a completed run, with assumptions.md if the spec has one, and writes the lock. */
async function offerLock(
  ui: Ui,
  root: string,
  folder: string,
  run: TestAuthorRecord,
  assumptionsPath: string | undefined,
  details: string[],
): Promise<string | undefined> {
  const specPath = `${folder}/${SPEC_FILE}`;
  const { passing } = run;
  const question = `Lock the acceptance tests of ${specPath}? Locked tests are frozen: no later test author run replaces them.`;
  const shown = [
    ...details,
    ...(passing ?? []).map((p) => `${p.criterion} passes before any implementation: ${p.file}`),
    ...(passing ? [] : ["the tests were not run: the project declares no test command"]),
  ];
  if ((await ui.choose(question, [LOCK, KEEP_UNLOCKED], shown)) !== LOCK) {
    ui.note(`not locked: a later test author run on ${specPath} replaces these files`);
    return undefined;
  }
  const files = [...run.tests.map((t) => t.file), ...run.helpers, ...(run.review ? [run.review] : []), ...(assumptionsPath ? [assumptionsPath] : [])];
  return step(ui, "Writing the lock", () => writeLock(root, path.posix.basename(folder), {
    spec: specPath,
    specSha256: hash(path.join(root, specPath)),
    lockedAt: new Date().toISOString(),
    run: run.run,
    files: files.map((f) => ({
      path: f,
      sha256: hash(path.join(root, f)),
      criterion: run.tests.find((t) => t.file === f)?.criterion ?? null,
    })),
  }), (lock) => lock);
}

/** Decides what the test author sees; stops if the contract does not say what it must not see or where it writes. */
function planFor(contract: Contract, folder: string): ViewPlan {
  const missing = [
    ...(contract.implementation?.length ? [] : ['"implementation": the paths that hold implementation code']),
    ...(contract.plan?.length ? [] : ['"plan": the paths that hold the plan']),
  ];
  if (missing.length > 0) {
    throw new DoppelblindError(`${CONTRACT_FILE} does not declare what the test author must not see; the test author does not start.`, missing);
  }
  if (!contract.acceptanceTests) {
    throw new DoppelblindError(`${CONTRACT_FILE} declares no path for the test author; the test author does not start.`, [
      '"acceptanceTests": the path the acceptance tests are written to',
    ]);
  }
  const briefs = Object.keys(readState(contract.root));
  const excluded = [...contract.implementation!, ...contract.plan!, contract.specs, ...contract.sources, ...briefs, STATE_DIR, CONTRACT_FILE];
  const plan = planView(contract.root, contract.acceptanceTests, path.posix.basename(folder), excluded);
  if (!hasTests(plan)) {
    throw new DoppelblindError("The project has no tests yet; the test author does not start.", [
      "It writes acceptance tests only in the language and with the framework of the project's existing tests.",
    ]);
  }
  return plan;
}

/** Has the review guide written for the criteria proven by review, in a run of its own, and renders review.md. */
async function writeReviewGuide(
  options: TestAuthorOptions,
  root: string,
  specPath: string,
  spec: ParsedSpec,
  limits: Limits,
  writable: string,
): Promise<string> {
  const { ui } = options;
  const criteria = spec.criteria.filter((c) => c.provenBy === "review");
  const handed = testAuthor.handOver(spec, "review").map((c, i) => ({ ...c, title: criteria[i].title }));
  const request = {
    systemPrompt: testAuthor.reviewPrompt,
    userMessage: testAuthor.buildReviewMessage(handed),
    schema: testAuthor.reviewSchema,
    ...limits,
  };
  const { response, log } = await runAgentWithLimitChoice(ui, limits, async (attempt) => {
    const runDir = startRunLog(root, "review-guide", { ...request, ...attempt });
    const log = toProjectPath(root, path.join(runDir, TRACE_FILE));
    const response: AgentResponse = await withLog(log, () =>
      step(ui, "Test author is writing the review file", (s) => (options.agent ?? runClaude)({ ...request, ...attempt, runDir, onProgress: showProgress(s) }), describeCost));
    return { response, log };
  });
  return withLog(log, () => step(ui, "Validating the review file", () => {
    const { entries } = validateOutput<testAuthor.ReviewOutput>(testAuthor.reviewSchema, response.output);
    const ids = entries.map((e) => e.criterion).sort();
    const expected = criteria.map((c) => c.id).sort();
    if (ids.join() !== expected.join()) {
      throw new DoppelblindError("The review guide does not have exactly one entry per criterion proven by review.", [
        `expected ${expected.join(", ")}; got ${ids.join(", ") || "none"}`,
      ]);
    }
    return testAuthor.renderReview(specPath, path.posix.relative(writable, specPath), criteria, entries);
  }, () => `${criteria.length} entries`));
}

/**
 * Checks what the test author wrote against what it reports: nothing outside its folder, and every test file it
 * lists exists there and covers one criterion proven by test, each of which has a test file.
 * Returns the files that may reach the project.
 */
function checkedWrites(ws: Workspace, spec: ParsedSpec, output: testAuthor.TestAuthorOutput): string[] {
  const writes = checkWrites(ws);
  const reserved = `${ws.writable}/${REVIEW_FILE}`;
  const rejected = [...writes.rejected, ...writes.written.filter((f) => f === reserved)];
  if (rejected.length > 0) {
    throw new DoppelblindError(`The test author wrote outside ${ws.writable}/; its writes were rejected.`, rejected.map((f) => `rejected: ${f}`));
  }
  const byTest = new Set(spec.criteria.filter((c) => c.provenBy === "test").map((c) => c.id));
  const problems: string[] = [];
  const covered = new Map<string, string>();
  for (const { file, criterion } of output.tests) {
    const f = normalize(file);
    if (!writes.written.includes(f)) problems.push(`${f} is listed as a test but was not written in ${ws.writable}/.`);
    if (!byTest.has(criterion)) problems.push(`${f} covers ${criterion}, which is not a criterion proven by test.`);
    if (covered.has(f) && covered.get(f) !== criterion) problems.push(`${f} is listed for ${covered.get(f)} and ${criterion}.`);
    covered.set(f, criterion);
  }
  for (const id of byTest) {
    if (![...covered.values()].includes(id)) problems.push(`${id} has no acceptance test.`);
  }
  const reported = output.assumptions.map((a) => a.id);
  for (const id of new Set(reported.filter((id, i) => reported.indexOf(id) !== i))) problems.push(`${id} is reported as more than one assumption.`);
  for (const { file, assumptions } of output.tests) {
    for (const id of assumptions) if (!reported.includes(id)) problems.push(`${normalize(file)} rests on ${id}, which is not a reported assumption.`);
  }
  if (problems.length > 0) throw new DoppelblindError("The test author's output does not cover the spec as required.", problems);
  return writes.written;
}

/** Runs each test file with the project's own test command; the test author's account of its tests does not count. */
async function ownTestRun(options: TestAuthorOptions, contract: Contract, runDir: string, tests: TestAuthorResult["tests"]) {
  const { ui } = options;
  const command = testCommand(contract);
  if (!command) {
    ui.note(`no test command: declare "testCommand" in ${CONTRACT_FILE} so that the orchestrator runs the tests`);
    return undefined;
  }
  return step(ui, "Running the acceptance tests", async () => {
    const results: TestFileResult[] = [];
    for (const t of tests) {
      results.push(await runTestFile(contract.root, command, t.file, t.criterion, options.testTimeoutMs ?? (contract.limits.testFileTimeoutMin ?? DEFAULT_TEST_FILE_TIMEOUT_MIN) * 60_000));
    }
    writeFileSync(path.join(runDir, TEST_RUN_FILE), JSON.stringify({ command, results }, null, 2) + "\n");
    const passing = results.filter(passes);
    for (const p of passing) ui.note(`${p.criterion}: ${p.file} passes before any implementation`);
    return passing;
  }, (passing) => `${tests.length - passing.length} of ${tests.length} fail before any implementation` +
    (passing.length > 0 ? `, ${passing.length} pass: ${passing.map((p) => p.criterion).join(", ")}` : ""));
}

/**
 * After a failed run, keeps what the test author already wrote into its folder, unlocked, and lists it as
 * incomplete; an earlier run's files are replaced only when this run wrote any.
 */
function keepIncomplete(err: unknown, ws: Workspace | undefined, root: string, copied: string[] | undefined): string[] {
  let kept = copied;
  if (!kept && ws && existsSync(ws.dir)) {
    const { written } = checkWrites(ws);
    kept = written.filter((f) => f !== `${ws.writable}/${REVIEW_FILE}`);
    if (kept.length > 0) copyWritten(ws, root, kept);
  }
  if (err instanceof DoppelblindError && kept?.length) {
    err.details.push(...kept.map((f) => `incomplete, not locked: ${f}`));
  }
  return kept ?? [];
}

/** A path the agent reports, relative to its working directory, as a project path. */
function normalize(file: string): string {
  return path.posix.normalize(file).replace(/^\.\//, "");
}

/**
 * The folder of the final spec that `target` names: a brief connected to a spec, a spec.md or a spec folder.
 * Stops with a message when there is no such spec or the spec is not final.
 */
function resolveSpec(contract: Contract, target: string): string {
  const { root } = contract;
  const named = toProjectPath(root, target);
  const state = readState(root);
  const recorded = Object.entries(state);
  const folder = state[named]?.folder ?? (path.posix.basename(named) === SPEC_FILE ? path.posix.dirname(named) : named);
  if (!existsSync(path.join(root, folder, SPEC_FILE))) {
    if (state[named]) throw new DoppelblindError(`${folder}/${SPEC_FILE}, recorded for ${named}, does not exist.`);
    if (existsSync(target)) {
      throw new DoppelblindError(`No spec is connected to ${named}.`, [`Run \`doppelblind feature ${named}\` to write its spec first.`]);
    }
    throw new DoppelblindError(`No spec found at ${named}.`, ["Name a brief that has a spec, a spec.md or a spec folder."]);
  }
  const brief = state[named] ? named : recorded.find(([, s]) => s.folder === folder)?.[0];
  if (!brief || !state[brief].final) {
    throw new DoppelblindError(`The spec ${folder}/${SPEC_FILE} is not final yet; the test author does not start.`, [
      brief ? `Finish its spec step first: \`doppelblind feature ${brief}\`.` : "No brief in the run state is connected to it.",
    ]);
  }
  return folder;
}
