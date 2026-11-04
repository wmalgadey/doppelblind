# Review

Criteria of [specs/001-orchestrator-spec-agent/spec.md](../../../specs/001-orchestrator-spec-agent/spec.md) that are proven by review. Check each one before the merge.

## AC-015: Spec from a non-English brief is written in English

- **Given** A brief written in German
- **When** The user runs the spec-agent command on it and opens the produced `spec.md`
- **Then** Title, introduction, criteria, wishes and questions are in English, while cited anchors stay word for word in the language of their source

**Steps:**

1. Create a new, empty project directory to work in.
2. In that directory, write a brief file entirely in German. Give it a title, a few paragraphs of introduction, several concrete requirements, at least one optional wish and at least one open point. Include a few distinctive German phrases you can find again later (for example "Der Export muss als CSV-Datei erfolgen").
3. Run the spec-agent command on this German brief, the same way it is run on any brief in this project, and wait for it to finish.
4. Open the `spec.md` it produced.

**Where to check:** The produced `spec.md` file, read next to the German brief file.

**What must be observed:** The title, the introduction, every criterion (title, Given, When, Then), every wish and every question in `spec.md` must be written in English. Every anchor cited from the brief must match the German source text word for word, in German. If any of those sections is wholly or partly in German outside a cited anchor, the criterion does not hold. It also does not hold if a cited anchor is translated into English, paraphrased, or differs from the brief's wording in any way.

## AC-020: Running step shows how long it has been running

- **Given** The project from AC-001, run in an interactive terminal, with a spec agent that takes several seconds
- **When** The user watches the TUI while the spec agent writes the spec
- **Then** The spec-agent step's line shows an elapsed time that increases while the step runs

**Steps:**

1. Set up the project from AC-001, following AC-001's Given.
2. Configure or substitute a spec agent that takes several seconds to finish, for example one that waits about 10 seconds before writing the spec.
3. In an interactive terminal (a real TTY, with output not piped or redirected), run the same command as in AC-001 so that the TUI appears.
4. Watch the TUI the whole time the spec agent is writing the spec.

**Where to check:** The spec-agent step's line in the TUI, shown in the interactive terminal while that step is running.

**What must be observed:** While the spec-agent step is running, its line must show an elapsed time, and that time must visibly go up as the step keeps running (for example 1s, 2s, 3s…). The criterion does not hold if the line shows no elapsed time while the step runs, or if the time stays frozen, or if it only appears after the step has finished.
