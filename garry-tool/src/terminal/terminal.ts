import { spawn, execFile, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";

/**
 * A shell in a folder Garry knows (the registry, a repo, a piece of work's
 * worktree), for the Files tab on the computer running Garry. The shell runs
 * in a real terminal made by the system's `script` command, so prompts,
 * colours, Ctrl-C and full screen programs work without native modules.
 *
 * For a company: GARRY_TERMINAL=off turns it off for everyone.
 */

export const terminalEnabled = () => (process.env.GARRY_TERMINAL ?? "").toLowerCase() !== "off";

export class TerminalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface TerminalInfo {
  id: string;
  /** what the shell was opened in, as the Files tab names it (registry, project:<id>, thread:<id>) */
  root: string;
  cwd: string;
  shell: string;
  createdAt: string;
  exited: boolean;
}

type Listener = (e: { type: "data"; data: string } | { type: "exit"; code: number | null }) => void;

interface Terminal extends TerminalInfo {
  proc: ChildProcess;
  backlog: string;
  listeners: Set<Listener>;
  ttyFile: string;
  pidFile: string;
  tmp: string;
}

/** Most shells open at once; one more is refused until one closes. */
export const MAX_TERMINALS = 8;
/** What a newly attached view replays: the end of what the shell printed. */
const BACKLOG = 200_000;
export const MAX_INPUT = 64_000;

const clampSize = (n: unknown, fallback: number, max: number) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 2 ? Math.min(v, max) : fallback;
};
const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function defaultShell(): string {
  const env = process.env.SHELL;
  if (env && existsSync(env)) return env;
  for (const s of ["/bin/zsh", "/bin/bash", "/bin/sh"]) if (existsSync(s)) return s;
  return "/bin/sh";
}

export class TerminalManager {
  private terms = new Map<string, Terminal>();

  list(): TerminalInfo[] {
    return [...this.terms.values()].map(info);
  }

  get(id: string): TerminalInfo | undefined {
    const t = this.terms.get(id);
    return t && info(t);
  }

  open(root: string, cwd: string, size: { cols?: unknown; rows?: unknown } = {}): TerminalInfo {
    if (!terminalEnabled()) throw new TerminalError("the terminal is turned off on this computer (GARRY_TERMINAL=off)", 403);
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new TerminalError(`no folder ${cwd}`, 404);
    if ([...this.terms.values()].filter((t) => !t.exited).length >= MAX_TERMINALS) throw new TerminalError(`at most ${MAX_TERMINALS} terminals are open at once; close one first`, 429);
    const cols = clampSize(size.cols, 100, 500);
    const rows = clampSize(size.rows, 30, 200);
    const shell = defaultShell();
    const tmp = mkdtempSync(join(tmpdir(), "garry-term-"));
    const ttyFile = join(tmp, "tty");
    const pidFile = join(tmp, "pid");
    // size the terminal, note its device (to resize it later) and the shell's process
    // (exec keeps it: closing signals the shell itself), then hand over to the shell
    const start = `stty cols ${cols} rows ${rows} 2>/dev/null; tty > ${quote(ttyFile)}; echo $$ > ${quote(pidFile)}; exec ${quote(shell)} -il`;
    const args = process.platform === "darwin" ? ["-q", "/dev/null", "/bin/sh", "-c", start] : ["-qfec", start, "/dev/null"];
    const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", GARRY_TERMINAL_ROOT: root };
    const proc = spawn("script", args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const id = randomBytes(6).toString("hex");
    const t: Terminal = { id, root, cwd, shell, createdAt: new Date().toISOString(), exited: false, proc, backlog: "", listeners: new Set(), ttyFile, pidFile, tmp };
    const decoder = new StringDecoder("utf8");
    const emit = (data: string) => {
      if (!data) return;
      t.backlog = (t.backlog + data).slice(-BACKLOG);
      for (const l of t.listeners) l({ type: "data", data });
    };
    proc.stdout!.on("data", (d: Buffer) => emit(decoder.write(d)));
    proc.stderr!.on("data", (d: Buffer) => emit(decoder.write(d)));
    proc.stdin!.on("error", () => undefined);
    const finish = (code: number | null) => {
      if (t.exited) return;
      t.exited = true;
      emit(decoder.end());
      for (const l of t.listeners) l({ type: "exit", code });
      rmSync(tmp, { recursive: true, force: true });
    };
    proc.on("exit", (code) => finish(code));
    proc.on("error", (e) => {
      emit(`\r\nThe terminal could not start: ${e.message}\r\n`);
      finish(null);
    });
    this.terms.set(id, t);
    return info(t);
  }

  /** Replays what the shell printed so far, then follows it. Returns the unsubscribe. */
  attach(id: string, listener: Listener): () => void {
    const t = this.must(id);
    if (t.backlog) listener({ type: "data", data: t.backlog });
    if (t.exited) {
      listener({ type: "exit", code: t.proc.exitCode });
      return () => undefined;
    }
    t.listeners.add(listener);
    return () => t.listeners.delete(listener);
  }

  write(id: string, data: unknown): void {
    const t = this.must(id);
    if (typeof data !== "string") throw new TerminalError("data: text is required", 400);
    if (data.length > MAX_INPUT) throw new TerminalError(`data: at most ${MAX_INPUT} characters at once`, 413);
    if (t.exited) throw new TerminalError("this terminal has closed", 410);
    t.proc.stdin!.write(data);
  }

  /** Tells the shell its new size; full screen programs redraw to fit. */
  async resize(id: string, size: { cols?: unknown; rows?: unknown }): Promise<void> {
    const t = this.must(id);
    if (t.exited) return;
    let tty = "";
    try {
      tty = readFileSync(t.ttyFile, "utf8").trim();
    } catch {
      return; // the shell has not started yet; it began at the size it was opened with
    }
    if (!/^\/dev\/[\w/]+$/.test(tty)) return;
    const cols = clampSize(size.cols, 100, 500);
    const rows = clampSize(size.rows, 30, 200);
    const flag = process.platform === "darwin" ? "-f" : "-F";
    await new Promise<void>((done) => execFile("stty", [flag, tty, "cols", String(cols), "rows", String(rows)], () => done()));
  }

  close(id: string): void {
    const t = this.must(id);
    this.terms.delete(id);
    if (t.exited) return;
    // script ignores SIGHUP and an interactive shell ignores SIGTERM: hang up on the shell
    // itself, as closing a terminal window does; script then ends with it
    let shellPid = 0;
    try {
      shellPid = Number(readFileSync(t.pidFile, "utf8").trim());
    } catch {
      /* not started yet */
    }
    const signal = (pid: number, sig: NodeJS.Signals) => {
      try {
        if (pid > 1) process.kill(pid, sig);
      } catch {
        /* already gone */
      }
    };
    signal(shellPid, "SIGHUP");
    // script ends on its own once the shell is gone
    setTimeout(() => {
      if (t.exited) return;
      signal(shellPid, "SIGKILL");
      t.proc.kill("SIGKILL");
    }, 2000).unref();
  }

  closeAll(): void {
    for (const id of [...this.terms.keys()]) this.close(id);
  }

  private must(id: string): Terminal {
    const t = this.terms.get(id);
    if (!t) throw new TerminalError("no such terminal", 404);
    return t;
  }
}

const info = (t: Terminal): TerminalInfo => ({ id: t.id, root: t.root, cwd: t.cwd, shell: t.shell, createdAt: t.createdAt, exited: t.exited });
