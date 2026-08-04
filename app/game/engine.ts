import {
  BOARD_SIZE,
  type Board,
  type Entity,
  type GameEvent,
  type GameState,
  type Move,
  type PlayerState,
  type Position,
  type VisualEffect,
} from "./types";
import {
  findEntityById,
  isMoveBlockedByWall,
  mod,
  moveLabel,
  positionAfterMove,
  slideBoard,
  slideWalls,
} from "./board";
import { buildPlan, generateFloor } from "./generator";

const INITIAL_PLAYER: PlayerState = {
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
};

let eventCounter = 0;

function makeEvent(
  type: GameEvent["type"],
  text: string,
  effects: VisualEffect[] = [],
): GameEvent {
  eventCounter += 1;
  return { id: eventCounter, type, text, effects };
}

export function xpToNextLevel(level: number): number {
  return 3 + level * 2;
}

function grantXp(player: PlayerState, amount: number): number {
  player.xp += amount;
  let levelsGained = 0;
  while (player.xp >= xpToNextLevel(player.level)) {
    player.xp -= xpToNextLevel(player.level);
    player.level += 1;
    player.maxHp += 1;
    player.hp = Math.min(player.maxHp, player.hp + 1);
    player.attack += 1;
    levelsGained += 1;
  }
  return levelsGained;
}

function damageFor(entity: Entity, player: PlayerState): number {
  return Math.max(1, (entity.attack ?? 1) - player.defense);
}

function torusDistance(from: number, to: number): number {
  const direct = Math.abs(from - to);
  return Math.min(direct, BOARD_SIZE - direct);
}

function isAdjacent(a: Position, b: Position): boolean {
  return torusDistance(a.row, b.row) + torusDistance(a.col, b.col) === 1;
}

function stepDirection(from: number, to: number): -1 | 0 | 1 {
  const direct = to - from;
  if (direct === 0) return 0;
  if (Math.abs(direct) > BOARD_SIZE / 2) return direct > 0 ? -1 : 1;
  return direct > 0 ? 1 : -1;
}

function retreatSlime(board: Board, playerPosition: Position, entity: Entity): Position | null {
  const options = [
    { row: mod(playerPosition.row - 1), col: playerPosition.col },
    { row: mod(playerPosition.row + 1), col: playerPosition.col },
    { row: playerPosition.row, col: mod(playerPosition.col - 1) },
    { row: playerPosition.row, col: mod(playerPosition.col + 1) },
  ];
  const target = options.find(({ row, col }) => board[row][col] === null);
  if (target) {
    board[target.row][target.col] = entity;
    return target;
  }
  return null;
}

interface ContactResult {
  type: GameEvent["type"];
  clear: boolean;
  tookDamage: boolean;
  levelUps: number;
}

function emptyContact(): ContactResult {
  return { type: "slide", clear: false, tookDamage: false, levelUps: 0 };
}

function mergeContact(current: ContactResult, next: ContactResult): ContactResult {
  return {
    type: next.type === "slide" ? current.type : next.type,
    clear: current.clear || next.clear,
    tookDamage: current.tookDamage || next.tookDamage,
    levelUps: current.levelUps + next.levelUps,
  };
}

