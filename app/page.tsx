"use client";

import { useEffect, useRef, useState } from "react";
import { VoxelDemo, type DemoStats } from "../src/core/VoxelDemo";
import { Canvas3DPreviewDemo } from "../src/core/Canvas3DPreviewDemo";
import { HandcraftedStageSource } from "../src/stages/HandcraftedStageSource";
import { ProceduralStageSource } from "../src/stages/ProceduralStageSource";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type StageMode = "handcrafted" | "procedural";
interface RandomStageSettings {
  seed: string;
  size: "small" | "medium";
  difficulty: "easy" | "normal" | "hard";
  theme: "mixed" | "forest" | "mountain" | "ruins";
}

const createStageSource = (mode: StageMode, settings: RandomStageSettings) => mode === "procedural"
  ? new ProceduralStageSource(settings)
  : new HandcraftedStageSource();

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
  hp: 16,
  maxHp: 16,
  enemies: 3,
  coins: 0,
  gameState: "playing",
  enemiesDefeated: 0,
  score: 0,
  combo: 0,
  elapsedSeconds: 0,
  status: "playing",
  lastMessage: "破壊をつないでMomentumを上げ、深部へ潜れ",
  stageMode: "procedural",
  seed: "first-dig",
  generatorVersion: 0,
  generationMs: 0,
  caves: 0,
  structures: 0,
  jigsawPieces: 0,
  reachabilityCost: 0,
  biomeCounts: "—",
  momentum: 0,
  breakMode: false,
  breakSeconds: 0,
  depthTier: 1,
  danger: 1,
  runLevel: 0,
  runXp: 0,
  nextUpgradeXp: 150,
  pendingUpgrade: false,
  upgradeChoices: [],
  upgrades: [],
  bossActive: false,
  bossDefeated: false,
  bossHp: 0,
  bossMaxHp: 0,
  metaCores: 0,
  legacyRank: 0,
  bestDepth: 0,
  runPace: 0,
  runMaxDepth: 0,
  targetSeconds: 300,
};

