import { z } from "zod";

/** Schemas for the skills repository. manifest.json is the index the supervisor composes pipelines from. */

export const SDLC_STAGES = ["spec", "plan", "design", "implement", "review", "test", "integrate"] as const;
export type SdlcStage = (typeof SDLC_STAGES)[number];

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

/** Same frontmatter convention as Claude skills. */
export const SkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
