import {
  BOARD_SIZE,
  CENTER,
  type Board,
  type Entity,
  type EntityKind,
  type GeneratedFloor,
  type Move,
  type SlideDelta,
  type WallBoard,
  type WallSide,
} from "./types";
import {
  cloneBoard,
  cloneWalls,
  emptyBoard,
  emptyWalls,
  findEntity,
  findEntityById,
  isMoveBlockedByWall,
  slideBoard,
  slideWalls,
} from "./board";

interface CandidateStats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
}

interface RandomSource {
  next: () => number;
  int: (max: number) => number;
  pick: <T>(items: T[]) => T;
}

function randomSource(seed: number): RandomSource {
  let value = (seed >>> 0) || 1;
  const next = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: <T>(items: T[]) => items[Math.floor(next() * items.length)],
  };
}

function shuffle<T>(items: T[], rng: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = rng.int(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function makeEntity(kind: EntityKind, id: string): Entity {
  if (kind === "slime") return { id, kind, hp: 2, attack: 2 };
  return { id, kind };
}

function place(board: Board, row: number, col: number, entity: Entity): void {
  if (board[row][col] === null) board[row][col] = entity;
}

function planObjectToCenter(
  board: Board,
  walls: WallBoard,
  kind: EntityKind,
  moves: Move[],
  removeWhenCentered: boolean,
): boolean {
  let safety = BOARD_SIZE * BOARD_SIZE * 2;

  while (safety > 0) {
    safety -= 1;
    const position = findEntity(board, kind);
    if (!position) return false;

    if (position.row === CENTER && position.col === CENTER) {
      if (removeWhenCentered) board[CENTER][CENTER] = null;
      return true;
    }

    let move: Move;
    if (position.row !== CENTER) {
      const delta: SlideDelta = position.row < CENTER ? 1 : -1;
      move = { axis: "col", line: position.col, delta };
    } else {
      const delta: SlideDelta = position.col < CENTER ? 1 : -1;
      move = { axis: "row", line: CENTER, delta };
    }

    if (isMoveBlockedByWall(walls, move)) {
      const source = CENTER - move.delta;
      const detour: Move =
        move.axis === "row"
          ? { axis: "col", line: source, delta: 1 }
          : { axis: "row", line: source, delta: 1 };
      // 中央をふさぐ壁床を垂直方向へずらし、別の辺から入れるルートを作る。
      if (isMoveBlockedByWall(walls, detour)) return false;
      const shifted = slideBoard(board, detour);
      const shiftedWalls = slideWalls(walls, detour);
      moves.push(detour);
      board.splice(0, board.length, ...shifted);
      walls.splice(0, walls.length, ...shiftedWalls);
      continue;
    }

    const next = slideBoard(board, move);
    const nextWalls = slideWalls(walls, move);
    moves.push(move);
    board.splice(0, board.length, ...next);
    walls.splice(0, walls.length, ...nextWalls);

    const centered = findEntity(board, kind);
    if (centered?.row === CENTER && centered.col === CENTER) {
      if (removeWhenCentered) board[CENTER][CENTER] = null;
      return true;
    }
  }

  return false;
}

/** Build a deterministic route for the key -> exit solution or the remaining exit route. */
export function buildPlan(source: Board, sourceWalls: WallBoard, keyAlreadyCollected = false): Move[] | null {
  const board = cloneBoard(source);
  const walls = cloneWalls(sourceWalls);
  const moves: Move[] = [];
  if (!keyAlreadyCollected && !planObjectToCenter(board, walls, "key", moves, true)) return null;
  if (!planObjectToCenter(board, walls, "exit", moves, false)) return null;
  return moves;
}

function moveSlimesForSimulation(board: Board, player: CandidateStats): number {
  let damage = 0;
  const slimeIds = board
    .flat()
    .filter((entity): entity is Entity => entity?.kind === "slime")
    .map((entity) => entity.id);

  for (const id of slimeIds) {
    const position = findEntityById(board, id);
    if (!position) continue;
    const slime = board[position.row][position.col];
    if (!slime) continue;

    const rowDistance = Math.abs(position.row - CENTER);
    const colDistance = Math.abs(position.col - CENTER);
    let row = position.row;
    let col = position.col;

    if (rowDistance >= colDistance && row !== CENTER) {
      row += row < CENTER ? 1 : -1;
    } else if (col !== CENTER) {
      col += col < CENTER ? 1 : -1;
    }

    if (row === CENTER && col === CENTER) {
      damage += Math.max(1, (slime.attack ?? 1) - player.defense);
      board[position.row][position.col] = null;
    } else if (board[row][col] === null) {
      board[row][col] = slime;
      board[position.row][position.col] = null;
    }
  }
  return damage;
}

function planIsSafe(source: Board, sourceWalls: WallBoard, plan: Move[]): boolean {
  const board = cloneBoard(source);
  let walls = cloneWalls(sourceWalls);
  const player: CandidateStats = { hp: 8, maxHp: 8, attack: 2, defense: 0 };
  let hasKey = false;

  for (const move of plan) {
    if (isMoveBlockedByWall(walls, move)) return false;
    const next = slideBoard(board, move);
    walls = slideWalls(walls, move);
    board.splice(0, board.length, ...next);
    const center = board[CENTER][CENTER];

    if (center?.kind === "key") {
      hasKey = true;
      board[CENTER][CENTER] = null;
    } else if (center?.kind === "exit") {
      if (hasKey) return player.hp > 0;
    } else if (center?.kind === "potion") {
      player.hp = Math.min(player.maxHp, player.hp + 3);
      board[CENTER][CENTER] = null;
    } else if (center?.kind === "spike") {
      player.hp -= 1;
      board[CENTER][CENTER] = null;
    } else if (center?.kind === "slime") {
      const dealt = player.attack;
      if ((center.hp ?? 1) <= dealt) board[CENTER][CENTER] = null;
      else {
        center.hp = (center.hp ?? 1) - dealt;
        player.hp -= Math.max(1, (center.attack ?? 1) - player.defense);
        board[CENTER][CENTER] = null;
      }
    }

    if (player.hp <= 0) return false;
    player.hp -= moveSlimesForSimulation(board, player);
    if (player.hp <= 0) return false;
  }

  return false;
}

function randomPosition(rng: RandomSource): { row: number; col: number } {
  const cells: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (row !== CENTER || col !== CENTER) cells.push({ row, col });
    }
  }
  return rng.pick(cells);
}

