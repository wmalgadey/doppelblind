# Orchestrator CLI with spec agent and spec loop

Brief: [docs/briefs/orchestrator-spec-agent.md](../../docs/briefs/orchestrator-spec-agent.md)

Doppelblind orchestrates separate agent roles so that a developer working with coding agents can trust a result. This change delivers the first step of that loop (OUT-01). The user gives a brief to the spec agent from the command line. The spec agent turns the brief into a specification: binding criteria in Given-When-Then that each cite a source, plus open questions where it would otherwise fill in an answer. The orchestrator shows a minimal terminal UI that describes what is happening. It writes the result as `spec.md` into a consecutively numbered subfolder of the project's `specs` folder, and records each run in the project's `.doppelblind` folder. The user then answers the open questions in `spec.md`. They can run the flow again to mark questions as `free` or `out of scope`, to start another spec-create run on the brief, the sources and every answer so far, or to finish the spec step.

Some things are deliberately left out. Open questions are not answered while a spec-create run is going on. No other role is started: the flow ends after the spec agent, because nothing exists yet that could run after it. The orchestrator does not commit what it produces; for now the user commits it (see OUT-13). Choosing the model per role and using other agent CLIs belong to later outcomes. A nice logo in the TUI and using an LLM to work the answers into the document are wishes only.

## Criteria

### AC-001: Spec command produces spec.md in a new numbered folder

Why: The outcome is that the user can give a brief to the spec agent via CLI and receive a specification.

- **Given** A git repository whose root holds a complete `.doppelblind.conf`, whose configured `specs` folder does not exist, and which contains a brief at `docs/briefs/feature.md`; the current directory is the repository root
- **When** The user runs the spec command with the argument `docs/briefs/feature.md`
- **Then** Exactly one new subfolder exists in the configured `specs` folder, its name starts with `001-`, and it contains a file named `spec.md`

Proven by: acceptance test

Rejects: An implementation that prints the spec to the terminal but writes no file fails on 'it contains a file named spec.md'; one that writes `specs/spec.md` directly fails on 'name starts with 001-'.

Sources: `docs/briefs/orchestrator-spec-agent.md` › Am Ende existiert eine `spec.md`; `specs/001-orchestrator-spec-agent/answers.md` › the number has at least three digits, padded with leading zeros, and the first folder gets 001.

### AC-002: Brief path is relative to the current directory; specs folder is at the git root

- **Given** A git repository with a complete `.doppelblind.conf` at its root, a brief at `docs/briefs/feature.md`, and the current directory set to `docs`
- **When** The user runs the spec command with the argument `briefs/feature.md`
- **Then** The run succeeds, and the new spec folder is created inside the `specs` path configured in `.doppelblind.conf`, resolved relative to the repository root, not relative to `docs`

Proven by: acceptance test

Rejects: An implementation that resolves the brief path against the repository root fails because it cannot find the brief; one that creates `docs/specs/...` fails on 'resolved relative to the repository root'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › there is one command for the spec agent and one for the complete flow; both take the brief path relative to the current directory.; `specs/001-orchestrator-spec-agent/answers.md` › the project root is the root of the git repository that contains the current directory.

Unanswered: Q-28

### AC-003: Absolute brief path inside the project is accepted

- **Given** A git repository with a complete `.doppelblind.conf` and a brief at `docs/briefs/feature.md`
- **When** The user runs the spec command with the absolute path of that brief
- **Then** The run behaves as with the relative path: a new spec folder with a `spec.md` is created in the configured `specs` folder

Proven by: acceptance test

Rejects: An implementation that rejects every absolute path fails because it creates no spec folder.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › an absolute path inside the project is accepted like a relative one.

### AC-004: Missing brief path shows the usage

- **Given** A git repository with a complete `.doppelblind.conf`
- **When** The user runs the spec command without a brief path
- **Then** The process stops, the output shows the command's usage and a message that the brief path is missing, no spec agent run is recorded in `.doppelblind`, and nothing is created in the `specs` folder

Proven by: acceptance test

Rejects: An implementation that says only 'error' without the usage fails on 'shows the command's usage'; one that starts the agent with an empty brief fails on 'no spec agent run is recorded'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the process stops before the spec agent starts and the user sees a message naming the problem; a missing path also shows the usage.; `specs/001-orchestrator-spec-agent/answers.md` › nothing is created in `specs`.

