# Assumptions

Decisions the test author made that the criteria of [spec.md](spec.md) do not. Decide each one in its Decision field: `accepted`, or `rejected: <what applies instead>`. The acceptance tests are locked only once every assumption is decided; a rejected one starts the test author again. Every decision binds the later test author runs and spec-create runs of this spec.

## A-001

**Criterion:** AC-001

**Assumption:** The spec-agent command is `doppelblind spec <brief path>`, run as `node src/cli.ts spec <brief path>` with the current directory as working directory. Every test uses it.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-folder-creation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/brief-path-validation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/configuration.test.ts
- tests/acceptance/001-orchestrator-spec-agent/spec-document.test.ts
- tests/acceptance/001-orchestrator-spec-agent/agent-input-and-run-record.test.ts
- tests/acceptance/001-orchestrator-spec-agent/progress-output.test.ts
- tests/acceptance/001-orchestrator-spec-agent/agent-failures.test.ts
- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-002

**Criterion:** AC-001

**Assumption:** Doppelblind starts the agent CLI as the executable `claude`, found through PATH. The tests put a stand-in `claude` that runs test/fixtures/fake-claude.mjs first on PATH. Doppelblind reads the agent's answer from one line of JSON on stdout in the Claude CLI result format (`type: "result"`, `is_error`, `result` holding the JSON string, `structured_output` holding the object). That object uses the SpecOutput fields of sampleSpec in test/helpers.ts. Valid output must cite the brief by its repository-relative path (`docs/briefs/x.md`), with anchors that appear word for word in the brief.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-folder-creation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/brief-path-validation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/configuration.test.ts
- tests/acceptance/001-orchestrator-spec-agent/spec-document.test.ts
- tests/acceptance/001-orchestrator-spec-agent/agent-input-and-run-record.test.ts
- tests/acceptance/001-orchestrator-spec-agent/progress-output.test.ts
- tests/acceptance/001-orchestrator-spec-agent/agent-failures.test.ts
- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-003

**Criterion:** AC-001

**Assumption:** `.doppelblind.conf` uses lines of the form `key = value`. The single line `specs = specs` makes it complete and declares the specs folder `specs`.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-folder-creation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/brief-path-validation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/spec-document.test.ts
- tests/acceptance/001-orchestrator-spec-agent/agent-input-and-run-record.test.ts
- tests/acceptance/001-orchestrator-spec-agent/progress-output.test.ts
- tests/acceptance/001-orchestrator-spec-agent/agent-failures.test.ts
- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-004

**Criterion:** AC-001

**Assumption:** A folder after `git init`, with no commits, counts as a git repository.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-folder-creation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/brief-path-validation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/configuration.test.ts
- tests/acceptance/001-orchestrator-spec-agent/spec-document.test.ts
- tests/acceptance/001-orchestrator-spec-agent/agent-input-and-run-record.test.ts
- tests/acceptance/001-orchestrator-spec-agent/progress-output.test.ts
- tests/acceptance/001-orchestrator-spec-agent/agent-failures.test.ts
- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-005

**Criterion:** AC-002

**Assumption:** The complete-flow command is `doppelblind run <brief path>`. Files inside `.git` are left out of the 'no file outside' snapshot. AC-031 also uses this command for its 'either command' part.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-folder-creation.test.ts
- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-006

**Criterion:** AC-005

**Assumption:** A message that names the missing path and shows the usage means the output contains 'usage', 'brief' and one of 'missing', 'required', 'expected' or 'no brief' (case-insensitive). 'Without starting the spec agent' means the `claude` executable is never started.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/brief-path-validation.test.ts

**Decision:**

## A-007

**Criterion:** AC-006

**Assumption:** Each case has a message matching a word list (case-insensitive). Missing path: 'not exist', 'no such', 'not found' or 'missing'. Directory: 'director'. Unreadable file: 'cannot read', 'could not read', 'unreadable', 'not readable', 'permission', 'EACCES' or 'access'. Outside the repository: 'outside' or 'not in/inside/within/part of'. The unreadable file is made with chmod 000, so the tests must not run as root.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/brief-path-validation.test.ts

