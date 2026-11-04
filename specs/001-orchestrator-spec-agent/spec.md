# Orchestrator CLI that runs the spec agent on a brief

Brief: [docs/briefs/orchestrator-spec-agent.md](../../docs/briefs/orchestrator-spec-agent.md)

Doppelblind is meant to orchestrate separate agent roles whose information boundaries are enforced technically. This change delivers its first outcome, OUT-01: a user gives a brief to the spec agent from the command line and gets back a specification. Each criterion in that specification cites a source, and decisions that no source makes appear as open questions instead of filled-in answers. The orchestrator hands the brief and the project's binding sources to the spec agent. While it runs, a minimal terminal display shows what is happening. The result is written as a `spec.md` in a numbered subfolder of the project's specs folder. The user answers the open questions in that file and can then start further spec-create runs or finish the spec step.

The change deliberately leaves two things out. Open questions are not answered during the run. No role other than the spec agent is started: the flow ends after the spec agent, because nothing exists yet that could run after it.

## Criteria

### AC-001: Spec command turns a relative brief path into a spec.md

- **Given** A git repository whose root holds a complete `.doppelblind.conf` declaring the specs folder `specs`, and a brief file `docs/briefs/x.md`, with the current directory at the repository root
- **When** The user runs the spec-agent command with the argument `docs/briefs/x.md` and the spec agent returns valid output
- **Then** A file `spec.md` exists in a newly created subfolder of `specs`, and no other new subfolder of `specs` exists

Proven by: acceptance test

Rejects: An implementation that resolves the brief path relative to the location of the orchestrator's own installation fails, because it does not find the brief and no `spec.md` appears under `specs`

Sources: `docs/briefs/orchestrator-spec-agent.md` › Den Brief übergebe ich als Pfad relativ zum aktuellen Verzeichnis.; `specs/001-orchestrator-spec-agent/answers.md` › there is one command for the spec agent and one for the complete flow; both take the brief path relative to the current directory.

### AC-002: Flow command starts no role other than the spec agent

Why: The flow ends after the spec agent because nothing exists yet that could run after it.

- **Given** The same project as in AC-001, with a snapshot of all files outside `specs`, `.doppelblind` and `.doppelblind.conf`
- **When** The user runs the complete-flow command with the brief path `docs/briefs/x.md` and the spec agent returns valid output
- **Then** A `spec.md` exists in a new subfolder of `specs`, and no file outside `specs`, the `.doppelblind` folder and `.doppelblind.conf` was created, changed or deleted

Proven by: acceptance test

Rejects: An implementation whose flow command goes on to start a test author that writes acceptance test files fails, because those files appear outside the allowed paths

Sources: `docs/briefs/orchestrator-spec-agent.md` › Es werden keine anderen Rollen gestartet. Der Flow ist nach dem Spec-Agent zu Ende, da es noch nichts gibt, was danach ausgeführt werden kann.; `specs/001-orchestrator-spec-agent/answers.md` › there is one command for the spec agent and one for the complete flow; both take the brief path relative to the current directory.

Unanswered: Q-21

### AC-003: Absolute brief path inside the project is accepted

- **Given** The project from AC-001
- **When** The user runs the spec-agent command with the absolute path of `docs/briefs/x.md`
- **Then** A `spec.md` exists in a new subfolder of `specs`, exactly as for the relative path

Proven by: acceptance test

Rejects: An implementation that rejects every absolute path as an error fails, because no `spec.md` is created

Sources: `specs/001-orchestrator-spec-agent/answers.md` › an absolute path inside the project is accepted like a relative one.

### AC-004: Specs folder is resolved from the git repository root

- **Given** The project from AC-001, with the current directory set to its subdirectory `docs`
- **When** The user runs the spec-agent command with the argument `briefs/x.md`
- **Then** The new `spec.md` is in a subfolder of `<repository root>/specs`, and no `specs` folder is created under `docs`

Proven by: acceptance test

