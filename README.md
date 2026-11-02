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

The spec agent runs in these steps:

1. Spec-create run: the spec agent writes the spec and open questions afresh from the brief, the sources and every answer so far.
2. Clarify run: you answer the questions manually in `spec.md`, or start the flow again and mark unanswered question with `free` or `out of scope`. If you `finish` the clarify run while any question is unanswered, those questions will be marked `unanswered` and the spec-agent is finished.
3. If all questions are answered, you decide whether another spec-create run starts with step 1. or to stop the spec-agent.

Answering does not make the open questions fewer: every spec-create run starts from scratch, and an answer can bring up decisions nobody saw before. The loop does not end by itself, so you decide when the spec is clear enough.

Each acceptance criteria will result in a frosen acceptance test, every answere marked `free` will be open to the implementation agent and is not tested.

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
