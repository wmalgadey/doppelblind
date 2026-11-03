# Test author generates acceptance tests from a final spec

Brief: [docs/briefs/test-agent.md](../../docs/briefs/test-agent.md)

This change covers the step after the spec (OUT-02). Once a spec is final, it goes to the test author, an agent role that never sees the implementation. The test author writes the acceptance tests for every criterion that a test can prove. For criteria that only the user's review can prove, it writes a review file that helps the user check each of those criteria. The user starts this step in one of two ways: by continuing the flow with the Doppelblind flow command, or by running the test agent directly as a single step on a brief or a spec. The TUI shows what is happening and ends by saying what the agent produced. When everything is fine for the user, the acceptance tests are locked, which freezes them.

The test author gets a narrow view. It sees only the ID, Given, When and Then of the criteria proven by test, the existing acceptance tests and the test infrastructure. Implementation code and the plan, which the project declares in its contract, are technically kept out of its reach. Its writes are confined to the test path the contract declares, and its run is bounded by time, cost and turns. This change leaves out the approval before implementation (core loop step 8). It also leaves open on purpose: when an end-to-end review list is produced, how the test author's output is validated against a schema, how its assumptions are recorded, and anything the final output shows beyond what the brief and the answers require.

## Criteria

### AC-001: Continuing the flow starts the test author for a final spec

- **Given** A project whose .doppelblind.conf declares the implementation paths, the plan paths and the test author's test path; the project has existing tests; a brief whose connected spec is final, has at least one criterion proven by test, and has no acceptance tests yet
- **When** The user runs the Doppelblind flow command again for that brief (not the single-step test agent command)
- **Then** A test author run starts: the TUI shows the step line for reading the final spec, and a new test author run folder appears in the project's .doppelblind folder

Proven by: acceptance test

Rejects: A flow command that stops after the spec is final and never starts the test author fails, because no test author step line appears and no test author run folder is created

Sources: `specs/002-test-author-acceptance-tests/answers.md` › I meant continuing the flow by using the flow command again (not the specific agent command); `docs/briefs/test-agent.md` › Ich nutze die Doppelblind-CLI und starte den Flow erneut oder direkt den Test-Agenten (für einen Einzelschritt).

Unanswered: Q-43

### AC-002: Direct start accepts a brief and uses its connected spec

- **Given** The same project as in AC-001, with a brief whose connected spec is final
- **When** The user starts the test agent directly as a single step and names the brief (command and arguments are deliberately unspecified)
- **Then** A test author run starts on the spec connected to that brief, and the run folder's recorded inputs contain criteria of that spec

Proven by: acceptance test

Rejects: A single-step command that accepts only a spec path and rejects a brief fails, because no test author run starts on the connected spec

Sources: `specs/002-test-author-acceptance-tests/answers.md` › or a specific spec. the arguments and commands are free for the implementor

Unanswered: Q-44

### AC-003: Direct start accepts a specific spec

- **Given** The same project as in AC-001, with a final spec
- **When** The user starts the test agent directly as a single step and names that spec
- **Then** A test author run starts on that spec, and the run folder's recorded inputs contain criteria of that spec

Proven by: acceptance test

Rejects: A single-step command that accepts only a brief fails, because no test author run starts when a spec is named

Sources: `specs/002-test-author-acceptance-tests/answers.md` › or a specific spec. the arguments and commands are free for the implementor

### AC-004: Direct start on a spec that is not final stops with a message

- **Given** A spec that is not final yet
- **When** The user starts the test agent directly on that spec
- **Then** The process stops, the user is shown a message, and no acceptance test file, review file or lock is written for that spec

Proven by: acceptance test

Rejects: An implementation that runs the test author on a draft spec fails, because acceptance test files appear for that spec

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the process should stop and the user is presented a message

Unanswered: Q-41

### AC-005: Direct start on a spec that does not exist stops with a message

- **Given** A spec reference, or a brief with no connected spec, that names no existing spec
- **When** The user starts the test agent directly with it
- **Then** The process stops, the user is shown a message, and no acceptance test file, review file or lock is written

Proven by: acceptance test

Rejects: An implementation that crashes with an unhandled error, or that creates an empty test folder, fails: in the first case no message is shown, in the second files are written

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the process should stop and the user is presented a message

Unanswered: Q-41, Q-44

### AC-006: Missing implementation or plan paths in the contract stop the run