Rejects: An implementation that resolves the specs folder relative to the current directory fails, because it creates `docs/specs/...`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the project root is the root of the git repository that contains the current directory.; `specs/001-orchestrator-spec-agent/answers.md` › the `specs` folder is the path given in `.doppelblind.conf` at that root, relative to it.

### AC-005: Missing brief path stops with a usage message

- **Given** The project from AC-001
- **When** The user runs the spec-agent command without a brief path
- **Then** The process ends without starting the spec agent, the output shows a message naming the missing path together with the command's usage, and nothing is created in `specs`

Proven by: acceptance test

Rejects: An implementation that starts the spec agent with an empty brief fails, because the spec agent is started and no usage is shown

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the process stops before the spec agent starts and the user sees a message naming the problem; a missing path also shows the usage.; `specs/001-orchestrator-spec-agent/answers.md` › nothing is created in `specs`.

### AC-006: Invalid brief path stops before the spec agent

- **Given** The project from AC-001
- **When** The user runs the spec-agent command with, in separate runs, a path that does not exist, a path to a directory, a path to an unreadable file, and a path to a file outside the git repository
- **Then** In each run the process ends without starting the spec agent, shows a message naming the problem, and nothing is created in `specs`

Proven by: acceptance test

Rejects: An implementation that accepts a brief outside the repository fails, because the spec agent is started and a spec folder is created

Sources: `specs/001-orchestrator-spec-agent/answers.md` › points to a directory, is absolute, or points outside the project; `specs/001-orchestrator-spec-agent/answers.md` › the process stops before the spec agent starts and the user sees a message naming the problem; a missing path also shows the usage.

### AC-007: Missing .doppelblind.conf is created

- **Given** A git repository with a brief file but no `.doppelblind.conf` at its root
- **When** The user runs the spec-agent command with the brief path
- **Then** A file `.doppelblind.conf` exists at the repository root afterwards

Proven by: acceptance test

Rejects: An implementation that only reports the missing file and creates nothing fails, because no `.doppelblind.conf` exists afterwards

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the file should be created if missing and the process has to fail if it is imcomplete

Unanswered: Q-27, Q-28

### AC-008: Incomplete .doppelblind.conf makes the process fail

- **Given** A git repository with a brief file and a `.doppelblind.conf` at its root that declares no specs folder
- **When** The user runs the spec-agent command with the brief path
- **Then** The process fails and no spec folder and no `spec.md` is created

Proven by: acceptance test

Rejects: An implementation that falls back to a built-in specs folder when the contract lacks one fails, because it creates a spec folder

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the file should be created if missing and the process has to fail if it is imcomplete

Unanswered: Q-27, Q-29

### AC-009: First spec folder gets number 001

- **Given** The project from AC-001, in one case with no `specs` folder and in another with an empty `specs` folder
- **When** The user runs the spec-agent command with the brief path and the spec agent returns valid output
- **Then** The new subfolder's name starts with `001-`

Proven by: acceptance test

Rejects: An implementation that numbers without padding fails, because the folder starts with `1-`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the number has at least three digits, padded with leading zeros, and the first folder gets 001.

### AC-010: Next number is one above the highest numbered subfolder

- **Given** A `specs` folder containing subfolders `001-a` and `003-b`, a subfolder `notes`, and a file `007-x.md`
- **When** The user runs the spec-agent command on a new brief and the spec agent returns valid output
- **Then** The new subfolder's name starts with `004-`, and `001-a`, `003-b`, `notes` and `007-x.md` are unchanged

Proven by: acceptance test

Rejects: An implementation that fills the gap and creates `002-...` fails, as does one that counts the file and creates `008-...`, because the name does not start with `004-`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the next number is one above the highest number of any subfolder whose name starts with a number and a dash.; `specs/001-orchestrator-spec-agent/answers.md` › gaps are not filled, and entries whose names do not start with a number, as well as files, are ignored.

### AC-011: Folder name carries the spec agent's short name

