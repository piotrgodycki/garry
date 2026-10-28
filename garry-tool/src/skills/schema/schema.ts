import { z } from "zod";

/**
 * Schemas for the skills repository (garry-tool/skills).
 * Skills are the atomic, reusable capabilities of the agents. manifest.json is
 * the index the supervisor uses to compose a pipeline for a given feature.
 */

export const SDLC_STAGES = [
  "spec",
  "plan",
  "design",
  "implement",
  "review",
  "test",
  "integrate",
] as const;
export type SdlcStage = (typeof SDLC_STAGES)[number];

/** One entry in manifest.json, that is one atomic skill. */
export const SkillEntrySchema = z.object({
  name: z.string(),
  stage: z.enum(SDLC_STAGES),
  path: z.string(),
  summary: z.string(),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
});
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

export const SkillsManifestSchema = z.object({
  version: z.string(),
  skills: z.array(SkillEntrySchema),
});
export type SkillsManifest = z.infer<typeof SkillsManifestSchema>;

/** Frontmatter of a SKILL.md file (the same convention as Claude skills). */
export const SkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
