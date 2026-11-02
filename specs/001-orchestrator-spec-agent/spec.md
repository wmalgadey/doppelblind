# Orchestrator CLI that turns a brief into a spec via the spec agent

Brief: [docs/briefs/orchestrator-spec-agent.md](../../docs/briefs/orchestrator-spec-agent.md)

## Criteria

### AC-001: Full-flow command produces a spec from a brief

- **Given** A project whose root is the current directory and contains a readable brief file at a relative path, e.g. `docs/briefs/x.md`
- **When** The user runs the orchestrator's full-flow command with that relative brief path
- **Then** The spec agent runs, and when it succeeds a new numbered subfolder of `specs` exists in the project root and contains a file `spec.md`

Sources: `docs/briefs/orchestrator-spec-agent.md` › OUT-01; `docs/briefs/orchestrator-spec-agent.md` › Den Brief übergebe ich als Pfad relativ zum aktuellen Verzeichnis.; `specs/001-orchestrator-spec-agent/answers.md` › naming is up to the implementer, two commands, one for the complete flow one for the specific step

Unanswered: Q-27, Q-32, Q-33

### AC-002: Separate spec-step command produces a spec from a brief

- **Given** The same project and brief as in AC-001
- **When** The user runs the orchestrator's command for the spec step alone (a command other than the full-flow command) with that relative brief path
- **Then** The spec agent runs, and when it succeeds a new numbered subfolder of `specs` in the project root contains a file `spec.md`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › naming is up to the implementer, two commands, one for the complete flow one for the specific step

Unanswered: Q-27, Q-32, Q-33

### AC-003: Missing brief path argument aborts with an error

- **Given** A project whose root is the current directory
- **When** The user runs either command without a brief path
- **Then** An error message is shown, the run aborts, the spec agent is not started, and no new subfolder of `specs` is created

Sources: `specs/001-orchestrator-spec-agent/answers.md` › show an error message and abort

### AC-004: Non-existent brief path aborts with an error

- **Given** A project whose root is the current directory and no file at `docs/briefs/missing.md`
- **When** The user runs either command with `docs/briefs/missing.md`
- **Then** An error message is shown, the run aborts, the spec agent is not started, and no new subfolder of `specs` is created

Sources: `specs/001-orchestrator-spec-agent/answers.md` › show an error message and abort

### AC-005: Brief path pointing to a directory aborts with an error

- **Given** A project whose root is the current directory and a directory `docs/briefs`
- **When** The user runs either command with `docs/briefs` as the brief path
- **Then** An error message is shown, the run aborts, the spec agent is not started, and no new subfolder of `specs` is created

Sources: `specs/001-orchestrator-spec-agent/answers.md` › show an error message and abort

### AC-006: Unreadable brief aborts with an error

- **Given** A project whose root is the current directory and a brief file the user running the command has no read permission for
- **When** The user runs either command with that brief path
- **Then** An error message is shown, the run aborts, the spec agent is not started, and no new subfolder of `specs` is created

Sources: `specs/001-orchestrator-spec-agent/answers.md` › show an error message and abort

### AC-007: Missing specs folder is created in the project root

- **Given** A project whose root has no `specs` folder and a readable brief
- **When** A spec-create run succeeds
- **Then** A folder `specs` exists directly in the project root and contains the new numbered subfolder with `spec.md`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › project root. create it if it does not exists

Unanswered: Q-32

### AC-008: Spec subfolder name format

- **Given** A successful spec-create run
- **When** The user lists the subfolders of `specs`
- **Then** The new subfolder's name matches `^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+){1,3}$` (three digits, a dash, then 2–4 lowercase words joined by dashes)

Sources: `specs/001-orchestrator-spec-agent/answers.md` › 3 digits; `docs/briefs/orchestrator-spec-agent.md` › Am Ende existiert eine `spec.md` in einem fortlaufend nummerierten Unterordner von `specs`

Unanswered: Q-38

### AC-009: Numbering increments the highest number without filling gaps

