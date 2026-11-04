import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { BRIEF_PATH, SPEC_COMMAND, createProject, run, specDirs, walk } from "./harness.ts";

const T = 60_000;

describe("project configuration", () => {
  test("creates .doppelblind.conf at the repository root when there is none", { tags: ["AC-007"], timeout: T }, () => {
    const project = createProject({ conf: null });
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    expect(existsSync(path.join(project.root, ".doppelblind.conf"))).toBe(true);
  });

  test("fails without creating a spec when the configuration declares no specs folder", { tags: ["AC-008"], timeout: T }, () => {
    const project = createProject({ conf: "# no specs folder declared\n" });
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    expect(result.status).not.toBe(0);
    expect(specDirs(project.root)).toEqual([]);
    const specMds = walk(project.root, [".git"]).files.filter((f) => path.posix.basename(f) === "spec.md");
    expect(specMds).toEqual([]);
  });
});