- **Given** The project from AC-001, and a spec agent whose valid output gives the spec the short name `brief-to-spec`
- **When** The user runs the spec-agent command with the brief path
- **Then** The new subfolder is named `001-brief-to-spec`

Proven by: acceptance test

Rejects: An implementation that derives the folder name from the brief's file name fails, because the folder is named `001-x`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › after the number and a dash comes a short name in English that the spec agent gives the spec, in lower case with dashes instead of spaces and at most 50 characters.

Unanswered: Q-38

### AC-012: spec.md has the fixed top-level structure

Why: Fixed English labels keep a spec from mixing German and English.

- **Given** A spec produced from a German brief by valid spec agent output with at least one criterion, one wish and one open question
- **When** The user opens the produced `spec.md`
- **Then** It starts with the title, a link to the brief and an introduction, followed by sections with the English labels Criteria, Wishes, Left open, Out of scope, Unanswered and Open questions, in this order

Proven by: acceptance test

Rejects: An implementation that leaves out the empty sections Left open, Out of scope and Unanswered, or translates the labels into the brief's language, fails on the section list

Sources: `specs/001-orchestrator-spec-agent/answers.md` › spec.md starts with the title, a link to the brief and an introduction, followed by the sections Criteria, Wishes, Left open, Out of scope, Unanswered and Open questions, in this order.; `docs/decisions.md` › DEC-005: Agents write their output in English

### AC-013: Criterion layout in spec.md

- **Given** A spec produced from valid spec agent output containing a criterion AC-001 with a reason, Given, When, Then, proven by, rejects and a source
- **When** The user opens the produced `spec.md`
- **Then** Under Criteria there is a heading containing `AC-001` and its title, followed by a Why line, Given, When and Then as a list, then the lines Proven by, Rejects, Sources and Open questions

Proven by: acceptance test

Rejects: An implementation that writes criteria as one table row each fails, because there is no heading with the ID and title

Sources: `specs/001-orchestrator-spec-agent/answers.md` › each criterion is a heading with its ID and title, an optional Why line, Given, When and Then as a list, then the lines Proven by, Rejects, Sources and Open questions.

### AC-014: Wish and open question layout in spec.md

- **Given** A spec produced from valid spec agent output with two wishes and an open question Q-01 that has a context and depends on Q-02
- **When** The user opens the produced `spec.md`
- **Then** Under Wishes each wish is one list item; under Open questions there is a heading containing `Q-01`, followed by the question, a context line, a Depends on line naming Q-02, and an empty **Answer:** field

Proven by: acceptance test

Rejects: An implementation that leaves out the Answer field fails, because the user has nowhere to answer

Sources: `specs/001-orchestrator-spec-agent/answers.md` › each wish is one list item.; `specs/001-orchestrator-spec-agent/answers.md` › each open question is a heading with its ID, the question, a context line, an optional Depends on line and an Answer field.

### AC-015: Spec from a non-English brief is written in English

Why: Otherwise a spec would mix German and English.

- **Given** A brief written in German
- **When** The user runs the spec-agent command on it and opens the produced `spec.md`
- **Then** Title, introduction, criteria, wishes and questions are in English, while cited anchors stay word for word in the language of their source

Proven by: review

Rejects: An implementation that writes the spec in German, or translates German anchors into English, is spotted in review by the text language or the changed anchors

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the spec agent writes the spec in English, and cited anchors stay in the language of their source.; `docs/decisions.md` › DEC-005: Agents write their output in English

### AC-016: Spec agent runs in an empty working directory outside the project

Why: No boundary may exist only as a prompt.

- **Given** The project from AC-001
- **When** The user runs the spec-agent command and the spec agent process is started
- **Then** The spec agent process's working directory is empty when it starts and does not lie inside the project's git repository

Proven by: acceptance test

Rejects: An implementation that starts the agent CLI with the project root as its working directory fails, because that directory is not empty and lies inside the repository

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the spec agent runs without tools, without settings and without project files, in an empty working directory.; `docs/product.md` › No boundary that exists only as a prompt.

