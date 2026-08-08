export type SoundName = "punch" | "ground-pound" | "explosion";

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export class AudioManager {
  private context: AudioContext | null = null;
  private lastSoundAt = new Map<SoundName, number>();

  unlock(): void {
    if (typeof window === "undefined") return;
    const AudioCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioCtor) return;
    try {
      this.context ??= new AudioCtor();
      if (this.context.state === "suspended") void this.context.resume();
    } catch {
      // Safariの音声制限時もゲーム本体は継続する。
    }
  }

  playPunch(hit: boolean): void {
    this.tone("punch", hit ? "square" : "triangle", hit ? 150 : 90, hit ? 70 : 55, 0.12, hit ? 0.08 : 0.035);
  }

  playGroundPound(): void {
    this.tone("ground-pound", "sawtooth", 105, 34, 0.3, 0.13);
  }

  playExplosion(): void {
    this.tone("explosion", "sawtooth", 180, 38, 0.25, 0.16);
  }

  private tone(
    name: SoundName,
    type: OscillatorType,
    startFrequency: number,
    endFrequency: number,
    duration: number,
    peakGain: number,
  ): void {
    this.unlock();
    const context = this.context;
    if (!context) return;
    const now = performance.now();
    const previous = this.lastSoundAt.get(name) ?? -Infinity;
    if (now - previous < 35) return;
    this.lastSoundAt.set(name, now);
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(startFrequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration * 0.75);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      // Web Audioが使えない環境では無音で継続する。
    }
  }

  dispose(): void {
    const context = this.context;
    this.context = null;
    this.lastSoundAt.clear();
    if (context && context.state !== "closed") void context.close();
  }
}