- **Given** A final spec in a project whose .doppelblind.conf declares no paths for implementation code and no paths for the plan
- **When** The user starts the test author on that spec
- **Then** The run stops with a message, and no acceptance test file, review file or lock is written

Proven by: acceptance test

Rejects: An implementation that runs the test author with full repository access when no paths are declared fails, because acceptance tests get written

Sources: `specs/002-test-author-acceptance-tests/answers.md` › which paths hold implementation code and which hold the plan

Unanswered: Q-41, Q-42

### AC-007: Missing test author path in the contract stops the run

- **Given** A final spec in a project whose .doppelblind.conf declares no path for the test author
- **When** The user starts the test author on that spec
- **Then** The run stops with a message, and no acceptance test file is written anywhere in the project

Proven by: acceptance test

Rejects: An implementation that falls back to a built-in default test directory fails, because acceptance test files appear in the project

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the acceptance tests are written to the path the contract in

Unanswered: Q-41, Q-42

### AC-008: A project without tests stops the run

- **Given** A final spec in a project with a complete contract but no tests at all
- **When** The user starts the test author on that spec
- **Then** The run stops with a message, and no acceptance test file is written

Proven by: acceptance test

Rejects: An implementation that picks a test framework on its own and writes tests fails, because acceptance test files appear

Sources: `specs/002-test-author-acceptance-tests/answers.md` › if the project has no tests yet, the run stops with a message

Unanswered: Q-41

### AC-009: A spec without criteria proven by test stops before the test author starts

- **Given** A final spec in which every criterion is proven by review
- **When** The user starts the test author on that spec
- **Then** The process stops before the test author starts, the user sees a message that the spec has no criterion proven by test, and no file in the project is created or changed

Proven by: acceptance test

Rejects: An implementation that still writes a review file, or that starts the agent and leaves a run folder behind, fails, because a file in the project is created

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the process stops before the test author starts, and the user sees a message that the spec has no criterion proven by test. nothing is written to the project.

Unanswered: Q-41

### AC-010: Locked earlier acceptance tests stop a new run

- **Given** A final spec whose acceptance tests were locked by an earlier test author run
- **When** The user starts the test author on that spec
- **Then** The process stops before the test author starts, the user sees a message that the tests of this spec are frozen, and the existing acceptance test files and review file are unchanged

Proven by: acceptance test

Rejects: An implementation that overwrites locked tests fails, because the existing acceptance test files change

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the user sees a message that the tests of this spec are frozen

Unanswered: Q-27, Q-28, Q-41

### AC-011: Unlocked earlier acceptance tests are replaced by a new run

- **Given** A final spec with acceptance tests and a review file from an earlier run that were never locked, including one acceptance test file the new run does not produce
- **When** The user starts the test author on that spec and the run completes
- **Then** The spec's acceptance tests and review file are exactly those of the new run; the earlier file the new run did not produce no longer exists

Proven by: acceptance test

Rejects: An implementation that adds new files next to the old ones without removing them fails, because the earlier file is still there

Sources: `specs/002-test-author-acceptance-tests/answers.md` › its files replace the earlier acceptance tests and review file of that spec

Unanswered: Q-40

### AC-012: Implementation and plan paths are absent from the test author's access

Why: OUT-02 asks for acceptance tests from an agent that never saw the implementation.

- **Given** A project whose .doppelblind.conf declares implementation and plan paths that contain files
- **When** A test author run executes
- **Then** No file under the declared implementation or plan paths can be read from the environment the test author runs in

Proven by: acceptance test

Rejects: An implementation that only tells the agent in its prompt not to read those paths, while they stay present in its checkout, fails, because those files can be read from the test author's environment

Sources: `specs/002-test-author-acceptance-tests/answers.md` › these paths are absent from what the test author can access; `docs/product.md` › get acceptance tests from an agent that never saw the implementation

Unanswered: Q-42

### AC-013: The test author receives only ID, Given, When and Then of criteria proven by test

- **Given** A final spec with an introduction, wishes, open questions, a criterion proven by test and a criterion proven by review, each with title, reason, rejects, Given, When and Then
- **When** A test author run executes
- **Then** The spec content the test author receives, as recorded in the run folder's inputs, contains the ID, Given, When and Then of the criterion proven by test, and contains none of: the criterion proven by review, any title, reason, rejects, the introduction, the wishes or the open questions

Proven by: acceptance test

