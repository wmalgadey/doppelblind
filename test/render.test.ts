import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { renderSpec } from "../src/spec/render.ts";
import { sampleSpec } from "./helpers.ts";

describe("render", () => {
  test("the spec lists criteria in Given-When-Then with their sources", () => {
    const md = renderSpec(sampleSpec(), "docs/briefs/greeting.md", "../../docs/briefs/greeting.md");
    assert.match(md, /^# Grüße für alle\n/);
    assert.match(md, /Brief: \[docs\/briefs\/greeting.md\]\(\.\.\/\.\.\/docs\/briefs\/greeting.md\)/);
    assert.match(md, /### AC-01: Greeter greets\n\n- \*\*Given\*\* the greeter is installed\n- \*\*When\*\* I run it\n- \*\*Then\*\* it prints a greeting/);
    assert.match(md, /Sources: `docs\/briefs\/greeting.md` › ## Walkthrough/);
    assert.match(md, /## Wishes\n\n- A colourful greeting\./);
  });

  test("each open question gets an empty answer to fill in", () => {
    const md = renderSpec(sampleSpec(), "b.md", "b.md");
    assert.match(md, /## Open questions\n\n### Q-01\n\nWhich words does the greeting use\?\n\n_Context: AC-01_\n\n\*\*Answer:\*\*\n$/);
  });

  test("empty wishes and questions are stated, not omitted", () => {
    const md = renderSpec(sampleSpec({ wishes: [], open_questions: [] }), "b.md", "b.md");
    assert.match(md, /## Wishes\n\nNone\.\n\n## Open questions\n\nNone\.\n$/);
  });
});