### AC-017: Spec agent receives the brief and only the sources declared for it

- **Given** A `.doppelblind.conf` declaring `docs/product.md` as a source for the spec agent, and a file `docs/other.md` that is not declared
- **When** The user runs the spec-agent command and the run is recorded in `.doppelblind`
- **Then** The recorded input of the spec agent contains the brief text and the text of `docs/product.md`, and does not contain the text of `docs/other.md`

Proven by: acceptance test

Rejects: An implementation that hands the spec agent every Markdown file in `docs` fails, because the recorded input contains the text of `docs/other.md`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › yes, they should be configurable per agent.; `specs/001-orchestrator-spec-agent/answers.md` › it sees only the message the orchestrator hands it

Unanswered: Q-27

### AC-018: Run record in .doppelblind holds input and agent run log

- **Given** The project from AC-001
- **When** The user runs the spec-agent command and it completes
- **Then** The project's `.doppelblind` folder contains a folder for this run holding the input handed to the spec agent, including the brief text, and the run log the agent CLI produced

Proven by: acceptance test

Rejects: An implementation that writes only the final spec and keeps no record fails, because the run folder with input and run log is missing

Sources: `specs/001-orchestrator-spec-agent/answers.md` › yes, it should contain the inputs, the guardrails and the run log from the agent; `docs/product.md` › Every run records its state, its logs and the input and output of every role in the project's .doppelblind folder

Unanswered: Q-35

### AC-019: TUI shows one line per step in order

- **Given** The project from AC-001, with standard error not attached to an interactive terminal
- **When** The user runs the spec-agent command and it completes
- **Then** Standard error contains one line each for reading the brief, loading the binding sources, the spec agent writing the spec, validating its output, and checking its criteria and citations, in this order, each marked done with a short detail

Proven by: acceptance test

Rejects: An implementation that prints only a final message fails, because the five step lines are missing

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the TUI shows one line per step: reading the brief, loading the binding sources, the spec agent writing the spec, validating its output and checking its criteria and citations.

Unanswered: Q-39

### AC-020: Running step shows how long it has been running

- **Given** The project from AC-001, run in an interactive terminal, with a spec agent that takes several seconds
- **When** The user watches the TUI while the spec agent writes the spec
- **Then** The spec-agent step's line shows an elapsed time that increases while the step runs

Proven by: review

Rejects: An implementation that shows a static 'running' label with no elapsed time is spotted in review by the missing increasing time

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the running step shows how long it has been running

### AC-021: TUI ends with a summary

- **Given** Valid spec agent output with 4 criteria and 2 open questions
- **When** The user runs the spec-agent command and it completes
- **Then** The final TUI output on standard error shows the number 4 for criteria, the number 2 for open questions, the status of the spec step, what to do next, and the path of the produced `spec.md`

Proven by: acceptance test

Rejects: An implementation that ends with only the path fails, because the counts and the status are missing

Sources: `specs/001-orchestrator-spec-agent/answers.md` › at the end it shows the number of criteria and open questions, the status of the spec step, what to do next and the path of the produced `spec.md`.

Unanswered: Q-39

### AC-022: Standard output carries only the spec path

- **Given** The project from AC-001
- **When** The user runs the spec-agent command with standard output piped and it completes
- **Then** Standard output contains exactly the path of the produced `spec.md` and nothing else, and all TUI lines appear on standard error

Proven by: acceptance test

Rejects: An implementation that prints the TUI to standard output fails, because standard output contains more than the path

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the TUI goes to standard error and only the path of the produced `spec.md` goes to standard output.

### AC-023: No spinner or cursor movement without an interactive terminal

- **Given** The project from AC-001, with standard error redirected to a file
- **When** The user runs the spec-agent command and it completes
- **Then** The captured standard error contains no terminal control sequences for cursor movement or line erasure, and no spinner frames

Proven by: acceptance test

Rejects: An implementation that always redraws a spinner line with cursor-up sequences fails, because those control sequences appear in the captured output

