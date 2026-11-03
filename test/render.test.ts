import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { renderSpec } from "../src/spec/render.ts";
import { sampleSpec } from "./helpers.ts";

const TWO_QUESTIONS = sampleSpec({
  open_questions: [
    { id: "Q-01", question: "Which words?", concerns: ["AC-001"] },
    { id: "Q-02", question: "Which colour?", concerns: ["AC-001"] },
  ],
});

describe("render", () => {
  test("the spec lists criteria in Given-When-Then with their sources", () => {
    const md = renderSpec(sampleSpec(), "docs/briefs/greeting.md", "../../docs/briefs/greeting.md");
    assert.match(md, /^# Grüße für alle\n/);
    assert.match(md, /Brief: \[docs\/briefs\/greeting.md\]\(\.\.\/\.\.\/docs\/briefs\/greeting.md\)/);
    assert.match(md, /### AC-001: Greeter greets\n\n- \*\*Given\*\* the greeter is installed\n- \*\*When\*\* I run it\n- \*\*Then\*\* it prints a greeting/);
    assert.match(md, /- \*\*Then\*\* it prints a greeting\n\nProven by: acceptance test\n\nSources: `docs\/briefs\/greeting.md` › ## Walkthrough/);
    assert.match(md, /## Wishes\n\n- A colourful greeting\./);
  });

  test("each open question gets an empty answer to fill in", () => {
    const md = renderSpec(sampleSpec(), "b.md", "b.md");
    assert.match(md, /## Open questions\n\n### Q-01\n\nWhich words does the greeting use\?\n\n_Context: I run the greeter\._\n\n\*\*Answer:\*\*\n$/);
  });

  test("empty wishes and questions are stated, not omitted", () => {
    const md = renderSpec(sampleSpec({ wishes: [], open_questions: [] }), "b.md", "b.md");
    assert.match(md, /## Wishes\n\nNone\.\n\n## Left open\n\nNone\.\n\n## Out of scope\n\nNone\.\n\n## Unanswered\n\nNone\.\n\n## Open questions\n\nNone\.\n$/);
  });

  test("a question names the questions it depends on", () => {
    const md = renderSpec(sampleSpec({ open_questions: [{ id: "Q-02", question: "Which colour?", concerns: [], depends_on: ["Q-01"] }] }), "b.md", "b.md");
    assert.match(md, /### Q-02\n\nWhich colour\?\n\n_Depends on: Q-01_\n\n\*\*Answer:\*\*/);
  });

  test("a criterion names the open questions that concern it", () => {
    const md = renderSpec(sampleSpec({
      open_questions: [
        { id: "Q-01", question: "Which words?", concerns: ["AC-001"] },
        { id: "Q-02", question: "Which colour?", concerns: [] },
        { id: "Q-03", question: "How loud?", concerns: ["AC-001"] },
      ],
    }), "b.md", "b.md");
    assert.match(md, /Sources: .*\n\nOpen questions: Q-01, Q-03\n\n## Wishes/);
  });

  test("left open and out of scope list every answer free and out of scope, to this spec or an earlier one, from the answers", () => {
    const spec = sampleSpec({
      open_questions: [
        { id: "Q-04", question: "Which words?", concerns: ["AC-001"] },
        { id: "Q-05", question: "Which colour?", concerns: ["AC-001"] },
      ],
    });
    const answers = [
      { id: "Q-01", question: "Which tone?", answer: "free" },
      { id: "Q-02", question: "Which font?", answer: "out of scope" },
      { id: "Q-03", question: "Which size?", answer: "Large." },
      { id: "Q-04", question: "Which words?", answer: "free" },
    ];
    const md = renderSpec(spec, "b.md", "b.md", { answers, unanswered: [] });
    assert.match(md, /## Left open\n\n- Q-01: Which tone\?\n- Q-04: Which words\?\n\n## Out of scope\n\n- Q-02: Which font\?\n\n## Unanswered\n\nNone\.\n\n## Open questions\n\n### Q-05\n/);
    assert.match(md, /Sources: .*\n\nOpen questions: Q-05\n\nLeft open: Q-04\n\n## Wishes/);
    assert.ok(!md.includes("Which size?"));
    assert.ok(!md.includes("### Q-04"));
  });

  test("unanswered lists the questions the record names, and they are no longer open", () => {
    const md = renderSpec(TWO_QUESTIONS, "b.md", "b.md", { answers: [], unanswered: ["Q-01", "Q-02"] });
    assert.match(md, /## Unanswered\n\n- Q-01: Which words\?\n- Q-02: Which colour\?\n\n## Open questions\n\nNone\.\n$/);
  });

  test("each criterion lists, per section, the spec's questions that concern it", () => {
    const four = sampleSpec({
      open_questions: [
        { id: "Q-01", question: "Which words?", concerns: ["AC-001"] },
        { id: "Q-02", question: "Which colour?", concerns: ["AC-001"] },
        { id: "Q-03", question: "Which font?", concerns: ["AC-001"] },
        { id: "Q-04", question: "How loud?", concerns: ["AC-001"] },
        { id: "Q-05", question: "Which tone?", concerns: [] },
      ],
    });
    const answers = [
      { id: "Q-02", question: "Which colour?", answer: "free" },
      { id: "Q-03", question: "Which font?", answer: "out of scope" },
      { id: "Q-05", question: "Which tone?", answer: "free" },
    ];
    const md = renderSpec(four, "b.md", "b.md", { answers, unanswered: ["Q-04"] });
    assert.match(md, /Sources: .*\n\nOpen questions: Q-01\n\nLeft open: Q-02\n\nOut of scope: Q-03\n\nUnanswered: Q-04\n\n## Wishes/);
  });
});
