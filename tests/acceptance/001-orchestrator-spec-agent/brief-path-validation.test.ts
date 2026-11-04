import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { BRIEF } from "../../../test/helpers.ts";
import { BRIEF_PATH, SPEC_COMMAND, agentInvocations, createProject, run, walk } from "./harness.ts";

const T = 60_000;

function expectNothingInSpecs(root: string): void {
  const tree = walk(path.join(root, "specs"));
  expect([...tree.dirs, ...tree.files]).toEqual([]);
}

describe("brief path validation", () => {
  test("without a brief path it names the missing path and shows the usage", { tags: ["AC-005"], timeout: T }, () => {
    const project = createProject();
    const result = run(project, [...SPEC_COMMAND]);
    expect(agentInvocations(project)).toHaveLength(0);
    expect(result.output).toMatch(/usage/i);
    expect(result.output).toMatch(/brief/i);
    expect(result.output).toMatch(/missing|required|expected|no brief/i);
    expectNothingInSpecs(project.root);
  });

  test("rejects a brief path that does not exist", { tags: ["AC-006"], timeout: T }, () => {
    const project = createProject();
    const result = run(project, [...SPEC_COMMAND, "docs/briefs/missing.md"]);
    expect(agentInvocations(project)).toHaveLength(0);
    expect(result.output).toMatch(/not exist|no such|not found|missing/i);
    expectNothingInSpecs(project.root);
  });

  test("rejects a brief path that is a directory", { tags: ["AC-006"], timeout: T }, () => {
    const project = createProject();
    const result = run(project, [...SPEC_COMMAND, "docs/briefs"]);
    expect(agentInvocations(project)).toHaveLength(0);
    expect(result.output).toMatch(/director/i);
    expectNothingInSpecs(project.root);
  });

  test("rejects a brief file that cannot be read", { tags: ["AC-006"], timeout: T }, () => {
    const project = createProject();
    chmodSync(path.join(project.root, BRIEF_PATH), 0o000);
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    chmodSync(path.join(project.root, BRIEF_PATH), 0o644);
    expect(agentInvocations(project)).toHaveLength(0);
    expect(result.output).toMatch(/cannot read|can't read|could not read|unreadable|not readable|permission|EACCES|access/i);
    expectNothingInSpecs(project.root);
  });

  test("rejects a brief file outside the git repository", { tags: ["AC-006"], timeout: T }, () => {
    const project = createProject();
    const outside = path.join(mkdtempSync(path.join(tmpdir(), "doppelblind-outside-")), "brief.md");
    writeFileSync(outside, BRIEF);
    const result = run(project, [...SPEC_COMMAND, outside]);
    expect(agentInvocations(project)).toHaveLength(0);
    expect(result.output).toMatch(/outside|not (in|inside|within|part of)\b/i);
    expectNothingInSpecs(project.root);
  });
});
