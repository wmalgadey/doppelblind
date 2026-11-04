// Shared setup for the acceptance tests of the spec-agent command.
// Runs the real CLI (`node src/cli.ts`) in a temporary git repository, with a stand-in `claude`
// executable first on PATH that delegates to test/fixtures/fake-claude.mjs.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect } from "vitest";
import { BRIEF, makeProject, sampleSpec } from "../../../test/helpers.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, "../../..");
const CLI = path.join(PROJECT_ROOT, "src/cli.ts");
const FAKE_CLAUDE = path.join(PROJECT_ROOT, "test/fixtures/fake-claude.mjs");

/** The spec-agent command: `doppelblind spec <brief>`. */
export const SPEC_COMMAND = ["spec"];
/** The complete-flow command: `doppelblind run <brief>`. */
export const FLOW_COMMAND = ["run"];

export const BRIEF_PATH = "docs/briefs/x.md";
export const BRIEF_MARKER = "OUT-01. I can be greeted.";
/** Appears in every output the fake agent CLI prints, so the stored run log can be recognised. */
export const RUN_LOG_MARKER = "fake-session-run-log-7f3a9c";
/** A complete configuration that declares the specs folder `specs`. */
export const COMPLETE_CONF = "specs = specs\n";

/** Choices typed on standard input when the command asks what to do. */
export const CHOOSE_RERUN = "1\n";
export const CHOOSE_STOP = "2\n";

export type Spec = ReturnType<typeof sampleSpec>;
type Criterion = Spec["criteria"][number];
type Question = Spec["open_questions"][number];

export interface Project {
  root: string;
  agentDir: string;
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  output: string;
}

export function criterion(n: number, overrides: Partial<Criterion> = {}): Criterion {
  const base = sampleSpec().criteria[0];
  return {
    ...base,
    id: `AC-${String(n).padStart(3, "0")}`,
    title: n === 1 ? base.title : `Greeter greets ${n}`,
    sources: [{ path: BRIEF_PATH, anchor: "## Walkthrough" }],
    ...overrides,
  };
}

export function question(n: number, overrides: Partial<Question> = {}): Question {
  return {
    id: `Q-${String(n).padStart(2, "0")}`,
    question: `Which words does greeting number ${n} use?`,
    concerns: ["AC-001"],
    context: "I run the greeter.",
    ...overrides,
  };
}

/** Valid spec agent output for the brief at BRIEF_PATH. */
export function validSpec(overrides: Partial<Spec> = {}): Spec {
  return sampleSpec({ criteria: [criterion(1)], open_questions: [question(1)], ...overrides });
}

export function successEnvelope(spec: unknown): string {
  return (
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 1,
      num_turns: 1,
      result: JSON.stringify(spec),
      session_id: RUN_LOG_MARKER,
      total_cost_usd: 0,
      structured_output: spec,
    }) + "\n"
  );
}

export function errorEnvelope(message: string): string {
  return (
    JSON.stringify({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      duration_ms: 1,
      num_turns: 0,
      result: message,
      session_id: RUN_LOG_MARKER,
    }) + "\n"
  );
}

function shimSource(agentDir: string): string {
  return `#!${process.execPath}
const fs = require("node:fs");
const dir = ${JSON.stringify(agentDir)};
const config = JSON.parse(fs.readFileSync(dir + "/config.json", "utf8"));
let entries = null;
try { entries = fs.readdirSync(process.cwd()); } catch {}
fs.appendFileSync(dir + "/invocations.jsonl", JSON.stringify({ cwd: process.cwd(), entries }) + "\\n");
if (config.stderr) process.stderr.write(config.stderr);
for (const key of Object.keys(process.env)) if (key.startsWith("FAKE_CLAUDE")) delete process.env[key];
Object.assign(process.env, config.env);
import(${JSON.stringify(pathToFileURL(FAKE_CLAUDE).href)});
`;
}

export interface ProjectOptions {
  /** Content of `.doppelblind.conf`; `null` for none. Defaults to COMPLETE_CONF. */
  conf?: string | null;
  /** Content of the brief at BRIEF_PATH. Defaults to BRIEF. */
  brief?: string;
  files?: Record<string, string>;
}

