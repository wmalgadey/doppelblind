import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DoppelblindError } from "../errors.ts";

export const STATUSES = ["passed", "failed", "skipped"] as const;
export type TestStatus = (typeof STATUSES)[number];

/**
 * One test in the test result Doppelblind reads, whatever the framework: a JSON list of these. `file` is a project
 * path, `name` the test's full name, `criterion` the criterion ID its marking names, or null when it has none.
 */
export interface TestResult {
  file: string;
  name: string;
  criterion: string | null;
  status: TestStatus;
}

/** What the orchestrator's own run of the report command produced. */
export interface ReportRun {
  /** The command line as it ran. */
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  /** The tail of what the command printed. */
  output: string;
  results: TestResult[];
}

const OUTPUT_TAIL = 4_000;

/** Checks that `raw` is a test result and returns its tests; stops with a message naming each wrong entry. */
export function parseResults(raw: unknown, source: string): TestResult[] {
  if (!Array.isArray(raw)) throw new DoppelblindError(`${source} is not a test result: it must hold a JSON list of tests.`);
  const problems: string[] = [];
  raw.forEach((t, i) => {
    const at = `entry ${i + 1}`;
    if (typeof t !== "object" || t === null || Array.isArray(t)) return problems.push(`${at} is not an object.`);
    const { file, name, criterion, status } = t as Record<string, unknown>;
    if (typeof file !== "string" || file === "") problems.push(`${at}: "file" must be a path.`);
    if (typeof name !== "string" || name === "") problems.push(`${at}: "name" must be the test's name.`);
    if (criterion !== null && (typeof criterion !== "string" || criterion === "")) problems.push(`${at}: "criterion" must be a criterion ID or null.`);
    if (!STATUSES.includes(status as TestStatus)) problems.push(`${at}: "status" must be one of ${STATUSES.join(", ")}.`);
  });
  if (problems.length > 0) throw new DoppelblindError(`${source} is not a valid test result.`, problems);
  return (raw as TestResult[]).map(({ file, name, criterion, status }) => ({ file: path.posix.normalize(file).replace(/^\.\//, ""), name, criterion, status }));
}

/**
 * Runs the contract's report command for the acceptance tests in `folder`, from the project root, and reads the test
 * result it writes to `outputFile`. The result file decides, never an agent's account; the command's exit code does
 * not, since tests are expected to fail before any implementation.
 */
export async function runReport(root: string, command: string, folder: string, outputFile: string, timeoutMs: number): Promise<ReportRun> {
  const line = command.replaceAll("{folder}", quote(folder)).replaceAll("{output}", quote(outputFile));
  const run = await spawnLine(root, line, timeoutMs);
  const details = [`command: ${line}`, `exit code: ${run.exitCode}`, ...tail(run.output)];
  if (run.timedOut) {
    throw new DoppelblindError(`The report command did not finish within ${Math.round(timeoutMs / 1000)} seconds.`, details);
  }
  if (!existsSync(outputFile)) throw new DoppelblindError(`The report command wrote no test result to ${outputFile}.`, details);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(outputFile, "utf8"));
  } catch (err) {
    throw new DoppelblindError(`${outputFile} is not valid JSON.`, [(err as Error).message, ...details]);
  }
  return { command: line, ...run, results: parseResults(raw, outputFile) };
}

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function tail(output: string): string[] {
  return output.trim() === "" ? [] : ["output:", ...output.trimEnd().split("\n").slice(-20)];
}

function spawnLine(root: string, line: string, timeoutMs: number): Promise<Omit<ReportRun, "command" | "results">> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", line], { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let output = "";
    let timedOut = false;
    const collect = (chunk: Buffer) => (output = (output + chunk.toString()).slice(-OUTPUT_TAIL));
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL"); // the whole process group: the shell and the test runner it started
      } catch {
        // already gone
      }
    }, timeoutMs);
    const finish = (exitCode: number | null) => {
      clearTimeout(timer);
      resolve({ exitCode, timedOut, output });
    };
    child.on("error", (err) => {
      output += err.message;
      finish(null);
    });
    child.on("close", finish);
  });
}
