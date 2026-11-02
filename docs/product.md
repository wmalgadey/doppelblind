# Doppelblind — Product

## 1. Goal

I develop software with coding agents and can trust a result without reading every line, because every check that decides whether a result is correct was created independently of what it checks. Doppelblind orchestrates separate agent roles — spec agent, test author, implementer, verifier, classifier and, after a failed run, a worst-case agent — and enforces the information boundaries between them technically, not by prompt.

Leading idea: a check counts only if it does not correlate with the error it is meant to find. An agent is worth running only if it has its own information boundary; without one, the same model agrees with itself.

The goal is reached when I can use Doppelblind as an individual tool for almost any project and make changes to that project in a safe and trusted way: small, low-risk changes merge automatically at the end, large or risky changes keep a human in the loop. Both the size and the risk of a change count.

## 2. User and context

Doppelblind is not for me alone; it is not restricted to particular users. Their projects may use a different documentation structure than mine. What they must understand: a project developed with Doppelblind can look like any other project worked on with coding agents, and anyone may keep using LLMs in it directly. Only a change triggered through Doppelblind runs the process as intended; changes made outside it can drift or carry bugs, and only Doppelblind produces confidence in a change.

Doppelblind works with any project structure. A project fulfils a contract — where its binding sources are, how a source is cited, which paths each role may write, which paths are protected, how a test names the criterion it checks, where the risk matrix is — and does not prescribe formats: a flat decision file or an ADR directory, a product vision or another description of what the system should do are equally valid, as long as each source is citable and says what is in force.

A spec cites only what binds the spec: a description of what the system should do, decisions that say they bind the spec, and the answers I gave to the open questions of any spec. Each decision says whether it binds the spec or only the plan; one that binds only the plan, such as a runtime, a language or a library, is never cited by a spec. Specs themselves are not sources, because a model writes them. An answer is only what I chose: my own text, `free` (left open on purpose, nobody tests it) or `out of scope` (not part of this change). That a question stayed unanswered is recorded by the orchestrator, never written as an answer and never given to the spec agent.

The contract is declared in the project, in a `.doppelblind.conf` file. Run state also lives in the project for now. Role prompts, harness settings and output schemas do not live in the project; nothing a role runs with is loaded from a directory that role can write. What Doppelblind produces — specs, acceptance tests, their lock and inventory — are ordinary project artifacts and are versioned like any other. For now I commit them myself (see OUT-13).

A project is a full spec-driven project on its own: its gates run in the project's CI and apply to every change, whoever made it. Only the trusted development pipeline runs through Doppelblind, not in the project.

A project may keep its own `AGENTS.md`/`CLAUDE.md` for working on it with LLMs; they belong to the project, not to Doppelblind. In a role run, Doppelblind replaces them with its own variant.

Only the user changes the risk matrix. A skill inside the project helps maintain it.

Sources are written by people. Skills that write into a binding source belong to the human side and are unreachable for every role in a run.

Agents run through an agent CLI in headless mode. I use a Claude subscription, not a per-token API key; the classifier also runs under the subscription, with typed output. I want to be able to switch to other agent CLIs. Until then, every role runs with Claude Code. I also want to choose the model per role: strong models where judgement decides — spec, plan, review — and cheaper ones for implementation. A complex implementation may be led by a model of its own that splits the work and hands the parts to cheaper models.

## 3. Core loop

1. I write a brief.
2. The spec agent writes binding criteria, each with an ID, a cited source and how it is proven — by an acceptance test, or by my review where no test can decide it — separate from wishes. What another outcome delivers, it marks as out of scope and cites that outcome. Every decision that neither the brief nor a source makes, it lists as an open question without a suggested answer.
3. I answer the open questions: with my own text, with `free` to leave a decision open on purpose, or with `out of scope` to keep it out of this change.
4. For each, I choose free, out of scope, to stop and answer it later, or to finish the spec step, which records it and every unanswered question as `unanswered`
5. I decide whether another spec-create run starts. If it does, the spec agent runs again from scratch on the brief, the sources and every answer so far, never on its earlier spec and never told how many runs came before, and the loop continues at step 3.
6. If it does not, the spec is final. If an answer has not reached the spec agent yet, it runs once more, and its open questions are answered as `unanswered`. Every open question is then left open, out of scope or unanswered.
7. The test author, who never sees implementation code or plan, writes acceptance tests for every criterion proven by test and lists every assumption it had to make. A criterion proven by review gets no acceptance test; I check it before the merge.
8. If the risk matrix or the assumptions call for it, I approve before implementation. The acceptance tests are frozen.
9. The implementer works until the acceptance tests are green or reports a divergence; the verifier, who never sees the implementer's report, returns findings until there are none or a limit is reached.
10. If the change carries technical risk or a criterion is proven by review, I approve the merge; otherwise it merges automatically once all gates are green.
11. I see what each run did, where it diverged, what it cost and how it ended.

## 4. Non-goals

- No role prompts, harness settings or output schemas in the project's tree.
- No prescribed format for vision, decisions or other sources.
- No sources generated from code or by a model. Gap detection checks the contract deterministically; it does not fill gaps.
- No boundary that exists only as a prompt.
- No agent report as a gate or a signal.
- Agents do not merge and do not deploy.
- No lighter test path for low-risk changes: risk decides only whether a human approves.

## 5. Invariants

