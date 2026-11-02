import { styleText } from "node:util";

export interface Step {
  done(detail?: string): void;
  fail(detail?: string): void;
}

/** What the flow reports while it runs. */
export interface Ui {
  banner(): void;
  step(label: string): Step;
  note(text: string): void;
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

/** Minimal terminal UI: a logo, then one line per step; on a TTY the running step shows a spinner. */
export function terminalUi(stream: NodeJS.WriteStream = process.stderr): Ui {
  const tty = Boolean(stream.isTTY);
  const style = (format: Parameters<typeof styleText>[0], text: string) => styleText(format, text, { stream });

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
  };
}

function elapsed(since: number): string {
  const seconds = Math.floor((Date.now() - since) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
