import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  BRIEF_PATH,
  FLOW_COMMAND,
  SPEC_COMMAND,
  createProject,
  expectOneNewSpecDir,
  run,
  setAgent,
  snapshot,
  specDirs,
  specFile,
  validSpec,
} from "./harness.ts";

const T = 60_000;

describe("spec folder creation", () => {
  test("creates spec.md in exactly one new subfolder of specs", { tags: ["AC-001"], timeout: T }, () => {
    const project = createProject();
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const dir = expectOneNewSpecDir(project);
    expect(existsSync(specFile(project, dir))).toBe(true);
  });

  test("complete flow writes only inside specs, .doppelblind and .doppelblind.conf", { tags: ["AC-002"], timeout: T }, () => {
    const project = createProject({ files: { "README.md": "# Project\n", "src/app.txt": "app\n" } });
    const excluded = ["specs", ".doppelblind", ".doppelblind.conf", ".git"];
    const before = snapshot(project.root, excluded);
    run(project, [...FLOW_COMMAND, BRIEF_PATH]);
    const dir = expectOneNewSpecDir(project);
    expect(existsSync(specFile(project, dir))).toBe(true);
    expect(snapshot(project.root, excluded)).toEqual(before);
  });

  test("accepts the absolute path of the brief", { tags: ["AC-003"], timeout: T }, () => {
    const project = createProject();
    run(project, [...SPEC_COMMAND, path.join(project.root, BRIEF_PATH)]);
    const dir = expectOneNewSpecDir(project);
    expect(existsSync(specFile(project, dir))).toBe(true);
  });

  test("resolves the brief from a subdirectory and writes into the root specs folder", { tags: ["AC-004"], timeout: T }, () => {
    const project = createProject();
    run(project, [...SPEC_COMMAND, "briefs/x.md"], { cwd: path.join(project.root, "docs") });
    const dir = expectOneNewSpecDir(project);
    expect(existsSync(specFile(project, dir))).toBe(true);
    expect(existsSync(path.join(project.root, "docs", "specs"))).toBe(false);
  });

  test("numbers the first spec folder 001- when there is no specs folder", { tags: ["AC-009"], timeout: T }, () => {
    const project = createProject();
    expect(existsSync(path.join(project.root, "specs"))).toBe(false);
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const dir = expectOneNewSpecDir(project);
    expect(dir.startsWith("001-")).toBe(true);
  });

  test("numbers the first spec folder 001- when the specs folder is empty", { tags: ["AC-009"], timeout: T }, () => {
    const project = createProject();
    mkdirSync(path.join(project.root, "specs"));
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const dir = expectOneNewSpecDir(project);
    expect(dir.startsWith("001-")).toBe(true);
  });

  test("numbers after the highest numbered subfolder and leaves other entries alone", { tags: ["AC-010"], timeout: T }, () => {
    const project = createProject();
    const specs = path.join(project.root, "specs");
    for (const d of ["001-a", "003-b", "notes"]) {
      mkdirSync(path.join(specs, d), { recursive: true });
      writeFileSync(path.join(specs, d, d === "notes" ? "todo.md" : "spec.md"), `# ${d}\n`);
    }
    writeFileSync(path.join(specs, "007-x.md"), "# a file, not a folder\n");
    const before = snapshot(specs);
    const existing = specDirs(project.root);
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const dir = expectOneNewSpecDir(project, existing);
    expect(dir.startsWith("004-")).toBe(true);
    const after = snapshot(specs);
    for (const [entry, content] of Object.entries(before)) expect(after[entry], entry).toEqual(content);
    const preserved = Object.keys(after).filter((k) => !k.startsWith(`${dir}`));
    expect(preserved.sort()).toEqual(Object.keys(before).sort());
  });

  test("names the folder after the short name the spec agent gives", { tags: ["AC-011"], timeout: T }, () => {
    const project = createProject();
    setAgent(project, { spec: validSpec({ short_name: "brief-to-spec" }) });
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    expect(specDirs(project.root)).toEqual(["001-brief-to-spec"]);
  });
});
