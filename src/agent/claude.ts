import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
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
}

export interface AgentResponse {
  /** Structured output as returned by the CLI; not yet validated. */
  output: unknown;
  costUsd?: number;
  durationMs?: number;
  /** The CLI's complete stdout, kept for the run log. */
  raw: string;
}

export type Agent = (request: AgentRequest) => Promise<AgentResponse>;

/** Path of the Claude Code CLI; harness settings do not come from the project. */
export function claudeBin(): string {
  return process.env.DOPPELBLIND_CLAUDE_BIN || "claude";
}

/**
 * Runs Claude Code headless with no tools, no settings, no project files and the role's
 * own system prompt, in an empty working directory. The agent sees only `userMessage`.
 */
export const runClaude: Agent = async (request) => {
  const workdir = mkdtempSync(path.join(tmpdir(), "doppelblind-agent-"));
  const args = [
    "--print",
    "--output-format", "json",
    "--json-schema", JSON.stringify(request.schema),
    "--system-prompt", request.systemPrompt,
    "--tools", "",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--max-budget-usd", String(request.maxBudgetUsd),
  ];
  try {
    const { stdout, stderr, code } = await run(claudeBin(), args, workdir, request.userMessage, request.timeoutMs);
    return parseResponse(stdout, stderr, code);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
};

export function parseResponse(stdout: string, stderr: string, code: number | null): AgentResponse {
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(stdout);
  } catch {
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
    raw: stdout,
  };
}

function run(bin: string, args: string[], cwd: string, input: string, timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
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
