import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

/**
 * Garry's memory: short things to keep in mind about a project, said once
 * ("/remember we deploy on Fridays") and given to every agent working in it
 * from then on, next to the layers. Kept in the project's registry
 * (memory.json), so it travels with an exported project; seen and changed on
 * the Memory page.
 */

export interface MemoryEntry {
  id: string;
  text: string;
  createdAt: string;
}

export class MemoryError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const MAX_ENTRIES = 200;
export const MAX_TEXT = 500;

const file = (registry: string) => join(registry, "memory.json");

export function readMemory(registry: string): MemoryEntry[] {
  try {
    const raw = JSON.parse(readFileSync(file(registry), "utf8")) as { entries?: unknown };
    if (!Array.isArray(raw.entries)) return [];
    return raw.entries.filter((e): e is MemoryEntry => typeof e?.id === "string" && typeof e?.text === "string" && typeof e?.createdAt === "string");
  } catch {
    // none yet, or unreadable: nothing remembered
    return [];
  }
}

function write(registry: string, entries: MemoryEntry[]): void {
  mkdirSync(registry, { recursive: true });
  const tmp = `${file(registry)}.tmp`;
  writeFileSync(tmp, JSON.stringify({ entries }, null, 2) + "\n");
  renameSync(tmp, file(registry));
}

/** Remembers one thing; the same thing twice is kept once. */
export function remember(registry: string, text: string): MemoryEntry {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new MemoryError("say what to remember, e.g. /remember we deploy on Fridays");
  if (clean.length > MAX_TEXT) throw new MemoryError(`keep it under ${MAX_TEXT} characters: one thing at a time`);
  const entries = readMemory(registry);
  const same = entries.find((e) => e.text.toLowerCase() === clean.toLowerCase());
  if (same) return same;
  if (entries.length >= MAX_ENTRIES) throw new MemoryError(`Garry remembers up to ${MAX_ENTRIES} things: forget some first (Memory)`, 409);
  const entry: MemoryEntry = { id: randomBytes(5).toString("hex"), text: clean, createdAt: new Date().toISOString() };
  write(registry, [...entries, entry]);
  return entry;
}

/**
 * Forgets one thing: by its id, by its number in the list (1 is the oldest),
 * or by words it contains when exactly one entry has them.
 */
export function forget(registry: string, what: string): MemoryEntry {
  const key = what.trim();
  if (!key) throw new MemoryError("say what to forget: its number in Memory, or words from it");
  const entries = readMemory(registry);
  const byNumber = /^\d+$/.test(key) ? entries[Number(key) - 1] : undefined;
  const matches = byNumber ? [byNumber] : (entries.filter((e) => e.id === key).length ? entries.filter((e) => e.id === key) : entries.filter((e) => e.text.toLowerCase().includes(key.toLowerCase())));
  if (matches.length === 0) throw new MemoryError(`nothing remembered matches "${key}"`, 404);
  if (matches.length > 1) throw new MemoryError(`${matches.length} things match "${key}": say more, or use its number in Memory`, 409);
  write(registry, entries.filter((e) => e.id !== matches[0].id));
  return matches[0];
}

/** What an agent reads: every entry, numbered, oldest first. */
export function memoryPrompt(registry: string): string {
  const entries = readMemory(registry);
  if (!entries.length) return "";
  return ["What the team asked Garry to remember about this project:", ...entries.map((e, i) => `${i + 1}. ${e.text}`)].join("\n");
}
