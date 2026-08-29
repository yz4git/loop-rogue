import type { GameState } from "../game/GameSession";
import type { UpgradeCard, UpgradeId } from "../game/RunDirector";

export interface GameViewState {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  chunks: number;
  pendingChunks: number;
  destroyed: number;
  player: string;
  grounded: boolean;
  velocityY: number;
  hp: number;
  maxHp: number;
  enemies: number;
  enemiesDefeated: number;
  coins: number;
  score: number;
  combo: number;
  elapsedSeconds: number;
  status: "playing" | "cleared" | "gameover";
  gameState: GameState;
  lastMessage: string;
  stageMode: "handcrafted" | "procedural";
  seed: string;
  generatorVersion: number;
  generationMs: number;
  caves: number;
  structures: number;
  jigsawPieces: number;
  reachabilityCost: number;
  biomeCounts: string;
  momentum: number;
  breakMode: boolean;
  breakSeconds: number;
  depthTier: number;
  danger: number;
  runLevel: number;
  runXp: number;
  nextUpgradeXp: number;
  pendingUpgrade: boolean;
  upgradeChoices: readonly UpgradeCard[];
  upgrades: readonly UpgradeId[];
  bossActive: boolean;
  bossDefeated: boolean;
  bossHp: number;
  bossMaxHp: number;
  metaCores: number;
  legacyRank: number;
  bestDepth: number;
  runPace: number;
  targetSeconds: number;
}

export interface GameViewCommands {
  restart: () => void;
  jump: () => void;
  punch: () => void;
  selectUpgrade: (id: UpgradeId) => void;
  setMoveInput: (x: number, y: number) => void;
  selectStage: (mode: "handcrafted" | "procedural") => void;
}

export interface GameView {
  render(state: GameViewState): void;
}
