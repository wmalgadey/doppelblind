# Orchestrator mit Spec-Agent

## Outcome

OUT-01. Danach kann ich einen Brief per CLI an den Spec-Agent geben und erhalte eine Spezifikation.

## Walkthrough

1. Ich starte den Orchestrator per CLI mit einem Kommando wie „gib den Brief an den Spec-Agent“ bzw. „starte den Flow für ein neues Feature“.
2. Den Brief übergebe ich als Pfad relativ zum aktuellen Verzeichnis.
3. Der Orchestrator gibt den Brief an den Spec-Agent. Der Spec-Agent erzeugt eine Spezifikation mit Kriterien in Given-When-Then und offenen Fragen.
4. Der Orchestrator zeigt eine minimale TUI, die beschreibt, was gerade passiert.
5. Am Ende existiert eine `spec.md` in einem fortlaufend nummerierten Unterordner von `specs` (z. B. `001-spec-inhalt`).
6. Ich öffne die `spec.md` und beantworte die offenen Fragen dort.

## Wishes

- Ein nettes Logo/Figlet vorweg in der TUI.
- Ggf. ein LLM zu Rate ziehen, um meine Antworten auf die offenen Fragen in das Dokument einzuarbeiten.

## Not included

- Die offenen Fragen werden nicht während des Laufs beantwortet.
- Es werden keine anderen Rollen gestartet. Der Flow ist nach dem Spec-Agent zu Ende, da es noch nichts gibt, was danach ausgeführt werden kann.

## Already applies
