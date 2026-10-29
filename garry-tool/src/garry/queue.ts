import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ThreadManager } from "../threads/manager.js";
import { now } from "../threads/store.js";

/**
 * What you tell Garry, in order. Every message waits its turn: Garry works on
 * one at a time, in one conversation per repository (so it remembers what came
 * before), and a new message never interrupts the work in progress; it starts
 * when the agent is free. You can drop a message while it waits. Kept in
 * ~/.garry/garry-queue.json, so a restart loses nothing.
 */
export type QueueStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface QueueItem {
  id: string;
  text: string;
  /** the repository it is for */
  projectId: string;
  status: QueueStatus;
  /** the conversation it runs in (Garry's thread for that repository) */
  threadId?: string;
  /** Garry's answer: the end of the agent's last message in that turn */
  reply?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

interface QueueFile {
  items: QueueItem[];
  /** Garry's conversation per repository */
  threads: Record<string, string>;
}

const KEEP = 50;

export class GarryQueue {
  private file: string;
  private data: QueueFile;
  private off: () => void;

  constructor(private threads: ThreadManager) {
    this.file = join(threads.store.root, "garry-queue.json");
    this.data = this.read();
    // a turn that was running when Garry stopped did not finish: say so, and go on
    for (const i of this.data.items) if (i.status === "running" && !(i.threadId && threads.isRunning(i.threadId))) Object.assign(i, { status: "failed", error: "Garry stopped before it finished", endedAt: now() });
    this.write();
    // when an agent is free again (its turn ended), the next message starts
    this.off = threads.subscribeAll((threadId, e) => {
      if (e.type === "status" && e.status !== "running") this.finished(threadId, e.status === "error");
    });
    this.pump();
  }

  close(): void {
    this.off();
  }

  list(): QueueItem[] {
    return this.data.items;
  }

  /** Adds a message at the end of the line; it starts at once if Garry is free. */
  add(text: string, projectId: string): QueueItem {
    if (!text.trim()) throw new Error("the message is empty");
    if (!this.threads.store.project(projectId)) throw new Error("unknown repository");
    const item: QueueItem = { id: this.threads.store.newId(), text: text.trim(), projectId, status: "queued", createdAt: now() };
    this.data.items.push(item);
    this.write();
    this.pump();
    return this.get(item.id)!;
  }

  get(id: string): QueueItem | undefined {
    return this.data.items.find((i) => i.id === id);
  }

  /** Drops a message that has not started; one that runs is stopped in Build. */
  cancel(id: string): boolean {
    const item = this.get(id);
    if (!item || item.status !== "queued") return false;
    Object.assign(item, { status: "cancelled", endedAt: now() });
    this.write();
    return true;
  }

  /** Starts the next message when nothing of Garry's runs and its conversation is free. */
  private pump(): void {
    if (this.data.items.some((i) => i.status === "running")) return;
    const next = this.data.items.find((i) => i.status === "queued");
    if (!next) return;
    const known = this.data.threads[next.projectId];
    const thread = known ? this.threads.store.get(known) : undefined;
    // you are talking to that agent in Build right now: wait for it
    if (thread && this.threads.isRunning(thread.id)) return;
    try {
      if (thread) this.threads.send(thread.id, next.text);
      else {
        const t = this.threads.create(next.projectId, next.text, `Garry: ${next.text.split("\n")[0].slice(0, 60)}`);
        this.data.threads[next.projectId] = t.id;
        next.threadId = t.id;
      }
      next.threadId ??= thread?.id;
      Object.assign(next, { status: "running", startedAt: now() });
    } catch (e) {
      Object.assign(next, { status: "failed", error: String((e as Error).message ?? e), endedAt: now() });
      this.write();
      return this.pump();
    }
    this.write();
  }

  private finished(threadId: string, error: boolean): void {
    const item = this.data.items.find((i) => i.status === "running" && i.threadId === threadId);
    if (item) {
      const events = this.threads.store.events(threadId);
      const lastUser = events.map((e) => e.type).lastIndexOf("user");
      const said = events.slice(lastUser + 1).filter((e) => e.type === "text");
      const ok = events.slice(lastUser + 1).some((e) => e.type === "turn_end" && e.ok);
      Object.assign(item, { status: error || !ok ? "failed" : "done", reply: said.length ? (said[said.length - 1] as { text: string }).text : undefined, endedAt: now() });
      if (item.status === "failed") item.error ??= "The agent stopped before it finished";
    }
    // also when it was your own turn in Build that ended: Garry may go on
    this.write();
    this.pump();
  }

  private read(): QueueFile {
    if (!existsSync(this.file)) return { items: [], threads: {} };
    try {
      const d = JSON.parse(readFileSync(this.file, "utf8")) as Partial<QueueFile>;
      return { items: Array.isArray(d.items) ? d.items : [], threads: d.threads ?? {} };
    } catch {
      return { items: [], threads: {} };
    }
  }

  private write(): void {
    // the waiting and the running always stay; of the finished, the latest
    const open = this.data.items.filter((i) => i.status === "queued" || i.status === "running");
    const closed = this.data.items.filter((i) => !(i.status === "queued" || i.status === "running")).slice(-KEEP);
    this.data.items = this.data.items.filter((i) => open.includes(i) || closed.includes(i));
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