Rejects: An implementation that hands over the whole spec file fails, because the recorded inputs contain the introduction and the review criterion

Sources: `specs/002-test-author-acceptance-tests/answers.md` › The test author sees only the criteria of the final spec whose; `specs/002-test-author-acceptance-tests/answers.md` › It does not see the introduction

Unanswered: Q-39

### AC-014: Brief, sources, answers, unit tests, other specs and run records are absent from the test author's access

- **Given** A project containing the brief, binding sources, an answers file, unit tests, another spec and earlier run records in .doppelblind
- **When** A test author run executes
- **Then** None of these files can be read from the environment the test author runs in

Proven by: acceptance test

Rejects: An implementation that hides only the implementation and plan paths and leaves the rest of the repository visible fails, because the brief can be read from the test author's environment

Sources: `specs/002-test-author-acceptance-tests/answers.md` › It does not see the brief, the binding sources

Unanswered: Q-38

### AC-015: Existing acceptance tests and test infrastructure are visible to the test author

- **Given** A project with existing acceptance tests and test fixtures, helpers and stubs
- **When** A test author run executes
- **Then** The existing acceptance tests and the test fixtures, helpers and stubs can be read from the environment the test author runs in

Proven by: acceptance test

Rejects: An implementation that hides all tests from the test author fails, because the fixtures cannot be read from its environment

Sources: `specs/002-test-author-acceptance-tests/answers.md` › It also sees the existing acceptance tests and the test infrastructure (fixtures, helpers, stubs), read-only

Unanswered: Q-38, Q-40

### AC-016: Decisions answered free are handed over per affected criterion

- **Given** A final spec with an open question answered free whose concerns list one criterion proven by test, and another criterion proven by test that the question does not concern
- **When** A test author run executes
- **Then** In the recorded inputs, the concerned criterion carries a note starting with "deliberately unspecified:"; the other criterion carries none; and the text of the open question is not handed over as an open question

Proven by: acceptance test

Rejects: An implementation that drops free answers entirely fails, because the concerned criterion carries no "deliberately unspecified:" note

Sources: `specs/002-test-author-acceptance-tests/answers.md` › deliberately unspecified: <aspect>

Unanswered: Q-37

### AC-017: Acceptance tests are written to the contract's test author path

- **Given** A project whose .doppelblind.conf declares a path for the test author
- **When** A test author run completes
- **Then** Every acceptance test file the run produced lies under the declared path

Proven by: acceptance test

Rejects: An implementation that writes tests to a fixed directory regardless of the contract fails, because the produced files lie outside the declared path

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the acceptance tests are written to the path the contract in

Unanswered: Q-42

### AC-018: A write outside the allowed path is rejected and fails the run

- **Given** A test author run in which the agent attempts to write a file outside the path the contract declares for the test author
- **When** The run processes that write
- **Then** The file does not exist outside the allowed path afterwards, the run fails, and the message names the rejected path

Proven by: acceptance test

Rejects: An implementation that lets the write through and only warns afterwards fails, because the file exists outside the allowed path

Sources: `specs/002-test-author-acceptance-tests/answers.md` › every write of the test author outside that path is rejected, and the run fails with a message naming the rejected path.

Unanswered: Q-40, Q-41

### AC-019: Time, cost and turn limits can be set when starting

Why: Product invariant 4 bounds every agent run by time and cost and lets the user set those limits at the start of a run.

- **Given** A final spec ready for the test author
- **When** The user starts the test author command with options that set a time limit, a cost limit and a turn limit
- **Then** The run uses the given values, and the run folder's guardrails record them

Proven by: acceptance test

Rejects: An implementation that ignores the options and always uses defaults fails, because the recorded guardrails show the default values

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the user can change them with options when starting the command; `docs/product.md` › Every agent run is bounded by time and cost

Unanswered: Q-31

### AC-020: Reaching the time or cost limit asks whether to raise it and retry

Why: Product invariant 4 says a human decides at a limit and nothing is approved automatically by waiting.

- **Given** A test author run with a time limit (or a cost limit) the run reaches
- **When** The limit is reached
- **Then** The user is asked whether to raise that limit and retry, and the run does not continue until the user answers

Proven by: acceptance test

Rejects: An implementation that silently retries with a higher limit fails, because the user is never asked

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the user is asked whether to raise it and retry; the turn limit is never raised; `docs/product.md` › At a limit, a human decides

