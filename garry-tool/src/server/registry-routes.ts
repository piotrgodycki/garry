import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { ZodError } from "zod";
import { fileRoute } from "../threads/files.js";
import { listManifests, readContracts } from "../sync/registryIO.js";
import { ServiceError, addService, removeService, type ServiceInput } from "../registry/services.js";
import { StackError, listStacks, removeStack, saveStack } from "../registry/stacks.js";
import { ArchitectureError, architectureState, checkDraft, listBoards, readArchitecture, resetArchitecture, saveArchitecture } from "../registry/architecture.js";
import { WIZARD_QUESTIONS, buildFromWizard } from "../architecture/wizard.js";
import { ArchitectureSchema, CAPABILITIES, COMPONENTS, PROVIDERS } from "../registry/schema/architecture.js";
import { ARCHITECTURE_TEMPLATES } from "../registry/schema/templates.js";
import { STACK_TEMPLATES } from "../registry/schema/stack-templates.js";
import { CATALOG, CATEGORIES, checkStack } from "../registry/schema/stacks.js";
import { aiSuggestions, quickFixes } from "../architecture/suggest.js";
import { resolveRouting, routeFor } from "../orchestrate/routing.js";
import { RoutingError, activeProfileName, defaultProfile, listProfiles, readProfile, removeProfile, saveProfile, setActiveProfile, setStageRoute } from "../orchestrate/profiles.js";
import { activeGarryProject } from "../project/store.js";
import { json, readBody, type RouteCtx } from "./http.js";

/**
 * What the registry holds, besides features: its files, the services, the
 * architecture boards, the stacks and the routing profiles. Returns false
 * when the request is about none of them.
 */
