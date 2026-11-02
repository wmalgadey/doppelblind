# Orchestrator CLI that runs the spec agent on a brief

Brief: [docs/briefs/orchestrator-spec-agent.md](../../docs/briefs/orchestrator-spec-agent.md)

## Criteria

### AC-001: Spec-agent command turns a brief into a spec.md

- **Given** a project with a readable brief file inside the project
- **When** the user runs the orchestrator's command for the spec agent, passing the brief's path
- **Then** after the run, a file spec.md exists in a numbered subfolder of the folder `specs` in the project root

Sources: `docs/briefs/orchestrator-spec-agent.md` › OUT-01; `specs/001-orchestrator-spec-agent/answers.md` › one command for a specific agent (to jump into the flow), one command to run the complete flow where it currently is at!; `specs/001-orchestrator-spec-agent/answers.md` › in the project root

Open questions: Q-08

### AC-002: Flow command on a new brief runs only the spec agent

- **Given** a project with a readable brief for a new feature that has no spec yet
- **When** the user runs the orchestrator's command that runs the complete flow, passing the brief's path
- **Then** the spec agent runs, a spec.md is created as in AC-001, and the flow ends without starting any other role (test author, implementer, verifier, classifier or worst-case agent)

Sources: `specs/001-orchestrator-spec-agent/answers.md` › one command for a specific agent (to jump into the flow), one command to run the complete flow where it currently is at!; `docs/briefs/orchestrator-spec-agent.md` › Es werden keine anderen Rollen gestartet.

Open questions: Q-01

### AC-003: Brief path is resolved relative to the current directory

- **Given** a brief at `docs/briefs/x.md` in the project and the user's current directory is `docs` inside the project
- **When** the user runs the spec-agent command with the brief path `briefs/x.md`
- **Then** the run uses the brief `docs/briefs/x.md` and creates a spec.md

Sources: `docs/briefs/orchestrator-spec-agent.md` › Den Brief übergebe ich als Pfad relativ zum aktuellen Verzeichnis.

Open questions: Q-09

### AC-004: Missing brief file yields an error message

- **Given** a brief path that points to no existing file
- **When** the user runs the spec-agent command with that path
- **Then** an error message is shown and the spec agent is not started

Sources: `specs/001-orchestrator-spec-agent/answers.md` › an error message

Open questions: Q-15

### AC-005: Brief path pointing to a directory yields an error message

- **Given** a brief path that points to a directory inside the project
- **When** the user runs the spec-agent command with that path
- **Then** an error message is shown and the spec agent is not started

Sources: `specs/001-orchestrator-spec-agent/answers.md` › an error message

Open questions: Q-15

### AC-006: Unreadable brief file yields an error message

- **Given** a brief file inside the project that the user's process has no permission to read
- **When** the user runs the spec-agent command with its path
- **Then** an error message is shown and the spec agent is not started

Sources: `specs/001-orchestrator-spec-agent/answers.md` › an error message

Open questions: Q-15

### AC-007: Brief path outside the project is rejected

- **Given** a readable file outside the project, reachable from the current directory via a relative path such as `../outside.md`
- **When** the user runs the spec-agent command with that path
- **Then** the path is not accepted, an error message is shown and the spec agent is not started

Sources: `specs/001-orchestrator-spec-agent/answers.md` › no! no symlinks and only path inside the project.; `specs/001-orchestrator-spec-agent/answers.md` › an error message

Open questions: Q-08, Q-09, Q-15

### AC-008: Brief given as a symlink is rejected

- **Given** a symlink inside the project that points to a readable brief file
- **When** the user runs the spec-agent command with the symlink's path
- **Then** the path is not accepted, an error message is shown and the spec agent is not started

Sources: `specs/001-orchestrator-spec-agent/answers.md` › no! no symlinks and only path inside the project.; `specs/001-orchestrator-spec-agent/answers.md` › an error message

Open questions: Q-10, Q-15

### AC-009: Spec agent runs with Claude Code in headless mode