Sources: `specs/001-orchestrator-spec-agent/answers.md` › without an interactive terminal the TUI writes plain lines without a spinner or cursor movement.

### AC-024: Failed agent run is shown with its reason and trace path

- **Given** The project from AC-001, and an agent CLI that exits with an error message 'not logged in'
- **When** The user runs the spec-agent command
- **Then** The process stops, the spec-agent step is marked failed, and the output shows 'not logged in' and the path of this run's folder in `.doppelblind`

Proven by: acceptance test

Rejects: An implementation that reports a generic 'agent failed' without the CLI's reason fails, because 'not logged in' is not shown

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the TUI marks the running step as failed and shows a message with the reason the agent CLI gave and the path of the run's trace.

Unanswered: Q-35, Q-39

### AC-025: Failed agent run leaves specs untouched and keeps the run record

- **Given** In one case a project with no spec for the brief, in another a brief whose spec folder already holds a `spec.md`, and an agent CLI that fails or is interrupted by the user during the run
- **When** The user runs the spec-agent command
- **Then** No new spec folder is created, an existing `spec.md` is byte-for-byte unchanged, and the run's folder in `.doppelblind` still exists with the input recorded before the failure

Proven by: acceptance test

Rejects: An implementation that creates the spec folder before the agent runs and leaves it empty after a failure fails, because a new spec folder exists

Sources: `specs/001-orchestrator-spec-agent/answers.md` › no spec folder is created and an existing spec.md stays unchanged.; `specs/001-orchestrator-spec-agent/answers.md` › the run's folder in `.doppelblind` is kept with everything recorded up to the failure.

Unanswered: Q-34

### AC-026: Invalid spec agent output stops the process without writing a spec

- **Given** An agent CLI that returns output not matching the spec agent's output schema, such as a criterion without a source
- **When** The user runs the spec-agent command
- **Then** The process stops, the validating step is marked failed with a reason, no spec folder is created, and an existing `spec.md` stays unchanged

Proven by: acceptance test

Rejects: An implementation that treats unparseable output as a spec with no criteria fails, because it writes a `spec.md`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › specs are only written or changed when the output is valid.; `docs/product.md` › invalid output is a failure, never an empty list

### AC-027: Re-run of a brief replaces spec.md in the same folder

- **Given** A brief whose spec folder `001-a` holds a `spec.md` with open questions, and whose spec step is not final
- **When** The user starts another spec-create run for the brief and the spec agent returns valid output
- **Then** `specs/001-a/spec.md` holds the new spec, and no new subfolder of `specs` is created

Proven by: acceptance test

Rejects: An implementation that always creates a new numbered folder fails, because `002-...` appears

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the brief keeps its spec folder.; `specs/001-orchestrator-spec-agent/answers.md` › its spec replaces the earlier spec.md in the same folder.

Unanswered: Q-25, Q-26

### AC-028: Re-run gets the answers, not the earlier spec

- **Given** A brief whose `spec.md` holds a criterion titled 'Unique Marker Title' and an open question answered with the text 'Use the brief title'
- **When** The user starts another spec-create run for the brief
- **Then** The recorded input of the new spec agent run contains the brief, the sources and the answer 'Use the brief title', and does not contain 'Unique Marker Title'

Proven by: acceptance test

Rejects: An implementation that hands the spec agent its earlier spec to revise fails, because the recorded input contains 'Unique Marker Title'

Sources: `specs/001-orchestrator-spec-agent/answers.md` › Spec-create run: the spec agent writes the spec and open questions afresh from the brief, the sources and every answer so far.; `docs/product.md` › never on its earlier spec and never told how many runs came before

Unanswered: Q-25

### AC-029: Answer fields are read as written in spec.md

- **Given** A `spec.md` whose question Q-01 has 'Use the brief title' on the lines after its **Answer:** field, Q-02 has only `free`, Q-03 has only `out of scope`, and Q-04 has an empty field
- **When** The user starts another spec-create run for the brief
- **Then** The recorded input of the spec agent contains Q-01 with the answer 'Use the brief title', Q-02 with the answer `free` and Q-03 with the answer `out of scope`, and contains no answer for Q-04

