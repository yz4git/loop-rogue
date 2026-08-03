import assert from "node:assert/strict";
import test from "node:test";

import { emptyBoard, emptyWalls, isMoveBlockedByWall, slideBoard, slideWalls } from "../app/game/board";
import { applyMove } from "../app/game/engine";
import { buildPlan } from "../app/game/generator";
import { CENTER, type GameState, type Move, type PlayerState } from "../app/game/types";

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  hp: 8,
  maxHp: 8,
  attack: 2,
  defense: 0,
  healPower: 3,
  hasKey: false,
  level: 1,
  xp: 0,
  ...overrides,
});

function state(board: GameState["board"], walls = emptyWalls(), playerState = player()): GameState {
  return {
    floor: 1,
    turn: 0,
    board,
    walls,
    player: playerState,
    status: "playing",
    message: "test",
    solution: [],
    event: { id: 1, type: "info", text: "test", effects: [] },
  };
}

test("中央へ向いた隣接床の壁がスライドを遮断する", () => {
  const board = emptyBoard();
  const walls = emptyWalls();
  walls[CENTER][CENTER - 1] = { id: "wall", sides: ["right"] };
  const move: Move = { axis: "row", line: CENTER, delta: 1 };

  assert.equal(isMoveBlockedByWall(walls, move), true);
  const next = applyMove(state(board, walls), move);
  assert.equal(next.turn, 0);
  assert.deepEqual(next.walls[CENTER][CENTER - 1]?.sides, ["right"]);
  assert.equal(next.event.type, "blocked");
});

test("壁のない辺からはオブジェクトごと中央へ重なれる", () => {
  const board = emptyBoard();
  const walls = emptyWalls();
  board[CENTER][CENTER - 1] = { id: "key", kind: "key" };
  walls[CENTER][CENTER - 1] = { id: "wall", sides: ["top"] };
  const next = applyMove(state(board, walls), { axis: "row", line: CENTER, delta: 1 });

  assert.equal(next.turn, 1);
  assert.equal(next.player.hasKey, true);
  assert.deepEqual(next.walls[CENTER][CENTER]?.sides, ["top"]);
});

test("経験値が規定値に達すると自動でレベルアップする", () => {
  const board = emptyBoard();
  board[CENTER][CENTER - 1] = { id: "key", kind: "key" };
  const next = applyMove(
    state(board, emptyWalls(), player({ xp: 4 })),
    { axis: "row", line: CENTER, delta: 1 },
  );

  assert.equal(next.player.level, 2);
  assert.equal(next.player.xp, 0);
  assert.equal(next.player.maxHp, 9);
  assert.equal(next.player.attack, 3);
  assert.equal(next.event.type, "levelup");
  assert.ok(next.event.effects.some((effect) => effect.type === "levelup"));
});

test("ヒント経路は壁で遮断される操作を含まない", () => {
  let board = emptyBoard();
  let walls = emptyWalls();
  board[CENTER][0] = { id: "key", kind: "key" };
  walls[CENTER][CENTER - 1] = { id: "wall", sides: ["right"] };
  board[6][5] = { id: "exit", kind: "exit" };
  const plan = buildPlan(board, walls);

  assert.ok(plan && plan.length > 0);
  let hasKey = false;
  for (const move of plan ?? []) {
    assert.equal(isMoveBlockedByWall(walls, move), false);
    board = slideBoard(board, move);
    walls = slideWalls(walls, move);
    if (board[CENTER][CENTER]?.kind === "key") {
      hasKey = true;
      board[CENTER][CENTER] = null;
    }
  }
  assert.equal(hasKey, true);
  assert.equal(board[CENTER][CENTER]?.kind, "exit");
});
