import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBuiltinSkills, loadSkills } from "../orchestrate/skillsManifest.js";
import { SkillError, installSkill, listLocalSkills, localSkillsDir, readLocalSkillMd, removeSkill, skillsPolicy, type InstallRequest } from "../skills/local.js";
import { AUDIT_RULES, auditFiles, readSkillFolder } from "../skills/audit.js";
import { proposeSkill, skillsRepo } from "../skills/propose.js";
import { githubToken } from "../github/env.js";
import { json, readBody, type RouteCtx } from "./http.js";

/** The skills: list, install, propose to the team, remove, read one, its audit. Returns false for anything else. */
export async function skillRoutes(req: IncomingMessage, res: ServerResponse, path: string, ctx: RouteCtx): Promise<boolean | void> {
  const { cfg } = ctx;
  // Skills: install a local skill (upload or folder), remove one, read its instructions
  if (req.method === "POST" && path === "/api/skills/install") {
    const body = (await readBody(req)) as InstallRequest;
    try {
      const reserved = new Set(loadBuiltinSkills(cfg.skills).map((sk) => sk.name));
      return json(res, 200, installSkill(body, reserved));
    } catch (e) {
      if (e instanceof SkillError) return json(res, e.status, { error: e.message, audit: e.audit });
      throw e;
    }
  }
  // Propose a skill to the team: a pull request that the skill-audit workflow and a reviewer must pass
  if (req.method === "POST" && path === "/api/skills/propose") {
    const body = (await readBody(req)) as InstallRequest;
    const token = githubToken();
    if (!token) return json(res, 400, { error: "set GARRY_GITHUB_TOKEN in .env.local to open pull requests" });
    try {
      const reserved = new Set(loadBuiltinSkills(cfg.skills).map((sk) => sk.name));
      return json(res, 200, await proposeSkill(body, reserved, { token }));
    } catch (e) {
      if (e instanceof SkillError) return json(res, e.status, { error: e.message, audit: e.audit });
      throw e;
    }
  }
  const delSkill = /^\/api\/skills\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && delSkill) {
    try {
      removeSkill(decodeURIComponent(delSkill[1]));
      return json(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof SkillError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  if (req.method === "GET" && path === "/api/skills/audit-rules") return json(res, 200, { rules: AUDIT_RULES });
  const skillAudit = /^\/api\/skills\/([^/]+)\/audit$/.exec(path);
  if (req.method === "GET" && skillAudit) {
    const name = decodeURIComponent(skillAudit[1]);
    const local = listLocalSkills().find((sk) => sk.name === name);
    if (local) return json(res, 200, { name, source: "local", audit: local.audit });
    const raw = JSON.parse(readFileSync(join(cfg.skills, "manifest.json"), "utf8")) as { skills: { name: string; path?: string }[] };
    const entry = raw.skills.find((sk) => sk.name === name);
    if (!entry) return json(res, 404, { error: `no skill ${name}` });
    const folder = entry.path ? join(cfg.skills, entry.path) : "";
    if (!folder || !existsSync(join(folder, "SKILL.md"))) return json(res, 200, { name, source: "builtin", audit: null });
    return json(res, 200, { name, source: "builtin", audit: auditFiles(readSkillFolder(folder)) });
  }
  const skillDoc = /^\/api\/skills\/([^/]+)\/doc$/.exec(path);
  if (req.method === "GET" && skillDoc) {
    const name = decodeURIComponent(skillDoc[1]);
    const local = readLocalSkillMd(name);
    if (local !== null) return json(res, 200, { name, source: "local", doc: local });
    const raw = JSON.parse(readFileSync(join(cfg.skills, "manifest.json"), "utf8")) as { skills: { name: string; path?: string }[] };
    const entry = raw.skills.find((sk) => sk.name === name);
    const md = entry?.path ? join(cfg.skills, entry.path, "SKILL.md") : "";
    if (!entry) return json(res, 404, { error: `no skill ${name}` });
    return json(res, 200, { name, source: "builtin", doc: md && existsSync(md) ? readFileSync(md, "utf8") : null });
  }

  if (req.method === "GET" && path === "/api/skills") {
    const repo = skillsRepo();
    return json(res, 200, {
      skills: loadSkills(cfg.skills),
      localDir: localSkillsDir(),
      policy: skillsPolicy(),
      propose: { repo: repo ? `${repo.owner}/${repo.name}` : null, ready: Boolean(githubToken() && repo) },
    });
  }
  return false;
}
