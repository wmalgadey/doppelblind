#!/usr/bin/env node
// Mechanical helpers for the approve-test skill. No dependencies, heuristic parsing.
//
//   literals   --spec <spec folder> --id <AC-nnn> -- <test files...>
//   blind-copy <test files...>
//   sample     <n> <ids...>

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomInt } from "node:crypto";

const [cmd, ...args] = process.argv.slice(2);

const flagValues = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) out.push(args[j]);
  return out;
};
const afterDashDash = () => {
  const i = args.indexOf("--");
  return i < 0 ? [] : args.slice(i + 1);
};
const fail = (msg) => { console.error(msg); process.exit(2); };
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");

const STRING = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
const REGEX = /(?<=[(,=:\[!&|?]\s*)\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\n\\\[])+)\/[a-z]*/g;
const TITLE_CALL = /^\s*(?:it|test|describe)(?:\.\w+)*\s*\(/;
const ASSERTION = /expect\s*\(|assert|\.to[A-Z]\w*\s*\(/;
const REL_IMPORT = /(from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)(["'])(\.{1,2}\/[^"']+)\2/g;

// Text of one "### AC-nnn" section of spec.md.
function criterionSection(specText, id) {
  const lines = specText.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^#{2,4}\\s+${id}\\b`).test(l));
  if (start < 0) return "";
  let end = lines.findIndex((l, i) => i > start && /^#{2,4}\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join("\n");
}

// Sections of assumptions.md that mention the criterion ID, decisions included.
function assumptionSections(text, id) {
  return text
    .split(/\n(?=#{2,4}\s+A-\d+)/)
    .filter((s) => /^#{2,4}\s+A-\d+/.test(s.trim()) && s.includes(id))
    .join("\n");
}

function literals() {
  const specDir = flagValues("--spec")[0];
  const id = flagValues("--id")[0];
  const files = afterDashDash();
  if (!specDir || !id || files.length === 0) fail("usage: literals --spec <dir> --id <AC-nnn> -- <files...>");
  const spec = readFileSync(join(specDir, "spec.md"), "utf8");
  const assumptionsPath = join(specDir, "assumptions.md");
  const assumptions = existsSync(assumptionsPath) ? readFileSync(assumptionsPath, "utf8") : "";
  const section = criterionSection(spec, id);
  if (!section) fail(`criterion ${id} not found in ${specDir}/spec.md`);
  const haystack = norm(section + "\n" + assumptionSections(assumptions, id));

  const found = [];
  for (const file of files) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(import|export)\b/.test(line) || !ASSERTION.test(line)) return;
      let skipFirstString = TITLE_CALL.test(line);
      for (const m of line.matchAll(STRING)) {
        if (skipFirstString) { skipFirstString = false; continue; }
        const parts = m[2].split(/\$\{[^}]*\}/).map((p) => p.trim()).filter((p) => /\w{3,}/.test(p));
        for (const p of parts) {
          if (/^AC-\d+$/.test(p)) continue;
          if (!haystack.includes(norm(p))) found.push({ file, line: i + 1, kind: "string", literal: p });
        }
      }
      for (const m of line.matchAll(REGEX)) {
        const words = m[1].replace(/\\[sdwbSDWBnt]/g, " ").match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
        const missing = words.filter((w) => !haystack.includes(w.toLowerCase()));
        if (missing.length) found.push({ file, line: i + 1, kind: "pattern", literal: m[0], missing });
      }
    });
  }
  console.log(JSON.stringify(found, null, 2));
}

function blindCopy() {
  const files = args;
  if (files.length === 0) fail("usage: blind-copy <files...>");
  const out = mkdtempSync(join(tmpdir(), "blind-"));
  files.forEach((file, n) => {
    const src = resolve(file);
    let text = readFileSync(src, "utf8");
    text = text.replace(/\/\*[\s\S]*?\*\//g, "");
    text = text.replace(/^\s*\/\/.*$/gm, "");
    text = text.replace(/([^:"'`\\\/])\/\/[^\n]*$/gm, "$1");
    text = text.replace(/\b(it|test|describe)((?:\.\w+)*)\s*\(\s*(["'`])(?:\\.|(?!\3)[^\\])*\3/g, '$1$2("<title>"');
    text = text.replace(/tags\s*:\s*\[[^\]]*\]/g, "tags: []");
    text = text.replace(/\bAC-\d+\b/g, "AC-xxx");
    text = text.replace(REL_IMPORT, (_, pre, q, spec) => `${pre}${q}${resolve(dirname(src), spec)}${q}`);
    const dest = join(out, `${n + 1}-${basename(file)}`);
    writeFileSync(dest, text);
    console.log(dest);
  });
}

function sample() {
  const n = Number(args[0]);
  const ids = args.slice(1);
  if (!Number.isInteger(n) || n < 0) fail("usage: sample <n> <ids...>");
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  ids.slice(0, n).forEach((id) => console.log(id));
}

({ literals, "blind-copy": blindCopy, sample }[cmd] || (() => fail(`unknown command: ${cmd}`)))();
