import {
  BOARD_SIZE,
  CENTER,
  type Board,
  type Entity,
  type EntityKind,
  type GeneratedFloor,
  type Move,
  type Position,
  type SlideDelta,
  type WallBoard,
  type WallSide,
} from "./types";
import {
  cloneBoard,
  cloneWalls,
  emptyBoard,
  emptyWalls,
  isMoveBlockedByWall,
  moveForPlayer,
  positionAfterMove,
  slideBoard,
  slideWalls,
} from "./board";

interface RandomSource {
  next: () => number;
  int: (max: number) => number;
  pick: <T>(items: T[]) => T;
}

interface PlanNode {
  board: Board;
  walls: WallBoard;
  position: Position;
  hasKey: boolean;
  moves: Move[];
}

interface SimulatedMove extends PlanNode {
  reachedExit: boolean;
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

function entityFingerprint(board: Board): string {
  return board
    .flat()
    .map((entity) => entity ? `${entity.kind}:${entity.id}:${entity.hp ?? 0}` : ".")
    .join("|");
}

function wallFingerprint(walls: WallBoard): string {
  return walls
    .flat()
    .map((wall) => wall ? `${wall.id}:${wall.sides.join("")}` : ".")
    .join("|");
}

function stateFingerprint(node: PlanNode): string {
  return `${node.position.row},${node.position.col},${node.hasKey ? 1 : 0}|${entityFingerprint(node.board)}|${wallFingerprint(node.walls)}`;
}

function isHazard(entity: Entity | null): boolean {
  return entity?.kind === "spike" || entity?.kind === "slime";
}

function collectForPlan(board: Board, position: Position, hasKey: boolean): {
  hasKey: boolean;
  reachedExit: boolean;
  safe: boolean;
} {
  const entity = board[position.row][position.col];
  if (!entity) return { hasKey, reachedExit: false, safe: true };
  if (isHazard(entity)) return { hasKey, reachedExit: false, safe: false };
  if (entity.kind === "key") {
    board[position.row][position.col] = null;
    return { hasKey: true, reachedExit: false, safe: true };
  }
  if (entity.kind === "exit") {
    return { hasKey, reachedExit: hasKey, safe: true };
  }
  board[position.row][position.col] = null;
  return { hasKey, reachedExit: false, safe: true };
}

function simulatePlayerMove(node: PlanNode, move: Move): SimulatedMove | null {
  if (isMoveBlockedByWall(node.walls, node.position, move)) return null;
  const position = positionAfterMove(node.position, move);
  const board = cloneBoard(node.board);
  const first = collectForPlan(board, position, node.hasKey);
  if (!first.safe) return null;
  if (first.reachedExit) {
    return { ...node, board, position, hasKey: first.hasKey, moves: [...node.moves, move], reachedExit: true };
  }

  const lineMove: Move = {
    ...move,
    line: move.axis === "row" ? position.row : position.col,
  };
  const shiftedBoard = slideBoard(board, lineMove);
  const shiftedWalls = slideWalls(node.walls, lineMove);
  const second = collectForPlan(shiftedBoard, position, first.hasKey);
  if (!second.safe) return null;
  return {
    board: shiftedBoard,
    walls: shiftedWalls,
    position,
    hasKey: second.hasKey,
    moves: [...node.moves, move],
    reachedExit: second.reachedExit,
  };
}

function moveOptions(position: Position): Move[] {
  const options: Move[] = [];
  const axes: Array<"row" | "col"> = ["row", "col"];
  const deltas: SlideDelta[] = [1, -1];
  for (const axis of axes) {
    for (const delta of deltas) options.push(moveForPlayer(position, axis, delta));
  }
  return options;
}

/** Find a short safe route for the moving hero, including both world shifts and pickups. */
export function buildPlan(
  source: Board,
  sourceWalls: WallBoard,
  playerPosition: Position = { row: CENTER, col: CENTER },
  keyAlreadyCollected = false,
): Move[] | null {
  const start: PlanNode = {
    board: cloneBoard(source),
    walls: cloneWalls(sourceWalls),
    position: playerPosition,
    hasKey: keyAlreadyCollected,
    moves: [],
  };
  const queue: PlanNode[] = [start];
  const visited = new Set<string>([stateFingerprint(start)]);
  let cursor = 0;
  const maxDepth = 14;
  const maxStates = 1800;

  while (cursor < queue.length && cursor < maxStates) {
    const current = queue[cursor];
    cursor += 1;
    if (current.moves.length >= maxDepth) continue;

    for (const move of moveOptions(current.position)) {
      const next = simulatePlayerMove(current, move);
      if (!next) continue;
      if (next.reachedExit) return next.moves;
      if (next.moves.length >= maxDepth) continue;
      const fingerprint = stateFingerprint(next);
      if (visited.has(fingerprint)) continue;
      visited.add(fingerprint);
      queue.push({
        board: next.board,
        walls: next.walls,
        position: next.position,
        hasKey: next.hasKey,
        moves: next.moves,
      });
    }
  }
  return null;
}

function randomPosition(rng: RandomSource): Position {
  const cells: Position[] = [];
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
    })).filter(({ row, col }) => board[row][col] === null && (row !== CENTER || col !== CENTER)),
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
  add("relic", 1);
  add("slime", 1 + Math.min(2, Math.floor((floor - 1) / 2)));

  const wallCells = shuffle(
    Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
      row: Math.floor(index / BOARD_SIZE),
      col: index % BOARD_SIZE,
    })).filter(({ row, col }) => row !== CENTER || col !== CENTER),
    rng,
  );
  const sides: WallSide[] = ["top", "right", "bottom", "left"];
  for (let index = 0; index < 5 + Math.min(3, floor); index += 1) {
    const { row, col } = wallCells[index];
    const first = rng.pick(sides);
    const wallSides = [first];
    if (index % 5 === 0) wallSides.push(sides[(sides.indexOf(first) + 1) % sides.length]);
    walls[row][col] = { id: `wall-${floor}-${index}`, sides: wallSides };
  }
  return { board, walls };
}