- **Given** `specs` contains subfolders `001-alpha-one` and `003-beta-two` and no other numbered subfolder
- **When** A spec-create run for a new brief succeeds
- **Then** The new subfolder's name starts with `004-`, and no subfolder starting with `002-` is created

Sources: `specs/001-orchestrator-spec-agent/answers.md` › close no gaps, just increment the highes 3 digit number

Unanswered: Q-29, Q-39, Q-40

### AC-010: Folders without a three-digit number do not affect numbering

- **Given** `specs` contains subfolders `002-alpha-one` and `drafts` and no other subfolder
- **When** A spec-create run for a new brief succeeds
- **Then** The new subfolder's name starts with `003-`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › close no gaps, just increment the highes 3 digit number

Unanswered: Q-39

### AC-011: spec.md lists criteria with ID, Given-When-Then and cited sources

- **Given** A successful spec-create run
- **When** The user opens the generated `spec.md`
- **Then** Each criterion in it shows an ID, a Given, a When and a Then, and at least one cited source consisting of a source path and an anchor

Sources: `docs/briefs/orchestrator-spec-agent.md` › Der Spec-Agent erzeugt eine Spezifikation mit Kriterien in Given-When-Then und offenen Fragen.; `docs/product.md` › each with an ID, a cited source and how it is proven

Unanswered: Q-34

### AC-012: spec.md states how each criterion is proven

- **Given** A successful spec-create run
- **When** The user opens the generated `spec.md`
- **Then** Each criterion states whether it is proven by an acceptance test or by the user's review

Sources: `docs/product.md` › each with an ID, a cited source and how it is proven

Unanswered: Q-34

### AC-013: spec.md keeps wishes separate from criteria

- **Given** A brief with a Wishes section listing at least one wish
- **When** A spec-create run succeeds and the user opens `spec.md`
- **Then** The wishes appear in a part of `spec.md` separate from the criteria and carry no criterion ID

Sources: `docs/product.md` › separate from wishes

Unanswered: Q-34

### AC-014: spec.md lists open questions with a place to answer each

- **Given** A spec-create run whose spec agent returns at least one open question
- **When** The user opens `spec.md`
- **Then** Each open question appears with its ID, and `spec.md` provides a place for each question where the user can write the answer

Sources: `docs/briefs/orchestrator-spec-agent.md` › Ich öffne die `spec.md` und beantworte die offenen Fragen dort.; `specs/001-orchestrator-spec-agent/answers.md` › the user writes the answers directly into the spec.md

Unanswered: Q-34

### AC-015: Invalid structured output from the spec agent is a failure

- **Given** A spec-create run in which the spec agent returns output that does not match its output schema
- **When** The run ends
- **Then** An error is shown to the user, no new subfolder of `specs` and no `spec.md` is written, and the output is not treated as a spec with empty criteria or empty open questions

Sources: `docs/product.md` › invalid output is a failure, never an empty list; `specs/001-orchestrator-spec-agent/answers.md` › noting is written, the user will see the error

Unanswered: Q-38

### AC-016: Agent CLI failure writes nothing

- **Given** The agent CLI is not installed, not logged in, or exits with an error during the spec agent run
- **When** The user runs a spec-create run
- **Then** The user sees an error, and no new subfolder of `specs` and no `spec.md` is written

Sources: `specs/001-orchestrator-spec-agent/answers.md` › noting is written, the user will see the error

### AC-017: User interruption writes nothing

- **Given** A spec-create run in which the spec agent is still running
- **When** The user interrupts the run (e.g. Ctrl+C)
- **Then** The user sees that the run was aborted, and no new subfolder of `specs` and no `spec.md` is written

Sources: `specs/001-orchestrator-spec-agent/answers.md` › noting is written, the user will see the error

### AC-018: No questions are asked during a spec-create run

- **Given** A spec-create run whose spec agent returns open questions
- **When** The run proceeds from start until `spec.md` is written
- **Then** The orchestrator does not ask the user in the terminal to answer any of those open questions during that run