- **Given** a valid brief
- **When** the user runs the spec-agent command
- **Then** the spec agent is run through Claude Code in headless mode, without the user having to name an agent CLI

Sources: `specs/001-orchestrator-spec-agent/answers.md` › currently we should just use claude code. other clis are part of OUT-09; `docs/product.md` › Agents run through an agent CLI in headless mode.

Open questions: Q-21

### AC-010: Spec agent input contains the brief and sources but no code

- **Given** a project containing source code files, binding sources and a valid brief
- **When** the spec-agent command runs
- **Then** the recorded input of the spec agent (see AC-028) contains the brief and the binding sources and contains none of the project's code files

Sources: `specs/001-orchestrator-spec-agent/answers.md` › sure, it should not read the code itself, only functional descisions and requirements

Open questions: Q-06, Q-07

### AC-011: Only the orchestrator writes the spec

- **Given** a project and a valid brief
- **When** the spec-agent command completes
- **Then** the only files created or changed in the project are the new spec folder with its spec.md and the content of the `.doppelblind` folder; the spec agent itself has written no file

Sources: `specs/001-orchestrator-spec-agent/answers.md` › there is no need to write anything, it can answer to the orchestrator which can create a structured spec; `specs/001-orchestrator-spec-agent/answers.md` › run state and logs, as well as input and output of the run, should be recorded and placed in a `.doppelblind` folder for later analysis

Open questions: Q-07

### AC-012: spec.md contains criteria in Given-When-Then and open questions

- **Given** a successful spec-agent run
- **When** the user opens the created spec.md
- **Then** it contains criteria, each with an ID, a Given, a When, a Then and at least one cited source, a list of wishes separate from the criteria, and a section of open questions

Sources: `docs/briefs/orchestrator-spec-agent.md` › Der Spec-Agent erzeugt eine Spezifikation mit Kriterien in Given-When-Then und offenen Fragen.; `docs/product.md` › OUT-01

Open questions: Q-13, Q-14

### AC-013: spec.md follows a user-changeable template

- **Given** the spec template has been changed by the user (e.g. a section heading renamed)
- **When** the spec-agent command runs on a brief
- **Then** the created spec.md follows the changed template (e.g. contains the renamed heading)

Sources: `specs/001-orchestrator-spec-agent/answers.md` › create a template for specs which should be used by the agent. so a user has control over the content of a spec.; `specs/001-orchestrator-spec-agent/answers.md` › create a template for the user to change

Open questions: Q-12, Q-13

### AC-014: Invalid structured output is a failure, never an empty list

- **Given** the spec agent returns output that does not validate against its output schema
- **When** the orchestrator processes that output
- **Then** the run is reported as failed; no spec.md is written that presents the invalid output as a spec with empty criteria or an empty list of open questions

Sources: `docs/product.md` › validates structured output against its schema — invalid output is a failure, never an empty list

Open questions: Q-13, Q-14

### AC-015: TUI shows what is currently happening

- **Given** the command runs in an interactive terminal
- **When** the spec agent is running
- **Then** the terminal shows a text-based interface that states the step currently in progress (e.g. that the spec agent is running)

Sources: `docs/briefs/orchestrator-spec-agent.md` › Der Orchestrator zeigt eine minimale TUI, die beschreibt, was gerade passiert.

### AC-016: Missing specs folder is created

- **Given** a project root without a `specs` folder
- **When** a spec-agent run completes successfully
- **Then** a `specs` folder exists in the project root and contains the new numbered subfolder with spec.md

Sources: `specs/001-orchestrator-spec-agent/answers.md` › if the folder doesn't exist, create it; `specs/001-orchestrator-spec-agent/answers.md` › in the project root

Open questions: Q-08

### AC-017: First spec folder is numbered 001

- **Given** a `specs` folder without any numbered subfolder
- **When** a spec-agent run completes successfully
- **Then** the new subfolder's name starts with `001-`

Sources: `docs/briefs/orchestrator-spec-agent.md` › (z. B. `001-spec-inhalt`); `specs/001-orchestrator-spec-agent/answers.md` › 3 digits may be enough, but the number may grow past 999