/** A temporary git repository with a brief at BRIEF_PATH, and a fake agent CLI returning validSpec(). */
export function createProject(options: ProjectOptions = {}): Project {
  const files: Record<string, string> = { [BRIEF_PATH]: options.brief ?? BRIEF, ...(options.files ?? {}) };
  const conf = options.conf === undefined ? COMPLETE_CONF : options.conf;
  if (conf !== null) files[".doppelblind.conf"] = conf;
  const root = realpathSync(makeProject(files));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const agentDir = realpathSync(mkdtempSync(path.join(tmpdir(), "doppelblind-agent-")));
  writeFileSync(path.join(agentDir, "claude"), shimSource(agentDir), { mode: 0o755 });
  const project = { root, agentDir };
  setAgent(project, { spec: validSpec() });
  return project;
}

export interface AgentBehaviour {
  spec?: unknown;
  stdout?: string;
  stderr?: string;
  exit?: number;
  sleepMs?: number;
}

/** Sets what the fake agent CLI does on its next invocations. */
export function setAgent(project: Project, behaviour: AgentBehaviour): void {
  const env: Record<string, string> = {
    FAKE_CLAUDE_STDOUT: behaviour.stdout ?? successEnvelope(behaviour.spec ?? validSpec()),
    FAKE_CLAUDE_EXIT: String(behaviour.exit ?? 0),
  };
  if (behaviour.sleepMs) env.FAKE_CLAUDE_SLEEP_MS = String(behaviour.sleepMs);
  writeFileSync(path.join(project.agentDir, "config.json"), JSON.stringify({ env, stderr: behaviour.stderr ?? "" }));
}

export interface Invocation {
  cwd: string;
  entries: string[] | null;
}

/** Every start of the agent CLI so far. */
export function agentInvocations(project: Project): Invocation[] {
  const file = path.join(project.agentDir, "invocations.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

export function clearInvocations(project: Project): void {
  rmSync(path.join(project.agentDir, "invocations.jsonl"), { force: true });
}

function cliEnv(project: Project): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("FAKE_CLAUDE")) delete env[key];
  env.PATH = `${project.agentDir}${path.delimiter}${process.env.PATH ?? ""}`;
  return env;
}

export interface RunOptions {
  /** Working directory; defaults to the repository root. */
  cwd?: string;
  /** Text on standard input, which is closed afterwards. Defaults to empty (closed at once). */
  input?: string;
  /** Redirects standard error to a file instead of a pipe. */
  stderrToFile?: boolean;
}

/** Runs `node src/cli.ts <args>` and waits for it to end. */
export function run(project: Project, args: string[], options: RunOptions = {}): RunResult {
  let stderrFile: string | undefined;
  let stderrFd: number | undefined;
  if (options.stderrToFile) {
    stderrFile = path.join(project.agentDir, `stderr-${Date.now()}.txt`);
    stderrFd = openSync(stderrFile, "w");
  }
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: options.cwd ?? project.root,
    env: cliEnv(project),
    input: options.input ?? "",
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["pipe", "pipe", stderrFd ?? "pipe"],
  });
  if (stderrFd !== undefined) closeSync(stderrFd);
  const stdout = result.stdout ?? "";
  const stderr = stderrFile ? readFileSync(stderrFile, "utf8") : (result.stderr ?? "");
  return { status: result.status, stdout, stderr, output: stdout + stderr };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs the CLI and, once the agent CLI has started, interrupts it as Ctrl-C in a terminal would. */
export async function runAndInterrupt(project: Project, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd: options.cwd ?? project.root,
    env: cliEnv(project),
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
  child.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
  const closed = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
  let ended = false;
  child.on("exit", () => (ended = true));
  child.stdin.on("error", () => {});
  child.stdin.end(options.input ?? "");
  const deadline = Date.now() + 30_000;
  while (!ended && agentInvocations(project).length === 0 && Date.now() < deadline) await sleep(50);
  await sleep(300);
  const killGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, signal);
    } catch {
      // the group is gone already
    }
  };
  killGroup("SIGINT");
  const timer = setTimeout(() => killGroup("SIGKILL"), 20_000);
  const status = await closed;
  clearTimeout(timer);
  killGroup("SIGKILL");
  return { status, stdout, stderr, output: stdout + stderr };
}

interface Tree {
  files: string[];
  dirs: string[];
}

/** Relative paths of all files and directories below `dir` (posix separators). */
export function walk(dir: string, exclude: string[] = []): Tree {
  const tree: Tree = { files: [], dirs: [] };
  if (!existsSync(dir)) return tree;
  const visit = (rel: string) => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (!rel && exclude.includes(entry.name)) continue;
      if (entry.isDirectory()) {
        tree.dirs.push(child);
        visit(child);
      } else {
        tree.files.push(child);
      }
    }
  };
  visit("");
  tree.files.sort();
  tree.dirs.sort();
  return tree;
}

