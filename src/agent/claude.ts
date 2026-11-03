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
  /** Called while the agent works, after each event that changes its progress. */
  onProgress?: (progress: AgentProgress) => void;
}

/** How far a running agent has come, read from its stream of events. */
export interface AgentProgress {
  /** Assistant messages so far. */
  turns: number;
  /** The agent's last tool call, e.g. `Write tests/acceptance/001-x/ac-001.test.ts`; paths relative to its working directory. */
  action?: string;
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
  const events = new EventStream(workdir, request.onProgress);
  const onStdout = (chunk: string) => {
    if (trace !== undefined) writeSync(trace, chunk);
    events.push(chunk);
  };
  try {
    const { stderr, code } = await run(sandbox?.bin ?? bin, sandbox?.args ?? args, workdir, request.userMessage, request.timeoutMs, onStdout);
    const stdout = events.end();
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

/** Lines of stdout kept besides the result event, for the message when there is none. */
const TAIL_LINES = 5;
/** Characters of stderr kept; only its end is shown. */
const STDERR_LIMIT = 64 * 1024;

/**
 * Reads the CLI's stream of JSON lines as it arrives and keeps only what the run's answer needs: the last result
 * event and the last few lines. The full stream goes to the trace, never into memory.
 */
class EventStream {
  private partial = "";
  private result: string | undefined;
  private tail: string[] = [];
  private messages = new Set<unknown>();
  private progress: AgentProgress = { turns: 0 };

  private workdir: string;
  private onProgress: ((progress: AgentProgress) => void) | undefined;

  constructor(workdir: string, onProgress?: (progress: AgentProgress) => void) {
    this.workdir = workdir;
    this.onProgress = onProgress;
  }

  push(chunk: string): void {
    const lines = (this.partial + chunk).split("\n");
    this.partial = lines.pop()!;
    for (const line of lines) this.line(line);
  }

  /** The kept lines, as parseResponse reads them. */
  end(): string {
    if (this.partial) this.line(this.partial);
    this.partial = "";
    return [...this.tail, ...(this.result && !this.tail.includes(this.result) ? [this.result] : [])].join("\n");
  }

  private line(line: string): void {
    if (!line.trim()) return;
    this.tail = [...this.tail, line].slice(-TAIL_LINES);
    const event = parseLine(line);
    if (event?.type === "result") this.result = line;
    if (event?.type !== "assistant" || !this.onProgress) return;
    const message = event.message as { id?: unknown; content?: unknown } | undefined;
    const before = { ...this.progress };
    this.messages.add(message?.id ?? this.messages.size);
    this.progress.turns = this.messages.size;
    for (const block of Array.isArray(message?.content) ? message.content : []) {
      if (block?.type === "tool_use") this.progress.action = describeToolUse(block, this.workdir);
    }
    if (before.turns !== this.progress.turns || before.action !== this.progress.action) this.onProgress({ ...this.progress });
  }
}

/** A tool call as one short line: its name and the path or pattern it works on. */
function describeToolUse(block: { name?: unknown; input?: unknown }, workdir: string): string {
  const name = typeof block.name === "string" ? block.name : "tool";
  const input = (block.input ?? {}) as Record<string, unknown>;
  const target = [input.file_path, input.path, input.pattern].find((v): v is string => typeof v === "string");
  if (!target) return name;
  const relative = path.isAbsolute(target) ? path.relative(workdir, target) || "." : target;
  return `${name} ${relative.startsWith("..") ? target : relative}`;
}

function run(bin: string, args: string[], cwd: string, input: string, timeoutMs: number, onStdout: (chunk: string) => void) {
  return new Promise<{ stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
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
      onStdout(chunk);
    });
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-STDERR_LIMIT)));
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
        resolve({ stderr, code });
      }
    });
    child.stdin.on("error", () => {}); // the child may exit before reading its input
    child.stdin.end(input);
  });
}
