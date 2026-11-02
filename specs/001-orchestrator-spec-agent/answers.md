# Answers

### Q-01

Is reading the user's answers from `spec.md` and running further clarify rounds (core loop steps 3–6 of the product description) part of this change, or does this change end with the user writing answers into `spec.md`?

**Answer:**

yes, part of this spec

### Q-02

What is the exact name and syntax of the CLI command, and are "hand the brief to the spec agent" and "start the flow for a new feature" one command or two different commands?

**Answer:**

naming is up to the implementer, two commands, one for the complete flow one for the specific step

### Q-03

What should happen when the brief path is missing, does not exist, is a directory, or is not readable?

**Answer:**

show an error message and abort

### Q-04

May the brief path point outside the project, and how is the project itself located: is it the current directory, or found some other way?

**Answer:**

everything should be inside the current project.

### Q-05

What should happen when the project has no `.doppelblind.conf`, or the file is invalid or declares no binding sources?

**Answer:**

free

### Q-06

What does `.doppelblind.conf` need to contain for this change (for example how binding sources are declared and which paths the spec agent may write), and in which format?

**Answer:**

free

### Q-07

Where is the `specs` folder located (project root, current directory, or a path declared in `.doppelblind.conf`), and what happens if it does not exist yet?

**Answer:**

project root. create it if it does not exists

### Q-08

What is the exact format of the subfolder name: how many digits does the number have, what number does the first folder get, and where does the text after the number (e.g. `spec-inhalt` in `001-spec-inhalt`) come from?

**Answer:**

3 digits, a 2–4 lowercase words joined by dashes that capture the change, in action-noun form where possible. Keep technical terms and acronyms

### Q-09

How is the next number determined when the existing subfolders have gaps, non-numbered names, or when two runs start at the same time?

**Answer:**

close no gaps, just increment the highes 3 digit number.. handling two runs at the same time is out of scope for now

### Q-10

What should happen when a run is started on a brief that already has a spec?

**Answer:**

1. Spec-create run: the spec agent writes the spec and open questions afresh from the brief, the sources and every answer so far.
2. Clarify run: you answer the questions manually in `spec.md`, or start the flow again and mark unanswered question with `free` or `out of scope`. If you `finish` the clarify run while any question is unanswered, those questions will be marked `unanswered` and the spec-agent is finished.
3. If all questions are answered, you decide whether another spec-create run starts with step 1. or to stop the spec-agent.

### Q-11

What exact layout must `spec.md` have (sections, headings, how each criterion, source citation, wish and open question is rendered), and where and how does the user write the answer to each open question in it?

**Answer:**

the user writes the answers directly into the spec.md. the spec.md should be created by the orchestrator. the llm should create structured data. check if a spec template is usefull and can be used by the process

### Q-12

Should `spec.md` contain anything besides criteria, wishes and open questions (for example a title, a reference to the brief, or other metadata), and if so what?

**Answer:**

a titel and a short description of the feature and the use case would be nice to have (probably more a wish than a testable feature)

### Q-13

Does the orchestrator itself check the spec agent's citations (that each cited path is a declared binding source and that the anchor appears verbatim in it), and what happens if a citation fails that check?

**Answer:**

free

### Q-14

When the spec agent run fails (invalid output, agent CLI not installed or not logged in, crash, interruption by the user), is any `spec.md` or subfolder written, and what does the user see?

**Answer:**

noting is written, the user will see the error

### Q-15

How does the user set the time and cost limits when starting a run, what applies when none are given, and in which unit is cost measured given that the agent runs under a subscription rather than per-token billing?

**Answer:**

free

### Q-16

When a limit is reached, how does the user make the decision the product description requires, and which choices does the user have?

**Answer:**

the user can decide on cost budget increase or wait time increase. the turn count shouldn't be changed mid run. the user will be asked by the orcehstrator and can answer it in terminal

### Q-17

Which steps or states must the TUI show, what else must it display, and what is shown when the run ends successfully or fails?

**Answer:**

free

### Q-18

How should the command behave when it is not run in an interactive terminal (for example in a pipe or CI)?

**Answer:**

out of scope

### Q-19

What is the layout of the `.doppelblind` folder (where a run's state, logs and the spec agent's input and output are stored, and how runs are told apart), and is that folder meant to be versioned?

**Answer:**

free

### Q-20

Where do the spec agent's prompt and output schema come from, given that they must not live in the project's tree, and how should a test check that from the outside, given that the role's input is recorded in the project's `.doppelblind` folder?

**Answer:**

free

### Q-21

Which of the information boundaries in the product description (for example what the spec agent can read or write in the project) must be enforced technically in this change, and which may still exist only as a prompt?

**Answer:**

everything, it is mandatory per product.md invariant

### Q-22

Which model does the spec agent run with in this change, and can the user choose it?

**Answer:**

out of scope

### Q-23

What should happen when the brief is not in English, given that writing briefs and getting specs in other languages is a later outcome (OUT-15)?

**Answer:**

output should be in english for now

### Q-24

What should happen when the brief is empty or lacks sections such as the outcome or the walkthrough?

**Answer:**

out of scope

### Q-25

What exit status should the command return on success and on each kind of failure?

**Answer:**

free

### Q-26

How will you tell that this change is done: which run on which brief in which project counts as the acceptance check?

**Answer:**

out of scope
