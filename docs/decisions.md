# Decisions

## DEC-001: Node.js 24 is the only runtime

Status: accepted
Date: 2026-11-02

Doppelblind runs on Node.js 24; Bun is not used.

Why: Starting the Claude CLI as a subprocess must be able to rely on Node's process behaviour.

## DEC-002: TypeScript runs without a build step

Status: accepted
Date: 2026-11-02

The TypeScript sources run directly in Node, without a build step.

Why: Node runs TypeScript natively without a flag since 22.18 and 23.6.

## DEC-003: Vitest is the test runner

Status: accepted
Date: 2026-11-02

Tests run with Vitest.

Why: Its VS Code integration is clearly more pleasant, and it is the more established option.

## DEC-004: TypeScript 7 for type checking

Status: accepted
Date: 2026-11-02

The project uses TypeScript 7.

Why: Type checking stays fast when the build grows large.

## DEC-005: Agents write their output in English

Status: accepted
Date: 2026-11-02

All agent output is in English, regardless of the brief's language. The fixed labels in spec.md stay English as well.

Why: Otherwise a spec mixes German and English.