export async function registryRoutes(req: IncomingMessage, res: ServerResponse, path: string, ctx: RouteCtx): Promise<boolean | void> {
  const { cfg, local, url } = ctx;
  // The registry's own files (catalog/, contracts/, features/, stacks/): browse and edit by hand, this machine only
  const regFiles = /^\/api\/registry(\/files|\/file)$/.exec(path);
  if (regFiles) {
    mkdirSync(cfg.registry, { recursive: true });
    if (await fileRoute(req, res, regFiles[1], cfg.registry, { local, json, readBody })) return;
  }

  // Services: add one to the registry (this machine and paired devices), remove one (this machine only)
  if (req.method === "POST" && path === "/api/registry/services") {
    const body = (await readBody(req)) as ServiceInput & { replace?: boolean };
    try {
      return json(res, 200, addService(cfg.registry, body, { replace: body.replace === true }));
    } catch (e) {
      if (e instanceof ServiceError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  const delService = /^\/api\/registry\/services\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && delService) {
    if (!local) return json(res, 403, { error: "only this computer can remove services" });
    try {
      removeService(cfg.registry, decodeURIComponent(delService[1]));
      return json(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof ServiceError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }

  // Suggestions for the board: quick fixes from the rules, and with ai Garry's own (Claude Code on this computer)
  if (req.method === "POST" && path === "/api/architecture/suggest") {
    const body = (await readBody(req)) as { goal?: string; ai?: boolean; board?: unknown };
    const parsed = ArchitectureSchema.safeParse(body.board ?? readArchitecture(cfg.registry, url.searchParams.get("board") ?? ""));
    if (!parsed.success) return json(res, 400, { error: "board: not a valid architecture" });
    const services = listManifests(cfg.registry).map((m) => ({ name: m.name, kind: m.kind as string | undefined, db: m.db }));
    const fixes = quickFixes(parsed.data, services);
    if (!body.ai) return json(res, 200, { quickFixes: fixes });
    try {
      const model = routeFor(resolveRouting(cfg.routing, undefined, { registry: cfg.registry }), "design").model;
      return json(res, 200, { quickFixes: fixes, ...(await aiSuggestions(parsed.data, services, String(body.goal ?? ""), { model })) });
    } catch (e) {
      return json(res, 502, { quickFixes: fixes, error: String((e as Error).message ?? e) });
    }
  }

  // The architecture boards (the whole project's, one per repository, ?board=<repo>): save one
  // (this machine and paired devices), check a draft, build one from the wizard's answers
  // (a preview, saved by the next POST), reset one (this machine only)
  if (path === "/api/architecture" || path === "/api/architecture/check" || path === "/api/architecture/wizard") {
    const board = url.searchParams.get("board") ?? "";
    try {
      if (req.method === "DELETE" && path === "/api/architecture") {
        if (!local) return json(res, 403, { error: "a board is reset on the computer running Garry" });
        resetArchitecture(cfg.registry, board);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (path === "/api/architecture/check") return json(res, 200, { issues: checkDraft(cfg.registry, body) });
        if (path === "/api/architecture/wizard") {
          const services = listManifests(cfg.registry).map((m) => ({ name: m.name, kind: m.kind as string | undefined, db: m.db }));
          const architecture = buildFromWizard((body as { answers?: unknown }).answers, services);
          return json(res, 200, { architecture, issues: checkDraft(cfg.registry, architecture) });
        }
        return json(res, 200, saveArchitecture(cfg.registry, body, board));
      }
    } catch (e) {
      if (e instanceof ArchitectureError) return json(res, e.status, { error: e.message });
      if (e instanceof ZodError) return json(res, 400, { error: e.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("; ") });
      throw e;
    }
  }

  // Stacks: save one (this machine and paired devices), check a draft, remove one (this machine only)
  if (req.method === "POST" && path === "/api/stacks/check") {
    const body = (await readBody(req)) as { technologies?: string[] };
    return json(res, 200, { issues: checkStack(Array.isArray(body.technologies) ? body.technologies.map(String) : []) });
  }
  if (req.method === "POST" && path === "/api/stacks") {
    const body = (await readBody(req)) as { replace?: boolean };
    try {
      return json(res, 200, saveStack(cfg.registry, body, { replace: body.replace === true }));
    } catch (e) {
      if (e instanceof StackError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  const delStack = /^\/api\/stacks\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && delStack) {
    if (!local) return json(res, 403, { error: "only this computer can remove stacks" });
    try {
      removeStack(cfg.registry, decodeURIComponent(delStack[1]));
      return json(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof StackError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }

  // Routing profiles: default (Garry's values until changed) and your own (routing/<name>.json in the registry)
  if (req.method === "POST" && path === "/api/routing") {
    // one stage (or "defaults") of a profile: the active one unless named
    const body = (await readBody(req)) as { profile?: string; stage?: string; model?: string; agent?: string };
    if (!body.stage || (!body.model && !body.agent)) return json(res, 400, { error: "stage and a model or an agent are required" });
    try {
      const p = setStageRoute(cfg.registry, body.profile ?? activeProfileName(cfg.registry), body.stage, { model: body.model, agent: body.agent }, cfg.routing);
      return json(res, 200, p);
    } catch (e) {
      if (e instanceof RoutingError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  if (req.method === "POST" && (path === "/api/routings" || path === "/api/routings/active")) {
    const body = (await readBody(req)) as { name?: string; replace?: boolean };
    try {
      if (path === "/api/routings/active") {
        setActiveProfile(cfg.registry, String(body.name ?? ""));
        return json(res, 200, listProfiles(cfg.registry, cfg.routing));
      }
      return json(res, 200, saveProfile(cfg.registry, body, { replace: body.replace === true, legacyFile: cfg.routing }));
    } catch (e) {
      if (e instanceof RoutingError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  const delRouting = /^\/api\/routings\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && delRouting) {
    if (!local) return json(res, 403, { error: "only this computer can remove routing profiles" });
    try {
      removeProfile(cfg.registry, decodeURIComponent(delRouting[1]));
      return json(res, 200, listProfiles(cfg.registry, cfg.routing));
    } catch (e) {
      if (e instanceof RoutingError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }

  if (req.method !== "GET") return false;
  if (path === "/api/architecture") {
    const board = url.searchParams.get("board") ?? "";
    const repos = cfg.threads!.store.projectsOf(activeGarryProject().id).map((r) => r.name);
    try {
      return json(res, 200, { ...architectureState(cfg.registry, board), board, boards: listBoards(cfg.registry, repos), components: COMPONENTS, capabilities: CAPABILITIES, providers: PROVIDERS, templates: ARCHITECTURE_TEMPLATES, wizard: WIZARD_QUESTIONS });
    } catch (e) {
      if (e instanceof ArchitectureError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  if (path === "/api/stacks") return json(res, 200, { stacks: listStacks(cfg.registry), catalog: CATALOG, categories: CATEGORIES, templates: STACK_TEMPLATES });
  if (path === "/api/registry") {
    return json(res, 200, { services: listManifests(cfg.registry), contracts: readContracts(cfg.registry) });
  }
  if (path === "/api/routing") {
    // the active profile, in the shape the routing matrix always had
    return json(res, 200, readProfile(cfg.registry, activeProfileName(cfg.registry), cfg.routing) ?? defaultProfile(cfg.routing));
  }
  if (path === "/api/routings") return json(res, 200, listProfiles(cfg.registry, cfg.routing));
  return false;
}
