# Orchestrator CLI that runs the spec agent on a brief

Brief: [docs/briefs/orchestrator-spec-agent.md](../../docs/briefs/orchestrator-spec-agent.md)

## Criteria

### AC-001: Brief path is resolved relative to the current directory

- **Given** A brief file exists at <project>/docs/briefs/feature.md and the current directory is <project>/docs
- **When** The user starts the orchestrator's flow from the CLI and passes the brief path "briefs/feature.md"
- **Then** The orchestrator reads that brief file, runs the spec agent on it, and the run ends with a newly created spec.md (see AC-009)

Sources: `docs/briefs/orchestrator-spec-agent.md` › Den Brief übergebe ich als Pfad relativ zum aktuellen Verzeichnis.; `docs/briefs/orchestrator-spec-agent.md` › OUT-01

Open questions: Q-01, Q-02, Q-06, Q-07, Q-08, Q-11

### AC-002: Spec contains criteria in Given-When-Then form

- **Given** A run started with a valid brief path has finished
- **When** The user opens the spec.md the run created
- **Then** The spec.md contains at least one acceptance criterion, and every criterion in it is stated with a Given part, a When part and a Then part

Sources: `docs/briefs/orchestrator-spec-agent.md` › Der Spec-Agent erzeugt eine Spezifikation mit Kriterien in Given-When-Then und offenen Fragen.

Open questions: Q-20, Q-23

### AC-003: Every criterion has an ID and a cited source

- **Given** A run started with a valid brief path has finished
- **When** The user reads the criteria in the created spec.md
- **Then** Every criterion carries an ID and names at least one cited source

Sources: `docs/product.md` › The spec agent writes binding criteria, each with an ID and a cited source, separate from wishes, and lists every decision the brief does not make as an open question without a suggested answer.; `docs/product.md` › OUT-01

Open questions: Q-05, Q-20

### AC-004: Open questions are in the spec.md itself

- **Given** A run started with a brief that leaves at least one decision open has finished
- **When** The user opens the created spec.md
- **Then** The spec.md contains the open questions, so the user can answer them in that file

Sources: `docs/briefs/orchestrator-spec-agent.md` › Ich öffne die `spec.md` und beantworte die offenen Fragen dort.; `docs/briefs/orchestrator-spec-agent.md` › Der Spec-Agent erzeugt eine Spezifikation mit Kriterien in Given-When-Then und offenen Fragen.

Open questions: Q-20, Q-21

### AC-005: Open questions carry no suggested answer

- **Given** A run has finished and the created spec.md contains open questions
- **When** The user reads each open question
- **Then** No open question includes a suggested answer

Sources: `docs/product.md` › The spec agent writes binding criteria, each with an ID and a cited source, separate from wishes, and lists every decision the brief does not make as an open question without a suggested answer.

### AC-006: Wishes are kept separate from criteria

- **Given** A brief with a "Wishes" section listing at least one wish
- **When** The run on that brief finishes and the user opens the created spec.md
- **Then** Each wish from the brief appears in the spec.md outside the list of criteria and does not appear as a criterion

Sources: `docs/product.md` › The spec agent writes binding criteria, each with an ID and a cited source, separate from wishes, and lists every decision the brief does not make as an open question without a suggested answer.

Open questions: Q-09, Q-20

### AC-007: Terminal shows what is currently happening

- **Given** The user has started a run with a valid brief path in a terminal
- **When** The spec agent is running
- **Then** The terminal shows text that describes the step currently in progress

Sources: `docs/briefs/orchestrator-spec-agent.md` › Der Orchestrator zeigt eine minimale TUI, die beschreibt, was gerade passiert.

Open questions: Q-14, Q-15

### AC-008: Spec.md is written to a numbered subfolder of specs

- **Given** A run started with a valid brief path
- **When** The run finishes successfully
- **Then** A file named spec.md exists in a new subfolder of the specs folder, and that subfolder's name begins with a sequence number

Sources: `docs/briefs/orchestrator-spec-agent.md` › Am Ende existiert eine `spec.md` in einem fortlaufend nummerierten Unterordner von `specs`

Open questions: Q-04, Q-12, Q-16, Q-17, Q-25

### AC-009: Subfolder numbers are sequential

- **Given** The specs folder contains exactly one subfolder, numbered 1 (e.g. 001-spec-inhalt)
- **When** A new run finishes successfully
- **Then** The spec.md is created in a new subfolder numbered 2, and the existing subfolder and its content are unchanged

