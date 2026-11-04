import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { fillAnswers, readAnswers, renderAnswerLog } from "../src/spec/answers.ts";
import { renderSpec } from "../src/spec/render.ts";
import { sampleSpec } from "./helpers.ts";

describe("answers", () => {
  test("readAnswers reads answered questions with their context apart from the question's text", () => {
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
      { id: "Q-01", question: "Which words?", answer: "Hello.\n\nAnd welcome.", context: "I run the greeter." },
      { id: "Q-02", question: "Which colour?", answer: "Blue." },
    ]);
    // answers.md keeps the context, so that it is read back the same way
    assert.deepEqual(readAnswers(renderAnswerLog(readAnswers(md))), readAnswers(md));
  });

  test("readAnswers skips questions with an empty or whitespace-only answer", () => {
    assert.deepEqual(readAnswers(renderSpec(sampleSpec(), "b.md", "b.md")), []);
    assert.deepEqual(readAnswers("### Q-01\n\nWhy?\n\n**Answer:**  \n\t\n \n"), []);
  });

  test("readAnswers skips questions marked unanswered", () => {
    assert.deepEqual(readAnswers("### Q-01\n\nWhy?\n\n**Answer:**\n\nunanswered\n\n### Q-02\n\nHow?\n\n**Answer:**\n\nunanswered, because\n"), [
      { id: "Q-02", question: "How?", answer: "unanswered, because" },
    ]);
  });

  test("an answer on the same line as its mark is read", () => {
    assert.deepEqual(readAnswers("### Q-07\n\nWhy?\n\n**Answer:** Because.\n"), [{ id: "Q-07", question: "Why?", answer: "Because." }]);
  });

  test("the words of the Answer mark inside a question's text are not its Answer field", () => {
    const md = "### Q-67\n\nWhat if the user removed the **Answer:** field?\n\n**Answer:**\n\n\n### Q-68\n\nWhy?\n\n**Answer:**\n\nBecause.\n";
    assert.deepEqual(readAnswers(md), [{ id: "Q-68", question: "Why?", answer: "Because." }]);
    assert.equal(fillAnswers(md, [{ id: "Q-67", answer: "It stops." }]),
      "### Q-67\n\nWhat if the user removed the **Answer:** field?\n\n**Answer:**\n\nIt stops.\n\n### Q-68\n\nWhy?\n\n**Answer:**\n\nBecause.\n");
  });

  test("the answer log keeps each answer with its question and reads back", () => {
    const answers = [
      { id: "Q-01", question: "Which words?", answer: "Hello." },
      { id: "Q-02", question: "Which colour?", answer: "free" },
    ];
    const md = renderAnswerLog(answers);
    assert.match(md, /^# Answers\n\n### Q-01\n\nWhich words\?\n\n\*\*Answer:\*\*\n\nHello\.\n\n### Q-02\n/);
    assert.deepEqual(readAnswers(md), answers);
  });

  test("fillAnswers writes into empty and unanswered fields and keeps given answers", () => {
    const md = "## Open questions\n\n### Q-01\n\nWhy?\n\n**Answer:**\n\n\n### Q-02\n\nHow?\n\n**Answer:**\n\nunanswered\n\n### Q-03\n\nWho?\n\n**Answer:**\n\nMe.\n";
    const filled = fillAnswers(md, [{ id: "Q-01", answer: "free" }, { id: "Q-02", answer: "out of scope" }, { id: "Q-03", answer: "free" }]);
    assert.deepEqual(readAnswers(filled), [
      { id: "Q-01", question: "Why?", answer: "free" },
      { id: "Q-02", question: "How?", answer: "out of scope" },
      { id: "Q-03", question: "Who?", answer: "Me." },
    ]);
  });

  test("an answer holding headings of its own is read and kept whole", () => {
    const answer = "## Errors\n\nShow them.\n\n## Logs\n\nKeep them.";
    const md = `## Open questions\n\n### Q-01\n\nWhy?\n\n**Answer:**\n\n${answer}\n\n### Q-02\n\nHow?\n\n**Answer:**\n\n\n`;
    assert.deepEqual(readAnswers(md), [{ id: "Q-01", question: "Why?", answer }]);
    const filled = fillAnswers(md, [{ id: "Q-01", answer: "free" }, { id: "Q-02", answer: "out of scope" }]);
    assert.deepEqual(readAnswers(filled), [
      { id: "Q-01", question: "Why?", answer },
      { id: "Q-02", question: "How?", answer: "out of scope" },
    ]);
  });
});
