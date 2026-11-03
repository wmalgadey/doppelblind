import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** What of a project the test author sees: project-relative paths, sorted. */
export interface ViewPlan {
  /** The existing acceptance tests, outside the folder of the spec the run is for. */
  acceptanceTests: string[];
  /** Fixtures, helpers and stubs in the project's test folders, and the configuration its tests run with. */
  infrastructure: string[];
  /** Test files outside the test author's path; never visible, counted so the run knows the project has tests. */
  unitTests: string[];
  /** The one folder the test author may write: the spec's folder under the test author's path. */
  writable: string;
}

export interface Workspace {
  /** The temporary directory the agent works in; it stands for the project root. */
  dir: string;
  /** Hash of every file copied in, by project path. */
  manifest: Map<string, string>;
  writable: string;
}

/** Directories never searched for tests: version control, dependencies and the run state. */
const SKIPPED = new Set(["node_modules", ".git", ".doppelblind"]);
const TEST_DIRS = new Set(["test", "tests", "__tests__", "spec"]);
const TEST_FILE = /(\.(test|spec)\.[^./]+|_test\.[^./]+|_spec\.rb)$|^test_.+\.py$/;
const CONFIG_FILE =
  /^(package\.json|tsconfig(\.[^.]+)?\.json|(vitest|jest|playwright)\.config\.[cm]?[jt]s|pytest\.ini|conftest\.py|pyproject\.toml|setup\.cfg|tox\.ini|go\.mod|Cargo\.toml|Gemfile|\.rspec|phpunit\.xml(\.dist)?)$/;

/**
 * Decides what the test author sees of the project at `root`. A file under an `excluded` path — implementation,
 * plan, specs, sources, briefs — is never part of the view, wherever it lies. Outside the test author's path,
 * test files are unit tests and stay hidden; the other files in test folders are test infrastructure.
 */
export function planView(root: string, acceptancePath: string, specFolderName: string, excluded: string[]): ViewPlan {
  const writable = `${acceptancePath}/${specFolderName}`;
  const plan: ViewPlan = { acceptanceTests: [], infrastructure: [], unitTests: [], writable };
  for (const file of walk(root, "", excluded)) {
    const name = path.posix.basename(file);
    const dirs = path.posix.dirname(file).split("/");
    if (within(file, acceptancePath)) {
      if (!within(file, writable)) plan.acceptanceTests.push(file);
    } else if (TEST_FILE.test(name)) {
      plan.unitTests.push(file);
    } else if (dirs.some((d) => TEST_DIRS.has(d)) || name === "conftest.py" || (dirs[0] === "." && CONFIG_FILE.test(name))) {
      plan.infrastructure.push(file);
    }
  }
  return plan;
}

/** Whether the project has any test at all: an acceptance test or a unit test. */
export function hasTests(plan: ViewPlan): boolean {
  return plan.unitTests.length > 0 || plan.acceptanceTests.some((f) => TEST_FILE.test(path.posix.basename(f)));
}

/**
 * Copies the planned files into a fresh temporary directory at their project paths, read-only, and creates the
 * empty writable folder. Nothing else of the project is in it.
 */
export function createWorkspace(root: string, plan: ViewPlan): Workspace {
  const dir = mkdtempSync(path.join(tmpdir(), "doppelblind-view-"));
  const manifest = new Map<string, string>();
  for (const file of [...plan.acceptanceTests, ...plan.infrastructure]) {
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(root, file), target);
    chmodSync(target, 0o444);
    manifest.set(file, hash(target));
  }
  mkdirSync(path.join(dir, plan.writable), { recursive: true });
  return { dir, manifest, writable: plan.writable };
}

export interface Writes {
  /** Regular files the agent created in its writable folder. */
  written: string[];
  /** Every other change: a file created, changed or removed outside that folder, or a link anywhere. */
  rejected: string[];
}

/** Compares the workspace with what was copied into it. */
export function checkWrites(ws: Workspace): Writes {
  const written: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const file of walk(ws.dir, "", [], true)) {
    seen.add(file);
    const stat = lstatSync(path.join(ws.dir, file));
    if (!stat.isFile()) rejected.push(file);
    else if (within(file, ws.writable)) written.push(file);
    else if (ws.manifest.get(file) !== hash(path.join(ws.dir, file))) rejected.push(file);
  }
  for (const file of ws.manifest.keys()) if (!seen.has(file)) rejected.push(file);
  return { written: written.sort(), rejected: rejected.sort() };
}

/** Replaces the project's copy of the writable folder with `files` from the workspace. */
export function copyWritten(ws: Workspace, root: string, files: string[]): void {
  rmSync(path.join(root, ws.writable), { recursive: true, force: true });
  mkdirSync(path.join(root, ws.writable), { recursive: true });
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    copyFileSync(path.join(ws.dir, file), path.join(root, file));
  }
}

export function removeWorkspace(ws: Workspace): void {
  rmSync(ws.dir, { recursive: true, force: true });
}

export function hash(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * Project-relative POSIX paths of the files below `dir`, skipping `excluded` paths and, unless `everything`,
 * the directories that never hold tests. Links are listed, never followed.
 */
function* walk(root: string, dir: string, excluded: string[], everything = false): Generator<string> {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (excluded.some((e) => within(file, e))) continue;
    if (entry.isDirectory()) {
      if (everything || !SKIPPED.has(entry.name)) yield* walk(root, file, excluded, everything);
    } else {
      yield file;
    }
  }
}

function within(file: string, dir: string): boolean {
  return file === dir || file.startsWith(`${dir}/`);
}
