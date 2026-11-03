import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { highestQuestion, renumberQuestions } from "../src/spec/questions.ts";
import { sampleSpec } from "./helpers.ts";

describe("questions", () => {
  test("renumbering continues after the highest question number and keeps depends_on pointing at the same questions", () => {
    const spec = sampleSpec({
      open_questions: [
        { id: "Q-01", question: "Which words?", concerns: ["AC-001"] },
        { id: "Q-02", question: "Which colour?", concerns: [], depends_on: ["Q-01"] },
      ],
    });
    const renumbered = renumberQuestions(spec, 26);
    assert.deepEqual(renumbered.open_questions, [
      { id: "Q-27", question: "Which words?", concerns: ["AC-001"] },
      { id: "Q-28", question: "Which colour?", concerns: [], depends_on: ["Q-27"] },
    ]);
    assert.deepEqual(spec.open_questions.map((q) => q.id), ["Q-01", "Q-02"]);
  });

  test("the first spec of a brief keeps its numbers, and numbers past 99 get more digits", () => {
    assert.deepEqual(renumberQuestions(sampleSpec(), 0).open_questions.map((q) => q.id), ["Q-01"]);
    assert.deepEqual(renumberQuestions(sampleSpec(), 99).open_questions.map((q) => q.id), ["Q-100"]);
  });

  test("the highest question number is 0 without questions", () => {
    assert.equal(highestQuestion([]), 0);
    assert.equal(highestQuestion(["Q-03", "Q-12", "Q-07"]), 12);
  });
});
