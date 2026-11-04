# Test author generates acceptance tests from a final spec

Brief: [docs/briefs/test-agent.md](../../docs/briefs/test-agent.md)

With OUT-01, Doppelblind turns a brief into a final spec whose criteria each cite a source. This change delivers OUT-02. A user hands a final spec to a test author agent, either by running the flow command again or by starting the test author on its own. The agent never sees the implementation or the plan. It writes acceptance tests for every criterion proven by test and lists the assumptions it had to make. For criteria proven by review, it produces a review file that helps the user check them one by one. The TUI shows each step of the run and, at the end, what was produced.

The approval before implementation is out of scope for this change. So are what happens when the test author's structured output is invalid and whether an end-to-end review list is produced: both are left open on purpose. As already decided, all agent output is in English.

## Criteria

### AC-001: Continuing the flow starts the test author on a final spec

- **Given** A project fulfilling the contract, with a brief whose spec is final and has at least one criterion proven by test, and with no acceptance tests yet for that spec
- **When** The user runs the Doppelblind flow command again for that brief
- **Then** A test author run starts for that spec: a new test author run folder appears in the project's .doppelblind folder, and the TUI shows the test author steps

Proven by: acceptance test

Rejects: A flow command that reports the flow as finished once the spec is final and never starts the test author fails, because no test author run folder appears

Sources: `specs/002-test-author-acceptance-tests/answers.md` › I meant continuing the flow by using the flow command again; `docs/briefs/test-agent.md` › Ich nutze die Doppelblind-CLI und starte den Flow erneut oder direkt den Test-Agenten

### AC-002: Single-step start on a brief uses its connected spec

- **Given** A project with a brief connected to a final spec that has at least one criterion proven by test
- **When** The user starts the test author directly as a single step and names the brief
- **Then** A test author run starts for the spec connected to that brief, and the inputs recorded in its run folder contain that spec's criteria

Proven by: acceptance test

Rejects: A single-step command that accepts only a spec path and rejects a brief fails, because no test author run starts for the connected spec

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the brief (which is "connected" to a spec) or a specific spec

Unanswered: Q-43

### AC-003: Single-step start on a named spec

- **Given** A project with a final spec that has at least one criterion proven by test
- **When** The user starts the test author directly as a single step and names that spec
- **Then** A test author run starts for that spec, and the inputs recorded in its run folder contain that spec's criteria

Proven by: acceptance test

Rejects: A single-step command that always picks the most recent spec, whatever spec is named, fails when the named spec is not the most recent one, because the recorded inputs hold another spec's criteria

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the brief (which is "connected" to a spec) or a specific spec

### AC-004: Starting on a spec that is not final stops

- **Given** A project with a spec that still has open questions without answers, so it is not final
- **When** The user starts the test author directly on that spec
- **Then** The process stops with a message, no test author run starts, and no acceptance test, review file, assumptions.md or lock is written for that spec

Proven by: acceptance test

Rejects: An implementation that runs the test author on any existing spec.md fails, because acceptance tests appear for a spec that is not final

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the process should stop and the user is presented a message

### AC-005: Starting on a spec that does not exist stops

- **Given** A project in which the named spec does not exist
- **When** The user starts the test author directly on that spec
- **Then** The process stops with a message and no test author run starts

Proven by: acceptance test

Rejects: An implementation that crashes with an unhandled error, or starts a run with an empty spec, fails, because it shows no message or starts a run

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the process should stop and the user is presented a message

### AC-006: Missing implementation or plan paths in the contract stop the run

- **Given** A project whose .doppelblind.conf declares no paths for implementation code and the plan, with a final spec that has a criterion proven by test
- **When** The user starts the test author on that spec
- **Then** The run stops with a message before the test author starts, and no acceptance test is written

Proven by: acceptance test

Rejects: An implementation that assumes everything outside the test path is visible when no paths are declared fails, because the test author starts

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the project declares in `.doppelblind.conf` which paths hold implementation code and which hold the plan

### AC-007: Implementation code and plan are absent from what the test author can access

Why: A check counts only if it does not correlate with the error it is meant to find.

- **Given** A project whose .doppelblind.conf declares an implementation path and a plan path, each holding a file, and a final spec with a criterion proven by test
- **When** A test author run takes place and the agent in it tries to read each of those files
- **Then** Neither file exists in what the test author can access: both reads fail, and neither file's content appears in the inputs recorded in the run folder