### AC-018: Next number follows the highest existing number, ignoring gaps

- **Given** a `specs` folder with subfolders `001-a` and `003-b`
- **When** a spec-agent run completes successfully
- **Then** the new subfolder's name starts with `004-`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › no gap detection, just use the next number

### AC-019: Empty numbered folders count for numbering

- **Given** a `specs` folder with subfolders `001-a` (containing spec.md) and `002-b` (empty)
- **When** a spec-agent run completes successfully
- **Then** the new subfolder's name starts with `003-`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › no matter if a folder is empty, use the next number

### AC-020: Subfolders without a number are ignored

- **Given** a `specs` folder with subfolders `001-a` and `drafts`
- **When** a spec-agent run completes successfully
- **Then** the new subfolder's name starts with `002-` and `drafts` is unchanged

Sources: `specs/001-orchestrator-spec-agent/answers.md` › subfolders without a number are ignored

### AC-021: Numbering grows past 999

- **Given** a `specs` folder whose highest numbered subfolder is `999-a`
- **When** a spec-agent run completes successfully
- **Then** the new subfolder's name starts with `1000-`

Sources: `specs/001-orchestrator-spec-agent/answers.md` › 3 digits may be enough, but the number may grow past 999

### AC-022: Folder name part after the number is a short dashed name

- **Given** a successful spec-agent run
- **When** the new subfolder is created
- **Then** the part of its name after the number and the first dash consists of 2 to 4 words of lowercase letters or digits, joined by single dashes

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the part after the number is 2–4 lowercase words joined by dashes that capture the change, in action-noun form where possible (e.g. "brief-to-spec", "fix-payment-timeout"). Keep technical terms and acronyms.

### AC-023: Two simultaneous runs do not interfere

- **Given** a project and two different valid briefs
- **When** the user starts the spec-agent command for both briefs at the same time
- **Then** both runs complete with two different numbered subfolders, each containing its own spec.md derived from its own brief, and the `.doppelblind` records of the two runs are kept apart

Sources: `specs/001-orchestrator-spec-agent/answers.md` › two runs in the same project must not interfere with each other; `specs/001-orchestrator-spec-agent/answers.md` › the two specs could be written simultaneously

Open questions: Q-19, Q-20

### AC-024: Spec is written in English

- **Given** a brief written in German
- **When** a spec-agent run completes successfully
- **Then** title, criteria, wishes and open questions in spec.md are written in English

Sources: `specs/001-orchestrator-spec-agent/answers.md` › currently everything should be English

### AC-025: Open questions are not answered during the run

- **Given** a brief whose spec will contain open questions
- **When** the spec-agent command runs
- **Then** the user is not asked to answer any open question during the run; the open questions appear only in spec.md

Sources: `docs/briefs/orchestrator-spec-agent.md` › Die offenen Fragen werden nicht während des Laufs beantwortet.

### AC-026: Orchestrator does not commit

- **Given** a project under version control with a clean working tree
- **When** a spec-agent run completes successfully
- **Then** no new commit exists; the created spec folder is present as an uncommitted change

Sources: `specs/001-orchestrator-spec-agent/answers.md` › for now the user commits the changes. committing without the user is part of OUT-13

### AC-027: Run is recorded in the .doppelblind folder

- **Given** a project and a valid brief
- **When** a spec-agent run ends
- **Then** the project's `.doppelblind` folder contains the run's state, its logs, and the input given to and the output returned by the spec agent

Sources: `specs/001-orchestrator-spec-agent/answers.md` › run state and logs, as well as input and output of the run, should be recorded and placed in a `.doppelblind` folder for later analysis; `docs/product.md` › Every run records its state, its logs and the input and output of every role in the project's .doppelblind folder, for later analysis.

Open questions: Q-20

### AC-028: Time and cost limits can be set at start and have defaults

- **Given** a valid brief
- **When** the user starts a run once without setting limits and once setting a time limit and a cost limit
- **Then** the run without limits starts using default limits; the run with limits applies the values the user set

