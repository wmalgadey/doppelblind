# Doppelblind

Orchestrates separate coding-agent roles and enforces the information boundaries between them. See [docs/product.md](docs/product.md).

## Usage

Requires Node.js 24 and the [Claude Code](https://claude.com/claude-code) CLI.

```sh
npm install
npm link                     # optional: makes `doppelblind` available on the PATH

doppelblind feature docs/briefs/<brief>.md   # start the flow for a new feature
doppelblind spec docs/briefs/<brief>.md      # hand the brief to the spec agent
```

Both commands currently run only the spec agent. It writes `specs/NNN-<short-name>/spec.md` with criteria in Given-When-Then, wishes and open questions; answer the open questions in that file. The agent's raw response is kept in `.doppelblind/runs/`.

Handing the same brief to the spec agent again revises its existing spec in place: the agent works your answers into the criteria, and the answered questions are kept under "Answered questions".

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
