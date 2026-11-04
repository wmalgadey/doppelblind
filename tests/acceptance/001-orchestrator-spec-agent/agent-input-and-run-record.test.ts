import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  BRIEF_MARKER,
  BRIEF_PATH,
  COMPLETE_CONF,
  RUN_LOG_MARKER,
  SPEC_COMMAND,
  agentInvocations,
  createProject,
  doppelblindFoldersHolding,
  newDoppelblindTexts,
  recordedInput,
  run,
} from "./harness.ts";

const T = 60_000;

describe("spec agent input and run record", () => {
  test("the spec agent starts in an empty working directory outside the repository", { tags: ["AC-016"], timeout: T }, () => {
    const project = createProject();
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const calls = agentInvocations(project);
    expect(calls.length).toBeGreaterThan(0);
    const { cwd, entries } = calls[0];
    expect(entries).toEqual([]);
    const relative = path.relative(project.root, cwd);
    const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    expect(inside).toBe(false);
  });

  test("the recorded input holds the brief and declared sources but not undeclared files", { tags: ["AC-017"], timeout: T }, () => {
    const project = createProject({
      conf: `${COMPLETE_CONF}spec_sources = docs/product.md\n`,
      files: {
        "docs/product.md": "# Product\n\nPRODUCT-MARKER-4b1e: the greeter is a command line tool.\n",
        "docs/other.md": "# Other\n\nOTHER-MARKER-9c2d: this must stay hidden.\n",
      },
    });
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const input = recordedInput(project);
    expect(input).toContain(BRIEF_MARKER);
    expect(input).toContain("PRODUCT-MARKER-4b1e: the greeter is a command line tool.");
    const everything = newDoppelblindTexts(project).map((f) => f.text).join("\n");
    expect(everything).not.toContain("OTHER-MARKER-9c2d");
  });

  test("the run folder in .doppelblind holds the agent input with the brief and the agent CLI run log", { tags: ["AC-018"], timeout: T }, () => {
    const project = createProject();
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const withInput = doppelblindFoldersHolding(project, BRIEF_MARKER);
    const withLog = doppelblindFoldersHolding(project, RUN_LOG_MARKER);
    expect(withInput.filter((d) => withLog.includes(d)).length).toBeGreaterThan(0);
  });
});