### AC-005: Invalid brief path stops before the spec agent

- **Given** A git repository with a complete `.doppelblind.conf`, and in turn each of these brief paths: one that does not exist, one that names a directory, one that names a file without read permission, and one that names an existing file outside the repository
- **When** The user runs the spec command with that path
- **Then** For each path, the process stops, the user sees a message that names the problem for that path, no spec agent run is recorded in `.doppelblind`, and nothing is created in the `specs` folder

Proven by: acceptance test

Rejects: An implementation that accepts a brief outside the repository fails on 'nothing is created in the specs folder'; one that crashes with a generic stack trace on a directory fails on 'a message that names the problem'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the process stops before the spec agent starts and the user sees a message naming the problem; a missing path also shows the usage.; `specs/001-orchestrator-spec-agent/answers.md` › nothing is created in `specs`.

Unanswered: Q-39

### AC-006: Next folder number is one above the highest numbered subfolder

- **Given** A `specs` folder that contains the subfolders `001-alpha` and `003-gamma`, a subfolder `drafts`, a subfolder `7notes`, and a file `010-readme.md`, and a new brief that has no spec folder yet
- **When** The user runs the spec command for the new brief
- **Then** The new spec folder's name starts with `004-`; no folder starting with `002-` or `011-` is created, and the existing entries are unchanged

Proven by: acceptance test

Rejects: An implementation that fills the gap fails on 'starts with 004-' because it creates `002-...`; one that counts the file `010-readme.md` fails because it creates `011-...`.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the next number is one above the highest number of any subfolder whose name starts with a number and a dash.; `specs/001-orchestrator-spec-agent/answers.md` › gaps are not filled, and entries whose names do not start with a number, as well as files, are ignored.

Unanswered: Q-42

### AC-007: Folder number has at least three digits

- **Given** First, a `specs` folder that contains only `009-old`; then, separately, a `specs` folder that contains only `999-old`
- **When** The user runs the spec command for a new brief in each case
- **Then** In the first case the new folder's name starts with `010-`; in the second case it starts with `1000-`

Proven by: acceptance test

Rejects: An implementation without zero padding fails on 'starts with 010-' because it creates `10-...`; one that wraps around after 999 fails on 'starts with 1000-'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the number has at least three digits, padded with leading zeros, and the first folder gets 001.

### AC-008: Folder name ends in the spec's short name

- **Given** Any brief for which the spec command succeeds
- **When** The new spec folder is created
- **Then** The part of the folder name after the number and the first dash is non-empty, contains no upper-case letters and no spaces, and is at most 50 characters long

Proven by: acceptance test

Rejects: An implementation that uses the brief's file name with spaces and capitals fails on 'contains no upper-case letters and no spaces'; one that does not shorten a long title fails on 'at most 50 characters'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › after the number and a dash comes a short name in English that the spec agent gives the spec, in lower case with dashes instead of spaces and at most 50 characters.

### AC-009: spec.md has the fixed top-level layout

- **Given** A `spec.md` produced by a successful run
- **When** The user opens it
- **Then** It starts with a title, a link to the brief and an introduction, followed by headings named exactly `Criteria`, `Wishes`, `Left open`, `Out of scope`, `Unanswered` and `Open questions`, in this order

Proven by: acceptance test

Rejects: An implementation that puts `Open questions` before `Criteria`, or names a section `Offene Fragen`, fails on 'named exactly ... in this order'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › spec.md starts with the title, a link to the brief and an introduction, followed by the sections Criteria, Wishes, Left open, Out of scope, Unanswered and Open questions, in this order.; `specs/001-orchestrator-spec-agent/answers.md` › the labels are fixed and in English.; `docs/decisions.md` › DEC-005

Unanswered: Q-25, Q-44

### AC-010: Each criterion and wish has the fixed layout

- **Given** A `spec.md` produced by a successful run that contains at least one criterion and one wish
- **When** The user reads the Criteria and Wishes sections
- **Then** Each criterion is a heading with its ID and title, optionally followed by a `Why` line, then Given, When and Then as a list, then the lines `Proven by`, `Rejects`, `Sources` and `Open questions`, in this order; each wish is one list item in the Wishes section

Proven by: acceptance test

