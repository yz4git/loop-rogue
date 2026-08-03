import {
  BOARD_SIZE,
  CENTER,
  type Board,
  type Entity,
  type GameEvent,
  type GameState,
  type Move,
  type PlayerState,
} from "./types";
import {
  entityAtCenter,
  findEntityById,
  mod,
  moveLabel,
  slideBoard,
} from "./board";
import { buildPlan, generateFloor } from "./generator";

const INITIAL_PLAYER: PlayerState = {
  hp: 8,
  maxHp: 8,
  attack: 2,
  defense: 0,
  healPower: 3,
  hasKey: false,
  xp: 0,
};

let eventCounter = 0;

function makeEvent(type: GameEvent["type"], text: string): GameEvent {
  eventCounter += 1;
  return { id: eventCounter, type, text };
}

function damageFor(entity: Entity, player: PlayerState): number {
  return Math.max(1, (entity.attack ?? 1) - player.defense);
}

function moveSlimes(board: Board, player: PlayerState, messages: string[]): boolean {
  let tookDamage = false;
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
      const damage = damageFor(slime, player);
      player.hp -= damage;
      tookDamage = true;
      messages.push(`スライムの接近攻撃！ ${damage}ダメージ`);
      board[position.row][position.col] = null;
    } else if (board[row][col] === null) {
      board[row][col] = slime;
      board[position.row][position.col] = null;
    }
  }

  return tookDamage;
}

function retreatSlime(board: Board, entity: Entity): void {
  const options = [
    { row: CENTER - 1, col: CENTER },
    { row: CENTER + 1, col: CENTER },
    { row: CENTER, col: CENTER - 1 },
    { row: CENTER, col: CENTER + 1 },
  ];
  const target = options.find(({ row, col }) => board[row][col] === null);
  if (target) board[target.row][target.col] = entity;
}

function resolveCenter(
  board: Board,
  player: PlayerState,
  messages: string[],
): { type: GameEvent["type"]; clear: boolean } {
  const center = entityAtCenter(board);
  if (!center) return { type: "slide", clear: false };

  switch (center.kind) {
    case "key":
      player.hasKey = true;
      player.xp += 1;
      board[CENTER][CENTER] = null;
      messages.push("鍵を手に入れた！ 出口を中央へ運ぼう");
      return { type: "pickup", clear: false };
    case "exit":
      if (player.hasKey) {
        messages.push("出口を突破した！ フロアクリア！");
        return { type: "clear", clear: true };
      }
      messages.push("出口は鍵がかかっている。先に鍵を運ぼう");
      return { type: "info", clear: false };
    case "potion": {
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + player.healPower);
      board[CENTER][CENTER] = null;
      messages.push(`回復薬を飲んだ！ HP +${player.hp - before}`);
      return { type: "heal", clear: false };
    }
    case "spike":
      player.hp -= 1;
      board[CENTER][CENTER] = null;
      messages.push("トゲを踏んだ！ 1ダメージ");
      return { type: "damage", clear: false };
    case "rock":
      messages.push("岩が中央で止まった。次の手を考えよう");
      return { type: "info", clear: false };
    case "slime": {
      const dealt = player.attack;
      if ((center.hp ?? 1) <= dealt) {
        player.xp += 2;
        board[CENTER][CENTER] = null;
        messages.push("スライムを撃破！");
        return { type: "hit", clear: false };
      }

      center.hp = (center.hp ?? 1) - dealt;
      const damage = damageFor(center, player);
      player.hp -= damage;
      board[CENTER][CENTER] = null;
      retreatSlime(board, center);
      messages.push(`攻撃！ スライムに${dealt}ダメージ。反撃で${damage}ダメージ`);
      return { type: "damage", clear: false };
    }
    default:
      return { type: "slide", clear: false };
  }
}

function chooseEventType(
  centerType: GameEvent["type"],
  tookDamage: boolean,
  player: PlayerState,
): GameEvent["type"] {
  if (player.hp <= 0) return "gameover";
  if (tookDamage) return "damage";
  return centerType;
}