Unanswered: Q-32

### AC-021: The turn limit is never offered for raising

- **Given** A test author run with a turn limit the run reaches
- **When** The turn limit is reached
- **Then** The user is not asked whether to raise the turn limit, and the run does not continue with more turns

Proven by: acceptance test

Rejects: An implementation that treats all three limits alike fails, because it asks whether to raise the turn limit

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the user is asked whether to raise it and retry; the turn limit is never raised

Unanswered: Q-30

### AC-022: Declining to raise a limit stops the process with a message

- **Given** A test author run that reached its time or cost limit, and the user is asked whether to raise it
- **When** The user declines
- **Then** The process stops and shows a message

Proven by: acceptance test

Rejects: An implementation that keeps going after the user declines fails, because the process does not stop

Sources: `specs/002-test-author-acceptance-tests/answers.md` › if the user declines, the process stops with a message

Unanswered: Q-29, Q-41

### AC-023: Each test author run keeps its own run folder in .doppelblind

Why: Product invariant 6 records every run's state, logs and role input and output for later analysis.

- **Given** A project in which a spec agent run has already been recorded in .doppelblind
- **When** A test author run executes
- **Then** A new folder for this run exists in .doppelblind that holds the agent's inputs, guardrails and run log, laid out the same way as the spec agent run's folder

Proven by: acceptance test

Rejects: An implementation that appends the test author's log to the spec agent's folder fails, because no separate folder exists for this run

Sources: `specs/002-test-author-acceptance-tests/answers.md` › laid out the same way as a spec agent run; `docs/product.md` › for later analysis

### AC-024: The run folder is kept when the run fails

- **Given** A test author run that fails (for example through a rejected write as in AC-018)
- **When** The process has stopped
- **Then** The run's folder in .doppelblind still exists with its inputs, guardrails and run log

Proven by: acceptance test

Rejects: An implementation that cleans up the run folder on failure fails, because the folder no longer exists

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the folder is kept when the run fails

Unanswered: Q-29

### AC-025: The TUI shows one line per step

- **Given** A test author run that completes
- **When** The user watches the TUI
- **Then** The TUI shows one line for each of these steps: reading the final spec, preparing what the test author may see, the test author writing the acceptance tests, validating its output, checking its writes, and writing the lock

Proven by: acceptance test

Rejects: An implementation that shows only a spinner until the end fails, because the step lines are missing

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the TUI shows one line per step; `docs/briefs/test-agent.md` › Die TUI zeigt mir, was gerade passiert.

Unanswered: Q-27

### AC-026: Step lines show elapsed time, done or failed

- **Given** A test author run in which one step is running, earlier steps have finished, and a later step fails
- **When** The user watches the TUI
- **Then** The running step's line shows how long it has been running; each finished step is marked done with a short detail; the failed step is marked failed and followed by the reason

Proven by: acceptance test

Rejects: An implementation that marks a failed step the same way as a finished one fails, because the step is not marked failed and has no reason after it

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the running step shows how long it has been running

### AC-027: The orchestrator's own test run reports a test that passes before implementation

Why: Product invariant 2 says no agent's account of its own work counts as evidence; signals come from systems.

- **Given** A test author run whose generated acceptance tests include one test, carrying a known criterion ID, that passes against the current main state, while the agent reports all tests as failing
- **When** The orchestrator checks the generated tests with its own test run
- **Then** That test is reported to the user with its criterion ID

Proven by: acceptance test

Rejects: An implementation that trusts the agent's report and skips its own test run fails, because the passing test is not reported

Sources: `specs/002-test-author-acceptance-tests/answers.md` › A test that passes before any implementation is reported with its criterion ID; `specs/002-test-author-acceptance-tests/answers.md` › The orchestrator checks this with its own test run; the test author's report does not count.; `docs/product.md` › no agent's account of its own work counts as evidence

Unanswered: Q-33, Q-34, Q-35, Q-36

### AC-028: Review file location and structure

Why: The review file lies next to the acceptance tests so that it gets the same protection: read-only for the implementer, frozen by hash, checked by CI.

- **Given** A final spec in folder <spec folder> with two criteria proven by review and at least one proven by test
- **When** A test author run completes
- **Then** The file tests/acceptance/<spec folder>/review.md exists, is Markdown, and has exactly one section per criterion proven by review, each headed by that criterion's ID

Proven by: acceptance test

