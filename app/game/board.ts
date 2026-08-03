import {
  BOARD_SIZE,
  type Axis,
  type Board,
  type Entity,
  type Move,
  type Position,
} from "./types";

export function mod(value: number, size = BOARD_SIZE): number {
  return ((value % size) + size) % size;
}

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function findEntity(board: Board, kind: Entity["kind"]): Position | null {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col]?.kind === kind) return { row, col };
    }
  }
  return null;
}

export function findEntityById(board: Board, id: string): Position | null {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col]?.id === id) return { row, col };
    }
  }
  return null;
}

export function listEntities(board: Board): Array<{
  entity: Entity;
  row: number;
  col: number;
}> {
  const entities: Array<{ entity: Entity; row: number; col: number }> = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const entity = board[row][col];
      if (entity) entities.push({ entity, row, col });
    }
  }
  return entities;
}

export function slideBoard(board: Board, move: Move): Board {
  const next = cloneBoard(board);
  const values: Array<Entity | null> = [];

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    values.push(
      move.axis === "row" ? board[move.line][index] : board[index][move.line],
    );
  }

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const sourceIndex = mod(index - move.delta);
    if (move.axis === "row") next[move.line][index] = values[sourceIndex];
    else next[index][move.line] = values[sourceIndex];
  }

  return next;
}

/** 岩が次の1マスで中央へ押し込まれる操作は、主人公との衝突として遮断する。 */
export function isMoveBlockedByRock(board: Board, move: Move): boolean {
  if (move.line !== Math.floor(BOARD_SIZE / 2)) return false;
  const source = mod(Math.floor(BOARD_SIZE / 2) - move.delta);
  const entity =
    move.axis === "row"
      ? board[Math.floor(BOARD_SIZE / 2)][source]
      : board[source][Math.floor(BOARD_SIZE / 2)];
  return entity?.kind === "rock";
}

export function moveLabel(move: Move): string {
  if (move.axis === "row") {
    return move.delta === 1
      ? `${move.line + 1}行を右へ`
      : `${move.line + 1}行を左へ`;
  }
  return move.delta === 1
    ? `${move.line + 1}列を下へ`
    : `${move.line + 1}列を上へ`;
}

export function isSameMove(a: Move, b: Move): boolean {
  return a.axis === b.axis && a.line === b.line && a.delta === b.delta;
}

export function positionAfterMove(position: Position, move: Move): Position {
  if (move.axis === "row" && position.row === move.line) {
    return { row: position.row, col: mod(position.col + move.delta) };
  }
  if (move.axis === "col" && position.col === move.line) {
    return { row: mod(position.row + move.delta), col: position.col };
  }
  return position;
}

export function lineContainsCenter(move: Move): boolean {
  return move.line === Math.floor(BOARD_SIZE / 2);
}

export function entityAtCenter(board: Board): Entity | null {
  return board[Math.floor(BOARD_SIZE / 2)][Math.floor(BOARD_SIZE / 2)];
}

export function axisForMove(axis: Axis): "横" | "縦" {
  return axis === "row" ? "横" : "縦";
}