Rejects: An implementation that writes a criterion as one paragraph without the `Proven by` and `Sources` lines fails on 'then the lines Proven by, Rejects, Sources and Open questions'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › each criterion is a heading with its ID and title, an optional Why line, Given, When and Then as a list, then the lines Proven by, Rejects, Sources and Open questions.; `specs/001-orchestrator-spec-agent/answers.md` › each wish is one list item.

### AC-011: Each new open question has an empty Answer field

- **Given** A `spec.md` produced by a first spec-create run for a brief, containing at least one open question
- **When** The user reads the Open questions section
- **Then** Each open question is a heading with its ID, followed by the question, a context line, optionally a `Depends on` line, and a `**Answer:**` field with nothing between the field and the next heading

Proven by: acceptance test

Rejects: An implementation that fills in a suggested answer below `**Answer:**` fails on 'nothing between the field and the next heading'; one without an Answer field fails on 'a **Answer:** field'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › each open question is a heading with its ID, the question, a context line, an optional Depends on line and an Answer field.; `specs/001-orchestrator-spec-agent/answers.md` › an empty field means the question has no answer yet

### AC-012: Spec is written in English for a brief in any language

Why: Otherwise a spec mixes German and English.

- **Given** A brief written in German, such as `docs/briefs/orchestrator-spec-agent.md`
- **When** The user runs the spec command for it
- **Then** The run succeeds, and the produced `spec.md` is written in English, except for cited anchors, which appear in the language of their source

Proven by: review

Rejects: An implementation whose spec agent answers in German, or translates a German anchor into English, is spotted by the user through 'written in English, except for cited anchors'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the brief is accepted in any language.; `specs/001-orchestrator-spec-agent/answers.md` › the spec agent writes the spec in English, and cited anchors stay in the language of their source.; `docs/decisions.md` › DEC-005

### AC-013: Open questions are not answered during the spec-create run

- **Given** A new brief that has no spec folder, and standard input closed (at end of input) from the start
- **When** The user runs the spec command and the spec agent returns at least one open question
- **Then** The run completes and writes `spec.md` with the open questions and empty Answer fields; it does not stop with a message that a choice cannot be read

Proven by: acceptance test

Rejects: An implementation that prompts for each open question after the spec agent returns fails on 'does not stop with a message that a choice cannot be read', because at end of input it must stop.

Sources: `docs/briefs/orchestrator-spec-agent.md` › Die offenen Fragen werden nicht während des Laufs beantwortet.; `specs/001-orchestrator-spec-agent/answers.md` › a choice that cannot be read because the input has ended stops the process with a message.

Unanswered: Q-38

### AC-014: Without an interactive terminal, only the spec path goes to standard output

- **Given** A new brief and a complete project setup, with standard output and standard error both redirected to files (not a terminal)
- **When** The user runs the spec command and it succeeds
- **Then** Standard output contains only the path of the produced `spec.md`; the TUI text appears on standard error as plain lines that contain no cursor-movement escape sequences and no spinner characters overwriting each other

Proven by: acceptance test

Rejects: An implementation that prints the progress lines to standard output fails on 'standard output contains only the path'; one that keeps redrawing a spinner with escape codes fails on 'no cursor-movement escape sequences'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › without an interactive terminal the TUI writes plain lines without a spinner or cursor movement.; `specs/001-orchestrator-spec-agent/answers.md` › the TUI goes to standard error and only the path of the produced `spec.md` goes to standard output.

### AC-015: TUI shows one line per step with its state

- **Given** A new brief and a complete project setup, run in an interactive terminal
- **When** The user runs the spec command
- **Then** The TUI shows one line each for reading the brief, loading the binding sources, the spec agent writing the spec, validating its output, and checking its criteria and citations; the running step shows how long it has been running, and each finished step is marked done with a short detail

Proven by: review

Rejects: An implementation that shows only a single spinner saying 'working…' is spotted through 'one line each for ...'; one that shows no elapsed time is spotted through 'shows how long it has been running'.

Sources: `docs/briefs/orchestrator-spec-agent.md` › Der Orchestrator zeigt eine minimale TUI, die beschreibt, was gerade passiert.; `specs/001-orchestrator-spec-agent/answers.md` › the TUI shows one line per step: reading the brief, loading the binding sources, the spec agent writing the spec, validating its output and checking its criteria and citations.; `specs/001-orchestrator-spec-agent/answers.md` › the running step shows how long it has been running; a finished step is marked done with a short detail, a failed step is marked failed and followed by the reason.

