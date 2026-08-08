import type { GameState, SessionSnapshot } from "../game/GameSession";

export interface GameViewState extends SessionSnapshot {
  gameState: GameState;
  message: string;
  stageMode: "handcrafted" | "procedural";
  seed: string;
  generationProgress: number;
}

export interface GameView {
  render(state: GameViewState): void;
}