function candidateFloor(floor: number, rng: RandomSource): { board: Board; walls: WallBoard } {
  const board = emptyBoard();
  const walls = emptyWalls();
  const key = randomPosition(rng);
  let exit = randomPosition(rng);
  while (exit.row === key.row && exit.col === key.col) exit = randomPosition(rng);

  place(board, key.row, key.col, makeEntity("key", `key-${floor}`));
  place(board, exit.row, exit.col, makeEntity("exit", `exit-${floor}`));

  const free = shuffle(
    Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
      row: Math.floor(index / BOARD_SIZE),
      col: index % BOARD_SIZE,
    })).filter(
      ({ row, col }) => board[row][col] === null && (row !== CENTER || col !== CENTER),
    ),
    rng,
  );
  let cursor = 0;
  const add = (kind: EntityKind, amount: number) => {
    for (let index = 0; index < amount && cursor < free.length; index += 1) {
      const position = free[cursor];
      cursor += 1;
      place(board, position.row, position.col, makeEntity(kind, `${kind}-${floor}-${index}-${cursor}`));
    }
  };

  add("spike", 2 + Math.min(2, Math.floor(floor / 2)));
  add("potion", 1 + (floor % 3 === 0 ? 1 : 0));
  add("slime", 1 + Math.min(2, Math.floor((floor - 1) / 2)));
  const wallCells = shuffle(
    Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
      row: Math.floor(index / BOARD_SIZE),
      col: index % BOARD_SIZE,
    })).filter(({ row, col }) => row !== CENTER || col !== CENTER),
    rng,
  );
  const sides: WallSide[] = ["top", "right", "bottom", "left"];
  for (let index = 0; index < 6 + Math.min(3, floor); index += 1) {
    const { row, col } = wallCells[index];
    const first = rng.pick(sides);
    const wallSides = [first];
    if (index % 4 === 0) wallSides.push(sides[(sides.indexOf(first) + 1) % sides.length]);
    walls[row][col] = { id: `wall-${floor}-${index}`, sides: wallSides };
  }
  return { board, walls };
}

function fallbackFloor(floor: number): { board: Board; walls: WallBoard } {
  const board = emptyBoard();
  const walls = emptyWalls();
  place(board, 1, 1, makeEntity("key", `key-${floor}`));
  place(board, 5, 5, makeEntity("exit", `exit-${floor}`));
  place(board, CENTER, 0, makeEntity("potion", `potion-${floor}`));
  place(board, 0, CENTER, makeEntity("spike", `spike-${floor}`));
  place(board, 6, 6, makeEntity("slime", `slime-${floor}`));
  walls[0][0] = { id: `wall-${floor}`, sides: ["right", "bottom"] };
  return { board, walls };
}

export function generateFloor(floor: number, seed = Date.now()): GeneratedFloor {
  const rng = randomSource(seed + floor * 7919);
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const { board, walls } = candidateFloor(floor, rng);
    const solution = buildPlan(board, walls);
    if (!solution || solution.length < 3 || solution.length > 16) continue;
    if (!solution.some((move) => move.axis === "row") || !solution.some((move) => move.axis === "col")) continue;
    if (planIsSafe(board, walls, solution)) return { board, walls, solution };
  }

  const { board, walls } = fallbackFloor(floor);
  const solution = buildPlan(board, walls) ?? [
    { axis: "col", line: 1, delta: 1 },
    { axis: "row", line: CENTER, delta: 1 },
    { axis: "col", line: 5, delta: -1 },
    { axis: "row", line: CENTER, delta: -1 },
  ];
  return { board, walls, solution };
}