Unanswered: Q-41

### AC-016: TUI ends with counts and the spec path

- **Given** A successful run of the spec command, with standard error captured
- **When** The run ends
- **Then** The final TUI output on standard error states a number of criteria and a number of open questions that equal the numbers of criterion headings and open question headings in the produced `spec.md`, and the path of that `spec.md`

Proven by: acceptance test

Rejects: An implementation that prints only 'done' fails on 'the path of that spec.md'; one that counts the wishes as criteria fails on 'equal the numbers of criterion headings'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › at the end it shows the number of criteria and open questions, the status of the spec step, what to do next and the path of the produced `spec.md`.

Unanswered: Q-40

### AC-017: Invalid structured output stops the process without writing a spec

- **Given** First, a new brief with no spec folder; then, separately, a brief whose spec folder already holds a `spec.md`; in both cases the spec agent returns output that does not match its output schema
- **When** The user runs the spec command
- **Then** The process stops, the TUI marks the step that validates the output as failed and follows it with the reason; in the first case no spec folder is created, and in the second the existing `spec.md` is byte-for-byte unchanged

Proven by: acceptance test

Rejects: An implementation that treats unparseable output as 'no criteria, no questions' and writes an empty spec fails on 'no spec folder is created'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › specs are only written or changed when the output is valid.; `docs/product.md` › invalid output is a failure, never an empty list; `specs/001-orchestrator-spec-agent/answers.md` › a failed step is marked failed and followed by the reason.

### AC-018: A failing agent run stops the process and keeps its trace

- **Given** First, a new brief with no spec folder; then, separately, a brief whose spec folder already holds a `spec.md`; in both cases the agent CLI fails during the run (it is not installed, the user is not logged in, it aborts, or the user interrupts it)
- **When** The user runs the spec command
- **Then** The process stops; the TUI marks the running step as failed and shows the reason the agent CLI gave and the path of the run's trace; that path exists inside `.doppelblind` and holds what was recorded up to the failure; in the first case no spec folder is created, and in the second the existing `spec.md` is unchanged

Proven by: acceptance test

Rejects: An implementation that deletes the run folder on failure fails on 'that path exists inside .doppelblind'; one that creates an empty spec folder before the agent starts fails on 'no spec folder is created'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the TUI marks the running step as failed and shows a message with the reason the agent CLI gave and the path of the run's trace.; `specs/001-orchestrator-spec-agent/answers.md` › no spec folder is created and an existing spec.md stays unchanged.; `specs/001-orchestrator-spec-agent/answers.md` › the run's folder in `.doppelblind` is kept with everything recorded up to the failure.

Unanswered: Q-43

### AC-019: Each run is recorded in the project's .doppelblind folder

Why: The record exists for later analysis.

- **Given** A successful run of the spec command for a brief
- **When** The run ends
- **Then** The project's `.doppelblind` folder contains a folder for this run that holds the input given to the spec agent (including the brief's text), the guardrails it ran with, the agent's run log, and the spec agent's output

Proven by: acceptance test

Rejects: An implementation that keeps the run log only in memory, or writes it to a temporary directory outside the project, fails on 'the project's .doppelblind folder contains a folder for this run'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › yes, it should contain the inputs, the guardrails and the run log from the agent; `docs/product.md` › Every run records its state, its logs and the input and output of every role in the project's .doppelblind folder

Unanswered: Q-45

### AC-020: Spec agent runs isolated from the project

- **Given** The record of any spec agent run in `.doppelblind`
- **When** The user reviews the guardrails recorded for that run
- **Then** They show that the spec agent ran without tools, without settings and without project files, in an empty working directory, and that it received only the message the orchestrator handed it

Proven by: review

Rejects: An implementation that starts the agent in the project root with file-reading tools enabled is spotted through 'without tools ... in an empty working directory' in the recorded guardrails.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the spec agent runs without tools, without settings and without project files, in an empty working directory.

Unanswered: Q-45

### AC-021: Spec agent receives exactly the sources configured for it

