import test from "node:test";
import assert from "node:assert/strict";
import { ProceduralStageSource } from "../src/stages/ProceduralStageSource";
import { validateWorldgenSeeds } from "../src/worldgen/BatchValidation";

test("100 deterministic small worlds remain valid", () => {
  const seeds = Array.from({ length: 100 }, (_, index) => `stress-${index}`);
  const report = validateWorldgenSeeds(seeds, (seed) => new ProceduralStageSource({ seed }).generate());
  assert.equal(report.count, 100);
  assert.deepEqual(report.failures, []);
});
