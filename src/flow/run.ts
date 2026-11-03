import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TRACE_FILE, type AgentProgress, type AgentRequest } from "../agent/claude.ts";
import { AgentLimitError, DoppelblindError } from "../errors.ts";
import { STATE_DIR } from "../spec/state.ts";
import type { Step, Ui } from "../tui.ts";

/** The limits and boundaries a run was started with, kept in its run folder. */
export const GUARDRAILS_FILE = "guardrails.json";

export type Limits = Pick<AgentRequest, "timeoutMs" | "maxBudgetUsd" | "maxTurns">;

/** Runs `fn` as one step of the TUI: done with `detail` of its result, or failed with the reason. `fn` may update the step. */
export async function step<T>(ui: Ui, label: string, fn: (s: Step) => T | Promise<T>, detail?: (result: T) => string): Promise<T> {
  const s = ui.step(label);
  try {
    const result = await fn(s);
    s.done(detail?.(result));
    return result;
  } catch (err) {
    s.fail(err instanceof Error ? err.message : String(err));
    if (err instanceof DoppelblindError) err.shown = true;
    throw err;
  }
}

/**
 * Runs `attempt`; when it reaches its time or cost limit, asks the user whether to double that limit and run it
 * again. The turn limit is never raised: reaching it fails the run.
 */
export async function runAgentWithLimitChoice<T>(ui: Ui, initial: Limits, attempt: (limits: Limits) => Promise<T>): Promise<T> {
  const limits = { ...initial };
  while (true) {
    try {
      return await attempt({ ...limits });
    } catch (err) {
      if (!(err instanceof AgentLimitError) || err.limit === "turns") throw err;
      const current = err.limit === "time" ? limits.timeoutMs : limits.maxBudgetUsd;
      const increased = current * 2;
      const answer = await ui.choose(
        `Agent reached the ${err.limit === "time" ? "time" : "cost"} limit (${formatLimit(err.limit, current)}). ` +
          `Increase it to ${formatLimit(err.limit, increased)} and retry?`,
        ["yes", "no"],
      );
      if (answer !== "yes") throw err;
      if (err.limit === "time") limits.timeoutMs = increased;
      else limits.maxBudgetUsd = increased;
    }
  }
}

function formatLimit(limit: "time" | "budget", value: number): string {
  if (limit === "budget") return `$${value.toFixed(2)}`;
  const minutes = value / 60_000;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Starts a run folder in the project's run state with the agent's prompt, input and guardrails,
 * which the agent completes with its call and trace, so any run can be inspected.
 */
export function startRunLog(root: string, role: string, request: AgentRequest, guardrails: object = {}): string {
  const base = path.join(root, STATE_DIR, "runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-${role}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "system-prompt.md"), request.systemPrompt);
  writeFileSync(path.join(dir, "input.md"), request.userMessage);
  const limits = { timeoutMs: request.timeoutMs, maxBudgetUsd: request.maxBudgetUsd, maxTurns: request.maxTurns ?? null };
  const tools = request.tools ?? [];
  writeFileSync(path.join(dir, GUARDRAILS_FILE), JSON.stringify({ ...limits, tools, ...guardrails }, null, 2) + "\n");
  writeFileSync(path.join(dir, TRACE_FILE), "");
  return dir;
}

/** Adds the trace's path to an expected failure of `fn`. */
export async function withLog<T>(log: string, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DoppelblindError) err.details.push(`Agent trace: ${log}`);
    throw err;
  }
}

/** Reports an agent's progress on its running step, e.g. `turn 3 · Write tests/acceptance/001-x/ac-001.test.ts`. */
export function showProgress(s: Step): (progress: AgentProgress) => void {
  return (p) => s.update([`turn ${p.turns}`, ...(p.action ? [p.action] : [])].join(" · "));
}

export function describeCost(response: { costUsd?: number; durationMs?: number }): string {
  const parts = [];
  if (response.durationMs !== undefined) parts.push(`${Math.round(response.durationMs / 1000)}s`);
  if (response.costUsd !== undefined) parts.push(`$${response.costUsd.toFixed(2)}`);
  return parts.join(", ");
}