Proven by: acceptance test

Rejects: An implementation that only tells the test author in its prompt not to read the implementation, while the files stay in its checkout, fails, because the read of the implementation file succeeds

Sources: `specs/002-test-author-acceptance-tests/answers.md` › these paths are absent from what the test author can access; `docs/product.md` › a check counts only if it does not correlate with the error it is meant to find

### AC-008: The test author gets only ID, Given, When and Then of criteria proven by test

- **Given** A final spec with one criterion proven by test, one criterion proven by review, an introduction, a wish and an open question, each with distinct marker text
- **When** A test author run takes place
- **Then** The inputs recorded in the run folder contain the ID, Given, When and Then of the criterion proven by test. They contain none of the following: the criterion proven by review, the introduction, the criterion's reason, its rejects, the wish, the open question

Proven by: acceptance test

Rejects: An implementation that passes the whole spec.md to the test author fails, because the introduction's and the review criterion's marker text appear in the recorded inputs

Sources: `specs/002-test-author-acceptance-tests/answers.md` › The test author sees only the criteria of the final spec whose `proven_by` is `test`: ID, Given, When, Then.; `specs/002-test-author-acceptance-tests/answers.md` › It does not see the introduction, `why`, `rejects`, wishes or open questions.

Unanswered: Q-31, Q-34

### AC-009: The test author does not see the brief, sources, other answers, other specs or run records

- **Given** A project with a brief, a binding source, answers marked unanswered and out of scope, a second spec and an earlier run folder in .doppelblind, each with distinct marker text, plus a final spec with a criterion proven by test
- **When** A test author run takes place and the agent in it tries to read each of those files
- **Then** None of those files can be read by the test author, and none of their marker text appears in the inputs recorded in the run folder

Proven by: acceptance test

Rejects: An implementation that hides only the implementation and plan paths, but leaves the brief and docs in the checkout, fails, because the brief can be read

Sources: `specs/002-test-author-acceptance-tests/answers.md` › It does not see the brief, the binding sources

Unanswered: Q-31, Q-32

### AC-010: Decisions answered free are handed over as deliberately unspecified

- **Given** A final spec with a criterion proven by test, and an open question about that criterion answered `free`
- **When** A test author run takes place
- **Then** The inputs recorded in the run folder contain, for that criterion, an entry starting with "deliberately unspecified:" naming the aspect, and do not contain the answer `free` as an answer

Proven by: acceptance test

Rejects: An implementation that drops free answers entirely fails, because the recorded inputs hold no "deliberately unspecified:" entry for the criterion

Sources: `specs/002-test-author-acceptance-tests/answers.md` › Decisions answered `free` are handed over per affected criterion as "deliberately unspecified: <aspect>"

Unanswered: Q-35

### AC-011: Missing test author path in the contract stops the run

- **Given** A project whose .doppelblind.conf declares no path for the test author, with a final spec that has a criterion proven by test
- **When** The user starts the test author on that spec
- **Then** The run stops with a message and no acceptance test is written

Proven by: acceptance test

Rejects: An implementation that falls back to a fixed tests folder fails, because acceptance tests are written

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the acceptance tests are written to the path the contract in `.doppelblind.conf` declares for the test author

### AC-012: Acceptance tests are written to the declared test author path

- **Given** A project whose .doppelblind.conf declares a test author path, with a final spec that has a criterion proven by test
- **When** A test author run ends successfully
- **Then** The generated acceptance test files lie under the declared test author path, and no file outside it was created or changed by the run, except files the orchestrator writes (assumptions.md, the lock, the run folder)

Proven by: acceptance test

Rejects: An implementation that writes the tests next to the spec in the specs folder fails, because the test files are not under the declared path

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the acceptance tests are written to the path the contract in `.doppelblind.conf` declares for the test author

### AC-013: A write outside the test author path is rejected

- **Given** A test author run in which the agent tries to write a file outside the declared test author path
- **When** The run processes that write
- **Then** The file does not exist outside the declared path afterwards, the run fails, and the message names the rejected path

Proven by: acceptance test

Rejects: An implementation that only logs a warning for writes outside the path fails, because the file stays and the run does not fail

