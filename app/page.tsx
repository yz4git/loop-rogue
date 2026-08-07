"use client";

import { useEffect, useRef, useState } from "react";
import { VoxelDemo, type DemoStats } from "../src/core/VoxelDemo";
import { CanvasTestDemo } from "../src/core/CanvasTestDemo";
import { HandcraftedStageSource } from "../src/stages/HandcraftedStageSource";
import { ProceduralStageSource } from "../src/stages/ProceduralStageSource";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

interface RandomStageRecord {
  seed: string;
  generatorVersion: number;
  size: "small" | "medium";
  difficulty: "easy" | "normal" | "hard";
  theme: "mixed" | "forest" | "mountain" | "ruins";
  cleared: boolean;
}

const INITIAL_STATS: DemoStats = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  chunks: 0,
  pendingChunks: 0,
  destroyed: 0,
  player: "24.5, 9.7, 6.5",
  grounded: false,
  velocityY: 0,
  hp: 500,
  maxHp: 500,
  enemies: 4,
  coins: 0,
  status: "playing",
  lastMessage: "深部へ掘り、敵2体を倒してゴールへ",
  stageMode: "handcrafted",
  seed: "—",
  generatorVersion: 0,
  generationMs: 0,
  caves: 0,
  structures: 0,
  jigsawPieces: 0,
  reachabilityCost: 0,
  biomeCounts: "—",
};