function resolveContact(
  board: Board,
  position: Position,
  player: PlayerState,
  messages: string[],
  effects: VisualEffect[],
): ContactResult {
  const entity = board[position.row][position.col];
  if (!entity) return emptyContact();

  switch (entity.kind) {
    case "key": {
      player.hasKey = true;
      const levelUps = grantXp(player, 1);
      board[position.row][position.col] = null;
      effects.push({ id: `pickup-${entity.id}`, type: "pickup", row: position.row, col: position.col, text: "+1 XP" });
      if (levelUps) effects.push({ id: `level-${player.level}`, type: "levelup", row: position.row, col: position.col, text: `LV ${player.level}` });
      messages.push(`鍵を手に入れた！ +1 XP${levelUps ? `・LV${player.level}！` : ""}`);
      return { type: levelUps ? "levelup" : "pickup", clear: false, tookDamage: false, levelUps };
    }
    case "exit":
      if (player.hasKey) {
        const levelUps = grantXp(player, 2);
        effects.push({ id: `exit-${entity.id}`, type: "pickup", row: position.row, col: position.col, text: "+2 XP" });
        if (levelUps) effects.push({ id: `level-${player.level}`, type: "levelup", row: position.row, col: position.col, text: `LV ${player.level}` });
        messages.push(`出口を突破！ +2 XP${levelUps ? `・LV${player.level}！` : ""}`);
        return { type: "clear", clear: true, tookDamage: false, levelUps };
      }
      messages.push("出口は鍵がかかっている。鍵を探そう");
      return { type: "info", clear: false, tookDamage: false, levelUps: 0 };
    case "potion": {
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + player.healPower);
      board[position.row][position.col] = null;
      effects.push({ id: `heal-${entity.id}`, type: "heal", row: position.row, col: position.col, text: `+${player.hp - before}` });
      messages.push(`回復薬を飲んだ！ HP +${player.hp - before}`);
      return { type: "heal", clear: false, tookDamage: false, levelUps: 0 };
    }
    case "relic":
      player.relics += 1;
      player.defense += 1;
      player.maxHp += 1;
      player.hp = Math.min(player.maxHp, player.hp + 1);
      board[position.row][position.col] = null;
      effects.push({ id: `relic-${entity.id}`, type: "pickup", row: position.row, col: position.col, text: "RELIC +DEF" });
      messages.push("遺物を手に入れた！ 防御力と最大HP +1");
      return { type: "pickup", clear: false, tookDamage: false, levelUps: 0 };
    case "spike":
      player.hp -= 1;
      board[position.row][position.col] = null;
      effects.push({ id: `spike-${entity.id}`, type: "damage", row: position.row, col: position.col, text: "-1" });
      messages.push("トゲを踏んだ！ 1ダメージ");
      return { type: "damage", clear: false, tookDamage: true, levelUps: 0 };
    case "slime": {
      const dealt = player.attack + Math.floor(player.combo / 3);
      effects.push({ id: `attack-${entity.id}`, type: "attack", row: position.row, col: position.col, text: `-${dealt}`, entityId: entity.id });
      if ((entity.hp ?? 1) <= dealt) {
        const levelUps = grantXp(player, 2);
        board[position.row][position.col] = null;
        effects.push({ id: `defeat-${entity.id}`, type: "enemyHit", row: position.row, col: position.col, text: "+2 XP", entityId: entity.id });
        if (levelUps) effects.push({ id: `level-${player.level}`, type: "levelup", row: position.row, col: position.col, text: `LV ${player.level}` });
        messages.push(`スライムを撃破！ +2 XP${levelUps ? `・LV${player.level}！` : ""}`);
        return { type: levelUps ? "levelup" : "hit", clear: false, tookDamage: false, levelUps };
      }

      entity.hp = (entity.hp ?? 1) - dealt;
      const damage = damageFor(entity, player);
      player.hp -= damage;
      board[position.row][position.col] = null;
      const retreat = retreatSlime(board, position, entity);
      effects.push({ id: `counter-${entity.id}`, type: "damage", row: position.row, col: position.col, text: `-${damage}` });
      if (retreat) effects.push({ id: `retreat-${entity.id}`, type: "enemyMove", row: retreat.row, col: retreat.col, entityId: entity.id });
      messages.push(`攻撃！ スライムに${dealt}ダメージ。反撃で${damage}ダメージ`);
      return { type: "damage", clear: false, tookDamage: true, levelUps: 0 };
    }
    default:
      return emptyContact();
  }
}

