import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "vitest";
import { DoppelblindError } from "../src/errors.ts";
import { briefTarget, specTarget } from "../src/flow/target.ts";
import { makeProject } from "./helpers.ts";

const BRIEF = "docs/briefs/greeting.md";

function project(files: Record<string, string> = {}): string {
  return makeProject({
    ".doppelblind.conf": JSON.stringify({ sources: [], specs: "specs" }),
    ".doppelblind/specs.json": JSON.stringify({ [BRIEF]: { folder: "specs/002-greet-everyone" } }),
    [BRIEF]: "BRIEF",
    "docs/briefs/new.md": "NEW BRIEF",
    "specs/001-other/spec.md": "OTHER SPEC",
    "specs/002-greet-everyone/spec.md": "SPEC",
    ...files,
  });
}

describe("specTarget", () => {
  test("a number with or without leading zeros names the spec folder with that number", () => {
    const root = project();
    for (const n of ["2", "02", "002", "0002"]) assert.equal(specTarget(root, n), "specs/002-greet-everyone");
  });

  test("the folder is relative to the current directory", () => {
    const root = project();
    assert.equal(specTarget(path.join(root, "docs"), "2"), "../specs/002-greet-everyone");
  });

  test("a path is returned unchanged", () => {
    assert.equal(specTarget(project(), "specs/002-greet-everyone/spec.md"), "specs/002-greet-everyone/spec.md");
  });

  test("a number without a spec stops", () => {
    assert.throws(() => specTarget(project(), "7"), (e: DoppelblindError) => /No spec numbered 7/.test(e.message));
  });

  test("a number two spec folders share stops", () => {
    const root = project({ "specs/002-twin/spec.md": "TWIN" });
    assert.throws(() => specTarget(root, "2"), (e: DoppelblindError) => /More than one spec is numbered 2/.test(e.message));
  });
});

describe("briefTarget", () => {
  test("a spec number, folder or spec.md names the brief connected to it", () => {
    const root = project();
    for (const t of ["2", "002", "specs/002-greet-everyone", "specs/002-greet-everyone/spec.md"]) assert.equal(briefTarget(root, t), BRIEF);
  });

  test("a brief is returned as given, a new one too", () => {
    const root = project();
    assert.equal(briefTarget(root, BRIEF), BRIEF);
    assert.equal(briefTarget(root, "docs/briefs/new.md"), "docs/briefs/new.md");
  });

  test("a spec no brief is connected to stops", () => {
    assert.throws(() => briefTarget(project(), "1"), (e: DoppelblindError) => /No brief in the run state is connected to specs\/001-other/.test(e.message));
  });
});