export default function Home() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<VoxelDemo | CanvasTestDemo | null>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickPointer = useRef<number | null>(null);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageMode, setStageMode] = useState<"handcrafted" | "procedural">("handcrafted");
  const [randomSeed, setRandomSeed] = useState("first-dig");
  const [randomSize, setRandomSize] = useState<"small" | "medium">("small");
  const [randomDifficulty, setRandomDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [randomTheme, setRandomTheme] = useState<"mixed" | "forest" | "mountain" | "ruins">("mixed");
  const [isGenerating, setIsGenerating] = useState(false);
  const [favoriteSeeds, setFavoriteSeeds] = useState<string[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    let errorTimer: number | undefined;
    try {
      const force2d = new URLSearchParams(window.location.search).get("test") === "2d";
      const canUseWebGL = !force2d && Boolean(document.createElement("canvas").getContext("webgl"));
      let demo: VoxelDemo | CanvasTestDemo;
      if (!canUseWebGL) demo = new CanvasTestDemo(viewport, setStats);
      else {
        try { demo = new VoxelDemo(viewport, setStats); }
        catch { viewport.replaceChildren(); demo = new CanvasTestDemo(viewport, setStats); }
      }
      demoRef.current = demo;
    } catch {
      errorTimer = window.setTimeout(() => setPreviewError("2Dテスト表示も開始できませんでした。Canvas対応ブラウザで開いてください。"), 0);
    }
    return () => {
      if (errorTimer !== undefined) window.clearTimeout(errorTimer);
      const demo = demoRef.current;
      demoRef.current = null;
      demo?.dispose();
    };
  }, []);

  useEffect(() => {
    if (stats.status !== "cleared" || stats.stageMode !== "procedural") return;
    try {
      const key = "loop-rogue:random-records";
      const records = JSON.parse(localStorage.getItem(key) ?? "[]") as RandomStageRecord[];
      const record: RandomStageRecord = { seed: stats.seed, generatorVersion: stats.generatorVersion, size: randomSize, difficulty: randomDifficulty, theme: randomTheme, cleared: true };
      const next = [record, ...records.filter((item) => item.seed !== record.seed)].slice(0, 50);
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* 保存不可でもクリア処理は継続 */ }
  }, [stats.status, stats.stageMode, stats.seed, stats.generatorVersion, randomSize, randomDifficulty, randomTheme]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const last = localStorage.getItem("loop-rogue:last-random-stage");
        if (last) {
          const record = JSON.parse(last) as Partial<RandomStageRecord>;
          if (typeof record.seed === "string" && record.seed) setRandomSeed(record.seed);
          if (record.size === "small" || record.size === "medium") setRandomSize(record.size);
          if (record.difficulty === "easy" || record.difficulty === "normal" || record.difficulty === "hard") setRandomDifficulty(record.difficulty);
          if (record.theme === "mixed" || record.theme === "forest" || record.theme === "mountain" || record.theme === "ruins") setRandomTheme(record.theme);
        }
        const favorites = JSON.parse(localStorage.getItem("loop-rogue:favorite-seeds") ?? "[]") as unknown;
        if (Array.isArray(favorites)) setFavoriteSeeds(favorites.filter((value): value is string => typeof value === "string").slice(0, 20));
      } catch { /* Safariのプライベートモードでは端末保存を省略する。 */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const updateFullscreenState = () => {
      const fullscreenDocument = document as FullscreenDocument;
      setIsFullscreen(Boolean(document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    const fullscreenDocument = document as FullscreenDocument;
    const fullscreenRoot = document.documentElement as FullscreenRoot;
    try {
      if (document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (fullscreenDocument.webkitExitFullscreen) await fullscreenDocument.webkitExitFullscreen();
        return;
      }
      if (fullscreenRoot.requestFullscreen) await fullscreenRoot.requestFullscreen();
      else if (fullscreenRoot.webkitRequestFullscreen) await fullscreenRoot.webkitRequestFullscreen();
      else setStats((current) => ({ ...current, lastMessage: "Safariではホーム画面に追加すると全画面で遊べます" }));
    } catch {
      setStats((current) => ({ ...current, lastMessage: "全画面化できませんでした。Safariの操作を確認してください" }));
    }
  };

  const updateJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const joystick = joystickRef.current;
    if (!joystick || joystickPointer.current !== event.pointerId) return;
    const rect = joystick.getBoundingClientRect();
    const max = rect.width * 0.34;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    const scale = length > max ? max / length : 1;
    demoRef.current?.setMoveInput((dx * scale) / max, (dy * scale) / max);
  };

  const selectStage = (mode: "handcrafted" | "procedural") => {
    const demo = demoRef.current;
    if (!(demo instanceof VoxelDemo)) {
      setStats((current) => ({ ...current, lastMessage: "WebGLテスト表示ではステージ切替を使えません" }));
      return;
    }
    setIsGenerating(mode === "procedural");
      if (mode === "procedural") {
      const record: RandomStageRecord = { seed: randomSeed.trim() || "first-dig", generatorVersion: 2, size: randomSize, difficulty: randomDifficulty, theme: randomTheme, cleared: false };
      try { localStorage.setItem("loop-rogue:last-random-stage", JSON.stringify(record)); } catch { /* 保存不可でもプレイは継続 */ }
      }
      startedAtRef.current = Date.now();
    window.setTimeout(() => {
      if (mode === "procedural") demo.switchStage(new ProceduralStageSource({ seed: randomSeed, size: randomSize, difficulty: randomDifficulty, theme: randomTheme }));
      else demo.switchStage(new HandcraftedStageSource());
      setStageMode(mode);
      setIsGenerating(false);
    }, 16);
  };

  const copySeed = async () => {
    const value = randomSeed.trim() || "first-dig";
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(value);
      setStats((current) => ({ ...current, lastMessage: `シードをコピーしました · ${value}` }));
    } catch {
      setStats((current) => ({ ...current, lastMessage: `シード: ${value}` }));
    }
  };

  const toggleFavoriteSeed = () => {
    const value = randomSeed.trim() || "first-dig";
    const next = favoriteSeeds.includes(value) ? favoriteSeeds.filter((seed) => seed !== value) : [value, ...favoriteSeeds].slice(0, 20);
    setFavoriteSeeds(next);
    try { localStorage.setItem("loop-rogue:favorite-seeds", JSON.stringify(next)); } catch { /* 保存不可でもプレイは継続 */ }
  };

  const shareSeed = async () => {
    const value = randomSeed.trim() || "first-dig";
    try {
      if (navigator.share) await navigator.share({ title: "Loop Rogue ランダムステージ", text: `Loop Rogueのシード: ${value}` });
      else await copySeed();
    } catch { /* 共有シートを閉じた場合はゲーム状態を変更しない */ }
  };

  const stopJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointer.current !== event.pointerId) return;
    joystickPointer.current = null;
    demoRef.current?.setMoveInput(0, 0);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const registerServiceWorker = async () => {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
        await registration?.update().catch(() => undefined);
      }
    };
    void registerServiceWorker();
  }, []);

  return (
    <main className="demo-shell" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
      <div className="rotate-message" role="status">iPhoneを横向きにして遊んでください</div>
      <header className="demo-header">
        <p className="eyebrow version-label">VERSION 54</p>
        <div className="header-actions">
          <button className="fullscreen-button" type="button" onClick={() => void toggleFullscreen()}>{isFullscreen ? "縮小" : "全画面"}</button>
          <button className="reset-button" type="button" onClick={() => demoRef.current?.reset()}>↻ リセット</button>
        </div>
      </header>

      <section className="stage-selector" aria-label="ステージ選択">
        <span className="selector-label">STAGE MODE</span>
        <button className={stageMode === "handcrafted" ? "selected" : ""} type="button" onPointerDown={(event) => { event.preventDefault(); selectStage("handcrafted"); }}>通常ステージ</button>
        <button className={stageMode === "procedural" ? "selected" : ""} type="button" onPointerDown={(event) => { event.preventDefault(); selectStage("procedural"); }}>ランダムステージ</button>
        <label className="seed-input">SEED<input value={randomSeed} maxLength={32} onChange={(event) => setRandomSeed(event.target.value)} aria-label="ランダムステージのシード" /></label>
        <label className="stage-option">SIZE<select value={randomSize} onChange={(event) => setRandomSize(event.target.value as "small" | "medium")}><option value="small">SMALL</option><option value="medium">MEDIUM</option></select></label>
        <label className="stage-option">LEVEL<select value={randomDifficulty} onChange={(event) => setRandomDifficulty(event.target.value as "easy" | "normal" | "hard")}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>
        <label className="stage-option">THEME<select value={randomTheme} onChange={(event) => setRandomTheme(event.target.value as "mixed" | "forest" | "mountain" | "ruins")}><option value="mixed">MIXED</option><option value="forest">FOREST</option><option value="mountain">MOUNTAIN</option><option value="ruins">RUINS</option></select></label>
        <button className="seed-action" type="button" onPointerDown={(event) => { event.preventDefault(); void copySeed(); }}>コピー</button>
        <button className={`seed-action ${favoriteSeeds.includes(randomSeed.trim() || "first-dig") ? "favorite" : ""}`} type="button" onPointerDown={(event) => { event.preventDefault(); toggleFavoriteSeed(); }}>★</button>
        <button className="seed-action" type="button" onPointerDown={(event) => { event.preventDefault(); void shareSeed(); }}>共有</button>
      </section>

      <section className="demo-stage" aria-label="ボクセル地形破壊デモ">
        <div className="canvas-wrap" ref={viewportRef}>
          {isGenerating && <div className="generation-overlay" role="status"><strong>ランダム地形を生成中</strong><span>シード: {randomSeed}</span><small>地形・地層・開始地点を準備しています</small></div>}
          {previewError && <div className="webgl-error" role="alert">{previewError}</div>}
          <div
            ref={joystickRef}
            className="virtual-joystick"
            aria-label="移動スティック"
            onPointerDown={(event) => { event.preventDefault(); joystickPointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); updateJoystick(event); }}
            onPointerMove={updateJoystick}
            onPointerUp={stopJoystick}
            onPointerCancel={stopJoystick}
          >
            <span className="joystick-knob" />
          </div>
          <button className="punch-button" type="button" onPointerDown={(event) => { event.preventDefault(); demoRef.current?.punch(); }}>PUNCH</button>
          <button className="jump-button" type="button" onPointerDown={(event) => { event.preventDefault(); demoRef.current?.jump(); }}>JUMP</button>
          <div className="camera-tip">?test=2d：WebGLなしテスト表示</div>
        </div>
        <div className="stage-hint"><span className="tap-icon">✦</span><span>{stats.lastMessage}</span></div>
        <div className="stage-badge">SURVIVE / DIG</div>
        {stats.status !== "playing" && <div className={`result-overlay ${stats.status}`} role="status">
          <strong>{stats.status === "cleared" ? "STAGE CLEAR" : "GAME OVER"}</strong>
          <span>{stats.status === "cleared" ? `ゴール到達 · ${stats.coins}G` : "敵に押し切られました"}</span>
          <button type="button" onPointerDown={(event) => { event.preventDefault(); demoRef.current?.reset(); }}>もう一度遊ぶ</button>
        </div>}
      </section>

      <section className="metrics" aria-label="デバッグ情報">
        <div><span>FPS</span><strong className={stats.fps >= 50 ? "good" : ""}>{stats.fps}</strong></div>
        <div><span>FRAME</span><strong>{stats.frameMs}ms</strong></div>
        <div><span>DRAW CALLS</span><strong>{stats.drawCalls}</strong></div>
        <div><span>TRIANGLES</span><strong>{stats.triangles.toLocaleString()}</strong></div>
        <div><span>CHUNKS</span><strong>{stats.chunks}</strong></div>
        <div><span>QUEUE</span><strong>{stats.pendingChunks}</strong></div>
        <div><span>PLAYER</span><strong>{stats.player}</strong></div>
        <div><span>VERTICAL</span><strong>{stats.velocityY.toFixed(2)} / {stats.grounded ? "GROUND" : "AIR"}</strong></div>
        <div><span>HP</span><strong className={stats.hp <= 1 ? "danger" : "good"}>{stats.hp}/{stats.maxHp}</strong></div>
        <div><span>ENEMIES</span><strong>{stats.enemies}</strong></div>
        <div><span>COINS</span><strong>{stats.coins}G</strong></div>
      </section>
      {stats.stageMode === "procedural" && <details className="worldgen-debug"><summary>WORLDGEN DEBUG / {stats.seed}</summary><div className="worldgen-grid"><span>VERSION <b>{stats.generatorVersion}</b></span><span>GEN <b>{stats.generationMs}ms</b></span><span>CAVES <b>{stats.caves}</b></span><span>STRUCTURES <b>{stats.structures}</b></span><span>JIGSAW <b>{stats.jigsawPieces}</b></span><span>DIG COST <b>{stats.reachabilityCost}</b></span><span className="biomes">BIOMES <b>{stats.biomeCounts || "—"}</b></span></div></details>}

      <section className="instructions">
        <div className="instruction-icon">🕹</div>
        <div><strong>爆発鉱石・連鎖破壊・危険地帯</strong><p>鉱石を壊すと周囲が爆発します。敵や地形を巻き込み、連鎖破壊で安全なルートを作ります。</p></div>
        <div className="destroyed-count"><span>DESTROYED</span><strong>{stats.destroyed}</strong></div>
      </section>

      <footer className="demo-footer"><span>PHASE 18 · RANDOM WORLD LAB</span><span>POOLING / CHUNK MESH</span></footer>
    </main>
  );
}
