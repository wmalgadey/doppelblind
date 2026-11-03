import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SpecOutput } from "../src/roles/spec-agent/index.ts";
import type { Step, Ui } from "../src/tui.ts";

/** Creates a temporary project from a map of project-relative paths to file contents. */
export function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "doppelblind-test-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

export interface RecordingUi extends Ui {
  events: string[];
}

/** A UI that records what the flow reports and answers each choice with the next of `choices`. */
export function recordingUi(choices: string[] = []): RecordingUi {
  const events: string[] = [];
  return {
    events,
    banner: () => events.push("banner"),
    note: (text) => events.push(`note: ${text}`),
    async choose(question, options, details = []) {
      for (const d of details) events.push(`detail: ${d}`);
      const choice = choices.shift();
      if (choice === undefined || !options.includes(choice)) throw new Error(`unexpected choice for "${question}": ${choice}`);
      events.push(`choose: ${question} -> ${choice}`);
      return choice;
    },
    step(label): Step {
      events.push(`start: ${label}`);
      return {
        update: (detail) => events.push(`update: ${label} (${detail})`),
        done: (detail) => events.push(`done: ${label}${detail ? ` (${detail})` : ""}`),
        fail: (reason) => events.push(`fail: ${label}${reason ? ` (${reason})` : ""}`),
      };
    },
  };
}

export const BRIEF = `# Greeting

## Outcome

OUT-01. I can be greeted.

## Walkthrough

1. I run the greeter.
`;

export function sampleSpec(overrides: Partial<SpecOutput> = {}): SpecOutput {
  return {
    title: "Grüße für alle",
    short_name: "greet-everyone",
    introduction: "Everyone who runs the greeter gets greeted. Colours are not part of this change.",
    criteria: [
      {
        id: "AC-001",
        title: "Greeter greets",
        reason_in_source: "Being greeted is the outcome the brief advances.",
        reason_anchor: "I can be greeted.",
        given: "the greeter is installed",
        when: "I run it",
        then: "it prints a greeting",
        rejects: "A greeter that exits without output fails, because it prints no greeting.",
        proven_by: "test",
        sources: [{ path: "docs/briefs/greeting.md", anchor: "## Walkthrough" }],
      },
    ],
    wishes: ["A colourful greeting."],
    open_questions: [{ id: "Q-01", question: "Which words does the greeting use?", concerns: ["AC-001"], context: "I run the greeter." }],
    ...overrides,
  };
}
