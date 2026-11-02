# Answers

## Round 1

### Q-01

What is the exact CLI command (program name, subcommand and argument syntax) the user types to start the flow with a brief?

**Answer:**

free

### Q-02

Is there one command or several distinct commands (e.g. one that only runs the spec agent and one that starts the flow for a new feature), and if several, how do they differ in behaviour?

**Answer:**

one command for a specific agent (to jump into the flow), one command to run the complete flow where it currently is at!

### Q-03

Which of the invariants in docs/product.md §5 must already hold for this outcome (for example: that invalid structured output from the spec agent counts as a failure, or that the run is bounded by time and cost)?

**Answer:**

check again in product.md. questions are resolved.

### Q-04

Where is the specs folder located: relative to the current directory, relative to the project root, or at a location declared in .doppelblind.conf?

**Answer:**

in the project root

### Q-05

Which binding sources does the spec agent receive along with the brief, and how does the orchestrator determine them?

**Answer:**

every aspekt the domain needs for functional behavior or which are part of a functional contract

### Q-06

What must .doppelblind.conf contain for this outcome, and what happens when it is missing or invalid?

**Answer:**

free

### Q-07

What does the user see and what happens when the brief path does not exist, points to a directory, or the file cannot be read?

**Answer:**

an error message

### Q-08

Are absolute paths, or relative paths leading outside the current directory or project (e.g. '../'), accepted as brief paths?

**Answer:**

no! no symlinks and only path inside the project.

### Q-09

Are there requirements on the brief's content or structure (e.g. required sections such as Outcome or Walkthrough), and what happens if a brief does not meet them or is empty?

**Answer:**

create a template for specs which should be used by the agent. so a user has control over the content of a spec.

### Q-10

Does the agent run under any restriction on what it can read or write during this outcome, and if so, which?

**Answer:**

sure, it should not read the code itself, only functional descisions and requirements

there is no need to write anything, it can answer to the orchestrator which can create a structured spec

### Q-11

Which agent CLI runs the spec agent when the user names none, and can the user name one for this command?

**Answer:**

currently we should just use claude code. other clis are part of OUT-09

### Q-12

What happens when the spec agent fails, times out, or returns output that cannot be turned into a spec: what is shown, is a folder or spec.md created, and what exit status does the command return?

**Answer:**

free

### Q-13

Are there time or cost limits for the run, are they fixed or configurable, who sets their values, and what happens when one is reached?

**Answer:**

- everything should be configurable at least. the user should set those values, with reasonable defaults.
- when a limit is reached, the user should be informed. dependent on the type of limit, the flow should stop or may proceed with a new limit accepted by the user.
- for example for the cost of a run, the user could say: go on.
- the limit of runs should not be made broader, because this will not result in better output.
- what happens when the time limit is reached: free

### Q-14

What exactly must the TUI show (which steps or states, progress, elapsed time, cost, final result, location of the created spec.md)?

**Answer:**

free

### Q-15

How should the command behave when its output is not an interactive terminal (e.g. piped into a file or run in CI)?

**Answer:**

this should be out of scope for now

### Q-16

What exit status should the command return on success and on each kind of failure?

**Answer:**

free

### Q-17

How is the subfolder name formed: how many digits does the number have, and where does the part after the number (e.g. 'spec-inhalt') come from?

**Answer:**

- 3 digits may be enough, but the number may grow past 999
- the part after the number is 2–4 lowercase words joined by dashes that capture the change, in action-noun form where possible (e.g. "brief-to-spec", "fix-payment-timeout"). Keep technical terms and acronyms.

### Q-18

How is the next number determined when the specs folder is missing, empty, contains gaps in its numbering, or contains subfolders without a number?

**Answer:**

- no gap detection, just use the next number
- no matter if a folder is empty, use the next number
- if the folder doesn't exist, create it
- subfolders without a number are ignored

### Q-19

What happens when two runs are started at the same time in the same project?

**Answer:**

- two runs in the same project must not interfere with each other
- the two specs could be written simultaneously

### Q-20

What is the required structure of spec.md (sections, their order, how IDs, sources, wishes and open questions are written) so that tests and later roles can read it?

**Answer:**

create a template for the user to change

### Q-21

How does the user record an answer to an open question in spec.md, including marking a decision as deliberately left open?

**Answer:**

- manually (or create an own skill for that; this is not part of doppelblind)
- a decision deliberately left open is marked with the answer `free`

### Q-22

What happens after the user has answered the open questions in spec.md — is there a command that takes the answers into account, and does it update the same spec.md or create a new folder?

**Answer:**

- the orchestrator should check for the answers and give them to the spec agent again, so the spec agent can generate a new specification
- the brief and the sources are passed along with the answers, but not the spec from the prior turn
- then the spec and the answers should be replaced
- the limit should be 3 turns for this refinement

### Q-23

In which language is the spec.md written when the brief is in another language?

**Answer:**

currently everything should be English

### Q-24

Besides spec.md, should the run write anything else (e.g. run state, logs, a copy of the brief), and where?

**Answer:**

run state and logs, as well as input and output of the run, should be recorded and placed in a `.doppelblind` folder for later analysis

### Q-25

Who commits the created spec folder to version control: the orchestrator, or the user?

**Answer:**

for now the user commits the changes. committing without the user is part of OUT-13

### Q-26

What must be true for this feature to count as done, beyond a spec.md being created for a brief (e.g. running it on a specific brief, specific checks passing)?

**Answer:**

the end of the turn limit for this flow step is reached, or no open question concerns any criterion
