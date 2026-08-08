import test from "node:test";
import assert from "node:assert/strict";
import { ProceduralStageSource } from "../src/stages/ProceduralStageSource";
import { validateWorldgenSeeds } from "../src/worldgen/BatchValidation";

test("3 deterministic small worlds remain valid", () => {
  const seeds = Array.from({ length: 3 }, (_, index) => `stress-${index}`);
  const report = validateWorldgenSeeds(seeds, (seed) => new ProceduralStageSource({ seed }).generate());
  assert.equal(report.count, 3);
  assert.deepEqual(report.failures, []);
});
