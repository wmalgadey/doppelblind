import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { readAnswerLog, readAnswers, renderAnswerLog } from "../src/spec/answers.ts";
import { renderSpec } from "../src/spec/render.ts";
import { sampleSpec } from "./helpers.ts";

describe("answers", () => {
  test("readAnswers reads answered questions without their context lines", () => {
    const spec = sampleSpec({
      open_questions: [
        { id: "Q-01", question: "Which words?", concerns: ["AC-001"], context: "I run the greeter." },
        { id: "Q-02", question: "Which colour?", concerns: [], depends_on: ["Q-01"] },
      ],
    });
    const md = renderSpec(spec, "b.md", "b.md")
      .replace("**Answer:**\n", "**Answer:**\n\nHello.\n\nAnd welcome.\n")
      .replace(/\*\*Answer:\*\*\n$/, "**Answer:**\n\nBlue.\n");
    assert.deepEqual(readAnswers(md), [
      { id: "Q-01", question: "Which words?", answer: "Hello.\n\nAnd welcome." },
      { id: "Q-02", question: "Which colour?", answer: "Blue." },
    ]);
  });

  test("readAnswers skips questions with an empty or whitespace-only answer", () => {
    assert.deepEqual(readAnswers(renderSpec(sampleSpec(), "b.md", "b.md")), []);
    assert.deepEqual(readAnswers("### Q-01\n\nWhy?\n\n**Answer:**  \n\t\n \n"), []);
  });

  test("an answer on the same line as its mark is read", () => {
    assert.deepEqual(readAnswers("### Q-07\n\nWhy?\n\n**Answer:** Because.\n"), [{ id: "Q-07", question: "Why?", answer: "Because." }]);
  });

  test("the answer log keeps each answer with its question and round", () => {
    const answers = [
      { round: 1, id: "Q-01", question: "Which words?", answer: "Hello." },
      { round: 2, id: "Q-01", question: "Which colour?", answer: "free" },
    ];
    const md = renderAnswerLog(answers);
    assert.match(md, /^# Answers\n\n## Round 1\n\n### Q-01\n\nWhich words\?\n\n\*\*Answer:\*\*\n\nHello\.\n\n## Round 2\n\n### Q-01\n/);
    assert.deepEqual(readAnswerLog(md), answers);
  });
});
