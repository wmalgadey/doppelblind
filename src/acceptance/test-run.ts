import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Contract } from "../contract.ts";

export interface TestFileResult {
  file: string;
  criterion: string;
  exitCode: number | null;
  timedOut: boolean;
  /** The tail of what the command printed. */
  output: string;
}

const OUTPUT_TAIL = 4_000;

/**
 * The command that runs one test file: the contract's `testCommand`, or else the project's npm test script.
 * Undefined if the project declares neither.
 */
export function testCommand(contract: Contract): string | undefined {
  if (contract.testCommand) return contract.testCommand;
  const pkg = path.join(contract.root, "package.json");
  if (!existsSync(pkg)) return undefined;
  try {
    return JSON.parse(readFileSync(pkg, "utf8")).scripts?.test ? "npm test -- {file}" : undefined;
  } catch {
    return undefined;
  }
}

/** Runs `command` for one test file from the project root; the exit code decides, never an agent's account. */
export function runTestFile(root: string, command: string, file: string, criterion: string, timeoutMs: number): Promise<TestFileResult> {
  const quoted = `'${file.replaceAll("'", `'\\''`)}'`;
  const line = command.includes("{file}") ? command.replaceAll("{file}", quoted) : `${command} ${quoted}`;
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
      resolve({ file, criterion, exitCode, timedOut, output });
    };
    child.on("error", (err) => {
      output += err.message;
      finish(null);
    });
    child.on("close", finish);
  });
}

/** A test file passes when its command exits with 0 in time. */
export function passes(result: TestFileResult): boolean {
  return result.exitCode === 0 && !result.timedOut;
}
