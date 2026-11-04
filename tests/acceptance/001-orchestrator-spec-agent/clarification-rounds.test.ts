import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { BRIEF } from "../../../test/helpers.ts";
import {
  BRIEF_MARKER,
  BRIEF_PATH,
  CHOOSE_RERUN,
  CHOOSE_STOP,
  COMPLETE_CONF,
  FLOW_COMMAND,
  type Project,
  SPEC_COMMAND,
  agentInvocations,
  clearInvocations,
  createProject,
  criterion,
  doppelblindFiles,
  expectOneNewSpecDir,
  question,
  readSpec,
  recordedInput,
  run,
  setAgent,
  snapshot,
  specDirs,
  specFile,
  validSpec,
  writeAnswers,
} from "./harness.ts";

const T = 90_000;
const PRODUCT_MARKER = "PRODUCT-MARKER-4b1e: the greeter is a command line tool.";

/** First spec-create run for the brief; returns the spec folder it created. */
function firstRun(project: Project, spec = validSpec(), brief = BRIEF_PATH): string {
  setAgent(project, { spec });
  const before = specDirs(project.root);
  run(project, [...SPEC_COMMAND, brief]);
  return expectOneNewSpecDir(project, before);
}

function specBytes(project: Project, dir: string): Buffer {
  return readFileSync(specFile(project, dir));
}

/** Text of `text` from `start` up to `end` (or `maxLength` characters when there is no end). */
function window(text: string, start: string, end?: string, maxLength = 400): string {
  const from = text.indexOf(start);
  expect(from, `recorded input lacks "${start}":\n${text}`).toBeGreaterThanOrEqual(0);
  const to = end === undefined ? -1 : text.indexOf(end, from + start.length);
  return text.slice(from, to < 0 ? from + start.length + maxLength : to);
}