Proven by: acceptance test

Rejects: An implementation that treats an empty field as `free` fails, because the input contains an answer for Q-04

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the user writes the answer on the lines after the question's **Answer:** field, up to the next heading.; `specs/001-orchestrator-spec-agent/answers.md` › `free` and `out of scope` are written as these exact words, alone in the field.; `specs/001-orchestrator-spec-agent/answers.md` › an empty field means the question has no answer yet

### AC-030: Other briefs' spec folders stay unchanged

- **Given** A `specs` folder holding `001-a` for another brief, with a snapshot of its contents
- **When** The user runs the spec-agent command, including repeated spec-create runs, on a different brief
- **Then** The contents of `001-a` are byte-for-byte unchanged

Proven by: acceptance test

Rejects: An implementation that rewrites every `spec.md` in `specs` fails, because `001-a/spec.md` changes

Sources: `specs/001-orchestrator-spec-agent/answers.md` › spec folders of other briefs stay unchanged.

Unanswered: Q-26

### AC-031: Finishing with empty answers marks them unanswered and ends the spec step

- **Given** A `spec.md` with questions Q-01 answered with own text and Q-02 with an empty Answer field
- **When** The user finishes the clarify run
- **Then** `spec.md` shows Q-02 marked `unanswered`, and a later run of either command on the brief starts no spec-create run and leaves `spec.md` unchanged

Proven by: acceptance test

Rejects: An implementation that writes `free` for unanswered questions fails, because Q-02 is not marked `unanswered`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › If you `finish` the clarify run while any question is unanswered, those questions will be marked `unanswered` and the spec-agent is finished.; `specs/001-orchestrator-spec-agent/answers.md` › once the spec step is final, no further spec-create run starts for that brief.

Unanswered: Q-22, Q-23, Q-37, Q-40

### AC-032: When all questions are answered, the user chooses another run or stop

- **Given** A `spec.md` whose every open question has an answer that has not yet reached the spec agent
- **When** The user runs the command for the brief and, in one case, chooses another spec-create run and, in another, chooses to stop
- **Then** With the first choice the spec agent runs again and `spec.md` is replaced; with the second no spec agent run starts, and a later run on the brief starts no spec-create run

Proven by: acceptance test

Rejects: An implementation that always starts another spec-create run without asking fails in the stop case, because the spec agent runs

Sources: `specs/001-orchestrator-spec-agent/answers.md` › If all questions are answered, you decide whether another spec-create run starts with step 1. or to stop the spec-agent.

Unanswered: Q-22

### AC-033: A run without open questions makes the spec final

- **Given** A spec agent whose valid output contains no open questions
- **When** The user runs the spec-agent command, then runs it again on the same brief
- **Then** The second run starts no spec-create run and `spec.md` stays unchanged

Proven by: acceptance test

Rejects: An implementation that starts a new spec-create run each time the command runs fails, because the spec agent runs a second time

Sources: `docs/product.md` › The spec is final when a run leaves no open question; `specs/001-orchestrator-spec-agent/answers.md` › once the spec step is final, no further spec-create run starts for that brief.

Unanswered: Q-40

### AC-034: Ended input at a choice stops the process

- **Given** A brief whose open questions are all answered, so that the command asks the user to choose, with standard input closed
- **When** The user runs the command for the brief
- **Then** The process stops with a message, no spec agent run starts, and `spec.md` stays unchanged

Proven by: acceptance test

Rejects: An implementation that treats ended input as a choice to start another run fails, because the spec agent runs

Sources: `specs/001-orchestrator-spec-agent/answers.md` › a choice that cannot be read because the input has ended stops the process with a message.

Unanswered: Q-22

### AC-035: Too many free answers report the brief as too vague

Why: Questions answered free reduce the number of acceptance tests, which makes the implementation vaguer and counts as a risk.