Sources: `docs/briefs/orchestrator-spec-agent.md` › Die offenen Fragen werden nicht während des Laufs beantwortet.

Unanswered: Q-27

### AC-019: No role other than the spec agent is started

- **Given** A run of the full-flow command on a brief
- **When** The run ends
- **Then** The run record in the project's `.doppelblind` folder shows only spec agent runs, and no test author, implementer, verifier, classifier or worst-case agent was started

Sources: `docs/briefs/orchestrator-spec-agent.md` › Es werden keine anderen Rollen gestartet.

### AC-020: Run state, logs and spec agent input and output are recorded

- **Given** A spec-create run, successful or failed
- **When** The run ends
- **Then** The project's `.doppelblind` folder contains the run's state, its logs, and the input given to and the output returned by the spec agent

Sources: `docs/product.md` › Every run records its state, its logs and the input and output of every role in the project's .doppelblind folder

### AC-021: Brief and binding sources are not changed by a run

- **Given** A project with a brief and binding sources, whose contents are noted before the run
- **When** A spec-create run ends, successfully or not
- **Then** The brief and every binding source are byte-for-byte unchanged

Sources: `docs/product.md` › Sources are written only by people.; `specs/001-orchestrator-spec-agent/answers.md` › everything, it is mandatory per product.md invariant

### AC-022: Spec is written in English for a non-English brief

- **Given** A brief written in German
- **When** A spec-create run succeeds
- **Then** The criteria, wishes and open questions in `spec.md` are written in English

Sources: `specs/001-orchestrator-spec-agent/answers.md` › output should be in english for now

### AC-023: At a limit the user is asked in the terminal

- **Given** A spec agent run that reaches its time or cost limit
- **When** The limit is reached
- **Then** The orchestrator asks the user in the terminal and offers to increase the cost budget or to increase the wait time

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the user can decide on cost budget increase or wait time increase; `specs/001-orchestrator-spec-agent/answers.md` › the user will be asked by the orcehstrator and can answer it in terminal

Unanswered: Q-37

### AC-024: Turn count cannot be changed at a limit

- **Given** A spec agent run that has reached a limit and the orchestrator asking the user
- **When** The user reads the choices offered
- **Then** No choice to change the turn count is offered

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the turn count shouldn't be changed mid run

### AC-025: Nothing continues by waiting at a limit

- **Given** A spec agent run that has reached a limit and the orchestrator asking the user
- **When** The user gives no answer
- **Then** The run does not continue and no `spec.md` is written until the user answers

Sources: `docs/product.md` › At a limit, a human decides; nothing is approved automatically by waiting.

Unanswered: Q-37

### AC-026: Answers written into spec.md are read

- **Given** An existing `spec.md` in which the user has written their own text as the answer to an open question
- **When** The user starts a clarify run for that spec
- **Then** That question is treated as answered with the user's text and the orchestrator does not ask for it again

Sources: `specs/001-orchestrator-spec-agent/answers.md` › yes, part of this spec; `specs/001-orchestrator-spec-agent/answers.md` › you answer the questions manually in `spec.md`

Unanswered: Q-27, Q-28, Q-34, Q-35

### AC-027: Clarify run offers choices for each unanswered question

- **Given** An existing spec with at least one open question that has no answer in `spec.md`
- **When** The user starts a clarify run for that spec
- **Then** For each unanswered question the orchestrator asks in the terminal and offers exactly these choices: `free`, `out of scope`, stop to answer later, and finish the spec step

Sources: `docs/product.md` › For each, I choose free, out of scope, to stop and answer it later, or to finish the spec step; `specs/001-orchestrator-spec-agent/answers.md` › start the flow again and mark unanswered question with `free` or `out of scope`

Unanswered: Q-27, Q-28

### AC-028: Choosing free or out of scope records it as the answer

- **Given** A clarify run asking for an unanswered question
- **When** The user chooses `free` (or `out of scope`)
- **Then** The question's answer is recorded as `free` (or `out of scope`) and is included among the answers given to any later spec agent run

