import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

export const SPEC_FILE = "spec.md";

export const NUMBERED = /^(\d{3,})-/;

/** Turns a title into a folder-safe slug, e.g. "Orchestrator mit Spec-Agent" → "orchestrator-mit-spec-agent". */
export function slugify(title: string, maxLength = 50): string {
  const slug = title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug || "spec";
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/** The next free number in the specs directory: one above the highest existing one. */
export function nextNumber(specsDir: string): number {
  if (!existsSync(specsDir)) return 1;
  let highest = 0;
  for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
    const match = entry.isDirectory() && NUMBERED.exec(entry.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

/** Creates the next numbered folder for a spec and returns its absolute path. */
export function createSpecFolder(specsDir: string, name: string): string {
  mkdirSync(specsDir, { recursive: true });
  const folder = path.join(specsDir, `${String(nextNumber(specsDir)).padStart(3, "0")}-${slugify(name)}`);
  mkdirSync(folder); // not recursive: fails instead of reusing a folder that appeared meanwhile
  return folder;
}
