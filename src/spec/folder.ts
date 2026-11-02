import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const NUMBERED = /^(\d{3,})-/;

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

/**
 * The folder whose spec.md was written for this brief, found by its `Brief:` line.
 * If several were, the highest-numbered one; undefined if none was.
 */
export function findSpecFolder(specsDir: string, briefPath: string): string | undefined {
  if (!existsSync(specsDir)) return undefined;
  const briefLine = `Brief: [${briefPath}](`;
  const folders = readdirSync(specsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && NUMBERED.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(NUMBERED.exec(a)![1]) - Number(NUMBERED.exec(b)![1]));
  for (const name of folders.reverse()) {
    const file = path.join(specsDir, name, "spec.md");
    if (!existsSync(file)) continue;
    if (readFileSync(file, "utf8").split("\n").some((line) => line.startsWith(briefLine))) return path.join(specsDir, name);
  }
  return undefined;
}

/** Creates the next numbered folder for a spec and returns its absolute path. */
export function createSpecFolder(specsDir: string, name: string): string {
  mkdirSync(specsDir, { recursive: true });
  const folder = path.join(specsDir, `${String(nextNumber(specsDir)).padStart(3, "0")}-${slugify(name)}`);
  mkdirSync(folder); // not recursive: fails instead of reusing a folder that appeared meanwhile
  return folder;
}
