import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadContract, toProjectPath } from "../contract.ts";
import { DoppelblindError } from "../errors.ts";
import { NUMBERED, SPEC_FILE } from "../spec/folder.ts";
import { readState } from "../spec/state.ts";

/**
 * The path `target` names, relative to `cwd`: a spec number such as 2, 02 or 002 names the spec folder with that
 * number, e.g. specs/002-…; any other target is a path and is returned unchanged.
 */
export function specTarget(cwd: string, target: string): string {
  if (!/^\d+$/.test(target)) return target;
  const contract = loadContract(cwd);
  const specsDir = path.join(contract.root, contract.specs);
  const number = Number(target);
  const folders = existsSync(specsDir)
    ? readdirSync(specsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && Number(NUMBERED.exec(e.name)?.[1]) === number)
        .map((e) => e.name)
    : [];
  if (folders.length === 0) throw new DoppelblindError(`No spec numbered ${target} in ${contract.specs}/.`);
  if (folders.length > 1) {
    throw new DoppelblindError(`More than one spec is numbered ${target}; name its folder.`, folders.map((f) => `${contract.specs}/${f}`));
  }
  return path.relative(cwd, path.join(specsDir, folders[0]));
}

/**
 * The brief, relative to `cwd`, that `target` names: a brief, or a spec number, spec folder or spec.md, which name
 * the brief the run state connects to that spec. A path that names no spec is returned unchanged: a new brief.
 */
export function briefTarget(cwd: string, target: string): string {
  const resolved = specTarget(cwd, target);
  const { root } = loadContract(cwd);
  const named = toProjectPath(root, path.resolve(cwd, resolved));
  const state = readState(root);
  if (state[named]) return resolved;
  const folder = path.posix.basename(named) === SPEC_FILE ? path.posix.dirname(named) : named;
  if (!existsSync(path.join(root, folder, SPEC_FILE))) return resolved;
  const brief = Object.entries(state).find(([, s]) => s.folder === folder)?.[0];
  if (!brief) throw new DoppelblindError(`No brief in the run state is connected to ${folder}/${SPEC_FILE}.`, ["Name its brief instead."]);
  return path.relative(cwd, path.join(root, brief));
}
