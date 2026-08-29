import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { GAME_CONFIG } from "../src/core/Settings";
import { PlayerCombat } from "../src/combat/PlayerCombat";
import { DestructionSystem } from "../src/destruction/DestructionSystem";
import { EnemyManager } from "../src/enemies/EnemyManager";
import { GameSession } from "../src/game/GameSession";
import { PlayerController } from "../src/player/PlayerController";
import { VoxelPlayerCollision } from "../src/player/VoxelPlayerCollision";
import { VoxelWorld } from "../src/world/VoxelWorld";

test("PlayerController owns jump state and rises from the snapped floor", () => {
  const world = new VoxelWorld();
  const player = new THREE.Group();
  player.position.set(world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z);
  const collision = new VoxelPlayerCollision(
    world,
    GAME_CONFIG.player.radius,
    GAME_CONFIG.player.height,
    GAME_CONFIG.player.stepHeight,
    GAME_CONFIG.player.groundSnapDistance,
    GAME_CONFIG.player.groundProbeDistance,
  );
  const controller = new PlayerController(player, world, collision);
  assert.equal(controller.snapToGround(true), true);
  const groundedY = player.position.y;
  controller.requestJump();
  assert.equal(controller.velocityY, GAME_CONFIG.player.jumpVelocity);
  controller.update(1 / 60, 0);
  assert.ok(player.position.y > groundedY);
  world.dispose();
});

test("PlayerCombat separates airborne ground-pound command from punch cooldown", () => {
  const world = new VoxelWorld();
  const player = new THREE.Group();
  let groundPounds = 0;
  const combat = new PlayerCombat(player, world, new THREE.Raycaster(), [], {
    onEnemyHit: () => undefined,
    onTerrainHit: () => undefined,
    onGroundPoundStart: () => { groundPounds += 1; },
    onMessage: () => undefined,
    playPunchSound: () => undefined,
    playGroundPoundSound: () => undefined,
  });
  combat.punch(false);
  combat.punch(false);
  assert.equal(groundPounds, 1);
  assert.equal(combat.isGroundPoundActive, true);
  combat.finishGroundPound();
  assert.equal(combat.isGroundPoundActive, false);
  world.dispose();
});

test("DestructionSystem is the runtime entry point for voxel damage", () => {
  const world = new VoxelWorld();
  world.processRebuildQueue(100);
  const destruction = new DestructionSystem(world);
  const result = destruction.damageArea({
    center: new THREE.Vector3(10.5, 10.5, 10.5),
    radius: 1.7,
    maxVoxels: GAME_CONFIG.destruction.maxPunchVoxels,
    source: "punch",
  });
  assert.equal(result.source, "punch");
  assert.ok(result.damagedVoxels > 0);
  assert.ok(result.dirtyChunks > 0);
  world.dispose();
});

test("EnemyManager replenishes regular enemies as depth danger rises", () => {
  const world = new VoxelWorld();
  const scene = new THREE.Scene();
  const player = new THREE.Group();
  player.position.set(world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z);
  const manager = new EnemyManager(scene, world, {
    onPlayerContact: () => undefined,
    onEnemyDamaged: () => undefined,
  });
  manager.reset();
  for (const enemy of manager.enemies) enemy.mesh.visible = false;
  manager.setDanger(2, 5);
  manager.update(4, player);
  assert.ok(manager.activeCount >= 7);
  manager.dispose();
  world.dispose();
});

test("GameSession is authoritative for damage, rewards, and stage state", () => {
  const session = new GameSession(10);
  session.damage(3);
  session.recordDestructionReward(2, 1, 100);
  session.recordEnemyDefeat(200);
  assert.equal(session.state.hp, 7);
  assert.equal(session.state.destroyed, 2);
  assert.equal(session.state.enemiesDefeated, 1);
  assert.ok(session.state.coins >= 25);
  session.clear();
  assert.equal(session.state.state, "cleared");
  session.reset();
  assert.equal(session.state.state, "playing");
  assert.equal(session.state.destroyed, 0);
});

