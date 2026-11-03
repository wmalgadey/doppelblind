# Answers

### Q-01

Is any part of the spec loop described in the product's core loop (steps 4 to 6: re-running the spec agent with the answers given in `spec.md`, finishing the spec step, recording unanswered questions) part of this change, or does this change end with the user writing answers into `spec.md`?

**Answer:**

rerunning and finishing the spec is part of this spec

### Q-02

The product says every invariant holds for a role from the outcome that introduces it. Does invariant 3 apply in this change: does the orchestrator validate the spec agent's output against a schema, so that invalid output counts as a failure? If so, what does the user see when the output is invalid, and is any spec folder left behind?

**Answer:**

invariants from product.md are always valid. the llm should be guided to created structured output, if that is used or created wrong, the process has to stop. specs are only written or changed when the output is valid.

### Q-03

Does invariant 4 apply in this change: is the spec agent's run limited by time and cost, can the user set these limits when starting the command, and what happens when a limit is reached?

**Answer:**

yes the invariants always have to be respected. the user might optionally change the time, cost and turn limits for the agents. the user might extend some limits like cost or time, but never turns (because going in circles should be avoided, but a process might take time or might be complex). the same is for the complete spec-agent run.

The spec agent runs in these steps:

1. Spec-create run: the spec agent writes the spec and open questions afresh from the brief, the sources and every answer so far.
2. Clarify run: you answer the questions manually in `spec.md`, or start the flow again and mark unanswered question with `free` or `out of scope`. If you `finish` the clarify run while any question is unanswered, those questions will be marked `unanswered` and the spec-agent is finished.
3. If all questions are answered, you decide whether another spec-create run starts with step 1. or to stop the spec-agent.

### Q-04

Does invariant 6 apply in this change: does the run record its state, its logs and the spec agent's input and output in the project's `.doppelblind` folder, and if so, what must that record contain?

**Answer:**

yes, it should contain the inputs, the guardrails and the run log from the agent

### Q-05

OUT-01 lists the GATES capability. Does the orchestrator in this change check the produced spec, such as whether every criterion cites a source from the project's allowlist and whether each anchor really appears in that source? If so, what happens when a check fails?

**Answer:**

free

### Q-06

How does the orchestrator decide which binding sources and earlier answers the spec agent receives? Are they read from the project's `.doppelblind.conf`, what must that file contain for this change, and what happens if it is missing or incomplete?

**Answer:**

yes, they should be configurable per agent. the file should be created if missing and the process has to fail if it is imcomplete

### Q-07

Must this change enforce any boundary on the spec agent beyond a prompt, such as which files it may read or write in the project, or is that left to a later outcome?

**Answer:**

yes. the spec agent runs without tools, without settings and without project files, in an empty working directory. it sees only the message the orchestrator hands it and cannot read or write any file in the project.

### Q-08

What is the exact command, with its name and arguments, that starts the orchestrator and hands a brief to the spec agent? Is the walkthrough's second phrasing (starting the flow for a new feature) a separate command or the same one?

**Answer:**

there is one command for the spec agent and one for the complete flow; both take the brief path relative to the current directory. names and further arguments are free for the implementor.

### Q-09

Where is the `specs` folder located when the command is run from a directory other than the project's root, and how does the orchestrator determine the project's root?

**Answer:**

the project root is the root of the git repository that contains the current directory. the `specs` folder is the path given in `.doppelblind.conf` at that root, relative to it.

### Q-10

How exactly is the new subfolder named? This covers how many digits the number has, which number the first folder gets when `specs` is empty or missing, and where the text after the number comes from.

**Answer:**

the number has at least three digits, padded with leading zeros, and the first folder gets 001. after the number and a dash comes a short name in English that the spec agent gives the spec, in lower case with dashes instead of spaces and at most 50 characters.

### Q-11

How is the next number determined when the existing subfolders of `specs` have gaps in their numbering, or when `specs` contains entries whose names do not start with a number?

**Answer:**

the next number is one above the highest number of any subfolder whose name starts with a number and a dash. gaps are not filled, and entries whose names do not start with a number, as well as files, are ignored.

### Q-12

What happens when the same brief is run again while a spec for it already exists in `specs`? And must existing spec folders stay unchanged by a run?

**Answer:**

the brief keeps its spec folder. a new spec-create run starts from scratch on the brief, the sources and every answer so far, and its spec replaces the earlier spec.md in the same folder. once the spec step is final, no further spec-create run starts for that brief. spec folders of other briefs stay unchanged.

### Q-13

What happens when the brief path is missing, does not exist, is not readable, points to a directory, is absolute, or points outside the project? What does the user see, and is anything created in `specs`?

**Answer:**

the process stops before the spec agent starts and the user sees a message naming the problem; a missing path also shows the usage. an absolute path inside the project is accepted like a relative one. nothing is created in `specs`.

### Q-14

What happens when the spec agent's run fails, for instance when the agent CLI is not installed, the user is not logged in to the subscription, the agent aborts, or the run is interrupted by the user? What does the user see, and is any spec folder left behind?

**Answer:**

the process stops. the TUI marks the running step as failed and shows a message with the reason the agent CLI gave and the path of the run's trace. no spec folder is created and an existing spec.md stays unchanged. the run's folder in `.doppelblind` is kept with everything recorded up to the failure.

### Q-15

Getting specs from briefs in languages other than English is a later outcome (OUT-15). How should a run behave when the brief is not written in English, as this brief is not?

**Answer:**

the brief is accepted in any language. the spec agent writes the spec in English, and cited anchors stay in the language of their source.

### Q-16

What must the minimal TUI show: which steps or states, whether it shows the path of the produced `spec.md` at the end, and what it shows on failure?

**Answer:**

the TUI shows one line per step: reading the brief, loading the binding sources, the spec agent writing the spec, validating its output and checking its criteria and citations. the running step shows how long it has been running; a finished step is marked done with a short detail, a failed step is marked failed and followed by the reason. at the end it shows the number of criteria and open questions, the status of the spec step, what to do next and the path of the produced `spec.md`.

### Q-17

How should the command behave when its output does not go to an interactive terminal, such as when it is piped or run in a script?

**Answer:**

without an interactive terminal the TUI writes plain lines without a spinner or cursor movement. the TUI goes to standard error and only the path of the produced `spec.md` goes to standard output. a choice that cannot be read because the input has ended stops the process with a message.

### Q-18

What exit status should the command return on success and on each kind of failure?

**Answer:**

free

### Q-19

What structure must `spec.md` have, meaning its sections and how each criterion, wish and open question is laid out, so that the user and later steps can find each part?

**Answer:**

spec.md starts with the title, a link to the brief and an introduction, followed by the sections Criteria, Wishes, Left open, Out of scope, Unanswered and Open questions, in this order. each criterion is a heading with its ID and title, an optional Why line, Given, When and Then as a list, then the lines Proven by, Rejects, Sources and Open questions. each wish is one list item. each open question is a heading with its ID, the question, a context line, an optional Depends on line and an Answer field. the labels are fixed and in English.

### Q-20

Where and in what form does the user write an answer to an open question in `spec.md`, and how are the answers `free` and `out of scope` written there?

**Answer:**

the user writes the answer on the lines after the question's **Answer:** field, up to the next heading. `free` and `out of scope` are written as these exact words, alone in the field. an empty field means the question has no answer yet; the marker `unanswered` is written only by the orchestrator and is not an answer.