**Decision:**

## A-008

**Criterion:** AC-008

**Assumption:** A `.doppelblind.conf` that holds only a comment line (`# ...`) declares no specs folder. 'The process fails' means a non-zero exit code.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/configuration.test.ts

**Decision:**

## A-009

**Criterion:** AC-010

**Assumption:** The existing subfolders `001-a` and `003-b` each hold a `spec.md`, `notes` holds `todo.md`, and `007-x.md` is a plain file. 'Unchanged' means byte-for-byte identical.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-folder-creation.test.ts

**Decision:**

## A-010

**Criterion:** AC-012

**Assumption:** Section labels are Markdown headings that start with the label (for example `## Criteria`). The title is on the first non-empty line. The link to the brief is a Markdown link whose target ends in `x.md`. The introduction text comes after the link and before the Criteria heading.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-document.test.ts

**Decision:**

## A-011

**Criterion:** AC-013

**Assumption:** The criterion heading is a Markdown heading inside the Criteria section. Given, When and Then are list items (`-`, `*` or `+`) that contain those words. The labels 'Why', 'Proven by', 'Rejects', 'Sources' and 'Open questions' appear literally, in this order, before the next section.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-document.test.ts

**Decision:**

## A-012

**Criterion:** AC-014

**Assumption:** In the spec agent's output, an open question's dependency is the field `depends_on: ["Q-02"]`. Q-02 is included in the output too. The Q-01 heading is a Markdown heading. The context and dependency lines contain 'Context' and 'Depends on'. An empty **Answer:** field means nothing but whitespace follows it before the next heading. Each wish is exactly one list line in the Wishes section.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/spec-document.test.ts

**Decision:**

## A-013

**Criterion:** AC-016

**Assumption:** The stand-in agent CLI lists its working directory when it starts. 'Empty' means that list is empty. 'Not inside the repository' means the path is neither the repository root nor below it.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/agent-input-and-run-record.test.ts

**Decision:**

## A-014

**Criterion:** AC-017

**Assumption:** A source for the spec agent is declared with the line `spec_sources = docs/product.md`. 'The recorded input' is the text of all files created in `.doppelblind` during the run. The brief text and source text are stored there unchanged, so a one-line marker from each can be found as-is.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/agent-input-and-run-record.test.ts
- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-015

**Criterion:** AC-018

**Assumption:** The run log is stored with the agent CLI's stdout content intact, so the session_id marker the fake prints can be found. The run's folder is a folder below `.doppelblind` (not `.doppelblind` itself) whose files include both the brief text and that marker.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/agent-input-and-run-record.test.ts

**Decision:**

## A-016

**Criterion:** AC-019

**Assumption:** A step marked done is a stderr line containing ✓, ✔ or the word 'done'. The steps are told apart by keywords, in this order: 'brief', 'source', 'spec', 'validat', and 'criteri' or 'citation'. The tests do not check the 'short detail' or that each step has exactly one line, because neither has a fixed wording.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/progress-output.test.ts

**Decision:**

## A-017

**Criterion:** AC-021

**Assumption:** The counts are on stderr lines that contain 'criteri' and 4, and 'question' and 2. The spec.md path appears as `specs/<folder>/spec.md`, either relative or inside an absolute path. 'The status of the spec step' and 'what to do next' have no measurable wording, so they are not asserted.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/progress-output.test.ts

**Decision:**

## A-018

**Criterion:** AC-022

**Assumption:** Standard output holds a single line with the spec.md path, either relative to the repository root or absolute. A trailing newline is allowed. That TUI lines appear on stderr is checked by a stderr line containing 'validat'.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/progress-output.test.ts

**Decision:**

## A-019

**Criterion:** AC-023