Sources: `specs/002-test-author-acceptance-tests/answers.md` › every write of the test author outside that path is rejected, and the run fails with a message naming the rejected path

### AC-014: Reaching the time or cost limit asks the user whether to raise it

- **Given** A test author run started with an option that sets a time limit (or cost limit) the run exceeds
- **When** The run reaches that limit
- **Then** The user is asked whether to raise the limit and retry

Proven by: acceptance test

Rejects: An implementation that ignores the option and uses only the default limit fails, because the run does not reach the low limit and the user is never asked

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the user can change them with options when starting the command; `specs/002-test-author-acceptance-tests/answers.md` › when the time or cost limit is reached, the user is asked whether to raise it and retry; the turn limit is never raised

### AC-015: Declining to raise a limit stops without writing results

- **Given** A test author run that has reached its time or cost limit, with the user asked whether to raise it
- **When** The user declines
- **Then** The process stops with a message, and the project holds none of these for the spec: acceptance tests, review file, assumptions.md, lock

Proven by: acceptance test

Rejects: An implementation that keeps the partial test files written before the limit was reached fails, because acceptance test files remain in the project

Sources: `specs/002-test-author-acceptance-tests/answers.md` › if the user declines, the process stops with a message and nothing of the run is written to the project

Unanswered: Q-36

### AC-016: The turn limit is never raised

- **Given** A test author run started with an option that sets a turn limit the run exceeds
- **When** The run reaches the turn limit
- **Then** The user is not asked whether to raise it, the process stops, and the TUI shows the reason

Proven by: acceptance test

Rejects: An implementation that treats the turn limit like the time limit and offers to raise it fails, because the user is asked

Sources: `specs/002-test-author-acceptance-tests/answers.md` › when the time or cost limit is reached, the user is asked whether to raise it and retry; the turn limit is never raised; `specs/002-test-author-acceptance-tests/answers.md` › the process stops and the TUI shows the reason

### AC-017: Each test author run keeps its own run folder

Why: Every run records its state, logs and the input and output of every role for later analysis.

- **Given** A project with an earlier spec agent run folder in .doppelblind
- **When** Two test author runs take place one after the other
- **Then** Each has its own folder in .doppelblind with its inputs, guardrails and run log, laid out the same way as the spec agent run folder

Proven by: acceptance test

Rejects: An implementation that overwrites a single test author folder on every run fails, because only one folder remains after two runs

Sources: `specs/002-test-author-acceptance-tests/answers.md` › each test author run keeps its own folder in `.doppelblind`; `docs/product.md` › for later analysis

### AC-018: The run folder is kept when the run fails

- **Given** A test author run that fails because of a write outside the declared path
- **When** The process has stopped
- **Then** The run folder of that run still exists in .doppelblind with its inputs, guardrails and run log

Proven by: acceptance test

Rejects: An implementation that cleans up the run folder on failure fails, because the folder is gone

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the folder is kept when the run fails

Unanswered: Q-36

### AC-019: The TUI shows one line per step

- **Given** A final spec with a criterion proven by test
- **When** A test author run ends successfully
- **Then** The TUI output has one line for each of these steps: reading the final spec, preparing what the test author may see, the test author writing the acceptance tests, validating its output, checking its writes, writing the lock

Proven by: acceptance test

Rejects: An implementation that shows only a single spinner for the whole run fails, because there are no separate step lines

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the TUI shows one line per step; `docs/briefs/test-agent.md` › Die TUI zeigt mir, was gerade passiert.

### AC-020: Step lines show elapsed time, done or failed

- **Given** A test author run whose agent step runs for several seconds and then makes a write outside the declared path
- **When** The TUI output is captured during and after the run
- **Then** While the agent step runs, its line shows how long it has been running. The steps finished before it are marked done with a short detail. The failing step is marked failed and followed by the reason

Proven by: acceptance test

Rejects: An implementation that marks every step done and prints the error only in the log fails, because the failing step is not marked failed and no reason follows it

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the running step shows how long it has been running

Unanswered: Q-44

### AC-021: Assumptions are written to assumptions.md next to spec.md

