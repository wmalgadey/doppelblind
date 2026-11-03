import { spawnSync } from "node:child_process";
import { accessSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { DoppelblindError } from "../errors.ts";

/** The command that runs the agent CLI inside the sandbox; `cleanup` removes the sandbox's home. */
export interface SandboxedCall {
  bin: string;
  args: string[];
  cleanup(): void;
}

/** System directories the agent CLI needs to run; nothing else of the host's file system exists in the sandbox. */
const SYSTEM_DIRS = ["/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/etc"];
const CREDENTIALS = ".credentials.json";

/**
 * Wraps a call of the agent CLI in bubblewrap, so that the agent's file system holds only the system directories,
 * the CLI itself, `workdir` (writable) and a fresh home with a copy of the CLI's credentials. The project, the
 * user's home and the host's temporary directory are absent, whatever the agent's tools or harness rules allow.
 * The agent gets its own process namespace, so it cannot reach the host's file system through /proc either.
 */
export function sandboxCall(bin: string, args: string[], workdir: string): SandboxedCall {
  if (spawnSync("bwrap", ["--version"]).status !== 0) {
    throw new DoppelblindError("This agent runs only in a sandbox, and bubblewrap (bwrap) is not available.", [
      "Install bubblewrap; it keeps what the agent must not see out of its file system.",
    ]);
  }
  const resolved = resolveBin(bin);
  const node = realpathSync(process.execPath);
  const home = mkdtempSync(path.join(tmpdir(), "doppelblind-home-"));
  const config = path.join(home, ".claude");
  mkdirSync(config);
  const credentials = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), ".claude"), CREDENTIALS);
  if (existsSync(credentials)) copyFileSync(credentials, path.join(config, CREDENTIALS));

  const binds = [...new Set([visiblePart(resolved), node])].filter((p) => !SYSTEM_DIRS.some((d) => within(p, d)));
  const wrapped = [
    ...SYSTEM_DIRS.flatMap((d) => ["--ro-bind-try", d, d]),
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    ...binds.flatMap((p) => ["--ro-bind", p, p]),
    "--bind", workdir, workdir,
    "--bind", home, home,
    "--unshare-pid",
    "--unshare-ipc",
    "--new-session",
    "--die-with-parent",
    "--chdir", workdir,
    "--setenv", "HOME", home,
    "--setenv", "CLAUDE_CONFIG_DIR", config,
    "--setenv", "TMPDIR", "/tmp",
    "--setenv", "PATH", [path.dirname(node), "/usr/local/bin", "/usr/bin", "/bin"].join(":"),
    "--",
    resolved,
    ...args,
  ];
  return { bin: "bwrap", args: wrapped, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

/** The CLI's real path, looked up on the PATH when `bin` is a bare name. */
function resolveBin(bin: string): string {
  const candidates = bin.includes("/")
    ? [path.resolve(bin)]
    : (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, bin));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // not here, try the next one
    }
  }
  throw new DoppelblindError(`Agent CLI not found: ${bin}`, ["Install Claude Code or set DOPPELBLIND_CLAUDE_BIN."]);
}

/**
 * What of the CLI the sandbox shows: the CLI file itself, or, for a script installed as an npm package,
 * that package's folder. Never the folder around a bare file, which may be a project.
 */
function visiblePart(file: string): string {
  const parts = file.split(path.sep);
  const modules = parts.lastIndexOf("node_modules");
  if (modules < 0) return file;
  const scoped = parts[modules + 1]?.startsWith("@") ? 2 : 1;
  return parts.slice(0, modules + 1 + scoped).join(path.sep);
}

function within(file: string, dir: string): boolean {
  return file === dir || file.startsWith(dir + path.sep);
}
