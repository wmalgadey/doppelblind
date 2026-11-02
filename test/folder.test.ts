import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import { createSpecFolder, findSpecFolder, nextNumber, slugify } from "../src/spec/folder.ts";
import { makeProject } from "./helpers.ts";

describe("folder", () => {
  test("slugify transliterates umlauts and joins words with dashes", () => {
    assert.equal(slugify("Orchestrator mit Spec-Agent"), "orchestrator-mit-spec-agent");
    assert.equal(slugify("Größe & Übergänge!"), "groesse-uebergaenge");
    assert.equal(slugify("Café"), "cafe");
    assert.equal(slugify("!!!"), "spec");
  });

  test("slugify shortens long titles at a word boundary", () => {
    const slug = slugify("one two three four five six seven eight nine ten eleven twelve");
    assert.ok(slug.length <= 50);
    assert.ok(!slug.endsWith("-"));
    assert.equal(slug, "one-two-three-four-five-six-seven-eight-nine-ten");
  });

  test("nextNumber is one above the highest numbered folder", () => {
    const root = makeProject({ "specs/001-a/spec.md": "", "specs/007-b/spec.md": "", "specs/notes/x.md": "", "specs/010-file.md": "" });
    assert.equal(nextNumber(path.join(root, "specs")), 8);
    assert.equal(nextNumber(path.join(root, "missing")), 1);
  });

  test("createSpecFolder creates a three-digit numbered folder", () => {
    const root = makeProject({});
    const specs = path.join(root, "specs");
    assert.equal(path.basename(createSpecFolder(specs, "Erste Spec")), "001-erste-spec");
    const second = createSpecFolder(specs, "Zweite Spec");
    assert.equal(path.basename(second), "002-zweite-spec");
    assert.ok(existsSync(second));
  });

  test("findSpecFolder finds the highest-numbered spec written for the brief", () => {
    const line = (brief: string) => `# T\n\nBrief: [${brief}](../../${brief})\n`;
    const root = makeProject({
      "specs/001-a/spec.md": line("docs/briefs/a.md"),
      "specs/002-b/spec.md": line("docs/briefs/b.md"),
      "specs/010-a-again/spec.md": line("docs/briefs/a.md"),
      "specs/011-empty/notes.md": line("docs/briefs/a.md"),
    });
    const specs = path.join(root, "specs");
    assert.equal(findSpecFolder(specs, "docs/briefs/a.md"), path.join(specs, "010-a-again"));
    assert.equal(findSpecFolder(specs, "docs/briefs/b.md"), path.join(specs, "002-b"));
    assert.equal(findSpecFolder(specs, "docs/briefs/c.md"), undefined);
    assert.equal(findSpecFolder(path.join(root, "missing"), "docs/briefs/a.md"), undefined);
  });
});
