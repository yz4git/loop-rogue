export const BOARD_SIZE = 7;
export const CENTER = Math.floor(BOARD_SIZE / 2);

export type Axis = "row" | "col";
export type SlideDelta = -1 | 1;

export type EntityKind =
  | "key"
  | "exit"
  | "potion"
  | "spike"
  | "slime"
  | "relic";

export type EventType =
  | "slide"
  | "pickup"
  | "heal"
  | "hit"
  | "damage"
  | "clear"
  | "gameover"
  | "blocked"
  | "levelup"
  | "info";

export type EffectType =
  | "attack"
  | "enemyMove"
  | "enemyHit"
  | "damage"
  | "heal"
  | "pickup"
  | "blocked"
  | "levelup"
  | "enemyIntent"
  | "combo";

export interface VisualEffect {
  id: string;
  type: EffectType;
  row: number;
  col: number;
  text?: string;
  entityId?: string;
}

export interface Entity {
  id: string;
  kind: EntityKind;
  hp?: number;
  attack?: number;
}

export type Board = Array<Array<Entity | null>>;
export type WallSide = "top" | "right" | "bottom" | "left";
export interface WallTile {
  id: string;
  sides: WallSide[];
}
export type WallBoard = Array<Array<WallTile | null>>;

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
  level: number;
  xp: number;
  combo: number;
  relics: number;
}

export interface GameEvent {
  id: number;
  type: EventType;
  text: string;
  effects: VisualEffect[];
}

export type GameStatus = "playing" | "clear" | "gameover";

export interface GeneratedFloor {
  board: Board;
  walls: WallBoard;
  solution: Move[];
}

export interface GameState {
  floor: number;
  turn: number;
  board: Board;
  walls: WallBoard;
  playerPosition: Position;
  enemyWarnings: string[];
  player: PlayerState;
  status: GameStatus;
  message: string;
  solution: Move[];
  event: GameEvent;
}
