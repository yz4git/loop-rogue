import type { GameEventSink } from "./GameEvents";
import type { EffectSink } from "../effects/EffectManager";
import type { GameView } from "../ui/GameViewState";

export interface GameServices {
  events: GameEventSink;
  effects: EffectSink;
  view: GameView;
}
