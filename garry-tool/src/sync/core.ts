import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { readManifest, readContracts, type Contracts, type Manifest } from "./registryIO.js";
import { computeSlice } from "./slice.js";
import { generateContractTypes } from "./codegen.js";

/** Reads the registry, computes the slice for one service and writes it into the repo. */
export function syncService(repo: string, registry: string, service: string): string[] {
  const manifest = readManifest(registry, service);
  const contracts = readContracts(registry);
  const slice = computeSlice(manifest, contracts);
  return writeSlice(repo, manifest, slice);
}

function writeSlice(repo: string, manifest: Manifest, slice: Contracts): string[] {
  const written: string[] = [];
  const contractsDir = join(repo, ".garry", "contracts");
  mkdirSync(contractsDir, { recursive: true });

  const writeJson = (name: string, data: unknown) => {
    writeFileSync(join(contractsDir, name), JSON.stringify(data, null, 2) + "\n");
    written.push(`contracts/${name}`);
  };

  if (slice.remotes) writeJson("remotes.json", slice.remotes);
  if (slice.sharedDeps) writeJson("shared-deps.json", slice.sharedDeps);
  if (slice.designTokens) writeJson("design-tokens.json", slice.designTokens);
  if (slice.events) writeJson("events.json", slice.events);

  const typesDir = join(repo, ".garry", "types");
  mkdirSync(typesDir, { recursive: true });
  writeFileSync(join(typesDir, "contracts.d.ts"), generateContractTypes(manifest, slice));
  written.push("types/contracts.d.ts");

  return written;
}
