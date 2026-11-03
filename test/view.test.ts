import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import { checkWrites, copyWritten, createWorkspace, hasTests, planView, removeWorkspace } from "../src/boundary/view.ts";
import { makeProject } from "./helpers.ts";

function project() {
  return makeProject({
    "package.json": "{}",
    "src/app.ts": "implementation",
    "src/app.test.ts": "unit test next to the code",
    "test/app.test.ts": "unit test",
    "test/helpers.ts": "helper",
    "test/fixtures/data.json": "fixture",
    "docs/plan/plan.md": "plan",
    "docs/product.md": "source",
    "specs/001-greet/spec.md": "spec",
    "tests/acceptance/001-greet/ac-001.test.ts": "earlier run of this spec",
    "tests/acceptance/000-other/ac-001.test.ts": "other spec's acceptance test",
    "node_modules/x/test/helper.js": "dependency",
  });
}

const EXCLUDED = ["src", "docs/plan", "specs", "docs/product.md", ".doppelblind"];

describe("view", () => {
  test("shows acceptance tests of other specs and test infrastructure, never implementation, plan, sources or unit tests", () => {
    const plan = planView(project(), "tests/acceptance", "001-greet", EXCLUDED);
    assert.deepEqual(plan.acceptanceTests, ["tests/acceptance/000-other/ac-001.test.ts"]);
    assert.deepEqual(plan.infrastructure.sort(), ["package.json", "test/fixtures/data.json", "test/helpers.ts"]);
    assert.deepEqual(plan.unitTests, ["test/app.test.ts"]);
    assert.equal(plan.writable, "tests/acceptance/001-greet");
    assert.ok(hasTests(plan));
  });

  test("a project with helpers but no test file has no tests", () => {
    const root = makeProject({ "test/helpers.ts": "helper", "src/a.ts": "a" });
    assert.ok(!hasTests(planView(root, "tests/acceptance", "001-x", ["src"])));
  });

  test("the workspace holds only the planned files, read-only, and an empty writable folder", () => {
    const root = project();
    const plan = planView(root, "tests/acceptance", "001-greet", EXCLUDED);
    const ws = createWorkspace(root, plan);
    try {
      assert.equal(readFileSync(path.join(ws.dir, "test/helpers.ts"), "utf8"), "helper");
      assert.ok(!existsSync(path.join(ws.dir, "src")));
      assert.ok(!existsSync(path.join(ws.dir, "tests/acceptance/001-greet/ac-001.test.ts")));
      assert.throws(() => writeFileSync(path.join(ws.dir, "test/helpers.ts"), "changed"));
      assert.deepEqual(checkWrites(ws), { written: [], rejected: [] });
    } finally {
      removeWorkspace(ws);
    }
  });

  test("a write outside the writable folder, a change, a removal and a link are rejected", () => {
    const root = project();
    const ws = createWorkspace(root, planView(root, "tests/acceptance", "001-greet", EXCLUDED));
    try {
      writeFileSync(path.join(ws.dir, "tests/acceptance/001-greet/ac-001.test.ts"), "new test");
      writeFileSync(path.join(ws.dir, "outside.ts"), "x");
      chmodSync(path.join(ws.dir, "test/helpers.ts"), 0o644);
      writeFileSync(path.join(ws.dir, "test/helpers.ts"), "changed");
      unlinkSync(path.join(ws.dir, "test/fixtures/data.json"));
      symlinkSync("/etc/passwd", path.join(ws.dir, "tests/acceptance/001-greet/link"));
      assert.deepEqual(checkWrites(ws), {
        written: ["tests/acceptance/001-greet/ac-001.test.ts"],
        rejected: ["outside.ts", "test/fixtures/data.json", "test/helpers.ts", "tests/acceptance/001-greet/link"],
      });
    } finally {
      removeWorkspace(ws);
    }
  });

  test("copying the written files replaces the spec's earlier acceptance tests", () => {
    const root = makeProject({ "tests/acceptance/001-greet/old.test.ts": "old", "test/a.test.ts": "t" });
    const ws = createWorkspace(root, planView(root, "tests/acceptance", "001-greet", []));
    try {
      writeFileSync(path.join(ws.dir, "tests/acceptance/001-greet/ac-001.test.ts"), "new");
      copyWritten(ws, root, ["tests/acceptance/001-greet/ac-001.test.ts"]);
      assert.ok(!existsSync(path.join(root, "tests/acceptance/001-greet/old.test.ts")));
      assert.equal(readFileSync(path.join(root, "tests/acceptance/001-greet/ac-001.test.ts"), "utf8"), "new");
    } finally {
      removeWorkspace(ws);
    }
  });
});
