import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "tests/**/*.test.ts"],
    reporters: ["tree"],
    // Acceptance tests carry their criterion ID (AC-…) as a tag; these are not declared here.
    strictTags: false,
  },
});
