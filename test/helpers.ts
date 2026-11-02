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

export function recordingUi(): RecordingUi {
  const events: string[] = [];
  return {
    events,
    banner: () => events.push("banner"),
    note: (text) => events.push(`note: ${text}`),
    step(label): Step {
      events.push(`start: ${label}`);
      return {
        done: (detail) => events.push(`done: ${label}${detail ? ` (${detail})` : ""}`),
        fail: () => events.push(`fail: ${label}`),
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
    criteria: [
      {
        id: "AC-01",
        title: "Greeter greets",
        given: "the greeter is installed",
        when: "I run it",
        then: "it prints a greeting",
        sources: [{ path: "docs/briefs/greeting.md", anchor: "## Walkthrough" }],
      },
    ],
    wishes: ["A colourful greeting."],
    open_questions: [{ id: "Q-01", question: "Which words does the greeting use?", context: "AC-01" }],
    ...overrides,
  };
}