Sources: `docs/product.md` › I can set the time and cost limits when I start a run.; `specs/001-orchestrator-spec-agent/answers.md` › everything should be configurable at least. the user should set those values, with reasonable defaults.

Open questions: Q-16, Q-17

### AC-029: Reaching the cost limit lets the user continue with a new limit

- **Given** a run whose cost limit is reached before the spec agent finishes
- **When** the limit is reached
- **Then** the user is informed that the cost limit was reached and can accept a new cost limit, after which the run continues; nothing continues without the user's decision

Sources: `specs/001-orchestrator-spec-agent/answers.md` › for example for the cost of a run, the user could say: go on.; `docs/product.md` › At a limit, a human decides; nothing is approved automatically by waiting.

Open questions: Q-17, Q-18

### AC-030: Refinement re-runs the spec agent on brief, sources and answers

- **Given** a spec folder whose open questions the user has answered
- **When** the user runs the complete-flow command for that feature
- **Then** the spec agent runs again; its recorded input contains the brief, the sources and all answers so far, and does not contain the spec.md of the prior round

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the orchestrator should check for the answers and give them to the spec agent again, so the spec agent can generate a new specification; `specs/001-orchestrator-spec-agent/answers.md` › the brief and the sources are passed along with the answers, but not the spec from the prior turn; `docs/product.md` › Specs themselves are not sources, because a model writes them.

Open questions: Q-01, Q-03, Q-04, Q-05, Q-06

### AC-031: Refinement replaces the spec in the same folder

- **Given** a spec folder `00N-name` whose open questions the user has answered
- **When** a refinement round completes successfully
- **Then** the spec.md in that folder is replaced by the new spec and no new numbered spec folder is created

Sources: `specs/001-orchestrator-spec-agent/answers.md` › then the spec and the answers should be replaced

Open questions: Q-01, Q-03, Q-04, Q-19

### AC-032: Answer `free` marks a decision as left open on purpose

- **Given** the user answered an open question with `free`
- **When** the refinement round completes
- **Then** the new spec.md lists that decision as left open on purpose and does not contain that question again as an open question

Sources: `specs/001-orchestrator-spec-agent/answers.md` › a decision deliberately left open is marked with the answer `free`

Open questions: Q-03

### AC-033: Spec step ends after three rounds or when no open question concerns a criterion

- **Given** a feature whose spec has had three spec-agent rounds, or whose latest spec has no open question that concerns a criterion
- **When** the user runs the complete-flow command for that feature
- **Then** the spec agent is not run again and the flow reports that the spec step has ended

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the limit should be 3 turns for this refinement; `specs/001-orchestrator-spec-agent/answers.md` › the end of the turn limit for this flow step is reached, or no open question concerns any criterion

Open questions: Q-01, Q-02

### AC-034: Round limit cannot be extended

- **Given** a feature whose spec step has reached the limit of three rounds
- **When** the user tries to continue the spec step
- **Then** the user is not offered an option to raise the round limit and no fourth spec-agent round runs

Sources: `specs/001-orchestrator-spec-agent/answers.md` › the limit of runs should not be made broader, because this will not result in better output.

Open questions: Q-02

## Wishes

- Ein nettes Logo/Figlet vorweg in der TUI.
- Ggf. ein LLM zu Rate ziehen, um meine Antworten auf die offenen Fragen in das Dokument einzuarbeiten.

## Left open

- The exact CLI command syntax (program name, subcommands, argument syntax) is left open.
- What .doppelblind.conf must contain for this outcome and what happens when it is missing or invalid is left open.
- What is shown, what is created and which exit status is returned when the spec agent fails, times out or returns unusable output is left open.
- What happens when the time limit of a run is reached is left open.
- What exactly the TUI shows (steps, progress, elapsed time, cost, result, spec location) is left open.
- The exit status of the command on success and on each kind of failure is left open.

## Open questions

### Q-01

How does the complete-flow command know which feature it should continue (for example, when answers have been given in an existing spec folder), and what does it do when it is started with a brief for which a spec folder already exists?