Sources: `docs/briefs/orchestrator-spec-agent.md` › Am Ende existiert eine `spec.md` in einem fortlaufend nummerierten Unterordner von `specs`

Open questions: Q-04, Q-12, Q-17, Q-18, Q-19, Q-22

### AC-010: Open questions are not answered during the run

- **Given** A brief whose spec will contain open questions
- **When** The user starts a run and gives no input in the terminal after starting it
- **Then** The run finishes and creates the spec.md without asking the user to answer any open question

Sources: `docs/briefs/orchestrator-spec-agent.md` › Die offenen Fragen werden nicht während des Laufs beantwortet.

### AC-011: No other role runs; flow ends after the spec agent

- **Given** A run started with a valid brief path
- **When** The spec agent has finished
- **Then** The run ends without starting any other role (test author, implementer, verifier, classifier or worst-case agent), and no acceptance tests or implementation files are created

Sources: `docs/briefs/orchestrator-spec-agent.md` › Es werden keine anderen Rollen gestartet.

Open questions: Q-02, Q-24

## Wishes

- Ein nettes Logo/Figlet vorweg in der TUI.
- Ggf. ein LLM zu Rate ziehen, um meine Antworten auf die offenen Fragen in das Dokument einzuarbeiten.

## Left open

None.

## Open questions

### Q-01

What is the exact CLI command (program name, subcommand and argument syntax) the user types to start the flow with a brief?

_Context: Walkthrough step 1: starting the orchestrator via CLI with a command such as 'give the brief to the spec agent' or 'start the flow for a new feature'._

**Answer:**

free

### Q-02

Is there one command or several distinct commands (e.g. one that only runs the spec agent and one that starts the flow for a new feature), and if several, how do they differ in behaviour?

_Context: Walkthrough step 1 names two possible command phrasings._

**Answer:**

one command for a specific agent (to jump into the flow), one command to run the complete flow where it currently is at!

### Q-03

Which of the invariants in docs/product.md §5 must already hold for this outcome (for example: that invalid structured output from the spec agent counts as a failure, or that the run is bounded by time and cost)?

_Context: docs/product.md lists this as an open question blocking OUT-01, and it determines which additional criteria apply to the run._

**Answer:**

check again in product.md. questions are resolved.

### Q-04

Where is the specs folder located: relative to the current directory, relative to the project root, or at a location declared in .doppelblind.conf?

_Context: Walkthrough step 5: spec.md ends up in a numbered subfolder of specs._

**Answer:**

in the project root

### Q-05

Which binding sources does the spec agent receive along with the brief, and how does the orchestrator determine them?

_Context: Walkthrough step 3: the orchestrator gives the brief to the spec agent, whose criteria must each cite a source._

**Answer:**

every aspekt the domain needs for functional behavior or which are part of a functional contract

### Q-06

What must .doppelblind.conf contain for this outcome, and what happens when it is missing or invalid?

_Context: Walkthrough step 3, given that docs/product.md declares the project contract in .doppelblind.conf._

_Depends on: Q-05_

**Answer:**

free

### Q-07

What does the user see and what happens when the brief path does not exist, points to a directory, or the file cannot be read?

_Context: Walkthrough step 2: passing the brief as a relative path._

**Answer:**

an error message

### Q-08

Are absolute paths, or relative paths leading outside the current directory or project (e.g. '../'), accepted as brief paths?

_Context: Walkthrough step 2: passing the brief as a relative path._

**Answer:**

no! no symlinks and only path inside the project.

### Q-09

Are there requirements on the brief's content or structure (e.g. required sections such as Outcome or Walkthrough), and what happens if a brief does not meet them or is empty?

_Context: Walkthrough step 3: the spec agent turns the brief into a spec._

**Answer:**

create a template for specs which should be used by the agent. so a user has control over the content of a spec.

### Q-10

Does the agent run under any restriction on what it can read or write during this outcome, and if so, which?

_Context: Walkthrough step 3: the spec agent runs, before the orchestrator enforces boundaries (product §9)._

_Depends on: Q-03_

**Answer:**

sure, it should not read the code itself, only functional descisions and requirements

there is no need to write anything, it can answer to the orchestrator which can create a structured spec

### Q-11

Which agent CLI runs the spec agent when the user names none, and can the user name one for this command?

_Context: Walkthrough step 3; docs/product.md lists this as an open question blocking OUT-01._

**Answer:**

currently we should just use claude code. other clis are part of OUT-09

### Q-12

What happens when the spec agent fails, times out, or returns output that cannot be turned into a spec: what is shown, is a folder or spec.md created, and what exit status does the command return?

