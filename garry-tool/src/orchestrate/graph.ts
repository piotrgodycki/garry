import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface ServiceNode {
  name: string;
  consumes: string[];
}

/** Loads the services of a feature with their consume edges, limited to the feature set. */
export function loadServices(registry: string, names: string[]): ServiceNode[] {
  return names.map((n) => {
    const file = join(registry, "catalog", `${n}.yaml`);
    if (!existsSync(file)) return { name: n, consumes: [] };
    const fm = (parseYaml(readFileSync(file, "utf8")) ?? {}) as { consumes?: Record<string, string[]> };
    const consumes = Object.keys(fm.consumes ?? {}).filter((c) => names.includes(c));
    return { name: n, consumes };
  });
}

/**
 * Delegation order, contract first: a service that consumes X depends on X, so X
 * is delegated first (the producer before the consumer). Cycles are tolerated and
 * produce a deterministic linearization.
 */
export function delegationOrder(nodes: ServiceNode[]): string[] {
  const byName = new Map(nodes.map((n) => [n.name, n] as const));
  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (n: ServiceNode) => {
    if (seen.has(n.name)) return;
    seen.add(n.name);
    for (const dep of n.consumes) {
      const d = byName.get(dep);
      if (d) visit(d);
    }
    order.push(n.name);
  };
  for (const n of nodes) visit(n);
  return order;
}