export default function Home() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<VoxelDemo | Canvas3DPreviewDemo | null>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickPointer = useRef<number | null>(null);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageMode, setStageMode] = useState<"handcrafted" | "procedural">("procedural");
  const [randomSeed, setRandomSeed] = useState("first-dig");
  const [randomSize, setRandomSize] = useState<"small" | "medium">("small");
  const [randomDifficulty, setRandomDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [randomTheme, setRandomTheme] = useState<"mixed" | "forest" | "mountain" | "ruins">("mixed");
  const [isGenerating, setIsGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [favoriteSeeds, setFavoriteSeeds] = useState<string[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    let errorTimer: number | undefined;
    let initialTimer: number | undefined;
    let stageTimer: number | undefined;
    try {
      const search = new URLSearchParams(window.location.search);
      const forceCanvas3d = search.get("test") === "2d" || search.get("renderer") === "canvas3d" || search.get("preview3d") === "1";
      const canUseWebGL = !forceCanvas3d && Boolean(document.createElement("canvas").getContext("webgl"));
      let demo: VoxelDemo | Canvas3DPreviewDemo;
      if (!canUseWebGL) demo = new Canvas3DPreviewDemo(viewport, setStats);
      else {
        try { demo = new VoxelDemo(viewport, setStats); }
        catch (error) {
          console.error("[Voxel Break Lab] WebGL initialization failed; falling back to Canvas 3D preview.", error);
          viewport.replaceChildren();
          demo = new Canvas3DPreviewDemo(viewport, setStats);
        }
      }
      demoRef.current = demo;
      if (demo) {
        let initial = { seed: "first-dig", size: "small" as const, difficulty: "normal" as const, theme: "mixed" as const };
        try {
          const saved = JSON.parse(localStorage.getItem("loop-rogue:last-random-stage") ?? "null") as Partial<RandomStageRecord> | null;
          if (saved?.seed) initial = {
            seed: saved.seed,
            size: saved.size === "medium" ? "medium" : "small",
            difficulty: saved.difficulty === "easy" || saved.difficulty === "hard" ? saved.difficulty : "normal",
            theme: saved.theme === "forest" || saved.theme === "mountain" || saved.theme === "ruins" ? saved.theme : "mixed",
          };
        } catch { /* 保存値が読めなくても初期シードで開始する。 */ }
        initialTimer = window.setTimeout(() => {
          setRandomSeed(initial.seed);
          setRandomSize(initial.size);
          setRandomDifficulty(initial.difficulty);
          setRandomTheme(initial.theme);
          setStageMode("procedural");
          setIsGenerating(true);
          stageTimer = window.setTimeout(() => {
            demo.switchStage(createStageSource("procedural", initial));
            setIsGenerating(false);
          }, 16);
        }, 0);
      }
    } catch {
      errorTimer = window.setTimeout(() => setPreviewError("Canvas 3Dプレビューを開始できませんでした。Canvas対応ブラウザで開いてください。"), 0);
    }
    return () => {
      if (errorTimer !== undefined) window.clearTimeout(errorTimer);
      const demo = demoRef.current;
      demoRef.current = null;
      demo?.dispose();
      if (initialTimer !== undefined) window.clearTimeout(initialTimer);
      if (stageTimer !== undefined) window.clearTimeout(stageTimer);
    };
  }, []);

  useEffect(() => {
    const demo = demoRef.current;
    if (!demo) return;
    if (settingsOpen) demo.pause();
    else demo.resume();
  }, [settingsOpen]);

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
    if (!demo) return;
    setIsGenerating(mode === "procedural");
    if (mode === "procedural") {
      const record: RandomStageRecord = { seed: randomSeed.trim() || "first-dig", generatorVersion: 3, size: randomSize, difficulty: randomDifficulty, theme: randomTheme, cleared: false };
      try { localStorage.setItem("loop-rogue:last-random-stage", JSON.stringify(record)); } catch { /* 保存不可でもプレイは継続 */ }
    }
    startedAtRef.current = Date.now();
    window.setTimeout(() => {
      demo.switchStage(createStageSource(mode, { seed: randomSeed, size: randomSize, difficulty: randomDifficulty, theme: randomTheme }));
      setStageMode(mode);
      setIsGenerating(false);
      setSettingsOpen(false);
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

  const randomizeSeed = () => {
    const values = new Uint32Array(2);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(values);
    else {
      values[0] = Date.now() >>> 0;
      values[1] = Math.floor(Math.random() * 0xffffffff);
    }
    setRandomSeed(`seed-${values[0].toString(36)}-${values[1].toString(36)}`);
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
      if (navigator.share) await navigator.share({ title: "Voxel Break Lab", text: `Voxel Break Lab seed: ${value}` });
      else await copySeed();
    } catch { /* 共有シートを閉じた場合はゲーム状態を変更しない */ }
  };

  const resetGame = () => demoRef.current?.reset();
  const closeSettings = () => setSettingsOpen(false);

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

  const momentumStyle = { "--momentum": `${stats.momentum}%` } as React.CSSProperties;
  const bossStyle = { "--boss-hp": `${stats.bossMaxHp > 0 ? (stats.bossHp / stats.bossMaxHp) * 100 : 0}%` } as React.CSSProperties;

  return (
    <main className={`demo-shell ${stats.breakMode ? "break-active" : ""} ${stats.status !== "playing" ? "run-ended" : ""}`} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
      <section className="demo-stage" aria-label="ボクセル地形破壊ゲーム">
        <div className="canvas-wrap" ref={viewportRef}>
          {isGenerating && <div className="generation-overlay" role="status"><strong>ランダム地形を生成中</strong><span>シード: {randomSeed}</span><small>破壊セットピース・敵・ルートを準備しています</small></div>}
          {previewError && <div className="webgl-error" role="alert">{previewError}</div>}
          <p className="version-label">BREAK RUN · GEN {stats.generatorVersion || 3}</p>

          <div className="minimal-hud" aria-label="ゲーム情報">
            <div><span>HP</span><strong className={stats.hp <= 3 ? "danger" : "good"}>{stats.hp}/{stats.maxHp}</strong></div>
            <div><span>CORE</span><strong>{stats.metaCores}</strong></div>
            <div className="hud-stage"><span>DEPTH TIER {stats.depthTier}</span><strong>{stats.destroyed} BREAKS</strong></div>
          </div>

          <div className="run-hud" aria-label="Momentumとラン情報">
            <div className="momentum-line" style={momentumStyle}><span>{stats.breakMode ? `BREAK ${stats.breakSeconds.toFixed(1)}s` : "MOMENTUM"}</span><b>{stats.momentum}</b><i /></div>
            <div className="run-subline"><span>LV {stats.runLevel}</span><span>COMBO {stats.combo}</span><span>DANGER {stats.danger.toFixed(1)}</span><span>PACE {stats.runPace}%</span></div>
          </div>

          {stats.bossActive && <div className="boss-hud" style={bossStyle}><span>DEPTH BOSS</span><strong>{stats.bossHp}/{stats.bossMaxHp}</strong><i /></div>}

          <button className="settings-button" type="button" aria-label="設定を開く" aria-expanded={settingsOpen} onPointerDown={(event) => { event.preventDefault(); setSettingsOpen(true); }}>⚙</button>
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
          <button className="punch-button" type="button" onPointerDown={(event) => { event.preventDefault(); demoRef.current?.punch(); }}>BREAK</button>
          <button className="jump-button" type="button" onPointerDown={(event) => { event.preventDefault(); demoRef.current?.jump(); }}>JUMP</button>

          {stats.pendingUpgrade && <div className="upgrade-overlay" role="dialog" aria-modal="true" aria-label="強化を選択">
            <div className="upgrade-heading"><small>RUN LEVEL {stats.runLevel + 1}</small><strong>CHOOSE BREAK MOD</strong><span>3つから1つ選択</span></div>
            <div className="upgrade-grid">
              {stats.upgradeChoices.map((choice) => <button key={choice.id} className={`upgrade-card rarity-${choice.rarity.toLowerCase()}`} type="button" onPointerDown={(event) => { event.preventDefault(); demoRef.current?.selectUpgrade(choice.id); }}>
                <small>{choice.rarity}</small><strong>{choice.title}</strong><span>{choice.description}</span>
              </button>)}
            </div>
          </div>}

          {stats.status !== "playing" && <div className={`result-overlay ${stats.status}`} role="status">
            <strong>{stats.status === "cleared" ? "RUN CLEAR" : "RUN OVER"}</strong>
            <span>{stats.status === "cleared" ? `Depth Boss撃破 · ${stats.coins}G` : `到達DEPTH ${stats.runMaxDepth}%`}</span>
            <small>CORE {stats.metaCores} · LEGACY RANK {stats.legacyRank} · BEST {stats.bestDepth}%</small>
            <button type="button" onPointerDown={(event) => { event.preventDefault(); resetGame(); }}>もう一度潜る</button>
          </div>}
        </div>
      </section>

      {settingsOpen && <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="設定">
        <div className="settings-panel">
          <div className="settings-heading"><div><span className="settings-kicker">VOXEL BREAK LAB</span><h1>BREAK RUN</h1></div><button className="settings-close" type="button" aria-label="設定を閉じる" onPointerDown={(event) => { event.preventDefault(); closeSettings(); }}>×</button></div>
          <div className="settings-scroll">
            <section className="settings-section" aria-label="ラン情報">
              <h2>RUN / META</h2>
              <div className="meta-summary"><span>CORE <b>{stats.metaCores}</b></span><span>LEGACY <b>{stats.legacyRank}</b></span><span>BEST DEPTH <b>{stats.bestDepth}%</b></span><span>UPGRADES <b>{stats.upgrades.length}</b></span></div>
            </section>
            <section className="settings-section" aria-label="ステージ設定">
              <h2>STAGE</h2>
              <div className="stage-mode-grid">
                <button className={stageMode === "handcrafted" ? "selected" : ""} type="button" onPointerDown={(event) => { event.preventDefault(); selectStage("handcrafted"); }}>通常ステージ</button>
                <button className={stageMode === "procedural" ? "selected" : ""} type="button" onPointerDown={(event) => { event.preventDefault(); selectStage("procedural"); }}>ランダムステージ</button>
              </div>
              <label className="settings-field">SEED<div className="seed-row"><input value={randomSeed} maxLength={32} onChange={(event) => setRandomSeed(event.target.value)} aria-label="ランダムステージのシード" /><button className="seed-action seed-random" type="button" onPointerDown={(event) => { event.preventDefault(); randomizeSeed(); }}>ランダム</button></div></label>
              <div className="settings-fields-grid">
                <label className="settings-field">SIZE<select value={randomSize} onChange={(event) => setRandomSize(event.target.value as "small" | "medium")}><option value="small">SMALL</option><option value="medium">MEDIUM</option></select></label>
                <label className="settings-field">LEVEL<select value={randomDifficulty} onChange={(event) => setRandomDifficulty(event.target.value as "easy" | "normal" | "hard")}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>
                <label className="settings-field">THEME<select value={randomTheme} onChange={(event) => setRandomTheme(event.target.value as "mixed" | "forest" | "mountain" | "ruins")}><option value="mixed">MIXED</option><option value="forest">FOREST</option><option value="mountain">MOUNTAIN</option><option value="ruins">RUINS</option></select></label>
              </div>
              <div className="settings-actions"><button type="button" onPointerDown={(event) => { event.preventDefault(); selectStage(stageMode); }}>↻ 新しいRUN</button><button type="button" onPointerDown={(event) => { event.preventDefault(); void copySeed(); }}>シードコピー</button><button className={favoriteSeeds.includes(randomSeed.trim() || "first-dig") ? "favorite" : ""} type="button" onPointerDown={(event) => { event.preventDefault(); toggleFavoriteSeed(); }}>★ お気に入り</button><button type="button" onPointerDown={(event) => { event.preventDefault(); void shareSeed(); }}>共有</button></div>
            </section>
            <section className="settings-section" aria-label="ゲーム設定">
              <h2>GAME</h2>
              <div className="settings-actions"><button type="button" onPointerDown={(event) => { event.preventDefault(); resetGame(); }}>↻ RUN RESET</button><button type="button" onPointerDown={(event) => { event.preventDefault(); void toggleFullscreen(); }}>{isFullscreen ? "縮小表示" : "全画面表示"}</button></div>
            </section>
            <section className="settings-section" aria-label="デバッグ設定">
              <h2>DEBUG</h2>
              <label className="debug-toggle"><input type="checkbox" checked={showDebug} onChange={(event) => setShowDebug(event.target.checked)} /><span>デバッグ情報を表示</span></label>
              {showDebug && <div className="metrics settings-metrics" aria-label="デバッグ情報">
                <div><span>FPS</span><strong className={stats.fps >= 50 ? "good" : ""}>{stats.fps}</strong></div><div><span>FRAME</span><strong>{stats.frameMs}ms</strong></div><div><span>DRAW CALLS</span><strong>{stats.drawCalls}</strong></div><div><span>TRIANGLES</span><strong>{stats.triangles.toLocaleString()}</strong></div><div><span>CHUNKS</span><strong>{stats.chunks}</strong></div><div><span>QUEUE</span><strong>{stats.pendingChunks}</strong></div><div><span>PLAYER</span><strong>{stats.player}</strong></div><div><span>VERTICAL</span><strong>{stats.velocityY.toFixed(2)} / {stats.grounded ? "GROUND" : "AIR"}</strong></div><div><span>ENEMIES</span><strong>{stats.enemies}</strong></div><div><span>DESTROYED</span><strong>{stats.destroyed}</strong></div><div><span>RUN XP</span><strong>{stats.runXp}/{stats.nextUpgradeXp}</strong></div><div><span>DANGER</span><strong>{stats.danger.toFixed(2)}</strong></div></div>}
              {showDebug && stats.stageMode === "procedural" && <details className="worldgen-debug" open><summary>WORLDGEN / {stats.seed}</summary><div className="worldgen-grid"><span>VERSION <b>{stats.generatorVersion}</b></span><span>GEN <b>{stats.generationMs}ms</b></span><span>CAVES <b>{stats.caves}</b></span><span>STRUCTURES <b>{stats.structures}</b></span><span>JIGSAW <b>{stats.jigsawPieces}</b></span><span>DIG COST <b>{stats.reachabilityCost}</b></span><span className="biomes">BIOMES <b>{stats.biomeCounts || "—"}</b></span></div></details>}
            </section>
          </div>
          <button className="settings-done" type="button" onPointerDown={(event) => { event.preventDefault(); closeSettings(); }}>ゲームに戻る</button>
        </div>
      </div>}
    </main>
  );
}