**Assumption:** Forbidden in stderr: cursor or erase control sequences (ESC [ … A–H, J, K, S, T, f, s, u, and ESC 7 / ESC 8), carriage returns, and spinner frames (Braille characters U+2800–U+28FF and ◐◓◑◒◴◷◶◵).

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/progress-output.test.ts

**Decision:**

## A-020

**Criterion:** AC-024

**Assumption:** The agent CLI that is not logged in exits with code 1. It prints 'not logged in' both on stderr and as an error result envelope on stdout. A step marked failed is a stderr line containing 'spec' and one of ✗, ✘, × or 'fail'. The run folder's path is shown either relative to the repository root (`.doppelblind/...`) or absolute, and it is a folder below `.doppelblind` holding the recorded brief text.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/agent-failures.test.ts

**Decision:**

## A-021

**Criterion:** AC-025

**Assumption:** 'Fails' means the agent CLI exits with code 1 and prints an error envelope. 'Interrupted by the user' means SIGINT is sent to the process group, as Ctrl-C would, once the agent CLI has started. The existing spec.md comes from an earlier successful run. The rerun is chosen by typing `1` on stdin. 'Input recorded' means a newly created file in `.doppelblind` contains the brief text.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/agent-failures.test.ts

**Decision:**

## A-022

**Criterion:** AC-026

**Assumption:** 'A criterion without a source' means the `sources` field is left out. The validating step is a stderr line containing 'validat' and a failure marker (✗, ✘, ×, 'fail'). The reason mentions 'source', on that line or a later one.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/agent-failures.test.ts

**Decision:**

## A-023

**Criterion:** AC-027

**Assumption:** The brief reaches the given state (spec folder `001-a` with open questions, spec step not final) by a first successful run with short name `a` and one unanswered open question. The new spec is recognised by its new title.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-024

**Criterion:** AC-028

**Assumption:** An answer is given by inserting its text on the line right after the question's **Answer:** line in spec.md. The question is found by its Markdown heading containing its ID. The sources are declared as in A-014, and the recorded input of the new run is the set of files created in `.doppelblind` during that run.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-025

**Criterion:** AC-029

**Assumption:** The recorded input lists the questions with their text, in ID order, and each answer appears between its own question's text and the next question's text. 'No answer for Q-04' is checked only by these three answer texts not appearing in the 120 characters after Q-04's question text.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-026

**Criterion:** AC-031

**Assumption:** 'Finishing the clarify run' means running the spec-agent command and choosing `2` (stop) at the prompt. 'Q-02 marked unanswered' means 'unanswered' (any case) appears either in Q-02's block or in the heading of the section that holds it. The later runs, one with each command, answer `1` on stdin, so a run that wrongly asks again would start the agent.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-027

**Criterion:** AC-032

**Assumption:** When the command asks the user to choose, the user types the option's number on stdin. `1` starts another spec-create run and `2` stops. Where no choice is asked, the input is ignored.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/agent-failures.test.ts
- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-028

**Criterion:** AC-034

**Assumption:** 'The command' is the spec-agent command. 'Standard input closed' means stdin is closed at once with no input. 'Stops with a message' is checked only by the output not being empty.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-029

**Criterion:** AC-035

**Assumption:** 'The command' is the spec-agent command, run with stdin closed. The step of the brief a question is about is a walkthrough step, given as the question's `context` and as its criterion's source anchor. Stderr names it by the step sentence without the final full stop. The default limit on free answers is below six. 'Too vague' is shown with the word 'vague'.

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**

## A-030

**Criterion:** AC-030

**Assumption:** Folder `001-a` comes from an earlier run on `docs/briefs/other.md`. 'Repeated spec-create runs' means a first run on `docs/briefs/x.md` and then a second run that answers `1` (another spec-create run).

**Test files:**

- tests/acceptance/001-orchestrator-spec-agent/clarification-rounds.test.ts

**Decision:**