- **Given** A project whose `.doppelblind.conf` configures `docs/product.md` as a source for the spec agent, and which also contains `docs/unlisted.md` with a unique marker text that is not configured
- **When** The user runs the spec command
- **Then** The recorded input of the spec agent run contains the text of `docs/product.md` and does not contain the marker text of `docs/unlisted.md`

Proven by: acceptance test

Rejects: An implementation that sends every Markdown file under `docs` fails on 'does not contain the marker text of docs/unlisted.md'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › yes, they should be configurable per agent.

Unanswered: Q-26

### AC-022: Missing .doppelblind.conf is created at the project root

- **Given** A git repository without `.doppelblind.conf` at its root, and a brief inside it
- **When** The user runs the spec command from a subdirectory of the repository
- **Then** A file `.doppelblind.conf` exists at the repository root afterwards, and none is created in the subdirectory

Proven by: acceptance test

Rejects: An implementation that only reports the missing file fails on 'a file .doppelblind.conf exists at the repository root'; one that creates it in the current directory fails on 'none is created in the subdirectory'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the file should be created if missing and the process has to fail if it is imcomplete; `specs/001-orchestrator-spec-agent/answers.md` › the `specs` folder is the path given in `.doppelblind.conf` at that root, relative to it.

Unanswered: Q-26, Q-27

### AC-023: Incomplete .doppelblind.conf makes the process fail

- **Given** A git repository whose `.doppelblind.conf` lacks a required entry, and a brief inside it
- **When** The user runs the spec command
- **Then** The process stops with a failed step followed by the reason, no spec agent run is recorded in `.doppelblind`, and no spec folder is created

Proven by: acceptance test

Rejects: An implementation that falls back to built-in default paths and continues fails on 'no spec folder is created'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the file should be created if missing and the process has to fail if it is imcomplete; `specs/001-orchestrator-spec-agent/answers.md` › a failed step is marked failed and followed by the reason.

Unanswered: Q-26

### AC-024: A new spec-create run replaces spec.md in the brief's folder

- **Given** A brief that already has the spec folder `002-feature` holding a `spec.md` whose spec step is not final, and another brief's folder `001-other`
- **When** A new spec-create run for the first brief completes
- **Then** No new spec folder is created; `002-feature/spec.md` holds the new spec; every file in `001-other` is unchanged

Proven by: acceptance test

Rejects: An implementation that creates `003-feature` for the rerun fails on 'no new spec folder is created'; one that renumbers or touches `001-other` fails on 'every file in 001-other is unchanged'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the brief keeps its spec folder.; `specs/001-orchestrator-spec-agent/answers.md` › its spec replaces the earlier spec.md in the same folder; `specs/001-orchestrator-spec-agent/answers.md` › spec folders of other briefs stay unchanged.

Unanswered: Q-21, Q-23

### AC-025: A rerun gets the answers, but not the earlier spec or the run count

- **Given** A brief whose `spec.md` has two open questions, one answered with the text `Answer marker XYZ` and one answered with `free`, written after their `**Answer:**` fields, and whose earlier `spec.md` contains a criterion title found nowhere else
- **When** A new spec-create run for the brief starts
- **Then** The recorded input of that spec agent run contains the brief, the configured sources, `Answer marker XYZ` and the `free` answer; it does not contain the earlier criterion title and does not state how many spec-create runs came before

Proven by: acceptance test

Rejects: An implementation that sends the previous `spec.md` as context fails on 'does not contain the earlier criterion title'; one that ignores the answers in `spec.md` fails on 'contains ... Answer marker XYZ'.

Sources: `docs/product.md` › never on its earlier spec and never told how many runs came before; `specs/001-orchestrator-spec-agent/answers.md` › the user writes the answer on the lines after the question's **Answer:** field, up to the next heading.; `specs/001-orchestrator-spec-agent/answers.md` › `free` and `out of scope` are written as these exact words, alone in the field.

Unanswered: Q-23, Q-37

### AC-026: Unanswered questions are never given to the spec agent

- **Given** A brief whose spec has a question marked `unanswered` by the orchestrator, and a later spec agent run for that brief
- **When** That spec agent run starts
- **Then** Its recorded input does not contain that question as answered, and does not contain the marker `unanswered`

Proven by: acceptance test

Rejects: An implementation that passes 'Q-03: unanswered' to the agent as an answer fails on 'does not contain the marker unanswered'.

