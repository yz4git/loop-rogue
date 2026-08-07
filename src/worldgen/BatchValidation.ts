import type { StageSnapshot } from "../stages/StageSource";

export interface BatchValidationReport {
  count: number;
  failures: string[];
  averageMs: number;
  maxMs: number;
}

export function validateWorldgenSeeds(seeds: readonly string[], generate: (seed: string) => StageSnapshot): BatchValidationReport {
  const failures: string[] = [];
  let totalMs = 0;
  let maxMs = 0;
  for (const seed of seeds) {
    const started = performance.now();
    try {
      const snapshot = generate(seed);
      const reachable = snapshot.metadata?.reachability?.reachable === true;
      if (!reachable || snapshot.types.length !== snapshot.width * snapshot.height * snapshot.depth) failures.push(seed);
    } catch {
      failures.push(seed);
    }
    const elapsed = performance.now() - started;
    totalMs += elapsed;
    maxMs = Math.max(maxMs, elapsed);
  }
  return { count: seeds.length, failures, averageMs: seeds.length ? totalMs / seeds.length : 0, maxMs };
}
