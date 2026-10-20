import { GitHub, parseSlug } from "../github/client.js";
import { gitTry } from "../workspace/git.js";
import { enforceAudit, prepareSkill, SkillError, type InstallRequest, type PreparedSkill } from "./local.js";

/**
 * Proposes a skill to the whole team: opens a pull request that adds it to the
 * pre-installed skills (garry-skills/skills/<stage>/<name>/ plus a manifest entry).
 * The skill-audit workflow then audits it again in CI with secret and static
 * scanners, CODEOWNERS asks a named reviewer to approve, and only after the merge
 * does it ship to everyone. The same local audit runs first, so a skill that
 * fails is never even proposed.
 */

export interface ProposeResult {
  number: number;
  url: string;
  branch: string;
  skill: PreparedSkill["skill"];
}

/** The repository skills are proposed to: GARRY_SKILLS_REPO (owner/name), else this checkout's origin. */
export function skillsRepo(): { owner: string; name: string } | null {
  const fromEnv = process.env.GARRY_SKILLS_REPO?.trim();
  if (fromEnv) return parseSlug(fromEnv);
  const origin = gitTry(["remote", "get-url", "origin"]);
  return origin.ok ? parseSlug(origin.out.trim()) : null;
}

/** Inserts one entry at the end of the manifest's skills array, keeping the file's formatting. */
export function addManifestEntry(manifest: string, entry: Record<string, unknown>): string {
  const parsed = JSON.parse(manifest) as { skills: { name: string }[] };
  if (parsed.skills.some((s) => s.name === entry.name)) throw new SkillError(`"${String(entry.name)}" is already in the manifest`, 409);
  const close = manifest.lastIndexOf("]");
  const lastBrace = manifest.lastIndexOf("}", close);
  if (close < 0 || lastBrace < 0) throw new SkillError("cannot place the entry in manifest.json");
  const body = JSON.stringify(entry, null, 2)
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
  return `${manifest.slice(0, lastBrace + 1)},\n${body}${manifest.slice(lastBrace + 1)}`;
}

export async function proposeSkill(
  req: InstallRequest,
  reserved: Set<string>,
  opts: { token: string; skillsDir?: string; base?: string },
): Promise<ProposeResult> {
  const prepared = prepareSkill(req, reserved);
  enforceAudit(prepared, req.acknowledge, "proposed");
  const repo = skillsRepo();
  if (!repo) throw new SkillError("cannot tell which repository to propose to: set GARRY_SKILLS_REPO=owner/name");

  const gh = new GitHub(opts.token);
  const base = opts.base ?? (await gh.defaultBranch(repo.owner, repo.name));
  const skillsDir = opts.skillsDir ?? "garry-skills";
  const { skill, files, audit } = prepared;
  const folder = `skills/${skill.stage}/${skill.name}`;

  const manifestPath = `${skillsDir}/manifest.json`;
  const manifest = await gh.fileText(repo.owner, repo.name, manifestPath, base);
  if (manifest === null) throw new SkillError(`no ${manifestPath} on ${base} in ${repo.owner}/${repo.name}`);
  const updated = addManifestEntry(manifest, {
    name: skill.name,
    stage: skill.stage,
    path: folder,
    summary: skill.description,
    inputs: [],
    outputs: [],
    ...(skill.dependsOn.length ? { dependsOn: skill.dependsOn } : {}),
  });

  const branch = `skills/add-${skill.name}`;
  try {
    await gh.commitToNewBranch(repo.owner, repo.name, base, branch, `skills: add ${skill.name} (${skill.stage})`, [
      ...files.map((f) => ({ path: `${skillsDir}/${folder}/${f.rel}`, content: f.data })),
      { path: manifestPath, content: Buffer.from(updated, "utf8") },
    ]);
  } catch (e) {
    if (/Reference already exists|422/.test((e as Error).message)) {
      throw new SkillError(`a proposal for "${skill.name}" already exists (branch ${branch})`, 409);
    }
    throw e;
  }

  const findings = audit.findings.length
    ? audit.findings.map((f) => `- **${f.severity}** ${f.title} (\`${f.file}:${f.line}\`): ${f.why}`).join("\n")
    : "- none";
  const body = [
    `Adds the skill **${skill.name}** to the **${skill.stage}** stage, proposed from Garry.`,
    "",
    `> ${skill.description}`,
    "",
    "### Files",
    files.map((f) => `- \`${skillsDir}/${folder}/${f.rel}\``).join("\n"),
    "",
    `### Local security audit: ${audit.verdict}`,
    findings,
    "",
    "The skill-audit check runs the audit again in CI, plus a secret scanner and Semgrep. It must be green.",
    "",
    "### Reviewer checklist",
    "- [ ] I read the whole SKILL.md and every script, not just the audit",
    "- [ ] It only does what its description says, in its own stage",
    "- [ ] No step reaches the network, secrets or files outside the service it works on without a clear reason",
    "- [ ] The skill-audit check is green",
  ].join("\n");
  const pr = await gh.openPr(repo.owner, repo.name, branch, base, `skills: add ${skill.name}`, body);
  return { ...pr, branch, skill };
}