Sources: `docs/product.md` › An answer is only what I chose: my own text, `free` (left open on purpose, nobody tests it) or `out of scope` (not part of this change).

Unanswered: Q-30, Q-36

### AC-029: Choosing stop leaves questions open for later

- **Given** A clarify run asking for an unanswered question
- **When** The user chooses to stop
- **Then** The run ends, that question and every remaining unanswered question are not recorded as `unanswered`, and a later clarify run asks for them again

Sources: `docs/product.md` › to stop and answer it later

Unanswered: Q-36

### AC-030: Choosing finish marks remaining questions unanswered and ends the spec step

- **Given** A clarify run in which at least one question is still unanswered
- **When** The user chooses to finish
- **Then** That question and every other still unanswered question are recorded as `unanswered`, the spec agent is not started again, and the spec step ends

Sources: `specs/001-orchestrator-spec-agent/answers.md` › If you `finish` the clarify run while any question is unanswered, those questions will be marked `unanswered` and the spec-agent is finished.; `docs/product.md` › which records it and every unanswered question as `unanswered`

Unanswered: Q-31

### AC-031: Unanswered is never an answer given to the spec agent

- **Given** A question recorded as `unanswered` by the orchestrator
- **When** A later spec agent run starts for any brief in the project
- **Then** The spec agent's recorded input does not contain that question with `unanswered` or any other value as its answer

Sources: `docs/product.md` › That a question stayed unanswered is recorded by the orchestrator, never written as an answer and never given to the spec agent.

Unanswered: Q-31

### AC-032: When all questions are answered the user decides about another run

- **Given** A clarify run in which every open question of the spec has an answer
- **When** The last question is answered
- **Then** The orchestrator asks the user in the terminal whether another spec-create run starts or the spec agent stops

Sources: `specs/001-orchestrator-spec-agent/answers.md` › If all questions are answered, you decide whether another spec-create run starts

Unanswered: Q-27

### AC-033: Another spec-create run uses brief, sources and every answer so far

- **Given** A spec whose questions have been answered and the user chose to start another spec-create run
- **When** The spec agent runs again
- **Then** The spec agent's recorded input contains the brief, the binding sources and every answer given so far

Sources: `specs/001-orchestrator-spec-agent/answers.md` › Spec-create run: the spec agent writes the spec and open questions afresh from the brief, the sources and every answer so far.

Unanswered: Q-28, Q-29, Q-30

### AC-034: Another spec-create run never sees an earlier spec

- **Given** A brief with an earlier `spec.md` and the user chose to start another spec-create run
- **When** The spec agent runs again
- **Then** The spec agent's recorded input does not contain the content of the earlier `spec.md` or of any other `spec.md` in `specs`

Sources: `docs/product.md` › never on its earlier spec and never told how many runs came before; `docs/product.md` › Specs themselves are not sources

Unanswered: Q-28, Q-29, Q-30

### AC-035: Another spec-create run is not told how many runs came before

- **Given** A brief for which at least one spec-create run has already happened
- **When** The spec agent runs again
- **Then** The spec agent's recorded input contains no information on how many spec-create runs came before

Sources: `docs/product.md` › never on its earlier spec and never told how many runs came before

### AC-036: Final run when an answer has not reached the spec agent

- **Given** A spec with at least one answer given after the last spec agent run
- **When** The user decides that no further spec-create run starts
- **Then** The spec agent runs once more, and every open question of that run is recorded as `unanswered`

Sources: `docs/product.md` › If an answer has not reached the spec agent yet, it runs once more, and its open questions are answered as `unanswered`.

Unanswered: Q-29, Q-31

### AC-037: A final spec has no open question left undecided