- **Given** A `.doppelblind.conf` that sets no limit on free answers, and a `spec.md` in which six questions are answered `free`
- **When** The user runs the command for the brief
- **Then** Standard error reports the brief as too vague and names each of the six questions together with the step of the brief it is about

Proven by: acceptance test

Rejects: An implementation that accepts any number of free answers silently fails, because no too-vague report appears

Sources: `docs/decisions.md` › DEC-007: Too many free answers make a brief too vague; `specs/001-orchestrator-spec-agent/answers.md` › the TUI goes to standard error and only the path of the produced `spec.md` goes to standard output.

Unanswered: Q-36

## Wishes

- A nice logo/figlet at the start of the TUI.
- Possibly consult an LLM to work my answers to the open questions into the document.

## Left open

- Q-05: OUT-01 lists the GATES capability. Does the orchestrator in this change check the produced spec, such as whether every criterion cites a source from the project's allowlist and whether each anchor really appears in that source? If so, what happens when a check fails?
- Q-18: What exit status should the command return on success and on each kind of failure?

## Out of scope

None.

## Unanswered

- Q-21: What does the complete-flow command do differently from the spec-agent command in this change, given that the flow ends after the spec agent?
- Q-22: The brief says open questions are not answered during the run, yet the clarify step lets the user start the flow again and mark unanswered questions as `free` or `out of scope`, and choose between another run and stopping. How does the user give these answers and choices to the orchestrator, and how does the user finish the clarify run?
- Q-23: The product's core loop says that when the spec step is finished and an answer has not yet reached the spec agent, the spec agent runs once more. Does that final run happen in this change when the user finishes the clarify run?
- Q-24: Is there a limit on the number of clarify rounds in this change? If so, where is it declared, and what happens when it is used up? What does 'the same is for the complete spec-agent run' mean for the limits of the whole spec step?
- Q-25: Where do the answers to earlier questions persist once a new spec-create run replaces `spec.md`, so that 'every answer so far' reaches later runs? Does the orchestrator write them to a file in the spec folder, and if so, in what form?
- Q-26: How does the orchestrator recognize which existing spec folder belongs to a brief when the brief is run again, including after the brief file is moved or renamed?
- Q-27: What format does `.doppelblind.conf` have, which entries must it contain for this change (beyond the specs folder and the sources per agent), and what does a newly created file contain?
- Q-28: After the orchestrator creates a missing `.doppelblind.conf`, does the run continue with it or stop? What does the user see?
- Q-29: When is a `.doppelblind.conf` incomplete, at which point does the process fail, and what does the user see?
- Q-30: What happens when the current directory is not inside a git repository?
- Q-31: What happens when the brief file exists but is empty?
- Q-32: What happens when a source declared for the spec agent in `.doppelblind.conf` does not exist or cannot be read?
- Q-33: How does the user set the time, cost and turn limits when starting a command? What happens when the user tries to raise the turn limit, and may the user lower it?
- Q-34: The product says a human decides when a run reaches its time or cost limit. How is the user asked in this change, and what happens to the run and the spec folder for each decision? What happens when the turn limit is reached?
- Q-35: What are the 'guardrails' that the run record must contain? How is a run's record laid out inside `.doppelblind`, and which file does 'the path of the run's trace' point to?
- Q-36: When does the too-vague report under DEC-007 happen, in which run or step? Does it stop the process or block anything, and how does `.doppelblind.conf` change the default limit of five?
- Q-37: In the next `spec.md`, how do questions answered earlier appear: those answered with own text, with `free`, with `out of scope` and those marked `unanswered`? Which sections of Left open, Out of scope and Unanswered do they go in, and how is `unanswered` written?
- Q-38: What happens when the short name the spec agent gives is not lower case, contains spaces or other characters, or is longer than 50 characters?
- Q-39: What exact wording and markers do the TUI step lines use for done and failed, which statuses can the spec step have, and what does 'what to do next' say for each status?
- Q-40: What does the user see when running either command on a brief whose spec step is already final?

## Open questions

None.
