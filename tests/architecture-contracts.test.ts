import assert from "node:assert/strict";
import test from "node:test";
import { VoxelStorage } from "../src/world/VoxelStorage";
import { GameSession } from "../src/game/GameSession";
import { normalizeInputState } from "../src/input/InputState";

test("architecture boundaries keep storage, session, and input independently testable", () => {
  const storage = new VoxelStorage(4, 4, 4);
  storage.set(1, 2, 3, 7, 2);
  assert.equal(storage.get(1, 2, 3), 7);
  assert.equal(storage.get(-1, 0, 0), 0);

  const session = new GameSession(10);
  session.addCoin(2);
  session.recordDestruction(3, 30);
  assert.equal(session.state.coins, 2);
  assert.equal(session.state.destroyed, 3);

  const input = normalizeInputState({
    moveX: 1,
    moveY: 1,
    cameraX: 0,
    cameraY: 0,
    jumpPressed: false,
    punchPressed: false,
    groundPoundRequested: false,
  });
  assert.equal(Math.round(Math.hypot(input.moveX, input.moveY) * 1000), 1000);
});