export function createGameState(floor = 1, seed = Date.now()): GameState {
  const generated = generateFloor(floor, seed);
  return {
    floor,
    turn: 0,
    board: generated.board,
    player: { ...INITIAL_PLAYER },
    status: "playing",
    message: "行または列をスワイプして、鍵を中央へ運ぼう",
    solution: generated.solution,
    event: makeEvent("info", "新しいフロア")
  };
}

export function applyMove(game: GameState, move: Move): GameState {
  if (game.status !== "playing") return game;

  const board = slideBoard(game.board, move);
  const player = { ...game.player };
  const messages: string[] = [moveLabel(move)];
  const centerResult = resolveCenter(board, player, messages);
  let tookDamage = centerResult.type === "damage";
  let status = centerResult.clear ? "clear" : game.status;

  if (status === "playing") {
    tookDamage = moveSlimes(board, player, messages) || tookDamage;
    if (player.hp <= 0) status = "gameover";
  }

  const nextPlan = status === "playing" ? buildPlan(board, player.hasKey) ?? [] : game.solution;
  const type = chooseEventType(centerResult.type, tookDamage, player);
  const eventText =
    status === "gameover" ? "力尽きた…" : messages.slice(1).join(" ") || messages[0];

  return {
    ...game,
    board,
    player,
    status: status as GameState["status"],
    turn: game.turn + 1,
    solution: nextPlan,
    message: status === "gameover" ? "ゲームオーバー。もう一度挑戦しよう" : eventText,
    event: makeEvent(type, eventText),
  };
}

export function upgradePlayer(
  player: PlayerState,
  upgrade: "attack" | "maxHp" | "heal",
): PlayerState {
  if (upgrade === "attack") return { ...player, attack: player.attack + 1 };
  if (upgrade === "maxHp") {
    return { ...player, maxHp: player.maxHp + 2, hp: player.hp + 2 };
  }
  return { ...player, healPower: player.healPower + 1 };
}

export function hintFor(game: GameState): string {
  const first = game.solution[0];
  if (!first) return "鍵か出口が動かせない状態です。フロアを再生成してください";
  return `ヒント：${moveLabel(first)}（1マス）`;
}

export function entityToken(kind: Entity["kind"]): {
  emoji: string;
  label: string;
  className: string;
} {
  switch (kind) {
    case "key":
      return { emoji: "🔑", label: "鍵", className: "key" };
    case "exit":
      return { emoji: "🚪", label: "出口", className: "exit" };
    case "potion":
      return { emoji: "🧪", label: "回復薬", className: "potion" };
    case "spike":
      return { emoji: "🔺", label: "トゲ", className: "spike" };
    case "rock":
      return { emoji: "🪨", label: "岩", className: "rock" };
    case "slime":
      return { emoji: "🟢", label: `スライム HP${entityHp(kind)}`, className: "slime" };
    default:
      return { emoji: "·", label: "床", className: "floor" };
  }
}

function entityHp(kind: Entity["kind"]): number {
  return kind === "slime" ? 2 : 0;
}

export function cellDescription(entity: Entity | null): string {
  if (!entity) return "床";
  const meta = entityToken(entity.kind);
  return meta.label;
}

export function nextFloor(game: GameState, player: PlayerState): GameState {
  const generated = generateFloor(game.floor + 1, Date.now() + game.floor * 31);
  return {
    ...game,
    floor: game.floor + 1,
    turn: 0,
    board: generated.board,
    player: { ...player, hasKey: false },
    status: "playing",
    message: "次のフロア。鍵を探そう",
    solution: generated.solution,
    event: makeEvent("info", "次のフロアへ")
  };
}

export function resetGame(): GameState {
  return createGameState(1, Date.now());
}

export function boardKey(board: Board): string {
  return board
    .map((row) => row.map((entity) => entity?.kind.slice(0, 1) ?? ".").join(""))
    .join("/");
}

export function centerCoordinates(): { row: number; col: number } {
  return { row: CENTER, col: CENTER };
}

export function wrapCoordinate(value: number): number {
  return mod(value, BOARD_SIZE);
}
