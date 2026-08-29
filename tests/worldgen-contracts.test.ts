import assert from "node:assert/strict";
import test from "node:test";
import { VoxelType } from "../src/world/VoxelDefinitions";
import { ProceduralStageSource, WORLD_GENERATOR_VERSION } from "../src/stages/ProceduralStageSource";

test("WorldGenerator v3 is deterministic and emits BREAK setpieces", () => {
  assert.equal(WORLD_GENERATOR_VERSION, 3);
  const first = new ProceduralStageSource({ seed: "mountain-check" }).generate();
  const same = new ProceduralStageSource({ seed: "mountain-check" }).generate();
  const different = new ProceduralStageSource({ seed: "cave-check" }).generate();

  assert.deepEqual(first.types, same.types);
  assert.notDeepEqual(first.types, different.types);
  assert.equal(first.width, 48);
  assert.equal(first.height, 32);
  assert.equal(first.depth, 48);
  assert.ok((first.metadata?.breakSetpieces ?? 0) >= 3);

  const index = (x: number, y: number, z: number) => x + first.width * (y + first.height * z);
  for (let x = 0; x < first.width; x += 1) {
    assert.equal(first.types[index(x, 0, 0)], VoxelType.Bedrock);
    assert.equal(first.types[index(x, 0, first.depth - 1)], VoxelType.Bedrock);
  }
  assert.equal(first.spawn.x > 1 && first.spawn.x < first.width - 1, true);
  assert.equal(first.spawn.z > 1 && first.spawn.z < first.depth - 1, true);
  assert.equal(first.goal.z > first.spawn.z, true);
  assert.equal(first.goal.z < first.depth - 1, true);
  assert.equal(first.metadata?.reachability?.reachable, true);
  assert.equal((first.metadata?.carverVoxels ?? 0) > 0, true);
  assert.equal((first.metadata?.trees ?? 0) + (first.metadata?.boulders ?? 0) > 0, true);
  assert.equal((first.metadata?.coinSpawns?.length ?? 0) > 0, true);
  assert.equal((first.metadata?.jigsawPieces ?? 0) > 0, true);
});

test("medium worlds receive an additional BREAK setpiece", () => {
  const medium = new ProceduralStageSource({ seed: "medium-check", size: "medium" }).generate();
  assert.equal(medium.width, 64);
  assert.equal(medium.height, 40);
  assert.equal(medium.depth, 64);
  assert.ok((medium.metadata?.breakSetpieces ?? 0) >= 4);
  assert.equal(medium.metadata?.reachability?.reachable, true);
});
