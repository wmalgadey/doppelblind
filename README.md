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
```

Both commands currently run only the spec agent. It writes `specs/NNN-<short-name>/spec.md` with criteria in Given-When-Then, wishes and open questions; answer the open questions in that file.

Each run keeps a folder in `.doppelblind/runs/<timestamp>-spec-agent/` with the agent's `system-prompt.md`, the user message in `input.md`, the validated output in `output.json`, the CLI call in `call.json` (binary, arguments, working directory, stdin, time limit, start, end and exit) and `trace.jsonl`, every event of the run as one JSON object per line. The trace is written while the agent works, so `tail -f` follows a run, and it is kept when a run fails.

Handing the same brief to the spec agent again starts a new round: the agent writes the spec afresh from the brief, the sources and every answer given so far, never from the earlier spec, and the new spec replaces `spec.md` in the same folder. Answers are kept with their questions' text in `answers.md` next to it; the answer `free` leaves a decision open on purpose, the answer `out of scope` puts it outside this change. After each round the spec is `ready` when no open question concerns a criterion and `open` otherwise; that is information only, and there is no round limit. `.doppelblind/specs.json` records each brief's folder, rounds, status, last run and the questions left unanswered.

`spec` reruns straight away. `feature` on a brief that has a spec first adds the answers from `spec.md` to `answers.md`, lists every open question still without an answer with the criteria it concerns, and asks for each: `free`, `out of scope` or `stop` (writes nothing for it and ends, so you can answer it in `spec.md` and run again). Then it asks "Another clarify round?". On `no`, the spec agent runs once more only if an answer other than `free` or `out of scope` has not reached it yet, and that run's open questions are recorded as unanswered; otherwise `spec.md` is rendered again from the last run's output. The spec step is then `final`: `spec.md` lists every question under "Left open", "Out of scope" or "Unanswered", and no further round starts.

The project declares its binding sources and the specs directory in `.doppelblind.conf`:

```json
{ "sources": ["docs/product.md", "docs/decisions.md"], "specs": "specs" }
```

If the Claude CLI is not on the PATH, set `DOPPELBLIND_CLAUDE_BIN`. In a GitHub Codespace, the CLI ships with the VS Code extension:

```sh
export DOPPELBLIND_CLAUDE_BIN=~/.vscode-remote/extensions/anthropic.claude-code-2.1.314-linux-x64/resources/native-binary/claude
```

The version in the path changes when the extension updates; check `ls ~/.vscode-remote/extensions/`.

## Development

```sh
npm test
npm run typecheck
```
