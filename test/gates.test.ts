import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { DoppelblindError } from "../src/errors.ts";
import { validateOutput } from "../src/gates/schema.ts";
import { checkSpec } from "../src/gates/spec.ts";
import { schema } from "../src/roles/spec-agent/index.ts";
import { BRIEF, sampleSpec } from "./helpers.ts";

const sources = [
  { path: "docs/briefs/greeting.md", content: BRIEF },
  { path: "docs/product.md", content: "| OUT-01 | turn a brief into a spec |" },
];

describe("gates", () => {
  test("a valid spec passes the schema", () => {
    const spec = sampleSpec();
    assert.deepEqual(validateOutput(schema, spec), spec);
  });

  test("output that does not match the schema is a failure, not an empty spec", () => {
    for (const output of [
      {},
      null,
      sampleSpec({ criteria: [] }),
      { ...sampleSpec(), extra: true },
      sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], sources: [] }] }),
      sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], id: "1" }] }),
      sampleSpec({ open_questions: [{ id: "Q1", question: "?" }] }),
      sampleSpec({ short_name: "Not A Slug" }),
      sampleSpec({ short_name: "single" }),
    ]) {
      assert.throws(() => validateOutput(schema, output), DoppelblindError);
    }
  });

  test("schema errors name the offending field", () => {
    try {
      validateOutput(schema, sampleSpec({ criteria: [] }));
      assert.fail("expected a failure");
    } catch (err) {
      assert.ok((err as DoppelblindError).details.some((d) => d.includes("/criteria")));
    }
  });

  test("citations of allowed sources with present anchors pass", () => {
    const spec = sampleSpec({
      criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "docs/briefs/greeting.md", anchor: "## Walkthrough" }, { path: "docs/product.md", anchor: "OUT-01" }] }],
    });
    assert.deepEqual(checkSpec(spec, sources), []);
  });

  test("citing a path that is not a binding source fails", () => {
    const spec = sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "src/cli.ts", anchor: "main" }] }] });
    assert.deepEqual(checkSpec(spec, sources), ["AC-01 cites src/cli.ts, which is not a binding source."]);
  });

  test("citing an anchor that does not appear in the source fails", () => {
    const spec = sampleSpec({ criteria: [{ ...sampleSpec().criteria[0], sources: [{ path: "docs/product.md", anchor: "OUT-99" }] }] });
    assert.deepEqual(checkSpec(spec, sources), ['AC-01 cites "OUT-99" in docs/product.md, which does not appear there.']);
  });

  test("duplicate IDs fail", () => {
    const c = sampleSpec().criteria[0];
    const q = sampleSpec().open_questions[0];
    const spec = sampleSpec({ criteria: [c, c, c], open_questions: [q, q] });
    assert.deepEqual(checkSpec(spec, sources), ["Duplicate criterion ID AC-01.", "Duplicate open question ID Q-01."]);
  });
});
