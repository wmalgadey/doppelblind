import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { DoppelblindError } from "../src/errors.ts";
import { parseSpec } from "../src/spec/parse.ts";
import { renderSpec } from "../src/spec/render.ts";
import { sampleSpec } from "./helpers.ts";

describe("parse", () => {
  test("reads back the criteria renderSpec writes, with the questions answered free that concern them", () => {
    const spec = sampleSpec({
      criteria: [
        sampleSpec().criteria[0],
        { ...sampleSpec().criteria[0], id: "AC-002", title: "Looks friendly", reason_in_source: null, reason_anchor: null, proven_by: "review" },
      ],
      open_questions: [
        { id: "Q-01", question: "Which words does the greeting use?", concerns: ["AC-001"] },
        { id: "Q-02", question: "Which colour?", concerns: ["AC-002"] },
      ],
    });
    const md = renderSpec(spec, "docs/briefs/greeting.md", "../../docs/briefs/greeting.md", {
      answers: [{ id: "Q-01", question: "Which words does the greeting use?", answer: "free" }],
      unanswered: ["Q-02"],
    });
    const parsed = parseSpec(md, "spec.md");

    assert.equal(parsed.title, "Grüße für alle");
    assert.deepEqual(parsed.criteria, [
      { id: "AC-001", title: "Greeter greets", given: "the greeter is installed", when: "I run it", then: "it prints a greeting", provenBy: "test", leftOpen: ["Q-01"] },
      { id: "AC-002", title: "Looks friendly", given: "the greeter is installed", when: "I run it", then: "it prints a greeting", provenBy: "review", leftOpen: [] },
    ]);
    assert.deepEqual([...parsed.leftOpen], [["Q-01", "Which words does the greeting use?"]]);
  });

  test("a spec without readable criteria fails with a message", () => {
    assert.throws(() => parseSpec("# Title\n\nNo criteria here.\n", "spec.md"), DoppelblindError);
    assert.throws(() => parseSpec("# T\n\n## Criteria\n\n### AC-001: X\n\nnothing\n", "spec.md"), /AC-001 has no Given/);
  });
});