- **Given** A spec step that has ended (finished or stopped by the user's decision of no further run)
- **When** The user inspects the recorded state of each open question of the final spec
- **Then** Every open question is recorded as `free`, `out of scope` or `unanswered`

Sources: `docs/product.md` › Every open question is then left open, out of scope or unanswered.

Unanswered: Q-31

## Wishes

- Ein nettes Logo/Figlet vorweg in der TUI.
- Ggf. ein LLM zu Rate ziehen, um meine Antworten auf die offenen Fragen in das Dokument einzuarbeiten.
- a titel and a short description of the feature and the use case would be nice to have (probably more a wish than a testable feature)

## Left open

- Q-05: What should happen when the project has no `.doppelblind.conf`, or the file is invalid or declares no binding sources?
- Q-06: What does `.doppelblind.conf` need to contain for this change (for example how binding sources are declared and which paths the spec agent may write), and in which format?
- Q-13: Does the orchestrator itself check the spec agent's citations (that each cited path is a declared binding source and that the anchor appears verbatim in it), and what happens if a citation fails that check?
- Q-15: How does the user set the time and cost limits when starting a run, what applies when none are given, and in which unit is cost measured given that the agent runs under a subscription rather than per-token billing?
- Q-17: Which steps or states must the TUI show, what else must it display, and what is shown when the run ends successfully or fails?
- Q-19: What is the layout of the `.doppelblind` folder (where a run's state, logs and the spec agent's input and output are stored, and how runs are told apart), and is that folder meant to be versioned?
- Q-20: Where do the spec agent's prompt and output schema come from, given that they must not live in the project's tree, and how should a test check that from the outside, given that the role's input is recorded in the project's `.doppelblind` folder?
- Q-25: What exit status should the command return on success and on each kind of failure?

## Out of scope

- Q-18: How should the command behave when it is not run in an interactive terminal (for example in a pipe or CI)?
- Q-22: Which model does the spec agent run with in this change, and can the user choose it?
- Q-24: What should happen when the brief is empty or lacks sections such as the outcome or the walkthrough?
- Q-26: How will you tell that this change is done: which run on which brief in which project counts as the acceptance check?

## Unanswered

- Q-27: Which steps does each of the two commands cover? In particular: does the full-flow command go on into the clarify loop (asking about unanswered questions, deciding about another spec-create run) in the same invocation, and does the spec-step command run only one spec-create run, only a clarify run, or something else?
- Q-28: How does the user tell the orchestrator which existing spec a clarify run or another spec-create run is for (for example by the brief path, by the spec folder, or otherwise), and how does the orchestrator know that a brief already has a spec?
- Q-29: When another spec-create run starts for a brief that already has a spec, where is the new spec written (into the existing subfolder, into a new numbered subfolder, or elsewhere), and what happens to the earlier `spec.md` and the answers the user wrote into it?
- Q-30: Where and in what form are the user's answers stored so that they reach later spec agent runs, given that the user writes them into `spec.md` and that `spec.md` must not be given to the spec agent?
- Q-31: Where does the orchestrator record that a question stayed `unanswered`, and is that record visible to the user in `spec.md` or elsewhere?
- Q-32: How is the project root determined: is it always the current directory, or is it found another way (for example by searching upward for `.doppelblind.conf`)?
- Q-33: What happens when the given brief path resolves to a file outside the current project?
- Q-34: What exact layout must `spec.md` have, and how is the place for each answer marked so that the user can write into it and the orchestrator can tell an answered from an unanswered question (including how `free` and `out of scope` are written there)? Should a spec template be used for this, and if so, where does it live?
- Q-35: What happens at a clarify run when `spec.md` is missing, cannot be parsed, or the user changed parts of it other than the answers?
- Q-36: When the user chooses to stop in a clarify run, are the `free` and `out of scope` choices already made earlier in that same run kept?
- Q-37: When a limit is reached, how does the user enter the new cost budget or wait time, and what happens if the user declines both increases or enters an invalid value?
- Q-38: Who determines the text after the number in the spec subfolder name (the spec agent, the orchestrator, or the user), and what happens if that text does not match the required format?
- Q-39: What number does the first spec subfolder get when `specs` contains no subfolder with a three-digit number?
- Q-40: What happens when the highest existing number is already 999?

## Open questions

None.
