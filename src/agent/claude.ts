import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DoppelblindError } from "../errors.ts";

export interface AgentRequest {
  systemPrompt: string;
  userMessage: string;
  /** JSON Schema the agent's structured output must satisfy. */
  schema: object;
  timeoutMs: number;
  maxBudgetUsd: number;
  /** File every event of the run is appended to as it arrives, one JSON object per line. */
  trace?: string;
}

export interface AgentResponse {
  /** Structured output as returned by the CLI; not yet validated. */
  output: unknown;
  costUsd?: number;
  durationMs?: number;
}

export type Agent = (request: AgentRequest) => Promise<AgentResponse>;

/** Path of the Claude Code CLI; harness settings do not come from the project. */
export function claudeBin(): string {
  return process.env.DOPPELBLIND_CLAUDE_BIN || "claude";
}

/**
 * Runs Claude Code headless with no tools, no settings, no project files and the role's
 * own system prompt, in an empty working directory. The agent sees only `userMessage`.
 * The CLI streams its events, so the trace grows while the agent works and survives a failed run.
 */
export const runClaude: Agent = async (request) => {
  const workdir = mkdtempSync(path.join(tmpdir(), "doppelblind-agent-"));
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
    "--json-schema", JSON.stringify(request.schema),
    "--system-prompt", request.systemPrompt,
    "--tools", "",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--max-budget-usd", String(request.maxBudgetUsd),
  ];
  try {
    const onStdout = request.trace ? (chunk: string) => appendFileSync(request.trace!, chunk) : undefined;
    const { stdout, stderr, code } = await run(claudeBin(), args, workdir, request.userMessage, request.timeoutMs, onStdout);
    return parseResponse(stdout, stderr, code);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
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
    throw new DoppelblindError("Agent run failed.", [reason]);
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
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        err.code === "ENOENT"
          ? new DoppelblindError(`Agent CLI not found: ${bin}`, ["Install Claude Code or set DOPPELBLIND_CLAUDE_BIN."])
          : err,
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new DoppelblindError(`Agent did not finish within ${Math.round(timeoutMs / 1000)}s.`));
      else resolve({ stdout, stderr, code });
    });
    child.stdin.on("error", () => {}); // the child may exit before reading its input
    child.stdin.end(input);
  });
}