_Context: Walkthrough steps 3 and 5: the spec agent produces the spec and spec.md exists at the end._

_Depends on: Q-03_

**Answer:**

free

### Q-13

Are there time or cost limits for the run, are they fixed or configurable, who sets their values, and what happens when one is reached?

_Context: Walkthrough step 3; docs/product.md lists this as an open question blocking OUT-01._

_Depends on: Q-03_

**Answer:**

- everything should be configurable at least. the user should set those values, with reasonable defaults.
- when a limit is reached, the user should be informed. dependent on the type of limit, the flow should stop or may proceed with a new limit accepted by the user.
- for example for the cost of a run, the user could say: go on.
- the limit of runs should not be made broader, because this will not result in better output.
- what happens when the time limit is reached: free

### Q-14

What exactly must the TUI show (which steps or states, progress, elapsed time, cost, final result, location of the created spec.md)?

_Context: Walkthrough step 4: a minimal TUI that describes what is currently happening._

**Answer:**

free

### Q-15

How should the command behave when its output is not an interactive terminal (e.g. piped into a file or run in CI)?

_Context: Walkthrough step 4: the TUI._

**Answer:**

this should be out of scope for now

### Q-16

What exit status should the command return on success and on each kind of failure?

_Context: Walkthrough step 5: the end of the run._

**Answer:**

free

### Q-17

How is the subfolder name formed: how many digits does the number have, and where does the part after the number (e.g. 'spec-inhalt') come from?

_Context: Walkthrough step 5: the example name 001-spec-inhalt._

**Answer:**

- 3 digits may be enough, but the number may grow past 999
- the part after the number is 2–4 lowercase words joined by dashes that capture the change, in action-noun form where possible (e.g. "brief-to-spec", "fix-payment-timeout"). Keep technical terms and acronyms.

### Q-18

How is the next number determined when the specs folder is missing, empty, contains gaps in its numbering, or contains subfolders without a number?

_Context: Walkthrough step 5: sequentially numbered subfolders._

_Depends on: Q-04_

**Answer:**

- no gap detection, just use the next number
- no matter if a folder is empty, use the next number
- if the folder doesn't exist, create it
- subfolders without a number are ignored

### Q-19

What happens when two runs are started at the same time in the same project?

_Context: Walkthrough step 5: sequentially numbered subfolders._

**Answer:**

- two runs in the same project must not interfere with each other
- the two specs could be written simultaneously

### Q-20

What is the required structure of spec.md (sections, their order, how IDs, sources, wishes and open questions are written) so that tests and later roles can read it?

_Context: Walkthrough steps 3 and 5: the spec content written to spec.md._

**Answer:**

create a template for the user to change

### Q-21

How does the user record an answer to an open question in spec.md, including marking a decision as deliberately left open?

_Context: Walkthrough step 6: answering the open questions in spec.md._

_Depends on: Q-20_

**Answer:**

- manually (or create an own skill for that; this is not part of doppelblind)
- a decision deliberately left open is marked with the answer `free`

### Q-22

What happens after the user has answered the open questions in spec.md — is there a command that takes the answers into account, and does it update the same spec.md or create a new folder?

_Context: Walkthrough step 6; docs/product.md lists this as an open question blocking OUT-01._

_Depends on: Q-21_

**Answer:**

- the orchestrator should check for the answers and give them to the spec agent again, so the spec agent can generate a new specification
- the brief and the sources are passed along with the answers, but not the spec from the prior turn
- then the spec and the answers should be replaced
- the limit should be 3 turns for this refinement

### Q-23

In which language is the spec.md written when the brief is in another language?

_Context: Walkthrough step 3: the spec agent writes the spec from a brief written in German._

**Answer:**

currently everything should be English

### Q-24

Besides spec.md, should the run write anything else (e.g. run state, logs, a copy of the brief), and where?

_Context: Walkthrough step 5 and product §2, which places run state in the project._

**Answer:**

run state and logs, as well as input and output of the run, should be recorded and placed in a `.doppelblind` folder for later analysis

### Q-25

Who commits the created spec folder to version control: the orchestrator, or the user?

_Context: Walkthrough step 5; docs/product.md lists this as an open question blocking OUT-01._

**Answer:**

for now the user commits the changes. committing without the user is part of OUT-13

### Q-26

What must be true for this feature to count as done, beyond a spec.md being created for a brief (e.g. running it on a specific brief, specific checks passing)?

_Context: Outcome OUT-01: passing a brief via CLI and receiving a spec._

**Answer:**

the end of the turn limit for this flow step is reached, or no open question concerns any criterion