- **Given** A test author run in which the agent reports two assumptions
- **When** The run ends
- **Then** assumptions.md is in the spec's folder next to spec.md, with two sections headed A-001 and A-002. Each section states the criterion, the assumption phrased as a question, a kind from gap, ambiguous, not measurable or contradiction, and the test files that rely on it. Each has an empty **Decision:** field

Proven by: acceptance test

Rejects: An implementation that writes the assumptions only into the run folder fails, because no assumptions.md exists next to spec.md

Sources: `specs/002-test-author-acceptance-tests/answers.md` › The orchestrator writes the assumptions to `assumptions.md` in the spec's folder, next to `spec.md`.

Unanswered: Q-42

### AC-022: Final TUI output shows the number of assumptions and their path

- **Given** A test author run in which the agent reports two assumptions with distinct question texts
- **When** The run ends
- **Then** The TUI's final output shows the number 2 and the path of assumptions.md, and does not show either assumption's question text

Proven by: acceptance test

Rejects: An implementation that prints every assumption in the TUI fails, because the question texts appear in the output

Sources: `specs/002-test-author-acceptance-tests/answers.md` › At the end of the run the TUI shows the number of assumptions and the path of `assumptions.md`

Unanswered: Q-42

### AC-023: No lock while an assumption lacks a valid decision

- **Given** A spec whose assumptions.md has one assumption with an empty **Decision:** field and one whose decision is text other than `accepted` or `rejected: <own text>`
- **When** The test author step reaches its end
- **Then** No lock is written for that spec's acceptance tests

Proven by: acceptance test

Rejects: An implementation that writes the lock right after the agent finishes, regardless of assumptions, fails, because a lock exists

Sources: `specs/002-test-author-acceptance-tests/answers.md` › The acceptance tests are frozen only when every assumption has a valid decision.; `specs/002-test-author-acceptance-tests/answers.md` › A valid decision is `accepted` or `rejected: <own text>`

Unanswered: Q-27, Q-28

### AC-024: Review file has one section per review criterion

Why: Next to the acceptance tests, the review file gets the same protection: read-only for the implementer, frozen by hash, checked by CI.

- **Given** A final spec in folder <spec folder> with two criteria proven by review and one proven by test
- **When** A test author run ends successfully
- **Then** tests/acceptance/<spec folder>/review.md exists and is Markdown with exactly two criterion sections, headed by the IDs of the two review criteria, and no section for the criterion proven by test

Proven by: acceptance test

Rejects: An implementation that writes review.md into the spec folder, or adds a section for every criterion, fails because of the path or the extra section

Sources: `specs/002-test-author-acceptance-tests/answers.md` › `tests/acceptance/<spec folder>/review.md`; `specs/002-test-author-acceptance-tests/answers.md` › so it gets the same protection

### AC-025: Each review entry lets the user check its criterion

- **Given** A review.md produced for a spec with criteria proven by review
- **When** The user reads each section
- **Then** Each section holds the criterion's title and its Given, When and Then. It also holds the steps that bring the project into the Given state and carry out the When, where to check (a command, a file or a screen state), and what must be observed for the criterion to hold. It holds no results

Proven by: review

Rejects: A review file that only repeats each criterion's Given-When-Then, without steps or where to check, is spotted in review by the missing steps and missing place to check

Sources: `specs/002-test-author-acceptance-tests/answers.md` › each entry holds the criterion's title and its Given, When and Then; `specs/002-test-author-acceptance-tests/answers.md` › It holds no results; `docs/briefs/test-agent.md` › die für den Menschen nützlich ist, um die Review-Kriterien einzeln zu prüfen

### AC-026: No review criterion means no review file

- **Given** A final spec with criteria proven by test and none proven by review
- **When** A test author run ends successfully
- **Then** No review.md exists under tests/acceptance/<spec folder>, and the TUI's final output says the spec has no criterion proven by review

Proven by: acceptance test

Rejects: An implementation that writes an empty review.md fails, because the file exists

Sources: `specs/002-test-author-acceptance-tests/answers.md` › no review file is written, and the TUI's final output says that the spec has no criterion proven by review.

### AC-027: No test criterion stops before the test author

- **Given** A final spec whose criteria are all proven by review
- **When** The user starts the test author on it
- **Then** The process stops before the test author starts, the user sees a message that the spec has no criterion proven by test, and nothing is written to the project

Proven by: acceptance test