function moveSlimes(
  board: Board,
  playerPosition: Position,
  player: PlayerState,
  previousWarnings: string[],
  messages: string[],
): { tookDamage: boolean; effects: VisualEffect[]; warnings: string[] } {
  let tookDamage = false;
  const effects: VisualEffect[] = [];
  const warnings: string[] = [];
  const slimeIds = board
    .flat()
    .filter((entity): entity is Entity => entity?.kind === "slime")
    .map((entity) => entity.id);

  for (const id of slimeIds) {
    const position = findEntityById(board, id);
    if (!position) continue;
    const slime = board[position.row][position.col];
    if (!slime) continue;

    const wasWarned = previousWarnings.includes(id);
    if (wasWarned && isAdjacent(position, playerPosition)) {
      const damage = damageFor(slime, player);
      player.hp -= damage;
      tookDamage = true;
      messages.push(`スライムの予告攻撃！ ${damage}ダメージ`);
      effects.push(
        { id: `enemy-hit-${id}`, type: "enemyHit", row: playerPosition.row, col: playerPosition.col, text: `-${damage}`, entityId: id },
        { id: `damage-${id}`, type: "damage", row: playerPosition.row, col: playerPosition.col, text: `-${damage}` },
      );
      continue;
    }

    const rowStep = stepDirection(position.row, playerPosition.row);
    const colStep = stepDirection(position.col, playerPosition.col);
    const target =
      torusDistance(position.row, playerPosition.row) >= torusDistance(position.col, playerPosition.col) && rowStep !== 0
        ? { row: mod(position.row + rowStep), col: position.col }
        : { row: position.row, col: mod(position.col + colStep) };

    if (target.row === playerPosition.row && target.col === playerPosition.col) {
      warnings.push(id);
      effects.push({ id: `intent-${id}`, type: "enemyIntent", row: playerPosition.row, col: playerPosition.col, text: "!", entityId: id });
      messages.push("スライムが狙いを定めた！ 次のターンに攻撃");
    } else if (board[target.row][target.col] === null) {
      board[target.row][target.col] = slime;
      board[position.row][position.col] = null;
      effects.push({ id: `move-${id}`, type: "enemyMove", row: target.row, col: target.col, entityId: id });
      if (isAdjacent(target, playerPosition)) {
        warnings.push(id);
        effects.push({ id: `intent-${id}`, type: "enemyIntent", row: playerPosition.row, col: playerPosition.col, text: "!", entityId: id });
      }
    } else if (isAdjacent(position, playerPosition)) {
      warnings.push(id);
      effects.push({ id: `intent-${id}`, type: "enemyIntent", row: playerPosition.row, col: playerPosition.col, text: "!", entityId: id });
    }
  }

  return { tookDamage, effects, warnings };
}

function chooseEventType(
  contactType: GameEvent["type"],
  tookDamage: boolean,
  player: PlayerState,
  levelUps: number,
  clear: boolean,
): GameEvent["type"] {
  if (player.hp <= 0) return "gameover";
  if (tookDamage) return "damage";
  if (clear) return "clear";
  if (levelUps > 0) return "levelup";
  return contactType;
}

export function createGameState(floor = 1, seed = Date.now()): GameState {
  const generated = generateFloor(floor, seed);
  return {
    floor,
    turn: 0,
    board: generated.board,
    walls: generated.walls,
    playerPosition: { row: Math.floor(BOARD_SIZE / 2), col: Math.floor(BOARD_SIZE / 2) },
    enemyWarnings: [],
    player: { ...INITIAL_PLAYER },
    status: "playing",
    message: "スワイプ方向へ進み、同じ行・列を流して鍵を探そう",
    solution: generated.solution,
    event: makeEvent("info", "新しいフロア"),
  };
}

