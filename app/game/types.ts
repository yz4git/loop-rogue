export const BOARD_SIZE = 7;
export const CENTER = Math.floor(BOARD_SIZE / 2);

export type Axis = "row" | "col";
export type SlideDelta = -1 | 1;

export type EntityKind =
  | "key"
  | "exit"
  | "potion"
  | "spike"
  | "rock"
  | "slime";

export type EventType =
  | "slide"
  | "pickup"
  | "heal"
  | "hit"
  | "damage"
  | "clear"
  | "gameover"
  | "info";

export interface Entity {
  id: string;
  kind: EntityKind;
  hp?: number;
  attack?: number;
}

export type Board = Array<Array<Entity | null>>;

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  axis: Axis;
  line: number;
  delta: SlideDelta;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  healPower: number;
  hasKey: boolean;
  xp: number;
}

export interface GameEvent {
  id: number;
  type: EventType;
  text: string;
}

export type GameStatus = "playing" | "clear" | "gameover";

export interface GeneratedFloor {
  board: Board;
  solution: Move[];
}

export interface GameState {
  floor: number;
  turn: number;
  board: Board;
  player: PlayerState;
  status: GameStatus;
  message: string;
  solution: Move[];
  event: GameEvent;
}
