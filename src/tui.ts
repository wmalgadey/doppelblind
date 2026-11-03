import { createInterface } from "node:readline";
import { styleText } from "node:util";
import { DoppelblindError } from "./errors.ts";

export interface Step {
  /** Shows what the running step is doing now, next to its time; a later call replaces it. */
  update(detail: string): void;
  done(detail?: string): void;
  /** Marks the step failed; the reason follows on the next line. */
  fail(reason?: string): void;
}

/** What the flow reports while it runs. */
export interface Ui {
  banner(): void;
  step(label: string): Step;
  note(text: string): void;
  /** Asks the user to pick one of `options`, showing `details` below the question, and resolves with the picked option. */
  choose(question: string, options: string[], details?: string[]): Promise<string>;
}

const LOGO = [
  String.raw` ____                              _  _      _  _             _`,
  String.raw`|  _ \   ___   _ __   _ __    ___ | || |__  | |(_) _ __    __| |`,
  String.raw`| | | | / _ \ | '_ \ | '_ \  / _ \| || '_ \ | || || '_ \  / _${"`"} |`,
  String.raw`| |_| || (_) || |_) || |_) ||  __/| || |_) || || || | | || (_| |`,
  String.raw`|____/  \___/ | .__/ | .__/  \___||_||_.__/ |_||_||_| |_| \__,_|`,
  String.raw`              |_|    |_|`,
].join("\n");

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const LABEL_WIDTH = 40;
/** Without a TTY a line cannot be redrawn, so a running step repeats its line with the time so far this often. */
const TICK_MS = 10_000;

/**
 * Minimal terminal UI: a logo, then one line per step; the running step shows how long it has been running and
 * what it is doing now, on a TTY next to a spinner.
 * Choices are read from `input`, one line each: an option or its number.
 */
export function terminalUi(stream: NodeJS.WriteStream = process.stderr, input: NodeJS.ReadableStream = process.stdin): Ui {
  const tty = Boolean(stream.isTTY);
  const style = (format: Parameters<typeof styleText>[0], text: string) => styleText(format, text, { stream });
  // one reader for every choice, so that lines read ahead are not lost between them
  let lines: AsyncIterator<string> | undefined;

  return {
    banner() {
      stream.write(`${style("cyan", LOGO)}\n`);
      stream.write(style("dim", "  independent checks for coding agents\n\n"));
    },

    step(label) {
      const started = Date.now();
      const line = (icon: string, detail = "") => `  ${icon} ${label.padEnd(LABEL_WIDTH)} ${detail}`.trimEnd();
      let timer: NodeJS.Timeout | undefined;
      let now = "";
      // the running line must fit the terminal, or redrawing it leaves wrapped rests behind
      const running = () => {
        const text = now ? `${elapsed(started)} · ${now}` : elapsed(started);
        // icon and spaces take 4 columns before the label and 1 after it; the last column stays free
        const room = (stream.columns || 80) - Math.max(label.length, LABEL_WIDTH) - 6;
        return text.length > room ? `${text.slice(0, Math.max(room - 1, 0))}…` : text;
      };

      if (tty) {
        let frame = 0;
        const draw = () => {
          const spinner = style("cyan", FRAMES[frame++ % FRAMES.length]);
          stream.write(`\r\x1b[2K${line(spinner, style("dim", running()))}`);
        };
        draw();
        timer = setInterval(draw, 100);
      } else {
        stream.write(`${line("…")}\n`);
        timer = setInterval(() => stream.write(`${line("…", running())}\n`), TICK_MS);
      }

      const finish = (icon: string, detail?: string) => {
        if (timer) clearInterval(timer);
        stream.write(`${tty ? "\r\x1b[2K" : ""}${line(icon, detail ? style("dim", detail) : "")}\n`);
      };
      return {
        update: (detail) => (now = detail),
        done: (detail) => finish(style("green", "✔"), detail),
        fail: (reason) => {
          finish(style("red", "✘"), "failed");
          if (reason) stream.write(`    ${style("red", reason)}\n`);
        },
      };
    },

    note(text) {
      stream.write(`    ${style("yellow", text)}\n`);
    },

    async choose(question, options, details = []) {
      lines ??= createInterface({ input, terminal: false })[Symbol.asyncIterator]();
      const menu = options.map((o, i) => `${i + 1}) ${o}`).join("  ");
      while (true) {
        stream.write(`\n  ${question}\n${details.map((d) => `    ${style("dim", d)}\n`).join("")}    ${menu}\n  > `);
        const next = await lines.next();
        if (next.done) throw new DoppelblindError(`No answer to "${question}": input ended.`);
        const answer = next.value.trim();
        const picked = options.find((o, i) => answer === o || answer === String(i + 1));
        if (picked) return picked;
        stream.write(`    ${style("yellow", `answer one of: ${options.join(", ")}`)}\n`);
      }
    },
  };
}

function elapsed(since: number): string {
  const seconds = Math.floor((Date.now() - since) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