1. Every boundary that matters has a first line that holds even if the agent ignores or circumvents it: what a role must not see is absent from its checkout or mount; what it must not change is read-only and rejected by a path check; what is frozen is secured by hash and test inventory. Harness rules and prompts are a second line at most.
2. No agent is rewarded on the signal that checks it, and no agent's account of its own work counts as evidence. Signals are produced by systems: git, test reports, gates, the orchestrator.
3. The orchestrator is deterministic code. It holds the state, starts exactly one role per step in a fresh context, validates structured output against its schema — invalid output is a failure, never an empty list — and decides whether an approval is needed: one yes suffices, an uncertain answer counts as yes. The implementer never classifies risk.
4. Every agent run is bounded by time and cost, and every loop that runs without me is bounded by rounds. A loop that starts a round only after I say so, such as the spec loop, is bounded by me. I can set the time and cost limits when I start a run. At a limit, a human decides; nothing is approved automatically by waiting.
5. Sources are written only by people.
6. Every run records its state, its logs and the input and output of every role in the project's .doppelblind folder, for later analysis. That record is never evidence that the orchestrator itself behaved correctly.

Every invariant holds for a role from the outcome that introduces it. §9 describes how Doppelblind's own code was written before that, not how a run works.

## 6. Capabilities

| Capability | Covers                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| CONTRACT   | What a project declares: source allowlist, citation anchors, in-force status, role paths, protected paths |
| ROLES      | Role prompts and output schemas: spec agent, test author, implementer, verifier, classifier, worst-case   |
| BOUNDARY   | Enforcing what a role sees and writes: worktrees, sparse checkout, read-only mounts, permissions, egress  |
| FLOW       | The state machine, its limits and where its state lives                                                   |
| GATES      | Protected paths, frozen acceptance tests, test inventory, trace, source lint, mutation, runtime budgets   |
| RISK       | Risk matrix, path rules, classifier, the business and technical approvals                                 |
| SIGNALS    | Run log, failure-mode metrics over many runs                                                              |
| AGENT      | Running an agent CLI headless; switching between CLIs; choosing the model per role                        |

## 7. Outcomes

| ID     | I can ...                                                                                                    | Status | Capabilities           |
| ------ | ------------------------------------------------------------------------------------------------------------ | ------ | ---------------------- |
| OUT-01 | turn a brief into a spec whose criteria each cite a source, with open questions instead of filled-in answers | Now    | ROLES, CONTRACT, GATES |
| OUT-02 | get acceptance tests from an agent that never saw the implementation, together with its assumptions          | Next   | ROLES, BOUNDARY        |
| OUT-03 | have an implementer work against frozen acceptance tests it cannot change, ending green or with a divergence | Next   | ROLES, BOUNDARY, GATES |
| OUT-04 | have a verifier that never read the implementer's report return evidenced findings until none are left       | Next   | ROLES, BOUNDARY, FLOW  |
| OUT-05 | approve only what the risk matrix flags and let everything else merge once all gates are green               | Next   | RISK, FLOW, GATES      |
| OUT-06 | see for every run what each role did, where it diverged, what it cost and how it ended                       | Later  | SIGNALS, FLOW          |
| OUT-07 | have a failed run's code discarded and a new spec checked against the failed run's trace                     | Later  | ROLES, FLOW            |
| OUT-08 | point Doppelblind at an existing project and see where it does not yet fulfil the contract                   | Later  | CONTRACT               |
| OUT-09 | run the roles with a different agent CLI                                                                     | Later  | AGENT                  |
| OUT-10 | see the failure-mode metrics as trends over features                                                         | Later  | SIGNALS                |
| OUT-11 | start a new project from a default structure that fulfils the contract                                       | Later  | CONTRACT               |
| OUT-12 | keep a project's contract and run state outside the project                                                  | Later  | CONTRACT, FLOW         |
| OUT-13 | have what a run produces committed regularly, without committing it myself                                   | Later  | FLOW                   |
| OUT-14 | choose the model per role: strong ones for spec, plan and review, cheaper ones for implementation            | Later  | AGENT, ROLES           |
| OUT-15 | write briefs and get specs in a language other than English                                                  | Later  | ROLES                  |

OUT-01 to OUT-05 are the core loop, built in this order. The goal (§1) is reached with OUT-05.

## 8. Later: promotion triggers

- OUT-06/OUT-07: as soon as I run into problems from which a new spec should be created.
- OUT-08: as soon as there is demand from outside.
- OUT-09: as soon as I or someone else wants to use another agent CLI, e.g. GitHub Copilot CLI.
- OUT-10: as soon as I have built a few features in another project.
- OUT-11: as soon as the core loop stands, starting from my own basic setup. Before OUT-08 unless OUT-08 is triggered first.
- OUT-12: as soon as I build many projects with Doppelblind.
- OUT-13: as soon as committing by hand slows me down or I lose changes between runs.
- OUT-14: as soon as the cost of runs slows me down, or I want a role to run with a model other than the one of the role it checks.
- OUT-15: as soon as I or someone else wants to work in a language other than English.

## 9. Bootstrapping

Doppelblind is developed with Doppelblind. Until the orchestrator enforces boundaries, every boundary exists only as a prompt, and spec, tests and code of the orchestrator come from one context. Tests written in that phase are correlated signals, not oracles. They keep running once the orchestrator enforces boundaries. Until the test author exists (OUT-02), there are no frozen acceptance tests, only unit tests; that is acceptable. Criteria from specs written before OUT-02 get no special treatment; a later decision may be that their tests give way to new ones.