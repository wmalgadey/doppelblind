# Test-Agent erzeugt Acceptance-Tests

## Outcome

OUT-02. Danach wird ein fertiger Spec an den Test-Agenten übergeben, und dieser erzeugt die notwendigen Acceptance-Tests für den nächsten Schritt.

## Walkthrough

1. Ich nutze die Doppelblind-CLI und starte den Flow erneut oder direkt den Test-Agenten (für einen Einzelschritt).
2. Die TUI zeigt mir, was gerade passiert.
3. Für Kriterien, die per Review belegt werden, erzeugt der Test-Agent eine Datei, die für den Menschen nützlich ist, um die Review-Kriterien einzeln zu prüfen. Er kann eine Ende-zu-Ende-Liste der ACs formulieren (also nur den Ablauf anhand der existierenden ACs), mit der der Mensch mehrere Kriterien abdecken kann.
4. Die TUI beendet den Lauf mit der Information, was der Agent erzeugt hat.

## Wishes

## Not included

## Already applies

- OUT-01
- DEC-005