Sources: `docs/product.md` › That a question stayed unanswered is recorded by the orchestrator, never written as an answer and never given to the spec agent.; `specs/001-orchestrator-spec-agent/answers.md` › the marker `unanswered` is written only by the orchestrator and is not an answer.

Unanswered: Q-24

### AC-027: A clarify choice at end of input stops the process

- **Given** A brief whose `spec.md` has at least one open question with an empty Answer field and whose spec step is not final, and standard input closed
- **When** The user starts the spec command for that brief again
- **Then** The process stops with a message that the choice cannot be read, no spec-create run is recorded in `.doppelblind`, and the spec step is not final

Proven by: acceptance test

Rejects: An implementation that treats end of input as 'finish' and marks the questions `unanswered` fails on 'the spec step is not final'; one that hangs waiting for input fails on 'the process stops'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › a choice that cannot be read because the input has ended stops the process with a message.; `specs/001-orchestrator-spec-agent/answers.md` › start the flow again and mark unanswered question with `free` or `out of scope`

Unanswered: Q-35

### AC-028: Finishing with unanswered questions makes the spec step final

- **Given** A brief whose `spec.md` has at least one open question with an empty Answer field, and whose answers have all already reached the spec agent
- **When** The user starts the flow for the brief again and chooses to finish the spec step
- **Then** No spec-create run starts; afterwards, starting the spec command for that brief again records no new spec-create run and leaves `spec.md` unchanged

Proven by: acceptance test

Rejects: An implementation that starts a new spec-create run on finish, or that lets a later invocation start one, fails on 'records no new spec-create run'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › If you `finish` the clarify run while any question is unanswered, those questions will be marked `unanswered` and the spec-agent is finished.; `specs/001-orchestrator-spec-agent/answers.md` › once the spec step is final, no further spec-create run starts for that brief.

Unanswered: Q-21, Q-22, Q-24, Q-35

### AC-029: Final run when an answer has not reached the spec agent

- **Given** A brief whose `spec.md` has an open question that the user answered with their own text after the last spec-create run
- **When** The user makes the spec final, either by finishing the spec step or by choosing not to start another spec-create run
- **Then** Exactly one more spec-create run is recorded whose input contains that answer, `spec.md` is replaced by its spec, its open questions are treated as `unanswered`, and the spec step is final

Proven by: acceptance test

Rejects: An implementation that makes the spec final without that run fails on 'exactly one more spec-create run is recorded'; one that then asks the user about the new questions again fails on 'its open questions are treated as unanswered'.

Sources: `docs/product.md` › If an answer has not reached the spec agent yet, it runs once more, and its open questions are answered as `unanswered`.

Unanswered: Q-24, Q-41

### AC-030: When all questions are answered, the user decides about another spec-create run

- **Given** A brief whose `spec.md` has open questions that all have answers in their Answer fields, and whose spec step is not final
- **When** The user starts the flow for the brief again and chooses to start another spec-create run
- **Then** A new spec-create run is recorded, and its spec replaces `spec.md` in the same folder

Proven by: acceptance test

Rejects: An implementation that makes the spec final as soon as all questions are answered, without offering another run, fails on 'a new spec-create run is recorded'.

Sources: `specs/001-orchestrator-spec-agent/answers.md` › If all questions are answered, you decide whether another spec-create run starts with step 1. or to stop the spec-agent.; `specs/001-orchestrator-spec-agent/answers.md` › rerunning and finishing the spec is part of this spec

Unanswered: Q-21, Q-35, Q-37, Q-38

### AC-031: Choosing to stop leaves the spec step open

- **Given** A brief whose `spec.md` has at least one open question with an empty Answer field
- **When** The user starts the flow for the brief again and, for that question, chooses to stop and answer it later
- **Then** The process ends without a spec-create run, and the spec step is not final: after the user writes an answer into the field, starting the flow again lets the user start another spec-create run

Proven by: acceptance test

Rejects: An implementation that treats stop like finish fails on 'the spec step is not final'.

Sources: `docs/product.md` › For each, I choose free, out of scope, to stop and answer it later, or to finish the spec step

Unanswered: Q-35, Q-36

### AC-032: No other role is started

Why: The flow ends after the spec agent, because nothing exists yet that could run after it.

