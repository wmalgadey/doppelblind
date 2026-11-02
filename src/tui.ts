import { createInterface } from "node:readline";
import { styleText } from "node:util";
import { DoppelblindError } from "./errors.ts";

export interface Step {
  done(detail?: string): void;
  fail(detail?: string): void;
}

/** What the flow reports while it runs. */
export interface Ui {
  banner(): void;
  step(label: string): Step;
  note(text: string): void;
  /** Asks the user to pick one of `options` and resolves with the picked option. */
  choose(question: string, options: string[]): Promise<string>;
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
const LABEL_WIDTH = 34;

/**
 * Minimal terminal UI: a logo, then one line per step; on a TTY the running step shows a spinner.
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

      if (tty) {
        let frame = 0;
        const draw = () => {
          const spinner = style("cyan", FRAMES[frame++ % FRAMES.length]);
          stream.write(`\r\x1b[2K${line(spinner, style("dim", elapsed(started)))}`);
        };
        draw();
        timer = setInterval(draw, 100);
      } else {
        stream.write(`${line("…")}\n`);
      }

      const finish = (icon: string, detail?: string) => {
        if (timer) clearInterval(timer);
        stream.write(`${tty ? "\r\x1b[2K" : ""}${line(icon, detail ? style("dim", detail) : "")}\n`);
      };
      return {
        done: (detail) => finish(style("green", "✔"), detail),
        fail: (detail) => finish(style("red", "✘"), detail),
      };
    },

    note(text) {
      stream.write(`    ${style("yellow", text)}\n`);
    },

    async choose(question, options) {
      lines ??= createInterface({ input, terminal: false })[Symbol.asyncIterator]();
      const menu = options.map((o, i) => `${i + 1}) ${o}`).join("  ");
      while (true) {
        stream.write(`  ${question}\n    ${menu}\n  > `);
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