Rejects: An implementation that writes the review file into the spec folder, or puts both criteria into one section, fails, because the file is not at the given path or the section count is wrong

Sources: `specs/002-test-author-acceptance-tests/answers.md` › tests/acceptance/<spec folder>/review.md; `specs/002-test-author-acceptance-tests/answers.md` › It is Markdown with one section per criterion proven by review

Unanswered: Q-28

### AC-029: Each review entry is usable for checking its criterion

- **Given** A review file produced for a spec with criteria proven by review
- **When** The user reads an entry
- **Then** The entry holds the criterion's title and its Given, When and Then; the steps that bring the project into the Given state and carry out the When; where to check (command, file or screen state); and what must be observed for the criterion to hold

Proven by: review

Rejects: An entry that only repeats the criterion's Then without setup steps or a place to check is spotted in review by the missing setup steps and missing place to check

Sources: `specs/002-test-author-acceptance-tests/answers.md` › each entry holds the criterion's title and its Given, When and Then; `docs/briefs/test-agent.md` › eine Datei, die für den Menschen nützlich ist, um die Review-Kriterien einzeln zu prüfen

### AC-030: The review file holds no results

Why: The reviewer's decision is recorded in the PR review and the run record, not in this file.

- **Given** A review file produced by a test author run
- **When** The user reads it
- **Then** It contains no place for or record of a review result, such as a checkbox, a pass/fail field or a verdict

Proven by: review

Rejects: A review file with a "Result: [ ]" line under each entry is spotted in review by that result field

Sources: `specs/002-test-author-acceptance-tests/answers.md` › It holds no results; `specs/002-test-author-acceptance-tests/answers.md` › the reviewer's decision is recorded in the PR review and the run record, not in this file

### AC-031: No review file when the spec has no criterion proven by review

- **Given** A final spec whose criteria are all proven by test
- **When** A test author run completes
- **Then** No file tests/acceptance/<spec folder>/review.md exists, and the TUI's final output says that the spec has no criterion proven by review

Proven by: acceptance test

Rejects: An implementation that writes an empty review.md fails, because the file exists

Sources: `specs/002-test-author-acceptance-tests/answers.md` › no review file is written, and the TUI's final output says that the spec has no criterion proven by review.

### AC-032: The final output names what the agent produced

- **Given** A test author run that produced acceptance test files and a review file
- **When** The run ends
- **Then** The TUI's final output names each acceptance test file and the review file the run produced

Proven by: acceptance test

Rejects: An implementation that ends with only "done" fails, because the produced files are not named

Sources: `docs/briefs/test-agent.md` › Die TUI beendet den Lauf mit der Information, was der Agent erzeugt hat.

### AC-033: A failed run leaves its files incomplete and unlocked

- **Given** A test author run that has written some acceptance test files and then fails
- **When** The process has stopped
- **Then** The TUI shows the reason; the files already written still exist and are listed as incomplete; and starting the test author on the same spec again does not stop with the message that the tests are frozen

Proven by: acceptance test

Rejects: An implementation that writes the lock before the run has finished fails, because the second start stops with the frozen message

Sources: `specs/002-test-author-acceptance-tests/answers.md` › files the test author already wrote stay in the project and are listed as incomplete; no lock is written, so they are not frozen.

Unanswered: Q-27, Q-29, Q-33

### AC-034: One criterion per test, at least one test per criterion proven by test

- **Given** The acceptance tests produced for a final spec
- **When** The user reviews them
- **Then** Each acceptance test carries exactly one criterion ID; every criterion proven by test has at least one acceptance test; and shared setup sits in fixtures or helpers, not in a test that serves several criteria

Proven by: review

Rejects: A single test that checks AC-001 and AC-002 together is spotted in review by the test carrying two criterion IDs

Sources: `specs/002-test-author-acceptance-tests/answers.md` › Each acceptance test covers exactly one criterion and carries exactly one criterion ID; `specs/002-test-author-acceptance-tests/answers.md` › Every criterion proven by test has at least one acceptance test.

### AC-035: Tests use the project's existing language and test framework

- **Given** A project whose existing tests use one language and one test framework
- **When** The user reviews the generated acceptance tests
- **Then** They are written in that language and with that test framework

Proven by: review

Rejects: Tests written with another framework than the project's existing tests are spotted in review by their imports and syntax

