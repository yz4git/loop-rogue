import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { GAME_CONFIG } from "../src/core/Settings";
import { VoxelWorld } from "../src/world/VoxelWorld";
import { VoxelType } from "../src/world/VoxelDefinitions";
import { ProceduralStageSource, WORLD_GENERATOR_VERSION } from "../src/stages/ProceduralStageSource";
import { createStageArray, setStageVoxel, type StageSnapshot, type StageSource } from "../src/stages/StageSource";
import { VoxelPlayerCollision } from "../src/player/VoxelPlayerCollision";
import { DestructionSystem } from "../src/destruction/DestructionSystem";

class CollisionTestStage implements StageSource {
  readonly id = "collision-test";

  generate(): StageSnapshot {
    const width = 8;
    const height = 8;
    const depth = 8;
    const types = createStageArray(width, height, depth);
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) setStageVoxel(types, width, height, depth, x, 0, z, VoxelType.Soil);
    }
    // 足元の隣にある1ボクセル段差。接触前は床として誤認してはいけない。
    setStageVoxel(types, width, height, depth, 4, 1, 3, VoxelType.Rock);
    return {
      width,
      height,
      depth,
      types,
      spawn: { x: 3.5, y: 1, z: 3.5 },
      goal: { x: 6.5, y: 1, z: 6.5 },
    };
  }
}
function damage(
  world: VoxelWorld,
  center: THREE.Vector3,
  radius: number,
  maxVoxels = GAME_CONFIG.destruction.maxPunchVoxels,
) {
  return new DestructionSystem(world).damageArea({
    center,
    radius,
    maxVoxels,
    source: "punch",
  });
}


test("ボクセルワールドはTypedArrayと16立方体チャンクで構成される", () => {
  const world = new VoxelWorld();
  assert.equal(world.chunkCount, 18);
  assert.equal(GAME_CONFIG.world.chunkSize, 16);
  assert.equal(world.getType(0, 0, 0), VoxelType.Bedrock);
  assert.equal(world.getType(10, 10, 10) !== VoxelType.Empty, true);
  world.dispose();
});

test("破壊は周辺ボクセルだけを変更し、再生成キューを作る", () => {
  const world = new VoxelWorld();
  world.processRebuildQueue(100);
  const result = damage(world, new THREE.Vector3(10.5, 10.5, 10.5), 1.7);
  assert.ok(result.damagedVoxels > 0);
  assert.ok(result.destroyed > 0);
  assert.ok(result.dirtyChunks >= 1);
  assert.ok(result.dirtyChunks <= 8);
  world.dispose();
});

test("境界の岩盤は壊れず、専用判定を返す", () => {
  const world = new VoxelWorld();
  world.processRebuildQueue(100);
  const result = damage(world, new THREE.Vector3(0.5, 0.5, 0.5), 1.2);
  assert.equal(result.bedrockHit, true);
  assert.equal(world.getType(0, 0, 0), VoxelType.Bedrock);
  world.dispose();
});

test("地下ゴールは深度と掘削の進行条件を持つ", () => {
  const world = new VoxelWorld();
  assert.equal(GAME_CONFIG.goal.position.z, 34.5);
  assert.equal(GAME_CONFIG.goal.requiredDepth >= 20, true);
  assert.equal(GAME_CONFIG.goal.requiredDestroyed >= 10, true);
  assert.equal(world.getType(24, 10, 34), VoxelType.Empty);
  assert.equal(world.getType(20, 10, 15) !== VoxelType.Empty, true);
  assert.equal(typeof damage(world, new THREE.Vector3(20.5, 10.5, 15.5), 0.5).oreDestroyed, "number");
  world.dispose();
});

test("破壊結果は鉱石報酬数を返す", () => {
  const world = new VoxelWorld();
  const result = damage(world, new THREE.Vector3(24.5, 10.5, 10.5), 1.7);
  assert.equal(result.oreDestroyed >= 0, true);
  assert.equal(Array.isArray(result.orePoints), true);
  world.dispose();
});

test("パンチとジャンプの操作感設定は見た目に余裕を持つ", () => {
  assert.equal(GAME_CONFIG.destruction.punchRange >= 2.7, true);
  assert.equal(GAME_CONFIG.destruction.punchRadius >= 1.9, true);
  assert.equal(GAME_CONFIG.player.jumpVelocity > 7, true);
  assert.equal(GAME_CONFIG.enemies.knockback > 0.85, true);
});

test("接地判定は足裏と重なるセルだけを使い、隣の段差で浮かない", () => {
  const world = new VoxelWorld(new CollisionTestStage());
  const beforeStep = new THREE.Vector3(3.5, 1, 3.5);
  assert.equal(world.findSupportY(beforeStep, 0.32, 1.4, 0.24), 1);
  const touchingButNotOverlapping = new THREE.Vector3(3.67, 1, 3.5);
  assert.equal(world.findSupportY(touchingButNotOverlapping, 0.32, 1.4, 0.24), 1);
  world.dispose();
});

