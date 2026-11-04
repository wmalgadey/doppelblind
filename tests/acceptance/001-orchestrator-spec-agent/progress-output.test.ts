import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  BRIEF_PATH,
  DONE,
  SPEC_COMMAND,
  createProject,
  criterion,
  expectOneNewSpecDir,
  lines,
  question,
  run,
  setAgent,
  validSpec,
} from "./harness.ts";

const T = 60_000;

describe("progress output", () => {
  test("standard error shows each spec step done, in order", { tags: ["AC-019"], timeout: T }, () => {
    const project = createProject();
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const done = lines(result.stderr).filter((l) => DONE.test(l));
    const steps = [/brief/i, /source/i, /spec/i, /validat/i, /criteri|citation/i];
    let from = 0;
    for (const step of steps) {
      const index = done.findIndex((l, i) => i >= from && step.test(l));
      expect(index, `no done line for ${step} after line ${from} in:\n${result.stderr}`).toBeGreaterThanOrEqual(0);
      from = index + 1;
    }
  });

  test("the final output shows the criteria and open question counts and the spec.md path", { tags: ["AC-021"], timeout: T }, () => {
    const project = createProject();
    setAgent(project, {
      spec: validSpec({
        criteria: [criterion(1), criterion(2), criterion(3), criterion(4)],
        open_questions: [question(1), question(2)],
      }),
    });
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const dir = expectOneNewSpecDir(project);
    const out = lines(result.stderr);
    expect(out.some((l) => /criteri/i.test(l) && /(^|\D)4(\D|$)/.test(l)), result.stderr).toBe(true);
    expect(out.some((l) => /question/i.test(l) && /(^|\D)2(\D|$)/.test(l)), result.stderr).toBe(true);
    expect(result.stderr).toContain(`specs/${dir}/spec.md`);
  });

  test("standard output holds only the spec.md path when piped", { tags: ["AC-022"], timeout: T }, () => {
    const project = createProject();
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const dir = expectOneNewSpecDir(project);
    const relative = `specs/${dir}/spec.md`;
    expect([relative, path.join(project.root, relative)]).toContain(result.stdout.trim());
    expect(result.stdout.replace(/\n$/, "")).not.toContain("\n");
    expect(result.stderr).toMatch(/validat/i);
  });

  test("standard error redirected to a file has no cursor control sequences or spinner frames", { tags: ["AC-023"], timeout: T }, () => {
    const project = createProject();
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH], { stderrToFile: true });
    expectOneNewSpecDir(project);
    expect(result.stderr.trim()).not.toBe("");
    expect(result.stderr).not.toMatch(/\x1b\[[0-9;?]*[ABCDEFGHJKSTfsu]/);
    expect(result.stderr).not.toMatch(/\x1b[78]/);
    expect(result.stderr).not.toContain("\r");
    expect(result.stderr).not.toMatch(/[⠀-⣿◐◓◑◒◴◷◶◵]/);
  });
});
