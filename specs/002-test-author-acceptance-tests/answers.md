# Answers

### Q-01

Step 3 says the test author 'can' write an end-to-end list that walks through existing criteria so one review covers several of them. Under which conditions does it produce this list, and what must the list contain?

**Answer:**

free

### Q-02

What does 'starting the flow again' do for a brief whose spec is already final, and what happens to the existing spec and answers?

**Answer:**

starting the flow again is wrong, I meant continuing the flow by using the flow command again (not the specific agent command)

### Q-03

When the user starts the test agent directly as a single step, how does the user say which spec it should run on, and what is the command with its arguments?

**Answer:**

the brief (which is "connected" to a spec) or a specific spec. the arguments and commands are free for the implementor

### Q-04

What happens when the user starts the test agent directly on a spec that is not final, or on a spec that does not exist?

**Answer:**

the process should stop and the user is presented a message

### Q-05

Is producing the lock and the inventory of the acceptance tests (named as artifacts in product §2) part of this change?

**Answer:**

yes. the lock is the final step of this agent, when everything is fine for the user

### Q-06

Is the approval before implementation (core loop step 8, when the risk matrix or the test author's assumptions call for it) part of this change?

**Answer:**

out of scope

### Q-07

Product invariant 1 says what a role must not see is absent from its checkout. But invariants hold only from the outcome that introduces them, and §9 says boundaries are prompt-only until the orchestrator enforces them. In this change, must implementation code and the plan be technically absent from what the test author can access?

**Answer:**

yes

### Q-08

The contract lists no 'implementation code' or 'plan' category. How does Doppelblind determine which parts of a project count as implementation code and plan, so that the test author does not see them?

**Answer:**

the project declares in `.doppelblind.conf` which paths hold implementation code and which hold the plan. these paths are absent from what the test author can access. if the contract declares none, the run stops with a message.

### Q-09

Apart from the final spec, which parts of the project, if any, may the test author see? This covers the brief, the binding sources, the answers, existing tests and the rest of the repository.

**Answer:**

The test author sees only the criteria of the final spec whose `proven_by` is `test`: ID, Given, When, Then. It does not see the introduction, `why`, `rejects`, wishes or open questions. It also sees the existing acceptance tests and the test infrastructure (fixtures, helpers, stubs), read-only, and interface signatures where a spec or contract fixes them. It does not see the brief, the binding sources, the `open`, `unanswered` or `out of scope` answers, the implementation, unit tests, the plan, other specs or run records. Decisions answered `free` are handed over per affected criterion as "deliberately unspecified: <aspect>"; no test may fix that aspect, and the test author reports no assumption for it. If a criterion cannot be tested without one of these, the test author reports it as an assumption instead of getting a wider view.

### Q-10

Where in the project are the acceptance tests written? Must a write by the test author outside the paths the contract allows for its role be rejected in this change?

**Answer:**

the acceptance tests are written to the path the contract in `.doppelblind.conf` declares for the test author. if the contract declares none, the run stops with a message. every write of the test author outside that path is rejected, and the run fails with a message naming the rejected path.

### Q-11

Product invariant 3 (structured output is validated against its schema, and invalid output is a failure) holds only from the outcome that introduces it. Does it apply to the test author in this change, and if so, what does the user see when the output is invalid?

**Answer:**

free

### Q-12

Product invariant 4 (every agent run is bounded by time and cost, and the user can set these limits when starting a run) holds only from the outcome that introduces it. Does it apply to the test author run in this change? If so, how does the user set the limits, and what happens when one is reached?

**Answer:**

yes. the test author run has a time, cost and turn limit with defaults. the user can change them with options when starting the command. when the time or cost limit is reached, the user is asked whether to raise it and retry; the turn limit is never raised. if the user declines, the process stops with a message and nothing of the run is written to the project.

### Q-13

Product invariant 6 (every run records its state, logs and each role's input and output in the project's .doppelblind folder) holds only from the outcome that introduces it. Does it apply to the test author run in this change?

**Answer:**

yes. each test author run keeps its own folder in `.doppelblind` with the inputs, the guardrails and the run log of the agent, laid out the same way as a spec agent run. the folder is kept when the run fails.

### Q-14

What exactly must the TUI show while the test author is running?

**Answer:**

the TUI shows one line per step: reading the final spec, preparing what the test author may see, the test author writing the acceptance tests, validating its output, checking its writes and writing the lock. the running step shows how long it has been running; a finished step is marked done with a short detail, a failed step is marked failed and followed by the reason.

### Q-15

Where and in what form are the test author's assumptions recorded, and does the user see them in the TUI at the end of the run?

**Answer:**

The orchestrator writes the assumptions to `assumptions.md` in the spec's folder, next to `spec.md`. Each assumption is a section headed by its ID (A-001, A-002, …) and states the criterion, the assumption phrased as a question someone who does not know the code can answer, its kind (gap, ambiguous, not measurable, contradiction), the test files that rely on it, and an empty `**Decision:**` field. A valid decision is `accepted` or `rejected: <own text>`; a decided assumption binds later runs like an answer. The acceptance tests are frozen only when every assumption has a valid decision. The run record keeps the raw output for analysis, not for decisions. At the end of the run the TUI shows the number of assumptions and the path of `assumptions.md`, not the assumptions themselves.

### Q-16

What must the TUI's final output contain besides the files the agent produced?

**Answer:**

free

### Q-17

Where is the review file written, what is it called, and in which format?

**Answer:**

The review file is written next to the acceptance tests of the spec, as `tests/acceptance/<spec folder>/review.md`, so it gets the same protection: read-only for the implementer, frozen by hash, checked by CI. It is Markdown with one section per criterion proven by review, headed by the criterion's ID, stating where to check (command, file or screen state) and what must be observed. It holds no results: the reviewer's decision is recorded in the PR review and the run record, not in this file.

### Q-18

Beyond the criterion ID, what must each entry of the review file contain for it to be useful when checking that criterion?

**Answer:**

each entry holds the criterion's title and its Given, When and Then, the steps that bring the project into the Given state and carry out the When, where to check, and what must be observed for the criterion to hold.

### Q-19

What happens when the final spec has no criterion proven by review: is a review file produced anyway?

**Answer:**

no review file is written, and the TUI's final output says that the spec has no criterion proven by review.

### Q-20

What happens when the final spec has no criterion proven by test?

**Answer:**

the process stops before the test author starts, and the user sees a message that the spec has no criterion proven by test. nothing is written to the project.

### Q-21

What happens when the test author run fails or is aborted partway? What does the TUI show, and what happens to any files already written?

**Answer:**

the process stops and the TUI shows the reason. files the test author already wrote stay in the project and are listed as incomplete; no lock is written, so they are not frozen.

### Q-22

What happens when the test author is started for a spec that already has acceptance tests or a review file from an earlier run?

**Answer:**

if the earlier acceptance tests are locked, the process stops before the test author starts and the user sees a message that the tests of this spec are frozen. if they are not locked, the new run starts from scratch and its files replace the earlier acceptance tests and review file of that spec.

### Q-23

How should the test author handle open questions in the final spec that are recorded as unanswered, free or out of scope?

**Answer:**

The test author does not see open questions. Unanswered and out-of-scope questions are not handed over: where an unanswered decision makes a criterion ambiguous, the test author reports an assumption, which goes to the user. Decisions answered `free` are handed over per affected criterion as "deliberately unspecified: <aspect>"; no test may fix that aspect, and the test author reports no assumption for it.

### Q-24

In which language and with which test framework are the acceptance tests written for a target project, and where is that decided?

**Answer:**

the test author writes the acceptance tests in the language and with the test framework the project's existing tests and test infrastructure use. nothing about it is declared in the contract; if the project has no tests yet, the run stops with a message.

### Q-25

What state must the generated acceptance tests be in when the run ends? This covers whether they must run at all and what result they must give before any implementation exists.

**Answer:**

When the run ends, every generated acceptance test must run to completion: it compiles, its fixtures and helpers exist, and it fails for no reason of its own. Against the current main state, each test must fail because the specified behaviour is missing (a failed assertion, or the system under test not offering the behaviour yet), not because of an error in the test. The orchestrator checks this with its own test run; the test author's report does not count. A test that passes before any implementation is reported with its criterion ID, and the user decides whether the behaviour already exists or the test must be rejected.

### Q-26

May one acceptance test cover several criteria, and is there a required number of tests per criterion?

**Answer:**

Each acceptance test covers exactly one criterion and carries exactly one criterion ID; shared setup goes into fixtures and helpers, not into a shared test. Every criterion proven by test has at least one acceptance test. There is no other required number: the test author writes one test per concrete example the criterion describes, tests edge cases only where the criterion names them and otherwise reports an assumption, and writes a property test where the criterion is an invariant. The number of tests per criterion is measured, not prescribed.