test("高所では吸着せず、床まで連続して落下する", () => {
  const world = new VoxelWorld(new CollisionTestStage());
  const collision = new VoxelPlayerCollision(world, 0.32, 1.4, 0.2, 0.24, 0.08);
  const position = new THREE.Vector3(2.5, 4, 2.5);
  let velocityY = 0;
  let previousY = position.y;
  let landed = false;
  for (let frame = 0; frame < 180; frame += 1) {
    velocityY = Math.max(-18, velocityY - 18 / 60);
    const result = collision.moveVertical(position, velocityY / 60);
    assert.ok(position.y <= previousY + 0.0001);
    previousY = position.y;
    if (result.landed) {
      landed = true;
      break;
    }
  }
  assert.equal(landed, true);
  assert.equal(position.y, 1);
  world.dispose();
});

test("水平移動の衝突確認は足元Y座標を変更せず、段差前で浮かない", () => {
  const world = new VoxelWorld(new CollisionTestStage());
  const collision = new VoxelPlayerCollision(world, 0.32, 1.4, 0.2, 0.24, 0.08);
  const flatPosition = new THREE.Vector3(1.5, 1, 2.5);
  let grounded = true;
  for (let frame = 0; frame < 120; frame += 1) {
    grounded = collision.moveHorizontal(flatPosition, 0.025, 0, grounded);
    assert.equal(flatPosition.y, 1);
  }
  assert.equal(grounded, true);

  const stepPosition = new THREE.Vector3(3.5, 1, 3.5);
  for (let frame = 0; frame < 30; frame += 1) {
    collision.moveHorizontal(stepPosition, 0.025, 0, true);
    assert.equal(stepPosition.y, 1);
  }
  assert.ok(stepPosition.x < 3.7);
  world.dispose();
});

test("実ゲームと同じ衝突処理でジャンプ弧を描き、元の床へ着地する", () => {
  const world = new VoxelWorld(new CollisionTestStage());
  const collision = new VoxelPlayerCollision(world, 0.32, 1.4, 0.2, 0.24, 0.08);
  const position = new THREE.Vector3(2.5, 1, 2.5);
  let velocityY = GAME_CONFIG.player.jumpVelocity;
  let maximumY = position.y;
  let landedFrame = -1;
  for (let frame = 0; frame < 180; frame += 1) {
    velocityY = Math.max(-GAME_CONFIG.player.maxFallSpeed, velocityY - GAME_CONFIG.player.gravity / 60);
    const result = collision.moveVertical(position, velocityY / 60);
    maximumY = Math.max(maximumY, position.y);
    if (result.hitCeiling) velocityY = 0;
    if (result.landed) {
      landedFrame = frame;
      break;
    }
  }
  assert.ok(maximumY > 3.3 && maximumY < 3.7);
  assert.ok(landedFrame >= 55 && landedFrame <= 75);
  assert.equal(position.y, 1);
  world.dispose();
});

test("ランダム地形は同じシードで再現され、異なるシードで変化する", () => {
  assert.equal(WORLD_GENERATOR_VERSION, 2);
  const first = new ProceduralStageSource({ seed: "mountain-check" }).generate();
  const same = new ProceduralStageSource({ seed: "mountain-check" }).generate();
  const different = new ProceduralStageSource({ seed: "cave-check" }).generate();
  assert.deepEqual(first.types, same.types);
  assert.notDeepEqual(first.types, different.types);
  assert.equal(first.width, 48);
  assert.equal(first.height, 32);
  assert.equal(first.depth, 48);
  const medium = new ProceduralStageSource({ seed: "medium-check", size: "medium" }).generate();
  assert.equal(medium.width, 64);
  assert.equal(medium.height, 40);
  assert.equal(medium.depth, 64);
});

test("ランダム地形は外周を岩盤で守り、開始地点とゴールを範囲内に置く", () => {
  const stage = new ProceduralStageSource({ seed: "spawn-check" }).generate();
  const index = (x: number, y: number, z: number) => x + stage.width * (y + stage.height * z);
  for (let x = 0; x < stage.width; x += 1) {
    assert.equal(stage.types[index(x, 0, 0)], VoxelType.Bedrock);
    assert.equal(stage.types[index(x, 0, stage.depth - 1)], VoxelType.Bedrock);
  }
  assert.equal(stage.spawn.x > 1 && stage.spawn.x < stage.width - 1, true);
  assert.equal(stage.spawn.z > 1 && stage.spawn.z < stage.depth - 1, true);
  assert.equal(stage.goal.z > stage.spawn.z, true);
  assert.equal(stage.goal.z < stage.depth - 1, true);
  assert.equal(stage.metadata?.reachability?.reachable, true);
  assert.equal((stage.metadata?.carverVoxels ?? 0) > 0, true);
  assert.equal((stage.metadata?.trees ?? 0) + (stage.metadata?.boulders ?? 0) > 0, true);
  assert.equal((stage.metadata?.coinSpawns?.length ?? 0) > 0, true);
  assert.equal((stage.metadata?.jigsawPieces ?? 0) > 0, true);
});
