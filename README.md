# Doppelblind

Orchestrates separate coding-agent roles and enforces the information boundaries between them. See [docs/product.md](docs/product.md).

## Why "Doppelblind"

The name comes from the double-blind study: neither the participant nor the researcher knows who receives what, so that nobody's expectation can shape the result. Doppelblind applies the same idea to coding agents. The agent that writes the acceptance tests never sees the implementation, the agent that implements cannot change those tests, and the agent that verifies never reads the implementer's report. A check only counts if it cannot share the mistake it is meant to find.

## Usage

Requires Node.js 24 and the [Claude Code](https://claude.com/claude-code) CLI.

```sh
npm install
npm link                     # optional: makes `doppelblind` available on the PATH

doppelblind feature docs/briefs/<brief>.md   # start the flow for a new feature, or continue it
doppelblind spec docs/briefs/<brief>.md      # hand the brief to the spec agent
doppelblind tests docs/briefs/<brief>.md     # hand the final spec to the test author (or name specs/NNN-…/spec.md)
```

Instead of the brief, every command also takes its spec: `specs/NNN-…/spec.md`, the folder `specs/NNN-…` or just the number, with or without leading zeros (`doppelblind feature 2`, `doppelblind feature 002`). `feature` and `spec` then work on the brief the run state connects to that spec.

`feature` runs the spec agent until the spec is final; run it again after that and it continues with the test author. The spec agent writes `specs/NNN-<short-name>/spec.md` with criteria in Given-When-Then, each proven by an acceptance test or by review, wishes and open questions; answer the open questions in that file.

Each run keeps a folder in `.doppelblind/runs/<timestamp>-spec-agent/` with the agent's `system-prompt.md`, the user message in `input.md`, its limits and tools in `guardrails.json`, the validated output in `output.json`, the CLI call in `call.json` (binary, arguments, working directory, stdin, time limit, start, end and exit) and `trace.jsonl`, every event of the run as one JSON object per line. The trace is written while the agent works, so `tail -f` follows a run, and it is kept when a run fails. While an agent runs, its step line shows its turn and its last tool call, e.g. `turn 3 · Write tests/acceptance/001-…/ac-001.test.ts`.

The spec agent runs in these steps:

1. Spec-create run: the spec agent writes the spec and open questions afresh from the brief, the sources and every answer so far.
2. Clarify run: you answer the questions manually in `spec.md`, or start the flow again and mark unanswered question with `free` or `out of scope`. If you `finish` the clarify run while any question is unanswered, those questions will be marked `unanswered` and the spec-agent is finished.
3. If all questions are answered, another spec-create run starts at once and writes a new `spec.md` with new open questions. You then choose to answer them (the command ends; answer them and run the flow again, back at step 2) or to mark them all `unanswered`, which finishes the spec-agent.

A final spec starts no further spec-create run. To write it again anyway, e.g. after you extended the brief, run `doppelblind spec <brief> --force`: the spec agent writes a new `spec.md` in the same folder with every answer given so far, and the spec step is open again. Questions recorded as `unanswered` are no answers; they may come up again. `--force` is refused while the spec's acceptance tests are locked.

Answering does not make the open questions fewer: every spec-create run starts from scratch, and an answer can bring up decisions nobody saw before. The loop does not end by itself, so you decide when the spec is clear enough.

Each acceptance criteria will result in a frosen acceptance test, every answere marked `free` will be open to the implementation agent and is not tested.

The project declares its binding sources and the specs directory in `.doppelblind.conf`:

```json
{ "sources": ["docs/product.md", "docs/decisions.md"], "specs": "specs" }
```

## Test author

Once a spec is final, the test author writes the acceptance tests for every criterion proven by test. It never sees the implementation, and this is enforced, not asked for: it runs under [bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`, Linux) in a temporary directory that holds only the existing acceptance tests and the test infrastructure, read-only. The project, your home and the host's `/tmp` do not exist in its file system. Of the spec it gets only ID, Given, When and Then of the criteria proven by test, and for each decision answered `free` a note `deliberately unspecified: …`.

The contract declares what it must not see, where it writes, how it marks a test with its criterion and how the tests are run; without these the run stops:

```json
{
  "implementation": ["src"],
  "plan": ["docs/plan"],
  "acceptanceTests": {
    "path": "tests/acceptance",
    "marking": "Mark a test with its criterion by a Vitest tag: test(\"…\", { tags: [\"AC-006\"] }, …). Put no tags on describe.",
    "report": "npx doppelblind-vitest {folder} {output}"
  }
}
```

- `marking` goes to the test author as the `<test-marking>` section of its message. `report` runs the acceptance tests of `{folder}` and writes Doppelblind's test result to `{output}`: a JSON list with `{ "file", "name", "criterion", "status" }` per test, `criterion` the criterion ID or `null`, `status` `passed`, `failed` or `skipped`. Doppelblind reads only this format, so any test framework works with a command that writes it. For Vitest, Doppelblind ships `doppelblind-vitest`: it runs Vitest with its JSON reporter and `--strictTags=false` (tags need no declaration) and takes the criterion from the test's tag; a test with more than one criterion tag is an error.

- Test infrastructure is every file in a `test`, `tests`, `__tests__` or `spec` folder that is not itself a test file, plus the test configuration at the root (`package.json`, `tsconfig.json`, `vitest.config.*` …). Test files outside `acceptanceTests` are unit tests and stay hidden. A project without any test stops the run: the test author writes in the language and framework the existing tests use.
- It may write only into `<acceptanceTests.path>/<spec folder>/`. It names test files after behaviour; a file may hold tests of several criteria, each test marked with exactly one. The orchestrator compares its directory before and after; any other write fails the run with the rejected path, and nothing of it reaches the project. A new run replaces the spec's earlier, unlocked files.
- Criteria proven by review go to a second run without tools that gets only those criteria; the orchestrator renders its answer as `<acceptanceTests.path>/<spec folder>/review.md`, one section per criterion. Without such criteria there is no review file.
- The orchestrator then runs the spec's folder itself with `report` and checks the test result: a test fails the gate if it has no criterion, if its ID is not a criterion of the spec proven by test, or if the test author lists it under another criterion; every criterion proven by test needs a test. A test without a marking in a file named `ac-NNN.test.*` counts for AC-NNN, with the warning `legacy criterion mapping`. Every test that passes before any implementation is reported with its criterion ID, every skipped one as skipped.
- Finally you choose `lock` or `keep unlocked`. The lock in `.doppelblind/locks/<spec folder>.json` holds the hash of every file and every test with its criterion; a later run on a locked spec stops.

Limits: `--timeout` (default 30 minutes), `--budget` (default $10) and `--max-turns` (default 100). At the time or cost limit you are asked whether to double it and start over; the turn limit is never raised. Each run keeps its folder in `.doppelblind/runs/<timestamp>-test-author/` (and `-review-guide/`) like a spec agent run, with `guardrails.json` and `test-run.json`. The test author writes into a temporary workspace that the TUI names as `workspace: …`; you can watch its files appear there, and they reach the project only after the write check.

If the Claude CLI is not on the PATH, set `DOPPELBLIND_CLAUDE_BIN`. In a GitHub Codespace, the CLI ships with the VS Code extension:

```sh
export DOPPELBLIND_CLAUDE_BIN=~/.vscode-remote/extensions/anthropic.claude-code-2.1.317-linux-x64/resources/native-binary/claude
```

The version in the path changes when the extension updates; check `ls ~/.vscode-remote/extensions/`.

## Development

```sh
npm test
npm run typecheck
```