describe("clarification rounds", () => {
  test("another spec-create run replaces spec.md in the same spec folder", { tags: ["AC-027"], timeout: T }, () => {
    const project = createProject();
    const dir = firstRun(project, validSpec({ short_name: "a" }));
    expect(dir).toBe("001-a");
    setAgent(project, { spec: validSpec({ short_name: "a", title: "Second version of the greeting" }) });
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(readSpec(project, "001-a")).toContain("Second version of the greeting");
    expect(specDirs(project.root)).toEqual(["001-a"]);
  });

  test("the next spec-create run gets brief, sources and answers but not the previous spec", { tags: ["AC-028"], timeout: T }, () => {
    const project = createProject({
      conf: `${COMPLETE_CONF}spec_sources = docs/product.md\n`,
      files: { "docs/product.md": `# Product\n\n${PRODUCT_MARKER}\n` },
    });
    const dir = firstRun(project, validSpec({ criteria: [criterion(1, { title: "Unique Marker Title" })] }));
    writeAnswers(project, dir, { "Q-01": "Use the brief title" });
    const before = doppelblindFiles(project);
    clearInvocations(project);
    setAgent(project, { spec: validSpec() });
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(agentInvocations(project).length).toBeGreaterThan(0);
    const input = recordedInput(project, before);
    expect(input).toContain(BRIEF_MARKER);
    expect(input).toContain(PRODUCT_MARKER);
    expect(input).toContain("Use the brief title");
    expect(input).not.toContain("Unique Marker Title");
  });

  test("own text, free and out of scope reach the spec agent as answers, an empty field does not", { tags: ["AC-029"], timeout: T }, () => {
    const project = createProject();
    const questions = [
      question(1, { question: "Which heading does the greeting carry?" }),
      question(2, { question: "Which punctuation ends the greeting?" }),
      question(3, { question: "Does the greeting support colours?" }),
      question(4, { question: "How long may the greeting be?" }),
    ];
    const dir = firstRun(project, validSpec({ open_questions: questions }));
    writeAnswers(project, dir, { "Q-01": "Use the brief title", "Q-02": "free", "Q-03": "out of scope" });
    const before = doppelblindFiles(project);
    setAgent(project, { spec: validSpec() });
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    const input = recordedInput(project, before);
    for (const id of ["Q-01", "Q-02", "Q-03"]) expect(input).toContain(id);
    const [q1, q2, q3, q4] = questions.map((q) => q.question);
    expect(window(input, q1, q2)).toContain("Use the brief title");
    expect(window(input, q2, q3)).toMatch(/\bfree\b/);
    expect(window(input, q3, q4)).toContain("out of scope");
    if (input.includes(q4)) {
      const last = window(input, q4, undefined, 120);
      expect(last).not.toContain("Use the brief title");
      expect(last).not.toMatch(/\bfree\b/);
      expect(last).not.toContain("out of scope");
    }
  });

  test("runs on a different brief leave another brief's spec folder unchanged", { tags: ["AC-030"], timeout: T }, () => {
    const project = createProject({ files: { "docs/briefs/other.md": BRIEF.replace("# Greeting", "# Farewell") } });
    const otherSpec = validSpec({
      short_name: "a",
      title: "Farewell",
      criteria: [criterion(1, { sources: [{ path: "docs/briefs/other.md", anchor: "## Walkthrough" }] })],
    });
    const other = firstRun(project, otherSpec, "docs/briefs/other.md");
    expect(other).toBe("001-a");
    const before = snapshot(`${project.root}/specs/001-a`);
    setAgent(project, { spec: validSpec({ short_name: "b" }) });
    run(project, [...SPEC_COMMAND, BRIEF_PATH]);
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(snapshot(`${project.root}/specs/001-a`)).toEqual(before);
  });

  test("finishing the clarify run marks the empty question unanswered and ends the spec step", { tags: ["AC-031"], timeout: T }, () => {
    const project = createProject();
    const dir = firstRun(project, validSpec({ open_questions: [question(1), question(2)] }));
    writeAnswers(project, dir, { "Q-01": "Use the brief title" });
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_STOP });
    const text = readSpec(project, dir);
    const lines = text.split("\n");
    const q2 = lines.findIndex((l) => /^#+\s/.test(l) && l.includes("Q-02"));
    expect(q2, text).toBeGreaterThanOrEqual(0);
    const level = /^#+/.exec(lines[q2])![0].length;
    const end = lines.findIndex((l, i) => i > q2 && new RegExp(`^#{1,${level}}\\s`).test(l));
    const block = lines.slice(q2, end < 0 ? undefined : end).join("\n");
    const sectionHeading =
      level > 1 ? ([...lines.slice(0, q2)].reverse().find((l) => new RegExp(`^#{1,${level - 1}}\\s`).test(l)) ?? "") : "";
    expect(/unanswered/i.test(block) || /unanswered/i.test(sectionHeading), text).toBe(true);
    const bytes = specBytes(project, dir);
    clearInvocations(project);
    setAgent(project, { spec: validSpec({ title: "Should never be written" }) });
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    run(project, [...FLOW_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(agentInvocations(project)).toHaveLength(0);
    expect(specBytes(project, dir).equals(bytes)).toBe(true);
  });

  test("choosing another spec-create run when all questions are answered replaces spec.md", { tags: ["AC-032"], timeout: T }, () => {
    const project = createProject();
    const dir = firstRun(project);
    writeAnswers(project, dir, { "Q-01": "Use the brief title" });
    const bytes = specBytes(project, dir);
    clearInvocations(project);
    setAgent(project, { spec: validSpec({ title: "Greeting after answers" }) });
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(agentInvocations(project).length).toBeGreaterThan(0);
    expect(specBytes(project, dir).equals(bytes)).toBe(false);
    expect(readSpec(project, dir)).toContain("Greeting after answers");
  });

  test("choosing to stop when all questions are answered starts no spec-create run now or later", { tags: ["AC-032"], timeout: T }, () => {
    const project = createProject();
    const dir = firstRun(project);
    writeAnswers(project, dir, { "Q-01": "Use the brief title" });
    clearInvocations(project);
    setAgent(project, { spec: validSpec({ title: "Should never be written" }) });
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_STOP });
    expect(agentInvocations(project)).toHaveLength(0);
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(agentInvocations(project)).toHaveLength(0);
  });

  test("a spec without open questions is final and a second run leaves it unchanged", { tags: ["AC-033"], timeout: T }, () => {
    const project = createProject();
    const dir = firstRun(project, validSpec({ open_questions: [] }));
    const bytes = specBytes(project, dir);
    clearInvocations(project);
    setAgent(project, { spec: validSpec({ open_questions: [], title: "Should never be written" }) });
    run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: CHOOSE_RERUN });
    expect(agentInvocations(project)).toHaveLength(0);
    expect(specBytes(project, dir).equals(bytes)).toBe(true);
  });

  test("with standard input closed the choice stops with a message and no spec-create run", { tags: ["AC-034"], timeout: T }, () => {
    const project = createProject();
    const dir = firstRun(project);
    writeAnswers(project, dir, { "Q-01": "Use the brief title" });
    const bytes = specBytes(project, dir);
    clearInvocations(project);
    setAgent(project, { spec: validSpec({ title: "Should never be written" }) });
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: "" });
    expect(agentInvocations(project)).toHaveLength(0);
    expect(specBytes(project, dir).equals(bytes)).toBe(true);
    expect(result.output.trim()).not.toBe("");
  });

  test("six free answers report the brief as too vague, naming each question and its brief step", { tags: ["AC-035"], timeout: T }, () => {
    const steps = [
      "I open the terminal.",
      "I run the greeter.",
      "I type my name.",
      "I read the greeting.",
      "I wave back.",
      "I close the terminal.",
    ];
    const brief = `# Greeting

## Outcome

OUT-01. I can be greeted.

## Walkthrough

${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;
    const project = createProject({ brief });
    const spec = validSpec({
      criteria: steps.map((s, i) => criterion(i + 1, { sources: [{ path: BRIEF_PATH, anchor: `${i + 1}. ${s}` }] })),
      open_questions: steps.map((s, i) =>
        question(i + 1, { concerns: [`AC-${String(i + 1).padStart(3, "0")}`], context: s }),
      ),
    });
    const dir = firstRun(project, spec);
    writeAnswers(project, dir, Object.fromEntries(steps.map((_, i) => [`Q-0${i + 1}`, "free"])));
    const result = run(project, [...SPEC_COMMAND, BRIEF_PATH], { input: "" });
    expect(result.stderr).toMatch(/vague/i);
    for (let i = 0; i < steps.length; i++) {
      expect(result.stderr).toContain(`Q-0${i + 1}`);
      expect(result.stderr).toContain(steps[i].replace(/\.$/, ""));
    }
  });
});
