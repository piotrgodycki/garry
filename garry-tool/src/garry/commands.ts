import type { Project } from "../threads/store.js";
import type { ThreadManager } from "../threads/manager.js";
import type { GarryQueue } from "./queue.js";
import type { Teams } from "./teams.js";
import { MemoryError, forget, readMemory, remember } from "./memory.js";

/**
 * Commands typed after a slash in Garry's field (and in any app that talks
 * to Garry): /remember, /forget, /memory, /new, /pair, /stop, /help. Each one
 * does its thing at once instead of waiting in line like a message, and
 * answers in a sentence; some also say which page to open.
 */

export interface CommandInfo {
  name: string;
  /** what goes after it, empty when nothing does */
  args: string;
  help: string;
}

export interface CommandResult {
  message: string;
  /** a page of the dashboard to open, when the command leads somewhere */
  open?: string;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface CommandContext {
  /** the active project's registry, where its memory is kept */
  registry: string;
  /** the active project's repositories; work goes to the first unless one is named */
  repos: Project[];
  threads: ThreadManager;
  teams: Teams;
  queue: GarryQueue;
}

type Run = (args: string, ctx: CommandContext) => CommandResult;

const repoFor = (ctx: CommandContext) => {
  const repo = ctx.repos[0];
  if (!repo) throw new CommandError("add a repository to this project first (Build)");
  return repo;
};
const needs = (args: string, example: string) => {
  if (!args.trim()) throw new CommandError(`say what, e.g. ${example}`);
  return args.trim();
};

const COMMANDS: (CommandInfo & { run: Run })[] = [
  {
    name: "remember",
    args: "what to keep in mind",
    help: "Garry and every agent in this project keep it in mind from now on",
    run: (args, ctx) => {
      const e = remember(ctx.registry, args);
      return { message: `I will remember: ${e.text}` };
    },
  },
  {
    name: "forget",
    args: "its number, or words from it",
    help: "Drops one thing from Garry's memory",
    run: (args, ctx) => ({ message: `Forgotten: ${forget(ctx.registry, args).text}` }),
  },
  {
    name: "memory",
    args: "",
    help: "What Garry remembers about this project",
    run: (_args, ctx) => {
      const n = readMemory(ctx.registry).length;
      return { message: n ? `I remember ${n} thing${n === 1 ? "" : "s"} about this project.` : "I do not remember anything about this project yet. Try /remember.", open: "/memory" };
    },
  },
  {
    name: "new",
    args: "what should change",
    help: "Starts a job: an agent works on it in its own branch",
    run: (args, ctx) => {
      const t = ctx.threads.create(repoFor(ctx).id, needs(args, "/new add a dark mode switch"));
      return { message: `Started: ${t.title}`, open: `/build/${t.id}` };
    },
  },
  {
    name: "pair",
    args: "what should change",
    help: "Starts a job with a reviewer who checks the work until it is right",
    run: (args, ctx) => {
      const p = ctx.teams.startPair(repoFor(ctx).id, needs(args, "/pair add a buy button"));
      return { message: `Started with a reviewer: ${p.task}`, open: `/build/${p.writer}` };
    },
  },
  {
    name: "stop",
    args: "",
    help: "Stops what Garry is working on now; what waits in line stays",
    run: (_args, ctx) => {
      const ids = new Set(ctx.repos.map((r) => r.id));
      const running = ctx.queue.list().find((i) => i.status === "running" && ids.has(i.projectId));
      if (!running?.threadId || !ctx.threads.stop(running.threadId)) return { message: "Garry is not working on anything right now." };
      return { message: `Stopped: ${running.text}` };
    },
  },
  {
    name: "help",
    args: "",
    help: "The commands you can type after a slash",
    run: () => ({ message: COMMANDS.map((c) => `/${c.name}${c.args ? ` <${c.args}>` : ""}: ${c.help}`).join("\n") }),
  },
];

export const commandList = (): CommandInfo[] => COMMANDS.map(({ name, args, help }) => ({ name, args, help }));

/** Runs "/name args". Text that is not a command is an error, never sent on as a message. */
export function runCommand(text: string, ctx: CommandContext): CommandResult {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) throw new CommandError("a command starts with a slash, e.g. /help");
  const cmd = COMMANDS.find((c) => c.name === m[1].toLowerCase());
  if (!cmd) throw new CommandError(`no command /${m[1]}: type / to see them`, 404);
  try {
    return cmd.run(m[2] ?? "", ctx);
  } catch (e) {
    if (e instanceof MemoryError) throw new CommandError(e.message, e.status);
    throw e;
  }
}
