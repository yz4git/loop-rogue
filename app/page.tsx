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
  hp: 500,
  maxHp: 500,
  enemies: 4,
  coins: 0,
  status: "playing",
  lastMessage: "深部へ掘り、敵2体を倒してゴールへ",
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
  const [isGenerating, setIsGenerating] = useState(false);

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
    window.setTimeout(() => {
      if (mode === "procedural") demo.switchStage(new ProceduralStageSource({ seed: randomSeed }));
      else demo.switchStage(new HandcraftedStageSource());
      setStageMode(mode);
      setIsGenerating(false);
    }, 16);
  };

  const stopJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointer.current !== event.pointerId) return;
    joystickPointer.current = null;
    demoRef.current?.setMoveInput(0, 0);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const registerServiceWorker = async () => {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    void registerServiceWorker();
  }, []);

  return (
    <main className="demo-shell" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
      <div className="rotate-message" role="status">iPhoneを横向きにして遊んでください</div>
      <header className="demo-header">
        <div>
          <p className="eyebrow"><span /> VOXEL BREAK LAB / PHASE 12</p>
          <h1>岩山を、壊す。</h1>
          <p className="subtitle">敵を倒し、コインを集め、地下ゴールを目指す破壊アクション</p>
        </div>
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
        <div><span>HP</span><strong className={stats.hp <= 1 ? "danger" : "good"}>{stats.hp}/{stats.maxHp}</strong></div>
        <div><span>ENEMIES</span><strong>{stats.enemies}</strong></div>
        <div><span>COINS</span><strong>{stats.coins}G</strong></div>
      </section>

      <section className="instructions">
        <div className="instruction-icon">🕹</div>
        <div><strong>爆発鉱石・連鎖破壊・危険地帯</strong><p>鉱石を壊すと周囲が爆発します。敵や地形を巻き込み、連鎖破壊で安全なルートを作ります。</p></div>
        <div className="destroyed-count"><span>DESTROYED</span><strong>{stats.destroyed}</strong></div>
      </section>

      <footer className="demo-footer"><span>PHASE 12 · BLAST CHAIN</span><span>POOLING / CHUNK MESH</span></footer>
    </main>
  );
}
