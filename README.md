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

The project declares its binding sources and the specs directory in `.doppelblind.conf`:

```json
{ "sources": ["docs/product.md", "docs/decisions.md"], "specs": "specs" }
```

If the Claude CLI is not on the PATH, set `DOPPELBLIND_CLAUDE_BIN`.

## Development

```sh
npm test
npm run typecheck
```