/** Byte-exact snapshot of everything below `dir`, except top-level entries named in `exclude`. */
export function snapshot(dir: string, exclude: string[] = []): Record<string, string> {
  const tree = walk(dir, exclude);
  const snap: Record<string, string> = {};
  for (const d of tree.dirs) snap[d] = "dir";
  for (const f of tree.files) snap[f] = `file:${readFileSync(path.join(dir, f)).toString("base64")}`;
  return snap;
}

/** Names of the subfolders of `<root>/specs`. */
export function specDirs(root: string): string[] {
  const specs = path.join(root, "specs");
  if (!existsSync(specs)) return [];
  return readdirSync(specs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export function specFile(project: Project, dir: string): string {
  return path.join(project.root, "specs", dir, "spec.md");
}

/** The single subfolder of `specs` that is not in `before`. */
export function expectOneNewSpecDir(project: Project, before: string[] = []): string {
  const added = specDirs(project.root).filter((d) => !before.includes(d));
  expect(added).toHaveLength(1);
  return added[0];
}

export function readSpec(project: Project, dir: string): string {
  return readFileSync(specFile(project, dir), "utf8");
}

/** Relative paths of all files in `.doppelblind`. */
export function doppelblindFiles(project: Project): string[] {
  return walk(path.join(project.root, ".doppelblind")).files;
}

/** Texts of the files in `.doppelblind` that are not in `before`. */
export function newDoppelblindTexts(project: Project, before: string[] = []): { file: string; text: string }[] {
  return doppelblindFiles(project)
    .filter((f) => !before.includes(f))
    .map((file) => ({ file, text: readFileSync(path.join(project.root, ".doppelblind", file), "utf8") }));
}

/** Texts of the `.doppelblind` files created since `before`, which hold what was recorded of the new run. */
export function recordedInput(project: Project, before: string[] = []): string {
  return newDoppelblindTexts(project, before)
    .map((f) => f.text)
    .join("\n");
}

/** Folders below `.doppelblind` (not itself) that hold a file containing `marker`, relative to the repository root. */
export function doppelblindFoldersHolding(project: Project, marker: string): string[] {
  const base = path.join(project.root, ".doppelblind");
  const tree = walk(base);
  const holding = tree.files.filter((f) => readFileSync(path.join(base, f), "utf8").includes(marker));
  return tree.dirs.filter((d) => holding.some((f) => f.startsWith(`${d}/`))).map((d) => `.doppelblind/${d}`);
}

/** Inserts `answer` on the lines after the **Answer:** field of question `id` in a spec.md text. */
export function answerQuestion(spec: string, id: string, answer: string): string {
  const lines = spec.split("\n");
  const heading = lines.findIndex((l) => /^#+\s/.test(l) && l.includes(id));
  if (heading < 0) throw new Error(`spec.md has no heading for ${id}`);
  const field = lines.findIndex((l, i) => i > heading && l.includes("**Answer:**"));
  if (field < 0) throw new Error(`spec.md has no **Answer:** field for ${id}`);
  lines.splice(field + 1, 0, ...answer.split("\n"));
  return lines.join("\n");
}

export function writeAnswers(project: Project, dir: string, answers: Record<string, string>): void {
  let text = readSpec(project, dir);
  for (const [id, answer] of Object.entries(answers)) text = answerQuestion(text, id, answer);
  writeFileSync(specFile(project, dir), text);
}

/** Asserts that `patterns` match in `text` in this order; returns the match positions. */
export function expectInOrder(text: string, patterns: RegExp[]): number[] {
  const positions: number[] = [];
  let from = 0;
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    re.lastIndex = from;
    const match = re.exec(text);
    expect(match, `expected ${pattern} after position ${from} in:\n${text}`).not.toBeNull();
    positions.push(match!.index);
    from = match!.index + Math.max(match![0].length, 1);
  }
  return positions;
}

/** A step line marked done. */
export const DONE = /✓|✔|\bdone\b/i;
/** A step line marked failed. */
export const FAILED = /✗|✘|×|\bfail(ed|s|ure)?\b/i;

export function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function appendFile(file: string, text: string): void {
  appendFileSync(file, text);
}