test("composition root and procedural source use the migrated runtime boundaries", () => {
  const demo = readFileSync(new URL("../src/core/VoxelDemo.ts", import.meta.url), "utf8");
  const procedural = readFileSync(new URL("../src/stages/ProceduralStageSource.ts", import.meta.url), "utf8");
  assert.match(demo, /GameRuntime/);
  assert.doesNotMatch(demo, /destroySphere/);
  assert.doesNotMatch(demo, /enemyManager\.update/);
  assert.match(procedural, /new WorldGenerator/);
  assert.doesNotMatch(procedural, /new ValueNoise/);
  assert.ok(procedural.split("\n").length < 60);
});


test("EnemyManager recycles a defeated boss slot back into the reinforcement pool", () => {
  const world = new VoxelWorld();
  const scene = new THREE.Scene();
  const player = new THREE.Group();
  player.position.set(world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z);
  const manager = new EnemyManager(scene, world, {
    onPlayerContact: () => undefined,
    onEnemyDamaged: () => undefined,
  });
  manager.reset();
  manager.setDanger(2, 5);
  const bossPoint = new THREE.Vector3(world.goalPoint.x, world.goalPoint.y, world.goalPoint.z);
  const boss = manager.spawnBoss(bossPoint, 5);
  assert.ok(boss);
  if (!boss) throw new Error("boss slot was unavailable");
  const result = manager.damage(boss, player.position, boss.mesh.position.clone(), boss.maxHp + 10, 1);
  assert.equal(result?.defeated, true);
  assert.equal(result?.boss, true);
  assert.equal(boss.boss, false);
  assert.notEqual(boss.type, "boss");
  assert.equal(boss.mesh.visible, false);
  manager.update(4, player);
  assert.ok(manager.activeCount >= 7);
  manager.dispose();
  world.dispose();
});

test("goal contact cannot bypass the RunDirector boss progression gate", () => {
  const runtime = readFileSync(new URL("../src/core/GameRuntime.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runtime, /maybeSpawnBoss\(true\)/);
  assert.doesNotMatch(runtime, /maybeSpawnBoss\(force/);
  assert.match(runtime, /BOSS LOCK/);
});


test("EnemyManager creates an immediate reinforcement surge on a new depth tier", () => {
  const world = new VoxelWorld();
  const scene = new THREE.Scene();
  const player = new THREE.Group();
  player.position.set(world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z);
  const manager = new EnemyManager(scene, world, {
    onPlayerContact: () => undefined,
    onEnemyDamaged: () => undefined,
  });
  manager.reset();
  manager.setDanger(1.35, 2);
  const before = manager.activeCount;
  const spawned = manager.triggerDepthSurge(player.position, 2);
  assert.ok(spawned >= 1);
  assert.ok(manager.activeCount > before);
  assert.ok(manager.activeCount <= GAME_CONFIG.enemies.maxActive);
  manager.dispose();
  world.dispose();
});

test("GameRuntime turns depth-tier changes into visible danger surges", () => {
  const runtime = readFileSync(new URL("../src/core/GameRuntime.ts", import.meta.url), "utf8");
  assert.match(runtime, /triggerDepthSurge/);
  assert.match(runtime, /DANGER SURGE/);
  assert.match(runtime, /lastDepthTier/);
});


test("runtime exposes close-camera avatar fallback and shared contact grace", () => {
  const runtime = readFileSync(new URL("../src/core/GameRuntime.ts", import.meta.url), "utf8");
  const demo = readFileSync(new URL("../src/core/VoxelDemo.ts", import.meta.url), "utf8");
  const enemies = readFileSync(new URL("../src/enemies/EnemyManager.ts", import.meta.url), "utf8");
  assert.match(runtime, /cameraDistance/);
  assert.match(demo, /cameraDistance >= 1\.2/);
  assert.match(enemies, /playerContactCooldown/);
  assert.match(enemies, /1\.35/);
});