Rejects: An implementation that starts the agent with an empty criteria list fails, because a test author run starts and writes to the project

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the process stops before the test author starts, and the user sees a message that the spec has no criterion proven by test

### AC-028: A run that fails partway leaves incomplete, unlocked files

- **Given** A test author run in which the agent has written one acceptance test file and then the run fails
- **When** The process stops
- **Then** The TUI shows the reason. The written test file stays in the project and is listed as incomplete. No lock is written

Proven by: acceptance test

Rejects: An implementation that writes the lock for whatever files exist when the run fails fails, because a lock exists

Sources: `specs/002-test-author-acceptance-tests/answers.md` › files the test author already wrote stay in the project and are listed as incomplete

### AC-029: Locked earlier tests stop a new run

- **Given** A spec whose acceptance tests from an earlier run are locked
- **When** The user starts the test author on that spec
- **Then** The process stops before the test author starts, the user sees a message that the tests of this spec are frozen, and the locked test files are unchanged

Proven by: acceptance test

Rejects: An implementation that overwrites the earlier tests regardless of the lock fails, because the locked files change

Sources: `specs/002-test-author-acceptance-tests/answers.md` › if the earlier acceptance tests are locked, the process stops before the test author starts

Unanswered: Q-29

### AC-030: Unlocked earlier tests are replaced

- **Given** A spec with unlocked acceptance test files and a review.md from an earlier run, each with distinct marker text
- **When** A new test author run on that spec ends successfully
- **Then** The earlier acceptance test files and review file are replaced by the new run's files: none of the earlier marker text remains under the spec's acceptance test path

Proven by: acceptance test

Rejects: An implementation that adds new files next to the earlier ones and keeps them fails, because the earlier marker text remains

Sources: `specs/002-test-author-acceptance-tests/answers.md` › if they are not locked, the new run starts from scratch

Unanswered: Q-30

### AC-031: A project without tests stops the run

- **Given** A project fulfilling the contract with no tests at all, and a final spec with a criterion proven by test
- **When** The user starts the test author on that spec
- **Then** The run stops with a message and no acceptance test is written

Proven by: acceptance test

Rejects: An implementation that picks a default test framework when none is present fails, because acceptance tests are written

Sources: `specs/002-test-author-acceptance-tests/answers.md` › if the project has no tests yet, the run stops with a message

Unanswered: Q-32, Q-33

### AC-032: Acceptance tests use the project's test language and framework

- **Given** A project whose existing tests use one language and test framework
- **When** A test author run ends successfully and the user looks at the generated acceptance tests
- **Then** The generated tests are written in that language and with that test framework, and use the project's existing test infrastructure

Proven by: review

Rejects: A test author that writes tests in a framework the project does not use is spotted in review by a different framework in the generated test files

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the test author writes the acceptance tests in the language and with the test framework the project's existing tests and test infrastructure use

Unanswered: Q-32

### AC-033: A test that passes before implementation is reported with its criterion ID

Why: No agent's account of its own work counts as evidence; signals are produced by systems.

- **Given** A project in which the behaviour of one criterion proven by test already exists on the current main state
- **When** A test author run ends and the orchestrator runs the generated acceptance tests itself
- **Then** The user is shown the criterion ID of the test that passes

Proven by: acceptance test

Rejects: An implementation that trusts the agent's report that all tests fail, and does not run them itself, fails, because the passing test's criterion ID is never shown

Sources: `specs/002-test-author-acceptance-tests/answers.md` › A test that passes before any implementation is reported with its criterion ID; `docs/product.md` › no agent's account of its own work counts as evidence

Unanswered: Q-28, Q-37, Q-38, Q-39, Q-40

### AC-034: Each acceptance test carries exactly one criterion ID, and each test criterion has a test

- **Given** A final spec with three criteria proven by test
- **When** A test author run ends successfully
- **Then** Each generated acceptance test names exactly one criterion ID in the way the contract declares for naming a test's criterion. Each of the three criterion IDs is named by at least one test

Proven by: acceptance test

Rejects: A run that produces one combined test naming all three IDs fails, because that test names more than one criterion ID

