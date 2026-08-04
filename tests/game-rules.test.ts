import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyBoard,
  emptyWalls,
  isMoveBlockedByWall,
  moveForPlayer,
  slideBoard,
  slideWalls,
} from "../app/game/board";
import { applyMove } from "../app/game/engine";
import { buildPlan } from "../app/game/generator";
import { BOARD_SIZE, CENTER, type GameState, type PlayerState, type Position } from "../app/game/types";

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  hp: 8,
  maxHp: 8,
  attack: 2,
  defense: 0,
  healPower: 3,
  hasKey: false,
  level: 1,
  xp: 0,
  combo: 0,
  relics: 0,
  ...overrides,
});

function state(
  board: GameState["board"],
  walls = emptyWalls(),
  playerState = player(),
  playerPosition: Position = { row: CENTER, col: CENTER },
): GameState {
  return {
    floor: 1,
    turn: 0,
    board,
    walls,
    playerPosition,
    enemyWarnings: [],
    player: playerState,
    status: "playing",
    message: "test",
    solution: [],
    event: { id: 1, type: "info", text: "test", effects: [] },
  };
}

test("主人公が一歩進み、その行の床・壁が同じ方向へ流れる", () => {
  const board = emptyBoard();
  const walls = emptyWalls();
  board[CENTER][CENTER + 1] = { id: "potion", kind: "potion" };
  walls[CENTER][CENTER] = { id: "wall", sides: ["top"] };
  const move = moveForPlayer({ row: CENTER, col: CENTER }, "row", 1);
  const next = applyMove(state(board, walls), move);

  assert.equal(next.turn, 1);
  assert.deepEqual(next.playerPosition, { row: CENTER, col: CENTER + 1 });
  assert.equal(next.player.hp, 8);
  assert.equal(next.board[CENTER][CENTER + 1], null);
  assert.deepEqual(next.walls[CENTER][CENTER + 1]?.sides, ["top"]);
});

test("主人公の進行方向を向いた壁はスライドを止める", () => {
  const board = emptyBoard();
  const walls = emptyWalls();
  walls[CENTER][CENTER] = { id: "wall", sides: ["right"] };
  const move = moveForPlayer({ row: CENTER, col: CENTER }, "row", 1);

  assert.equal(isMoveBlockedByWall(walls, { row: CENTER, col: CENTER }, move), true);
  const next = applyMove(state(board, walls), move);
  assert.equal(next.turn, 0);
  assert.deepEqual(next.playerPosition, { row: CENTER, col: CENTER });
  assert.equal(next.event.type, "blocked");
});

test("壁のない辺からは同じマスへ入り、鍵を取得できる", () => {
  const board = emptyBoard();
  const walls = emptyWalls();
  board[CENTER][CENTER + 1] = { id: "key", kind: "key" };
  walls[CENTER][CENTER] = { id: "wall", sides: ["top"] };
  const next = applyMove(state(board, walls), moveForPlayer({ row: CENTER, col: CENTER }, "row", 1));

  assert.equal(next.turn, 1);
  assert.equal(next.player.hasKey, true);
});

test("経験値が規定値に達すると自動でレベルアップする", () => {
  const board = emptyBoard();
  board[CENTER][CENTER + 1] = { id: "key", kind: "key" };
  const next = applyMove(
    state(board, emptyWalls(), player({ xp: 4 })),
    moveForPlayer({ row: CENTER, col: CENTER }, "row", 1),
  );

  assert.equal(next.player.level, 2);
  assert.equal(next.player.xp, 0);
  assert.equal(next.player.maxHp, 9);
  assert.equal(next.player.attack, 3);
  assert.equal(next.event.type, "levelup");
});

test("遺物を拾うと防御力と最大HPが上がる", () => {
  const board = emptyBoard();
  board[CENTER + 1][CENTER] = { id: "relic", kind: "relic" };
  const next = applyMove(
    state(board),
    moveForPlayer({ row: CENTER, col: CENTER }, "col", 1),
  );

  assert.equal(next.player.relics, 1);
  assert.equal(next.player.defense, 1);
  assert.equal(next.player.maxHp, 9);
});

test("近づいたスライムは次の攻撃を予告する", () => {
  const board = emptyBoard();
  board[CENTER][CENTER + 2] = { id: "slime", kind: "slime", hp: 2, attack: 2 };
  const next = applyMove(
    state(board),
    moveForPlayer({ row: CENTER, col: CENTER }, "row", 1),
  );

  assert.ok(next.enemyWarnings.includes("slime"));
  assert.ok(next.event.effects.some((effect) => effect.type === "enemyIntent"));
  assert.equal(next.player.hp, 8);
});

test("ヒント経路は壁を越えず、鍵と出口へ到達する", () => {
  const board = emptyBoard();
  const walls = emptyWalls();
  board[CENTER][CENTER - 1] = { id: "key", kind: "key" };
  board[CENTER + 1][CENTER] = { id: "exit", kind: "exit" };
  walls[CENTER][CENTER] = { id: "wall", sides: ["right"] };
  const start = { row: CENTER, col: CENTER };
  const plan = buildPlan(board, walls, start);

  assert.ok(plan && plan.length > 0);
  let currentBoard = board;
  let currentWalls = walls;
  let position = start;
  let hasKey = false;
  for (const move of plan ?? []) {
    assert.equal(isMoveBlockedByWall(currentWalls, position, move), false);
    position = { row: move.axis === "row" ? position.row : position.row + move.delta, col: move.axis === "row" ? position.col + move.delta : position.col };
    position.row = (position.row + BOARD_SIZE) % BOARD_SIZE;
    position.col = (position.col + BOARD_SIZE) % BOARD_SIZE;
    if (currentBoard[position.row][position.col]?.kind === "key") {
      hasKey = true;
      currentBoard[position.row][position.col] = null;
    }
    currentBoard = slideBoard(currentBoard, { ...move, line: move.axis === "row" ? position.row : position.col });
    currentWalls = slideWalls(currentWalls, { ...move, line: move.axis === "row" ? position.row : position.col });
  }
  assert.equal(hasKey, true);
});