function fallbackFloor(floor: number): { board: Board; walls: WallBoard } {
  const board = emptyBoard();
  const walls = emptyWalls();
  place(board, CENTER, CENTER - 2, makeEntity("key", `key-${floor}`));
  place(board, CENTER, CENTER + 2, makeEntity("exit", `exit-${floor}`));
  place(board, CENTER - 2, CENTER, makeEntity("potion", `potion-${floor}`));
  place(board, CENTER + 2, CENTER, makeEntity("relic", `relic-${floor}`));
  place(board, 0, 0, makeEntity("spike", `spike-${floor}`));
  place(board, 6, 6, makeEntity("slime", `slime-${floor}`));
  walls[0][0] = { id: `wall-${floor}`, sides: ["right", "bottom"] };
  return { board, walls };
}

export function generateFloor(floor: number, seed = Date.now()): GeneratedFloor {
  const rng = randomSource(seed + floor * 7919);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const { board, walls } = candidateFloor(floor, rng);
    const solution = buildPlan(board, walls);
    if (!solution || solution.length < 3 || solution.length > 12) continue;
    if (!solution.some((move) => move.axis === "row") || !solution.some((move) => move.axis === "col")) continue;
    return { board, walls, solution };
  }

  const { board, walls } = fallbackFloor(floor);
  const solution = buildPlan(board, walls) ?? [
    moveForPlayer({ row: CENTER, col: CENTER }, "row", -1),
    moveForPlayer({ row: CENTER, col: CENTER - 1 }, "row", -1),
    moveForPlayer({ row: CENTER, col: CENTER - 2 }, "row", 1),
    moveForPlayer({ row: CENTER, col: CENTER - 1 }, "row", 1),
  ];
  return { board, walls, solution };
}
