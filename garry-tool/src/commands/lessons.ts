import pc from "picocolors";
import { isRecurring, loadLessons, recordLesson, type LessonSource } from "../learn/lessons.js";
import { STAGES } from "../orchestrate/plan.js";

const SOURCES: LessonSource[] = ["review", "test", "ci", "drift", "human"];

const HELP = `garry lessons [list] [options]
garry lessons add [options]

What Garry learned in this project. Lessons live in the registry (lessons/) and
are injected into every matching task and into .garry/lessons.md by garry sync.

list (default)
  --registry <path>   registry root (default: garry-registry/examples/registry-sample)

add: record a mistake
  --id <L-xxx>        the same mistake again: append an incident to this lesson
  --title <text>      a new lesson: short name of the mistake
  --rule <text>       a new lesson: the one instruction that prevents it
  --kind <k>          mistake (default) or practice
  --stages <a,b>      stages the rule applies to (default: every stage)
  --services <a,b>    services the rule applies to (default: the whole project)
  --skills <a,b>      skills the rule applies to (default: any skill)
  --feature <id>      feature where it happened (required)
  --stage <stage>     stage where it was caught (required)
  --service <name>    service where it happened
  --source <s>        review, test, ci, drift or human (required)
  --summary <text>    what happened, in one sentence (required)
  --registry <path>   registry root

  --help, -h          show this help
`;

const FLAGS = [
  "registry", "id", "title", "rule", "kind", "stages", "services", "skills",
  "feature", "stage", "service", "source", "summary",
] as const;

function parse(argv: string[]): { sub: string; values: Record<string, string>; help: boolean } {
  const values: Record<string, string> = {};
  let help = false;
  let sub = "list";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if ((FLAGS as readonly string[]).includes(key) && val !== undefined && !val.startsWith("--")) {
        values[key] = val;
        i++;
      }
    } else sub = a;
  }
  return { sub, values, help };
}

const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export async function runLessons(argv: string[]): Promise<void> {
  const { sub, values, help } = parse(argv);
  if (help) {
    console.log(HELP);
    return;
  }
  const registry = values.registry ?? "garry-registry/examples/registry-sample";

  if (sub === "list") {
    const lessons = loadLessons(registry);
    if (lessons.length === 0) {
      console.log("No lessons yet. Record one with: garry lessons add --help");
      return;
    }
    for (const l of lessons) {
      const tags = [l.kind, l.status === "retired" ? "retired" : "", isRecurring(l) ? pc.red("recurring") : ""].filter(Boolean);
      console.log(`${pc.bold(l.id)}  ${l.title}  ${pc.dim(`(${tags.join(", ")}, ${l.incidents.length}x)`)}`);
      console.log(`      ${l.rule}`);
    }
    const recurring = lessons.filter(isRecurring);
    if (recurring.length) {
      console.log(
        "\n" + pc.dim(`Recurring: ${recurring.map((l) => l.id).join(", ")}. Consider promoting them into @garry/skills so every project gets them.`),
      );
    }
    return;
  }

  if (sub === "add") {
    const { feature, stage, source, summary } = values;
    if (!feature || !stage || !source || !summary) throw new Error("add needs --feature, --stage, --source and --summary");
    if (!(STAGES as readonly string[]).includes(stage)) throw new Error(`unknown stage: ${stage}`);
    if (!SOURCES.includes(source as LessonSource)) throw new Error(`unknown source: ${source} (use ${SOURCES.join(", ")})`);
    const stages = list(values.stages);
    const bad = stages?.find((s) => !(STAGES as readonly string[]).includes(s));
    if (bad) throw new Error(`unknown stage in --stages: ${bad}`);
    if (values.kind && values.kind !== "mistake" && values.kind !== "practice") throw new Error("--kind is mistake or practice");

    const lesson = recordLesson(registry, {
      lessonId: values.id,
      title: values.title,
      rule: values.rule,
      kind: values.kind as "mistake" | "practice" | undefined,
      stages,
      services: list(values.services),
      skills: list(values.skills),
      incident: { feature, stage, service: values.service, source: source as LessonSource, summary },
    });
    const verb = values.id ? "Added an incident to" : "Recorded";
    console.log(pc.green(`${verb} ${lesson.id}: ${lesson.title} (${lesson.incidents.length}x)`));
    console.log(pc.dim(`  ${registry}/lessons/${lesson.file}`));
    if (isRecurring(lesson)) console.log(pc.dim("  This mistake keeps happening. Consider promoting it into @garry/skills."));
    return;
  }

  throw new Error(`unknown lessons command: ${sub}`);
}
