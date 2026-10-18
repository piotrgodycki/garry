import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Lessons are what Garry learned in one project, mostly from its own mistakes.
 * They live in the project's registry (lessons/L-xxx-*.md), next to the feature
 * state, so they survive every agent and every session. The schema is
 * LessonFrontmatterSchema in @garry/registry; this module reads them loosely,
 * the same way the rest of the tool reads the registry.
 */

export type LessonSource = "review" | "test" | "ci" | "drift" | "human";

export interface Incident {
  feature: string;
  stage: string;
  service?: string;
  date: string;
  source: LessonSource;
  summary: string;
}

export interface Lesson {
  id: string;
  title: string;
  kind: "mistake" | "practice";
  status: "active" | "retired";
  rule: string;
  appliesTo: { stages: string[]; services: string[]; skills: string[] };
  incidents: Incident[];
  file: string;
}

/** A lesson with this many incidents keeps happening: a candidate for @garry/skills. */
export const RECURRING_AT = 2;

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function normalize(raw: Partial<Lesson>, file: string): Lesson | null {
  if (!raw.id || !raw.rule) return null;
  return {
    id: raw.id,
    title: raw.title ?? raw.id,
    kind: raw.kind === "practice" ? "practice" : "mistake",
    status: raw.status === "retired" ? "retired" : "active",
    rule: String(raw.rule).trim(),
    appliesTo: {
      stages: raw.appliesTo?.stages ?? [],
      services: raw.appliesTo?.services ?? [],
      skills: raw.appliesTo?.skills ?? [],
    },
    incidents: (raw.incidents ?? []).map((i) => ({ ...i, date: String(i.date) })),
    file,
  };
}

/** Reads every lesson in the registry, sorted by id. A registry without lessons/ has none. */
export function loadLessons(registry: string): Lesson[] {
  const dir = join(registry, "lessons");
  if (!existsSync(dir)) return [];
  const out: Lesson[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const m = FM.exec(readFileSync(join(dir, f), "utf8"));
    if (!m) continue;
    const lesson = normalize((parseYaml(m[1]) ?? {}) as Partial<Lesson>, f);
    if (lesson) out.push(lesson);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

export interface LessonQuery {
  stage: string;
  /** undefined for a supervisor task, which plans across every service */
  service?: string;
  skills?: string[];
}

/**
 * The active lessons that apply to one task. Each scope list narrows the match and
 * an empty list matches everything. A supervisor task (no service) gets lessons for
 * any service, because it plans for all of them.
 */
export function lessonsFor(lessons: Lesson[], q: LessonQuery): Lesson[] {
  return lessons.filter((l) => {
    if (l.status !== "active") return false;
    const s = l.appliesTo;
    if (s.stages.length && !s.stages.includes(q.stage)) return false;
    if (q.service && s.services.length && !s.services.includes(q.service)) return false;
    if (s.skills.length && q.skills && !s.skills.some((k) => q.skills!.includes(k))) return false;
    return true;
  });
}

export function isRecurring(l: Lesson): boolean {
  return l.incidents.length >= RECURRING_AT;
}

export interface RecordInput {
  /** append to this lesson; without it a new lesson is created */
  lessonId?: string;
  title?: string;
  rule?: string;
  kind?: "mistake" | "practice";
  stages?: string[];
  services?: string[];
  skills?: string[];
  incident: Omit<Incident, "date"> & { date?: string };
  /** the longer story for a new lesson: what happened, why, how to avoid it */
  body?: string;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-");
}

function nextId(lessons: Lesson[]): string {
  const max = lessons.reduce((n, l) => Math.max(n, Number(l.id.slice(2)) || 0), 0);
  return `L-${String(max + 1).padStart(3, "0")}`;
}

function frontmatter(l: Lesson): string {
  const { file: _file, ...data } = l;
  return `---\n${stringifyYaml(data, { lineWidth: 0 }).trimEnd()}\n---\n`;
}

/**
 * Records a mistake. With lessonId the incident is appended to that lesson (the
 * same mistake again); otherwise a new lesson file is written. Returns the lesson.
 */
export function recordLesson(registry: string, input: RecordInput): Lesson {
  const dir = join(registry, "lessons");
  mkdirSync(dir, { recursive: true });
  const lessons = loadLessons(registry);
  const incident: Incident = { ...input.incident, date: input.incident.date ?? new Date().toISOString().slice(0, 10) };

  if (input.lessonId) {
    const l = lessons.find((x) => x.id === input.lessonId);
    if (!l) throw new Error(`lesson ${input.lessonId} not found in ${dir}`);
    const path = join(dir, l.file);
    const src = readFileSync(path, "utf8");
    const body = src.replace(FM, "");
    const updated: Lesson = { ...l, status: "active", incidents: [...l.incidents, incident] };
    writeFileSync(path, frontmatter(updated) + body);
    return updated;
  }

  if (!input.title || !input.rule) throw new Error("a new lesson needs a title and a rule");
  const id = nextId(lessons);
  const lesson: Lesson = {
    id,
    title: input.title,
    kind: input.kind ?? "mistake",
    status: "active",
    rule: input.rule,
    appliesTo: { stages: input.stages ?? [], services: input.services ?? [], skills: input.skills ?? [] },
    incidents: [incident],
    file: `${id}-${slug(input.title)}.md`,
  };
  const body = input.body?.trim() || `## What happened\n\n${incident.summary}\n`;
  writeFileSync(join(dir, lesson.file), `${frontmatter(lesson)}\n${body}\n`);
  return lesson;
}

/** The lessons file a subagent reads inside its repository (.garry/lessons.md). */
export function renderLessonsMd(service: string, lessons: Lesson[]): string {
  const head = `# Lessons for ${service}

Garry learned these in this project, mostly from its own mistakes. Follow every
rule below. They come from the registry (lessons/) and are rewritten by
\`garry sync\`; do not edit this file by hand.
`;
  if (lessons.length === 0) return `${head}\nNo lessons yet.\n`;
  const items = lessons.map((l) => {
    const stages = l.appliesTo.stages.length ? l.appliesTo.stages.join(", ") : "every stage";
    const seen = l.incidents.length ? `, seen ${l.incidents.length}x` : "";
    return `## ${l.id}: ${l.title}\n\n${l.rule}\n\n_${l.kind}, ${stages}${seen}_\n`;
  });
  return `${head}\n${items.join("\n")}`;
}
