import type { ThreadStore, ThreadEvent } from "./store.js";

type Listener = (e: ThreadEvent) => void;
type AnyListener = (threadId: string, e: ThreadEvent) => void;

/** Every thread's log: each event is stored first, then handed to whoever follows that thread or all of them. */
export class ThreadEvents {
  private byThread = new Map<string, Set<Listener>>();
  private everyone = new Set<AnyListener>();

  constructor(private readonly store: ThreadStore) {}

  subscribe(threadId: string, fn: Listener): () => void {
    const set = this.byThread.get(threadId) ?? new Set<Listener>();
    set.add(fn);
    this.byThread.set(threadId, set);
    return () => set.delete(fn);
  }

  subscribeAll(fn: AnyListener): () => void {
    this.everyone.add(fn);
    return () => this.everyone.delete(fn);
  }

  emit(threadId: string, e: ThreadEvent): void {
    this.store.append(threadId, e);
    for (const fn of this.byThread.get(threadId) ?? []) fn(e);
    for (const fn of this.everyone) fn(threadId, e);
  }
}
