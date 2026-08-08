export interface EffectRequest {
  kind: "debris" | "dust" | "hit-stop" | "camera-shake";
  x: number;
  y: number;
  z: number;
  strength?: number;
}

export interface EffectSink {
  play(request: EffectRequest): void;
}

/** エフェクト要求をゲームルールから描画プールへ渡す境界。 */
export class EffectManager {
  constructor(private readonly sink: EffectSink) {}

  destruction(x: number, y: number, z: number, strength = 1): void {
    this.sink.play({ kind: "debris", x, y, z, strength });
    this.sink.play({ kind: "dust", x, y, z, strength });
    this.sink.play({ kind: "camera-shake", x, y, z, strength });
  }
}