export function applyMove(game: GameState, move: Move): GameState {
  if (game.status !== "playing") return game;

  if (isMoveBlockedByWall(game.walls, game.playerPosition, move)) {
    const text = "壁が進路をふさいでいる！ 反対側か別の軸へ切り替えよう";
    return {
      ...game,
      message: text,
      event: makeEvent("blocked", text, [
        { id: `blocked-${game.turn}-${game.playerPosition.row}-${game.playerPosition.col}`, type: "blocked", row: game.playerPosition.row, col: game.playerPosition.col, text: "BLOCK" },
      ]),
    };
  }

  const playerPosition = positionAfterMove(game.playerPosition, move);
  const player = { ...game.player, combo: game.player.combo };
  const boardBeforeShift = game.board.map((row) => row.map((entity) => (entity ? { ...entity } : null)));
  const messages: string[] = [moveLabel(move)];
  const effects: VisualEffect[] = [
    { id: `player-move-${game.turn}`, type: "enemyMove", row: playerPosition.row, col: playerPosition.col, text: "➜" },
  ];
  let contact = resolveContact(boardBeforeShift, playerPosition, player, messages, effects);
  const lineMove: Move = { ...move, line: move.axis === "row" ? playerPosition.row : playerPosition.col };
  const board = slideBoard(boardBeforeShift, lineMove);
  const walls = slideWalls(game.walls, lineMove);

  if (!contact.clear) {
    contact = mergeContact(contact, resolveContact(board, playerPosition, player, messages, effects));
  }

  let status: GameState["status"] = contact.clear ? "clear" : "playing";
  let enemyWarnings = game.enemyWarnings;
  if (status === "playing") {
    const enemyPhase = moveSlimes(board, playerPosition, player, game.enemyWarnings, messages);
    contact.tookDamage = contact.tookDamage || enemyPhase.tookDamage;
    effects.push(...enemyPhase.effects);
    enemyWarnings = enemyPhase.warnings;
    if (player.hp <= 0) status = "gameover";
  }

  if (contact.tookDamage) player.combo = 0;
  else {
    player.combo = Math.min(9, player.combo + 1);
    if (player.combo >= 3 && player.combo % 3 === 0) {
      effects.push({ id: `combo-${game.turn}`, type: "combo", row: playerPosition.row, col: playerPosition.col, text: `COMBO ×${player.combo}` });
    }
  }

  const nextPlan = status === "playing"
    ? buildPlan(board, walls, playerPosition, player.hasKey) ?? []
    : game.solution;
  const type = chooseEventType(contact.type, contact.tookDamage, player, contact.levelUps, contact.clear);
  const eventText = status === "gameover"
    ? "力尽きた…"
    : messages.slice(1).join(" ") || `${messages[0]}${player.combo >= 2 ? `・コンボ${player.combo}` : ""}`;

  return {
    ...game,
    board,
    walls,
    playerPosition,
    enemyWarnings,
    player,
    status,
    turn: game.turn + 1,
    solution: nextPlan,
    message: status === "gameover" ? "ゲームオーバー。もう一度挑戦しよう" : eventText,
    event: makeEvent(type, eventText, effects),
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
  if (!first) return "壁のない方向へ進み、敵の予告を見て距離を取ろう";
  return `ヒント：${moveLabel(first)}（主人公が1マス進み、その${first.axis === "row" ? "行" : "列"}が流れる）`;
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
    case "relic":
      return { emoji: "💠", label: "遺物（防御+1）", className: "relic" };
    case "spike":
      return { emoji: "🔺", label: "トゲ", className: "spike" };
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
  return entityToken(entity.kind).label;
}

export function nextFloor(game: GameState, player: PlayerState): GameState {
  const generated = generateFloor(game.floor + 1, Date.now() + game.floor * 31);
  return {
    ...game,
    floor: game.floor + 1,
    turn: 0,
    board: generated.board,
    walls: generated.walls,
    playerPosition: { row: Math.floor(BOARD_SIZE / 2), col: Math.floor(BOARD_SIZE / 2) },
    enemyWarnings: [],
    player: { ...player, hasKey: false, combo: 0 },
    status: "playing",
    message: "次のフロア。敵の予告を読みながら鍵を探そう",
    solution: generated.solution,
    event: makeEvent("info", "次のフロアへ"),
  };
}

export function resetGame(): GameState {
  return createGameState(1, Date.now());
}

export function boardKey(board: Board): string {
  return board.map((row) => row.map((entity) => entity?.kind.slice(0, 1) ?? ".").join("")).join("/");
}