_Context: Steps 1 and 6: starting the flow, and continuing it after the user has answered the open questions._

**Answer:**


### Q-02

Does the first spec-agent run on a brief count as one of the three rounds, or are the three rounds counted only for refinements after it?

_Context: Refining the spec after the open questions have been answered._

**Answer:**


### Q-03

Where does the user write the answers to the open questions: inside spec.md (as the brief's step 6 says) or in a separate answers file in the spec folder, and what is the required format so the orchestrator can find each answer and the question it belongs to?

_Context: Step 6: the user opens spec.md and answers the open questions there._

**Answer:**


### Q-04

What does 'the spec and the answers should be replaced' mean for the answers: are earlier rounds' answers kept so that all answers so far are passed to the next round, and where are they kept?

_Context: Refining the spec after the open questions have been answered._

_Depends on: Q-03_

**Answer:**


### Q-05

What happens when the user starts a refinement while some open questions are still unanswered?

_Context: Refining the spec after the open questions have been answered._

_Depends on: Q-03_

**Answer:**


### Q-06

How does the orchestrator decide which files are passed to the spec agent as binding sources, and which files count as 'code' that the spec agent must not see?

_Context: Step 3: the orchestrator gives the brief to the spec agent._

**Answer:**


### Q-07

Must the rule that the spec agent cannot read code and cannot write files be enforced technically in this outcome (so that it holds even if the agent ignores its instructions), or is an instruction to the agent sufficient for now?

_Context: Step 3: the spec agent produces the specification._

**Answer:**


### Q-08

How is the project root determined (for example from the current directory, from the location of .doppelblind.conf, or otherwise), and what happens when the command is run outside any project?

_Context: Steps 2 and 5: the brief path and the location of the specs folder._

**Answer:**


### Q-09

Is an absolute brief path that points to a file inside the project accepted?

_Context: Step 2: the brief is passed as a path._

**Answer:**


### Q-10

Is a brief path accepted if a directory along the path (not the file itself) is a symlink?

_Context: Step 2: the brief is passed as a path._

**Answer:**


### Q-11

What happens when the brief file is empty, or is not a text file?

_Context: Step 2: the brief is passed as a path._

**Answer:**


### Q-12

Where does the spec template live, who provides its initial version, and what happens when it is missing or cannot be used?

_Context: Step 3: the spec agent produces the specification._

**Answer:**


### Q-13

What must the spec template contain and what may the user change in it, given that the orchestrator must still validate the agent's output against a fixed schema?

_Context: Step 3: the spec agent produces the specification._

_Depends on: Q-12_

**Answer:**


### Q-14

Besides schema validation, must the orchestrator check citations itself (for example, that every cited path is one of the sources passed and every anchor appears verbatim in that source), and what happens when a citation fails that check?

_Context: Step 3: the spec agent produces criteria that each cite a source._

**Answer:**


### Q-15

What happens when a brief path is rejected or the brief cannot be read: besides the error message, is anything created (spec folder, .doppelblind records)?

_Context: Step 2: the brief is passed as a path._

**Answer:**


### Q-16

What are the default values of the time limit and the cost limit, and how does the user set them (on the command line, in .doppelblind.conf, or both, and which wins)?

_Context: Running the spec agent within the limits of a run._

**Answer:**


### Q-17

How is the cost of a run measured, given that agents run under a subscription rather than a per-token API key?

_Context: Running the spec agent within the limits of a run._

**Answer:**


### Q-18

What happens when the user declines to accept a new cost limit after the limit was reached?

_Context: Running the spec agent within the limits of a run._

**Answer:**


### Q-19

What happens when two refinement runs for the same spec folder are started at the same time?

_Context: Refining the spec after the open questions have been answered._

**Answer:**


### Q-20

How are the records in the .doppelblind folder organised (for example one folder per run), and in which format are state, logs, input and output stored?

_Context: Recording the run for later analysis._

**Answer:**


### Q-21

Which model does the spec agent run with in this outcome, and can the user choose it?

_Context: Step 3: the orchestrator gives the brief to the spec agent._

**Answer:**
