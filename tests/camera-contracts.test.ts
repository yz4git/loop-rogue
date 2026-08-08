import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { GAME_CONFIG } from "../src/core/Settings";
import { CameraCollisionSolver } from "../src/camera/CameraCollisionSolver";
import { CameraController } from "../src/camera/CameraController";
import { VoxelWorld } from "../src/world/VoxelWorld";
import { VoxelType } from "../src/world/VoxelDefinitions";
import { createStageArray, setStageVoxel, type StageSnapshot, type StageSource } from "../src/stages/StageSource";

class CameraTestStage implements StageSource {
  readonly id = "camera-test";

  generate(): StageSnapshot {
    const width = 8;
    const height = 8;
    const depth = 8;
    const types = createStageArray(width, height, depth);
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        setStageVoxel(types, width, height, depth, x, 0, z, VoxelType.Soil);
      }
    }
    setStageVoxel(types, width, height, depth, 1, 2, 2, VoxelType.Rock);
    return {
      width,
      height,
      depth,
      types,
      spawn: { x: 2.5, y: 1, z: 2.5 },
      goal: { x: 6.5, y: 1, z: 6.5 },
    };
  }
}

test("third person camera uses the close exploration defaults", () => {
  assert.equal(GAME_CONFIG.camera.baseDistance, 7);
  assert.equal(GAME_CONFIG.camera.minDistance, 1.35);
  assert.equal(GAME_CONFIG.camera.maxDistance, 8);
  assert.equal(GAME_CONFIG.camera.cameraCollisionRadius, 0.35);
  assert.ok(GAME_CONFIG.camera.pitchSensitivity < GAME_CONFIG.camera.yawSensitivity);
});

test("voxel camera collision stops before a solid cell", () => {
  const world = new VoxelWorld(new CameraTestStage());
  const solver = new CameraCollisionSolver(world);
  const target = new THREE.Vector3(2.5, 2.5, 2.5);
  const desired = new THREE.Vector3(0.5, 2.5, 2.5);
  const resolved = new THREE.Vector3();
  const distance = solver.resolve(target, desired, GAME_CONFIG.camera.cameraCollisionRadius, resolved);
  assert.ok(distance < target.distanceTo(desired));
  assert.ok(resolved.x > 1.25);
  world.dispose();
});

test("camera recenter remains a numeric orbit helper", () => {
  const world = new VoxelWorld(new CameraTestStage());
  const camera = new THREE.PerspectiveCamera();
  const controller = new CameraController(camera, world);
  const point = controller.getPosition(
    { x: 0, y: 0, z: 0 },
    { yaw: Math.PI, pitch: 0, distance: 7 },
  );
  assert.equal(Math.round(point.z * 100) / 100, -7);
  world.dispose();
});
