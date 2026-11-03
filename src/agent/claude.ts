import { spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentLimitError, DoppelblindError } from "../errors.ts";
import { sandboxCall } from "./sandbox.ts";

export interface AgentRequest {
  systemPrompt: string;
  userMessage: string;
  /** JSON Schema the agent's structured output must satisfy. */
  schema: object;
  timeoutMs: number;
  maxBudgetUsd: number;
  /** Most turns the agent may take; unbounded when omitted. */
  maxTurns?: number;
  /**
   * Built-in tools the agent may use, e.g. `Read` or `Write`; none when omitted. Edits are accepted only inside
   * `workdir`, reads outside it are denied: a second line behind the sandbox.
   */
  tools?: string[];
  /**
   * The directory the agent works in. When given, the agent runs sandboxed: this directory is all it sees
   * of the project, and it is kept after the run. Otherwise it runs in an empty temporary directory.
   */
  workdir?: string;
  /** Folder the run is archived in: the call in `call.json`, every event in `trace.jsonl`. */
  runDir?: string;
}

export const CALL_FILE = "call.json";
export const TRACE_FILE = "trace.jsonl";

export interface AgentResponse {
  /** Structured output as returned by the CLI; not yet validated. */
  output: unknown;
  costUsd?: number;
  durationMs?: number;
}

export type Agent = (request: AgentRequest) => Promise<AgentResponse>;

/**
 * Runs Claude Code headless with no settings, no project files and the role's own system prompt.
 * Without `workdir` it has no tools and runs in an empty working directory, so it sees only `userMessage`;
 * with `workdir` it runs in a sandbox that holds only that directory, with the tools the request names.
 * The CLI streams its events, so the trace grows while the agent works and survives a failed run.
 * The call — binary, arguments, working directory, stdin, limits — is archived before it starts and
 * completed with its exit when it ends.
 */
export const runClaude: Agent = async (request) => {
  // path of the Claude Code CLI; harness settings do not come from the project
  const bin = process.env.DOPPELBLIND_CLAUDE_BIN || "claude";
  const workdir = request.workdir ?? mkdtempSync(path.join(tmpdir(), "doppelblind-agent-"));
  const tools = request.tools ?? [];
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
    "--json-schema", JSON.stringify(request.schema),
    "--system-prompt", request.systemPrompt,
    "--tools", tools.join(","),
    ...(tools.length > 0 ? ["--permission-mode", "acceptEdits"] : []),
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--max-budget-usd", String(request.maxBudgetUsd),
    ...(request.maxTurns === undefined ? [] : ["--max-turns", String(request.maxTurns)]),
  ];
  const sandbox = request.workdir === undefined ? undefined : sandboxCall(bin, args, workdir);
  const { runDir } = request;
  const call: Record<string, unknown> = {
    bin,
    args,
    ...(sandbox && { sandbox: { bin: sandbox.bin, args: sandbox.args.slice(0, sandbox.args.indexOf("--")) } }),
    cwd: workdir,
    stdin: request.userMessage,
    timeoutMs: request.timeoutMs,
    startedAt: new Date().toISOString(),
  };
  const archive = () => runDir && writeFileSync(path.join(runDir, CALL_FILE), JSON.stringify(call, null, 2) + "\n");
  archive();
  const trace = runDir ? openSync(path.join(runDir, TRACE_FILE), "a") : undefined;
  const onStdout = trace === undefined ? undefined : (chunk: string) => writeSync(trace, chunk);
  try {
    const { stdout, stderr, code } = await run(sandbox?.bin ?? bin, sandbox?.args ?? args, workdir, request.userMessage, request.timeoutMs, onStdout);
    Object.assign(call, { endedAt: new Date().toISOString(), exitCode: code, stderr });
    return parseResponse(stdout, stderr, code);
  } catch (err) {
    call.endedAt ??= new Date().toISOString();
    call.error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    if (trace !== undefined) closeSync(trace);
    archive();
    sandbox?.cleanup();
    if (request.workdir === undefined) rmSync(workdir, { recursive: true, force: true });
  }
};

/** Reads the result event from the CLI's stream of JSON lines. */
export function parseResponse(stdout: string, stderr: string, code: number | null): AgentResponse {
  const result = stdout.split("\n").map(parseLine).findLast((event) => event?.type === "result");
  if (!result) {
    const detail = (stderr || stdout).trim().split("\n").slice(-5);
    throw new DoppelblindError(`Agent CLI exited with code ${code} and no JSON result.`, detail);
  }
  if (result.is_error || result.subtype !== "success") {
    const reason = typeof result.result === "string" ? result.result : String(result.subtype);
    if (result.subtype === "error_max_budget_usd") {
      throw new AgentLimitError("budget", "Agent run failed.", [reason]);
    }
    if (result.subtype === "error_max_turns") {
      throw new AgentLimitError("turns", "Agent reached its turn limit.", [reason]);
    }
    throw new DoppelblindError("Agent run failed.", [reason]);
  }
  if (code !== 0) {
    throw new DoppelblindError(`Agent CLI exited with code ${code} after a successful result.`, stderr.trim().split("\n").slice(-5));
  }
  if (result.structured_output === undefined) {
    throw new DoppelblindError("Agent returned no structured output.");
  }
  return {
    output: result.structured_output,
    costUsd: typeof result.total_cost_usd === "number" ? result.total_cost_usd : undefined,
    durationMs: typeof result.duration_ms === "number" ? result.duration_ms : undefined,
  };
}

function parseLine(line: string): Record<string, unknown> | undefined {
  try {
    const event = JSON.parse(line);
    return typeof event === "object" && event !== null ? event : undefined;
  } catch {
    return undefined;
  }
}

function run(bin: string, args: string[], cwd: string, input: string, timeoutMs: number, onStdout?: (chunk: string) => void) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = new AgentLimitError("time", `Agent did not finish within ${Math.round(timeoutMs / 1000)}s.`);
    const clearTimers = () => {
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };
    const rejectOnce = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(err);
    };
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        child.kill("SIGKILL");
        rejectOnce(timeoutError);
      }, 1_000);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (settled) return; // the trace is closed once the run was given up
      stdout += chunk;
      onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err: NodeJS.ErrnoException) => {
      rejectOnce(timedOut ? timeoutError : err.code === "ENOENT"
          ? new DoppelblindError(`Agent CLI not found: ${bin}`, ["Install Claude Code or set DOPPELBLIND_CLAUDE_BIN."])
          : err);
    });
    child.on("close", (code) => {
      if (timedOut) rejectOnce(timeoutError);
      else if (!settled) {
        settled = true;
        clearTimers();
        resolve({ stdout, stderr, code });
      }
    });
    child.stdin.on("error", () => {}); // the child may exit before reading its input
    child.stdin.end(input);
  });
}
