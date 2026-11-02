# Doppelblind — Product

## 1. Goal

I develop software with coding agents and can trust a result without reading every line, because every check that decides whether a result is correct was created independently of what it checks. Doppelblind orchestrates separate agent roles — spec agent, test author, implementer, verifier, classifier and, after a failed run, a worst-case agent — and enforces the information boundaries between them technically, not by prompt.

Leading idea: a check counts only if it does not correlate with the error it is meant to find. An agent is worth running only if it has its own information boundary; without one, the same model agrees with itself.

The goal is reached when I can use Doppelblind as an individual tool for almost any project and make changes to that project in a safe and trusted way: small, low-risk changes merge automatically at the end, large or risky changes keep a human in the loop. Both the size and the risk of a change count.

## 2. User and context

Doppelblind is not for me alone; it is not restricted to particular users. Their projects may use a different documentation structure than mine. What they must understand: a project developed with Doppelblind can look like any other project worked on with coding agents, and anyone may keep using LLMs in it directly. Only a change triggered through Doppelblind runs the process as intended; changes made outside it can drift or carry bugs, and only Doppelblind produces confidence in a change.

Doppelblind works with any project structure. A project fulfils a contract — where its binding sources are, how a source is cited, which paths each role may write, which paths are protected, how a test names the criterion it checks, where the risk matrix is — and does not prescribe formats: a flat decision file or an ADR directory, a product vision or another description of what the system should do are equally valid, as long as each source is citable and says what is in force.

The contract is declared in the project, in a `.doppelblind.conf` file. Run state also lives in the project for now. Role prompts, harness settings and output schemas do not live in the project; nothing a role runs with is loaded from a directory that role can write. What Doppelblind produces — specs, acceptance tests, their lock and inventory — are ordinary project artifacts and are versioned like any other.

A project is a full spec-driven project on its own: its gates run in the project's CI and apply to every change, whoever made it. Only the trusted development pipeline runs through Doppelblind, not in the project.

A project may keep its own `AGENTS.md`/`CLAUDE.md` for working on it with LLMs; they belong to the project, not to Doppelblind. In a role run, Doppelblind replaces them with its own variant.

Only the user changes the risk matrix. A skill inside the project helps maintain it.

Sources are written by people. Skills that write into a binding source belong to the human side and are unreachable for every role in a run.

Agents run through an agent CLI in headless mode. I use a Claude subscription, not a per-token API key; the classifier also runs under the subscription, with typed output. I want to be able to switch to other agent CLIs.

## 3. Core loop

1. I write a brief.
2. The spec agent writes binding criteria, each with an ID and a cited source, separate from wishes, and lists every decision the brief does not make as an open question without a suggested answer. I answer them.
3. The test author, who never sees implementation code or plan, writes acceptance tests per criterion and lists every assumption it had to make.
4. If the risk matrix or the assumptions call for it, I approve before implementation. The acceptance tests are frozen.
5. The implementer works until the acceptance tests are green or reports a divergence; the verifier, who never sees the implementer's report, returns findings until there are none or a limit is reached.
6. If the change carries technical risk, I approve the merge; otherwise it merges automatically once all gates are green.
7. I see what each run did, where it diverged, what it cost and how it ended.

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
4. Every run is bounded by rounds per loop, time and cost. At a limit, a human decides; nothing is approved automatically by waiting.
5. Sources are written only by people.

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
| AGENT      | Running an agent CLI headless; switching between CLIs                                                     |

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

OUT-01 to OUT-05 are the core loop, built in this order. The goal (§1) is reached with OUT-05.

## 8. Later: promotion triggers

- OUT-06/OUT-07: as soon as I run into problems from which a new spec should be created.
- OUT-08: as soon as there is demand from outside.
- OUT-09: as soon as I or someone else wants to use another agent CLI, e.g. GitHub Copilot CLI.
- OUT-10: as soon as I have built a few features in another project.
- OUT-11: as soon as the core loop stands, starting from my own basic setup. Before OUT-08 unless OUT-08 is triggered first.
- OUT-12: as soon as I build many projects with Doppelblind.

## 9. Bootstrapping

Doppelblind is developed with Doppelblind. Until the orchestrator enforces boundaries, every boundary exists only as a prompt, and spec, tests and code of the orchestrator come from one context. Tests written in that phase are correlated signals, not oracles. They keep running once the orchestrator enforces boundaries. Until the test author exists (OUT-02), there are no frozen acceptance tests, only unit tests; that is acceptable. Criteria from specs written before OUT-02 get no special treatment; a later decision may be that their tests give way to new ones.
