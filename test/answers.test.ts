import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { readAnswers, renderAnswers } from "../src/spec/answers.ts";
import { renderSpec } from "../src/spec/render.ts";
import { sampleSpec } from "./helpers.ts";

describe("answers", () => {
  test("readAnswers reads answered questions and skips empty answers", () => {
    const spec = sampleSpec({
      open_questions: [
        { id: "Q-01", question: "Which words?", context: "AC-01" },
        { id: "Q-02", question: "Which colour?" },
      ],
    });
    const md = renderSpec(spec, "b.md", "b.md").replace("**Answer:**\n", "**Answer:**\n\nHello.\n\nAnd welcome.\n");
    assert.deepEqual(readAnswers(md), [{ id: "Q-01", question: "Which words?", answer: "Hello.\n\nAnd welcome." }]);
  });

  test("an answer on the same line as its mark is read", () => {
    assert.deepEqual(readAnswers("### Q-07\n\nWhy?\n\n**Answer:** Because.\n"), [{ id: "Q-07", question: "Why?", answer: "Because." }]);
  });

  test("answered questions render in the layout they are read from", () => {
    const answered = [{ id: "Q-01", question: "Which words?", answer: "Hello." }];
    const md = renderSpec(sampleSpec({ open_questions: [] }), "b.md", "b.md", answered);
    assert.match(md, /## Open questions\n\nNone\.\n\n## Answered questions\n\n### Q-01\n/);
    assert.deepEqual(readAnswers(md), answered);
    assert.deepEqual(readAnswers(renderAnswers(answered).join("\n")), answered);
  });
});
