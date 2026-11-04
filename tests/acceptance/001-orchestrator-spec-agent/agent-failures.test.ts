import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  BRIEF_MARKER,
  BRIEF_PATH,
  CHOOSE_RERUN,
  FAILED,
  type Project,
  type RunResult,
  SPEC_COMMAND,
  createProject,
  criterion,
  doppelblindFiles,
  doppelblindFoldersHolding,
  errorEnvelope,
  expectOneNewSpecDir,
  lines,
  newDoppelblindTexts,
  run,
  runAndInterrupt,
  setAgent,
  specDirs,
  specFile,
  validSpec,
} from "./harness.ts";

const T = 90_000;

function failAgent(project: Project): void {
  setAgent(project, { stdout: errorEnvelope("agent crashed"), stderr: "agent crashed\n", exit: 1 });
}

function hangAgent(project: Project): void {
  setAgent(project, { spec: validSpec(), sleepMs: 30_000 });
}

/** Runs the spec command once successfully so that the brief has a spec folder with a spec.md. */
function withExistingSpec(project: Project): { dir: string; bytes: Buffer } {
  run(project, [...SPEC_COMMAND, BRIEF_PATH]);
  const dir = expectOneNewSpecDir(project);
  return { dir, bytes: readFileSync(specFile(project, dir)) };
}

function expectInputRecorded(project: Project, before: string[]): void {
  const recorded = newDoppelblindTexts(project, before).filter((f) => f.text.includes(BRIEF_MARKER));
  expect(recorded.length).toBeGreaterThan(0);
}

function failedLine(result: RunResult, step: RegExp): number {
  const out = lines(result.stderr);
  const index = out.findIndex((l) => step.test(l) && FAILED.test(l));
  expect(index, `no failed line for ${step} in:\n${result.stderr}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("agent CLI failures", () => {
  test("an agent CLI that is not logged in fails the spec-agent step and names the run folder", { tags: ["AC-024"], timeout: T }, () => {
    const project = createProject();
    setAgent(project, { stdout: errorEnvelope("not logged in"), stderr: "not logged in\n", exit: 1 });
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    failedLine(result, /spec/i);
    expect(result.output).toContain("not logged in");
    const folders = doppelblindFoldersHolding(project, BRIEF_MARKER);
    expect(folders.length).toBeGreaterThan(0);
    expect(folders.some((f) => result.output.includes(f) || result.output.includes(path.join(project.root, f)))).toBe(true);
  });

  test("a failing agent CLI creates no spec folder and keeps the recorded input", { tags: ["AC-025"], timeout: T }, () => {
    const project = createProject();
    failAgent(project);
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    expect(specDirs(project.root)).toEqual([]);
    expectInputRecorded(project, []);
  });

  test("an interrupted agent CLI creates no spec folder and keeps the recorded input", { tags: ["AC-025"], timeout: T }, async () => {
    const project = createProject();
    hangAgent(project);
    await runAndInterrupt(project, [...SPEC_COMMAND, BRIEF_PATH]);
    expect(specDirs(project.root)).toEqual([]);
    expectInputRecorded(project, []);
  });

  test("a failing agent CLI leaves an existing spec.md byte-for-byte unchanged", { tags: ["AC-025"], timeout: T }, () => {
    const project = createProject();
    const { dir, bytes } = withExistingSpec(project);
    const before = doppelblindFiles(project);
    failAgent(project);
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(specDirs(project.root)).toEqual([dir]);
    expect(readFileSync(specFile(project, dir)).equals(bytes)).toBe(true);
    expectInputRecorded(project, before);
  });

  test("an interrupted agent CLI leaves an existing spec.md byte-for-byte unchanged", { tags: ["AC-025"], timeout: T }, async () => {
    const project = createProject();
    const { dir, bytes } = withExistingSpec(project);
    const before = doppelblindFiles(project);
    hangAgent(project);
    await runAndInterrupt(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(specDirs(project.root)).toEqual([dir]);
    expect(readFileSync(specFile(project, dir)).equals(bytes)).toBe(true);
    expectInputRecorded(project, before);
  });

  test("output without a source for a criterion fails validation and creates no spec folder", { tags: ["AC-026"], timeout: T }, () => {
    const project = createProject();
    const { sources: _dropped, ...withoutSource } = criterion(1);
    setAgent(project, { spec: validSpec({ criteria: [withoutSource as never] }) });
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const index = failedLine(result, /validat/i);
    expect(lines(result.stderr).slice(index).join("\n")).toMatch(/source/i);
    expect(specDirs(project.root)).toEqual([]);
  });

  test("output without a source for a criterion leaves an existing spec.md unchanged", { tags: ["AC-026"], timeout: T }, () => {
    const project = createProject();
    const { dir, bytes } = withExistingSpec(project);
    const { sources: _dropped, ...withoutSource } = criterion(1);
    setAgent(project, { spec: validSpec({ title: "Should never be written", criteria: [withoutSource as never] }) });
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    const index = failedLine(result, /validat/i);
    expect(lines(result.stderr).slice(index).join("\n")).toMatch(/source/i);
    expect(specDirs(project.root)).toEqual([dir]);
    expect(readFileSync(specFile(project, dir)).equals(bytes)).toBe(true);
  });
});
