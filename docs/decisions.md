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

## DEC-006: Default limits of agent runs

Status: accepted
Date: 2026-11-04

Unless the contract or an option sets another value, the spec agent runs at most 5 minutes and $1, the test author at most 15 minutes, $5 and 80 turns, and each test file in the orchestrator's own test run at most 2 minutes. This decision binds only the plan.

Why: Measured runs stayed far below these limits: the spec agent at most 2.2 minutes and $0.38, the test author at most 11.5 minutes, $2.58 and 59 turns.

## DEC-007: Too many free answers make a brief too vague

Status: accepted
Date: 2026-11-04

When more questions of a spec are answered `free` than the contract allows, by default five, Doppelblind reports the brief as too vague and names each of those questions with the step of the brief it is about. This decision binds the spec.

Why: Questions answered `free` reduce the number of acceptance tests, so the implementation becomes vaguer; that counts as a risk.
