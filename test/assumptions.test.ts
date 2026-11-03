import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { decidedText, parseDecision, readAssumptions, renderAssumptions, undecided } from "../src/spec/assumptions.ts";
import { renderAnswerList } from "../src/spec/answers.ts";

const ENTRY = { id: "A-001", criterion: "AC-002", assumption: "The greeter is called greet.", files: ["tests/acceptance/x/ac-002.test.mjs"] };

/** assumptions.md with ENTRY whose Decision field holds `decision`. */
function withDecision(decision: string): string {
  return renderAssumptions("spec.md", [ENTRY]).replace("**Decision:**\n", `**Decision:**\n\n${decision}\n`);
}

describe("assumptions", () => {
  test("accepted and rejected with a text of the user's own are decisions", () => {
    assert.deepEqual(parseDecision("accepted"), { decision: { kind: "accepted" } });
    assert.deepEqual(parseDecision("  Accepted \n"), { decision: { kind: "accepted" } });
    assert.deepEqual(parseDecision("rejected: the command is called hello"), { decision: { kind: "rejected", text: "the command is called hello" } });
    assert.deepEqual(parseDecision("rejected:\nspans\ntwo lines"), { decision: { kind: "rejected", text: "spans\ntwo lines" } });
  });

  test("an empty field, rejected without a text and any other value are no decision", () => {
    for (const raw of ["", "  \n", "rejected", "rejected:", "rejected:   ", "Rejected :", "yes", "accepted, mostly", "rejected because"]) {
      const parsed = parseDecision(raw);
      assert.equal(parsed.decision, undefined, raw);
      assert.ok(parsed.problem, raw);
    }
    assert.match(parseDecision("rejected:").problem!, /gives no text/);
    assert.equal(parseDecision("").problem, "no decision");
  });

  test("assumptions.md renders one section per assumption with criterion, text, test files and an empty Decision field", () => {
    const md = renderAssumptions("spec.md", [ENTRY, { id: "A-002", criterion: "AC-001", assumption: "Exit code 0.", files: [] }]);
    assert.ok(md.startsWith("# Assumptions\n\nDecisions the test author made that the criteria of [spec.md](spec.md) do not."));
    assert.ok(md.includes(
      "## A-001\n\n**Criterion:** AC-002\n\n**Assumption:** The greeter is called greet.\n\n**Test files:**\n\n" +
        "- tests/acceptance/x/ac-002.test.mjs\n\n**Decision:**\n\n## A-002",
    ));
    assert.ok(md.endsWith("## A-002\n\n**Criterion:** AC-001\n\n**Assumption:** Exit code 0.\n\n**Test files:**\n\nNone.\n\n**Decision:**\n"));
  });

  test("reads back what it renders, with the decision the user wrote", () => {
    const [read] = readAssumptions(withDecision("rejected: it is called hello"));
    assert.deepEqual(read, { ...ENTRY, raw: "rejected: it is called hello", decision: { kind: "rejected", text: "it is called hello" } });
    assert.equal(decidedText(read), "it is called hello");

    const [accepted] = readAssumptions(withDecision("accepted"));
    assert.equal(decidedText(accepted), "The greeter is called greet.");
    // a rendered decision is kept when the file is written again
    assert.deepEqual(readAssumptions(renderAssumptions("spec.md", [accepted])), [accepted]);
  });

  test("every assumption without a valid decision is named with what is wrong", () => {
    const md = withDecision("rejected") + "\n## A-002\n\n**Criterion:** AC-001\n\n**Assumption:** Exit code 0.\n\n**Decision:**\n\naccepted\n" +
      "\n## A-003\n\n**Criterion:** AC-001\n\n**Assumption:** No decision field.\n";
    const entries = readAssumptions(md);
    assert.deepEqual(entries.map((e) => e.decision?.kind), [undefined, "accepted", undefined]);
    assert.deepEqual(undecided(entries), [
      'A-001 (AC-002): "rejected" gives no text; write rejected: <what applies instead>',
      "A-003 (AC-001): no **Decision:** field",
    ]);
    assert.equal(decidedText(entries[0]), undefined);
    assert.deepEqual(undecided(readAssumptions(renderAssumptions("spec.md", [ENTRY]))), ["A-001 (AC-002): no decision"]);
  });

  test("the spec agent gets each decided assumption in place of a question, its decision in place of the answer", () => {
    const list = renderAnswerList(
      [{ id: "Q-01", question: "Which words?", answer: "Hello." }],
      [{ assumption: "The greeter is called greet.", decision: "rejected: it is called hello" }],
    );
    assert.equal(list, "# Answers\n\n**Question:** Which words?\n\n**Answer:**\n\nHello.\n\n" +
      "**Assumption:** The greeter is called greet.\n\n**Answer:**\n\nrejected: it is called hello\n");
  });
});
