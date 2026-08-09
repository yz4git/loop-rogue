import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import {
  isEntityOccluded,
  isFaceFacingCamera,
  projectWorldPoint,
  sortActiveFaces,
  type CanvasPreviewFace,
} from "../src/rendering/Canvas3DPreviewRenderer";

const cameraPosition = new THREE.Vector3(0, 0, 5);
const forward = new THREE.Vector3(0, 0, -1);
const right = new THREE.Vector3(1, 0, 0);
const up = new THREE.Vector3(0, 1, 0);

test("Canvas 3D projection places a camera-facing point near screen center", () => {
  const projected = projectWorldPoint(
    new THREE.Vector3(0, 0, 0),
    cameraPosition,
    forward,
    right,
    up,
    400,
    300,
    60,
  );
  assert.ok(projected);
  if (!projected) throw new Error("center projection unexpectedly returned null");
  assert.ok(Math.abs(projected.x - 200) < 0.001);
  assert.ok(Math.abs(projected.y - 150) < 0.001);
});

test("Canvas 3D projection rejects points behind the camera", () => {
  const projected = projectWorldPoint(
    new THREE.Vector3(0, 0, 10),
    cameraPosition,
    forward,
    right,
    up,
    400,
    300,
    60,
  );
  assert.equal(projected, null);
});

test("Canvas 3D back-face culling keeps only faces directed at the camera", () => {
  const faceCenter = new THREE.Vector3(0, 0, 0);
  assert.equal(isFaceFacingCamera([0, 0, 1], faceCenter, cameraPosition), true);
  assert.equal(isFaceFacingCamera([0, 0, -1], faceCenter, cameraPosition), false);
});

test("Canvas 3D face sorting ignores stale records outside the active face count", () => {
  const activeNear: CanvasPreviewFace = { points: [], depth: 1, color: "#111" };
  const activeFar: CanvasPreviewFace = { points: [], depth: 3, color: "#222" };
  const stale: CanvasPreviewFace = { points: [], depth: 999, color: "#old" };
  const faces = [activeNear, activeFar, stale];
  const sorted: CanvasPreviewFace[] = [stale];
  const activeCount = sortActiveFaces(faces, 2, sorted);
  assert.equal(activeCount, 2);
  assert.equal(sorted.length, 2);
  assert.strictEqual(sorted[0], activeFar);
  assert.strictEqual(sorted[1], activeNear);
  assert.ok(!sorted.some((face) => face === stale));
});

test("Canvas 3D entity occlusion detects a solid voxel between camera and entity", () => {
  const wall = new Set(["1,0,0"]);
  const world = {
    isSolidAt: (x: number, y: number, z: number) => wall.has(`${x},${y},${z}`),
  };
  const entity = new THREE.Vector3(3.5, 0.5, 0.5);
  const camera = new THREE.Vector3(0.5, 0.5, 0.5);
  assert.equal(isEntityOccluded(world, camera, entity, 0.35), true);
  wall.clear();
  assert.equal(isEntityOccluded(world, camera, entity, 0.35), false);
});

test("Canvas fallback query flags and WebGL diagnostics remain wired", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /search\.get\("renderer"\) === "canvas3d"/);
  assert.match(page, /search\.get\("preview3d"\) === "1"/);
  assert.match(page, /new Canvas3DPreviewDemo/);
  assert.match(page, /console\.error\("\[Voxel Break Lab\] WebGL initialization failed;/);
});