Sources: `specs/002-test-author-acceptance-tests/answers.md` › Each acceptance test covers exactly one criterion and carries exactly one criterion ID; `specs/002-test-author-acceptance-tests/answers.md` › Every criterion proven by test has at least one acceptance test.; `docs/product.md` › how a test names the criterion it checks

Unanswered: Q-41

### AC-035: Final TUI output lists what the agent produced

- **Given** A final spec with criteria proven by test and by review
- **When** A test author run ends successfully
- **Then** The TUI's final output names the generated acceptance test files and the path of review.md

Proven by: acceptance test

Rejects: An implementation that ends with only "done" fails, because the generated files are not named

Sources: `docs/briefs/test-agent.md` › Die TUI beendet den Lauf mit der Information, was der Agent erzeugt hat.

### AC-036: Generated files are in English

Why: Otherwise a spec mixes German and English.

- **Given** A German brief whose final spec has criteria proven by test and by review
- **When** A test author run ends and the user reads assumptions.md, review.md and the generated tests
- **Then** All text the agents produced in those files is in English

Proven by: review

Rejects: A test author that writes German review steps for a German brief is spotted in review by the German text in review.md

Sources: `docs/decisions.md` › All agent output is in English, regardless of the brief's language.; `docs/decisions.md` › Otherwise a spec mixes German and English.

## Wishes

None.

## Left open

- Q-01: Step 3 says the test author 'can' write an end-to-end list that walks through existing criteria so one review covers several of them. Under which conditions does it produce this list, and what must the list contain?
- Q-11: Product invariant 3 (structured output is validated against its schema, and invalid output is a failure) holds only from the outcome that introduces it. Does it apply to the test author in this change, and if so, what does the user see when the output is invalid?
- Q-16: What must the TUI's final output contain besides the files the agent produced?

## Out of scope

- Q-06: Is the approval before implementation (core loop step 8, when the risk matrix or the test author's assumptions call for it) part of this change?

## Unanswered

- Q-27: Once the user has entered a decision for every assumption in assumptions.md, what does the user do so that the lock gets written, and which step of Doppelblind reads those decisions?
- Q-28: Besides every assumption having a valid decision, which conditions must hold for the lock to be written? This covers the case where the run produced no assumptions at all and the case where a test passed before implementation and the user has not decided about it yet.
- Q-29: What do the lock and the test inventory contain, where are they written, and how can someone outside Doppelblind check that a locked acceptance test or review file has changed?
- Q-30: When the user rejects an assumption, how is the test author started again? What does the new run receive from the rejected assumption, how many such rounds are allowed, and what happens when they are used up?
- Q-31: How does a decided assumption reach later test author and spec-create runs of the spec, and what does such a later run see of it?
- Q-32: How does Doppelblind tell which paths of a project hold existing acceptance tests, test infrastructure (fixtures, helpers, stubs) and unit tests, so it can show the first two read-only to the test author and hide the unit tests?
- Q-33: What counts as 'the project has no tests yet' for the check that stops the run?
- Q-34: Which interface signatures does the test author see, and how does a spec or the contract fix them so that Doppelblind can hand them over?
- Q-35: How does Doppelblind decide which criteria a question answered `free` affects, and what text names the aspect in the 'deliberately unspecified' entry?
- Q-36: Is the run folder in .doppelblind kept when the user declines to raise a time or cost limit, given that nothing of the run may then be written to the project and that a failed run keeps its folder?
- Q-37: When the orchestrator's own test run finds a generated acceptance test that does not run to completion, or fails because of an error in the test rather than because the behaviour is missing, what happens and what does the user see?
- Q-38: How does the orchestrator know how to run a project's acceptance tests for its own test run, and how does it tell a failed assertion apart from an error in the test?
- Q-39: What exactly is 'the current main state' that the generated tests run against, for example when the working tree has uncommitted changes?
- Q-40: Where and how is a test that passes before implementation reported, how does the user decide whether the behaviour already exists or the test must be rejected, and what happens after each decision?
- Q-41: What happens when the generated acceptance tests break the rules that each test carries exactly one criterion ID and that every criterion proven by test has at least one test?
- Q-42: Is assumptions.md written when the test author reports no assumption, and if so, what does it contain?
- Q-43: What happens when the single-step start names a brief that has no connected spec, or one connected to more than one spec?
- Q-44: What short detail does the TUI show on each finished step line?

## Open questions

None.
