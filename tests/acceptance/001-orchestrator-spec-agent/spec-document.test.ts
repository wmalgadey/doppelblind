import { describe, expect, test } from "vitest";
import {
  BRIEF_PATH,
  SPEC_COMMAND,
  createProject,
  criterion,
  expectInOrder,
  expectOneNewSpecDir,
  question,
  readSpec,
  run,
  setAgent,
  validSpec,
} from "./harness.ts";

const T = 60_000;

const GERMAN_BRIEF = `# Begrüßung

## Ergebnis

OUT-01. Ich werde begrüßt.

## Ablauf

1. Ich starte den Begrüßer.
`;

/** Index of the heading line whose text starts with `label`. */
function heading(label: string): RegExp {
  return new RegExp(`^#{1,6}\\s+${label}\\b.*$`, "m");
}

/** Text of a spec.md from the heading matching `start` to the next heading at the same or a higher level. */
function section(text: string, start: RegExp): string {
  const match = start.exec(text);
  expect(match, `no heading ${start} in:\n${text}`).not.toBeNull();
  const level = /^#+/.exec(match![0])![0].length;
  const rest = text.slice(match!.index + match![0].length);
  const next = new RegExp(`^#{1,${level}}\\s`, "m").exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

describe("spec.md layout", () => {
  test("a spec from a German brief has its title, brief link, introduction and English section labels in order", { tags: ["AC-012"], timeout: T }, () => {
    const project = createProject({ brief: GERMAN_BRIEF });
    const spec = validSpec({
      title: "Begrüßung für alle",
      introduction: "Wer den Begrüßer startet, wird begrüßt.",
      criteria: [
        criterion(1, {
          title: "Begrüßer begrüßt",
          reason_in_source: "Begrüßt zu werden ist das Ergebnis des Briefs.",
          reason_anchor: "Ich werde begrüßt.",
          given: "der Begrüßer ist installiert",
          when: "ich ihn starte",
          then: "gibt er einen Gruß aus",
          rejects: "Ein Begrüßer ohne Ausgabe scheitert, weil er keinen Gruß ausgibt.",
          sources: [{ path: BRIEF_PATH, anchor: "## Ablauf" }],
        }),
      ],
      wishes: ["Ein bunter Gruß."],
      open_questions: [question(1, { question: "Welche Worte nutzt der Gruß?", context: "Ich starte den Begrüßer." })],
    });
    setAgent(project, { spec });
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const text = readSpec(project, expectOneNewSpecDir(project));
    const firstLine = text.split("\n").find((l) => l.trim() !== "")!;
    expect(firstLine).toContain("Begrüßung für alle");
    const [link, intro, criteria] = expectInOrder(text, [
      /\]\([^)]*x\.md\)/,
      /Wer den Begrüßer startet, wird begrüßt\./,
      heading("Criteria"),
    ]);
    expect(link).toBeLessThan(intro);
    expect(intro).toBeLessThan(criteria);
    expectInOrder(text, [
      heading("Criteria"),
      heading("Wishes"),
      heading("Left open"),
      heading("Out of scope"),
      heading("Unanswered"),
      heading("Open questions"),
    ]);
  });

  test("a criterion has a heading with its ID and title followed by its fields in order", { tags: ["AC-013"], timeout: T }, () => {
    const project = createProject();
    setAgent(project, { spec: validSpec() });
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const text = readSpec(project, expectOneNewSpecDir(project));
    const criteria = section(text, heading("Criteria"));
    expectInOrder(criteria, [
      /^#{1,6}\s+.*AC-001.*Greeter greets.*$/m,
      /Why/,
      /^\s*[-*+]\s.*Given/m,
      /^\s*[-*+]\s.*When/m,
      /^\s*[-*+]\s.*Then/m,
      /Proven by/,
      /Rejects/,
      /Sources/,
      /Open questions/,
    ]);
  });

  test("wishes are list items and an open question shows question, context, dependency and an empty answer", { tags: ["AC-014"], timeout: T }, () => {
    const project = createProject();
    const spec = validSpec({
      wishes: ["A colourful greeting.", "A greeting that rhymes."],
      open_questions: [
        question(1, { question: "Which words does the greeting use?", context: "I run the greeter.", depends_on: ["Q-02"] } as never),
        question(2, { question: "Which language is the greeting in?" }),
      ],
    });
    setAgent(project, { spec });
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    const text = readSpec(project, expectOneNewSpecDir(project));
    const wishes = section(text, heading("Wishes"));
    const items = wishes.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("A colourful greeting.");
    expect(items[1]).toContain("A greeting that rhymes.");
    const q1 = section(text, /^#{1,6}\s+.*Q-01.*$/m);
    const [, , , answer] = expectInOrder(q1, [
      /Which words does the greeting use\?/,
      /^.*Context.*I run the greeter\..*$/m,
      /^.*Depends on.*Q-02.*$/m,
      /\*\*Answer:\*\*/,
    ]);
    expect(q1.slice(answer + "**Answer:**".length).trim()).toBe("");
  });
});