Sources: `specs/002-test-author-acceptance-tests/answers.md` › the test author writes the acceptance tests in the language and with the test framework the project's existing tests and test infrastructure use

### AC-036: No test fixes an aspect answered free

- **Given** A criterion handed over with a "deliberately unspecified:" aspect
- **When** The user reviews that criterion's acceptance tests
- **Then** No test asserts a specific value or behaviour for that aspect

Proven by: review

Rejects: A test that asserts an exact message text when the message text was answered free is spotted in review by that assertion

Sources: `specs/002-test-author-acceptance-tests/answers.md` › no test may fix that aspect, and the test author reports no assumption for it

### AC-037: Agent output is in English

Why: Otherwise a spec mixes German and English.

- **Given** A brief written in German whose spec is final
- **When** The user reviews the review file and the acceptance tests produced
- **Then** The review file's text and the tests' descriptions are in English

Proven by: review

Rejects: A review file written in German is spotted in review by its German text

Sources: `docs/decisions.md` › DEC-005: Agents write their output in English

## Wishes

None.

## Left open

- Q-01: Step 3 says the test author 'can' write an end-to-end list that walks through existing criteria so one review covers several of them. Under which conditions does it produce this list, and what must the list contain?
- Q-11: Product invariant 3 (structured output is validated against its schema, and invalid output is a failure) holds only from the outcome that introduces it. Does it apply to the test author in this change, and if so, what does the user see when the output is invalid?
- Q-15: Where and in what form are the test author's assumptions recorded, and does the user see them in the TUI at the end of the run?
- Q-16: What must the TUI's final output contain besides the files the agent produced?

## Out of scope

- Q-06: Is the approval before implementation (core loop step 8, when the risk matrix or the test author's assumptions call for it) part of this change?

## Unanswered

- Q-27: The lock is the last step 'when everything is fine for the user'. How does the user say that everything is fine, and what happens to the run if the user does not say so?
- Q-28: What do the lock and the test inventory contain, where are they stored in the project, and what exactly do they cover (acceptance tests, the review file, test infrastructure)?
- Q-29: When the user declines to raise a limit, nothing of the run may be written to the project. But the run folder lives in the project's .doppelblind folder and is kept when a run fails, and files the test author already wrote stay in the project when a run is aborted. Which of these is kept, and which is removed, when the user declines?
- Q-30: What happens when the test author run reaches its turn limit: what does the user see, and what happens to files already written?
- Q-31: What are the default values of the time, cost and turn limits of the test author run?
- Q-32: When the user agrees to raise a time or cost limit, how does the user give the new value, and does the retry continue the run or start it over?
- Q-33: What happens when the orchestrator's own test run finds a generated test that does not run to completion, or that fails because of an error in the test itself rather than missing behaviour? What does the user see, and is the run a failure?
- Q-34: How does the orchestrator tell a test that fails because the behaviour is missing from a test that fails because of an error in the test?
- Q-35: When a test passes before any implementation, how does the user decide whether the behaviour already exists or the test must be rejected, and what happens to the test and the lock after each decision?
- Q-36: What does 'the current main state' mean for the orchestrator's test run when the user's working tree or current branch differs from main?
- Q-37: What text replaces '<aspect>' in the 'deliberately unspecified: <aspect>' note handed to the test author for a decision answered free?
- Q-38: How does Doppelblind tell existing acceptance tests and test infrastructure, which the test author sees, from unit tests, which it must not see, given that the contract declares nothing about tests other than the test author's path?
- Q-39: How does Doppelblind find the interface signatures that 'a spec or contract fixes', which the test author may see, and in what form are they handed over?
- Q-40: The existing acceptance tests are visible to the test author read-only, but an unlocked earlier run's tests are replaced. Is a write by the test author to an existing acceptance test of another spec rejected, and is a write to an earlier unlocked test of this spec allowed?
- Q-41: How can a test tell from the outside that the process stopped in the stop cases (spec not final, spec missing, contract incomplete, no tests, no criterion proven by test, tests frozen, declined limit, rejected write)? This covers the exit status and whether the message text is fixed.
- Q-42: What happens when the contract declares implementation, plan or test author paths that do not exist in the project?
- Q-43: When the user continues the flow with the flow command and the spec is final, does the test author start right away, or does the user first confirm?
- Q-44: How does a test author run know which spec belongs to a brief when the user names a brief, and what happens if a brief is connected to more than one spec?

## Open questions

None.