- **Given** A new brief and a complete project setup
- **When** The user runs the complete-flow command for it and the spec step becomes final
- **Then** The run record in `.doppelblind` contains only spec agent runs, and the process ends after the spec step

Proven by: acceptance test

Rejects: An implementation that starts a test author after the spec fails on 'contains only spec agent runs'.

Sources: `docs/briefs/orchestrator-spec-agent.md` › Es werden keine anderen Rollen gestartet.

Unanswered: Q-34

### AC-033: The orchestrator does not commit

- **Given** A git repository and a brief, with the repository's commit history noted beforehand
- **When** The user runs the spec command and it succeeds
- **Then** The repository's commit history is unchanged, and the produced spec folder is uncommitted

Proven by: acceptance test

Rejects: An implementation that commits `spec.md` automatically fails on 'the repository's commit history is unchanged'.

Sources: `docs/product.md` › For now I commit them myself (see OUT-13).

## Wishes

- A nice logo/figlet at the top of the TUI.
- Possibly consult an LLM to work my answers to the open questions into the document.

## Left open

- Q-05: OUT-01 lists the GATES capability. Does the orchestrator in this change check the produced spec, such as whether every criterion cites a source from the project's allowlist and whether each anchor really appears in that source? If so, what happens when a check fails?
- Q-18: What exit status should the command return on success and on each kind of failure?

## Out of scope

None.

## Unanswered

- Q-21: How does the orchestrator tell that a brief already has a spec folder? This covers a brief file that was moved, renamed or edited since its spec was created.
- Q-22: What does the user see, and what happens, when they start a command for a brief whose spec step is already final?
- Q-23: A new spec-create run replaces spec.md. Where are the user's earlier answers kept so that every answer so far reaches later runs?
- Q-24: When the user chooses `free` or `out of scope` for a question during a clarify run, or when questions are marked `unanswered` on finish, where and in what form is this written down?
- Q-25: What do the sections Left open, Out of scope and Unanswered in spec.md list, and in what form?
- Q-26: What must `.doppelblind.conf` contain for this change, what counts as incomplete, and what does the orchestrator write into the file when it creates it?
- Q-27: After the orchestrator creates a missing `.doppelblind.conf`, does the run continue, or does it stop? And what does the user see?
- Q-28: What happens when the command is run in a directory that is not inside a git repository?
- Q-29: What happens when the `specs` path configured in `.doppelblind.conf` points outside the project, or names an existing file?
- Q-30: What are the default time, cost and turn limits, both for a single spec agent run and for the complete spec-agent run?
- Q-31: How does the user change the time, cost and turn limits when starting a command? What happens when they try to raise the turn limit above its default?
- Q-32: What happens when a spec agent run, or the complete spec-agent run, reaches its time, cost or turn limit? What does the user see, what can they decide at that point, and what is kept of the run?
- Q-33: The agent runs under a subscription, not a per-token API key. How is the cost of a run measured for the cost limit?
- Q-34: In this change, does the complete-flow command behave differently in any observable way from the spec command?
- Q-35: In a clarify run, how are the choices for each unanswered question presented, and how does the user enter them? How is the decision about another spec-create run presented and entered?
- Q-36: If the user chooses `free` or `out of scope` for some questions and then chooses to stop at a later question, are the earlier choices kept?
- Q-37: What happens in a clarify run when the user has changed spec.md beyond the Answer fields, such as by deleting or renaming a question heading, changing an ID, or deleting the file?
- Q-38: What happens when the spec agent returns a spec with no open questions at all? Is the user asked whether another spec-create run starts, or does the spec step become final, or something else?
- Q-39: What happens when the brief file is empty?
- Q-40: What values can the status of the spec step take at the end of the TUI, and what does the 'what to do next' text say in each case?
- Q-41: What does the TUI show during a clarify run and during the extra spec-create run on finish, and which step lines appear there?
- Q-42: What happens when two runs for different new briefs in the same project would create a spec folder at the same time?
- Q-43: What happens when the user interrupts the process outside a spec agent run, such as while a clarify choice is being asked or while spec.md is being written?
- Q-44: How is the link to the brief at the top of spec.md written, and what is it relative to?
- Q-45: How must the run's folder in `.doppelblind` be named and laid out, and in what form are the inputs, guardrails and run log stored there?

## Open questions

None.
