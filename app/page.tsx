"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  applyMove,
  cellDescription,
  createGameState,
  entityToken,
  hintFor,
  nextFloor,
  resetGame,
  upgradePlayer,
  xpToNextLevel,
} from "./game/engine";
import { CENTER, BOARD_SIZE, type Axis, type GameState, type Move } from "./game/types";
import { isMoveBlockedByRock, listEntities } from "./game/board";

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startRow: number;
  startCol: number;
  axis: Axis | null;
  line: number;
  offsetPx: number;
  offsetCells: number;
  intentPx: number;
  blocked: boolean;
}

type UpgradeId = "attack" | "maxHp" | "heal";

interface UpgradeOption {
  id: UpgradeId;
  icon: string;
  title: string;
  description: string;
}

const UPGRADE_POOL: UpgradeOption[] = [
  { id: "attack", icon: "⚔️", title: "攻撃力 +1", description: "中央へ運んだスライムを一撃で倒しやすくなる" },
  { id: "maxHp", icon: "💖", title: "最大HP +2", description: "最大HPと現在HPが2増える" },
  { id: "heal", icon: "✨", title: "回復量 +1", description: "回復薬の回復量が1増える" },
];

// SSRと初回クライアント描画を一致させ、再スタート時だけ新しい乱数を使う。
const INITIAL_SEED = 20260802;

type FloorGrid = number[][];

function createFloorGrid(seed = 1): FloorGrid {
  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => seed * 100 + row * BOARD_SIZE + col),
  );
}

function slideFloorGrid(grid: FloorGrid, move: Move): FloorGrid {
  const next = grid.map((row) => [...row]);
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const source = (index - move.delta + BOARD_SIZE) % BOARD_SIZE;
    if (move.axis === "row") next[move.line][index] = grid[move.line][source];
    else next[index][move.line] = grid[source][move.line];
  }
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tokenCopies(
  row: number,
  col: number,
  drag: DragState | null,
): Array<{ x: number; y: number }> {
  let x = col;
  let y = row;
  if (drag?.axis === "row" && drag.line === row) x += drag.offsetCells;
  if (drag?.axis === "col" && drag.line === col) y += drag.offsetCells;

  const copies = [{ x, y }];
  if (x < 0) copies.push({ x: x + BOARD_SIZE, y });
  if (x >= BOARD_SIZE) copies.push({ x: x - BOARD_SIZE, y });
  if (y < 0) copies.push({ x, y: y + BOARD_SIZE });
  if (y >= BOARD_SIZE) copies.push({ x, y: y - BOARD_SIZE });
  return copies;
}

function tokenStyle(position: { x: number; y: number }): CSSProperties {
  return {
    left: `${(position.x / BOARD_SIZE) * 100}%`,
    top: `${(position.y / BOARD_SIZE) * 100}%`,
    width: `${100 / BOARD_SIZE}%`,
    height: `${100 / BOARD_SIZE}%`,
  };
}

function floorTileStyle(position: { x: number; y: number }, tileId: number): CSSProperties {
  return {
    ...tokenStyle(position),
    "--joint-x": `${34 + (tileId % 4) * 9}%`,
    "--stone-shade": `${96 + (tileId % 5) * 4}%`,
  } as CSSProperties;
}

function eventTone(type: GameState["event"]["type"]): [number, number] {
  switch (type) {
    case "pickup":
      return [740, 0.12];
    case "heal":
      return [580, 0.16];
    case "hit":
      return [180, 0.1];
    case "damage":
    case "gameover":
      return [110, 0.2];
    case "clear":
      return [880, 0.22];
    case "levelup":
      return [980, 0.24];
    case "blocked":
      return [120, 0.08];
    default:
      return [320, 0.06];
  }
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createGameState(1, INITIAL_SEED));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeId | null>(null);
  const [moving, setMoving] = useState(false);
  const [floorGrid, setFloorGrid] = useState<FloorGrid>(() => createFloorGrid(1));
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const previousEventId = useRef(game.event.id);
  const movingRef = useRef(false);

  const ensureAudio = useCallback(() => {
    if (!soundOn || typeof window === "undefined") return null;
    if (!audioRef.current) {
      const AudioCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      audioRef.current = new AudioCtor();
    }
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  }, [soundOn]);

  const playTone = useCallback(
    (frequency: number, duration: number, delay = 0) => {
      const context = ensureAudio();
      if (!context) return;
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    },
    [ensureAudio],
  );

  const playEventSound = useCallback(
    (type: GameState["event"]["type"]) => {
      const [frequency, duration] = eventTone(type);
      playTone(frequency, duration);
      if (type === "clear") playTone(frequency * 1.25, duration, 0.1);
      if (type === "pickup") playTone(frequency * 1.2, duration, 0.08);
    },
    [playTone],
  );

  useEffect(() => {
    if (game.event.id === previousEventId.current) return;
    previousEventId.current = game.event.id;
    if (soundOn) playEventSound(game.event.type);
  }, [game.event.id, game.event.type, playEventSound, soundOn]);

  const upgradeOptions = useMemo(() => {
    const offset = (game.floor - 1) % UPGRADE_POOL.length;
    return UPGRADE_POOL.map((_, index) => UPGRADE_POOL[(index + offset) % UPGRADE_POOL.length]);
  }, [game.floor]);

  const commitMove = useCallback(
    (move: Move) => {
      if (movingRef.current || game.status !== "playing") return;
      movingRef.current = true;
      setMoving(true);
      setHintVisible(false);
      if (!isMoveBlockedByRock(game.board, move)) {
        setFloorGrid((current) => slideFloorGrid(current, move));
      }
      setGame((current) => applyMove(current, move));
      window.setTimeout(() => {
        movingRef.current = false;
        setMoving(false);
      }, 360);
    },
    [game.board, game.status],
  );

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (game.status !== "playing" || movingRef.current) return;
    const board = boardRef.current;
    if (!board) return;
    ensureAudio();
    const rect = board.getBoundingClientRect();
    const startCol = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * BOARD_SIZE), 0, BOARD_SIZE - 1);
    const startRow = clamp(Math.floor(((event.clientY - rect.top) / rect.height) * BOARD_SIZE), 0, BOARD_SIZE - 1);
    const next: DragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRow,
      startCol,
      axis: null,
      line: startRow,
      offsetPx: 0,
      offsetCells: 0,
      intentPx: 0,
      blocked: false,
    };
    dragRef.current = next;
    setDrag(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    if (!current.axis && distance < 8) return;

    const axis = current.axis ?? (Math.abs(dx) >= Math.abs(dy) ? "row" : "col");
    const rawOffset = axis === "row" ? dx : dy;
    const board = boardRef.current;
    const cellSize = board ? board.getBoundingClientRect().width / BOARD_SIZE : 40;
    const line = axis === "row" ? current.startRow : current.startCol;
    const intendedMove: Move = {
      axis,
      line,
      delta: rawOffset >= 0 ? 1 : -1,
    };
    const blocked = Math.abs(rawOffset) > 1 && isMoveBlockedByRock(game.board, intendedMove);
    const visualOffset = blocked ? clamp(rawOffset * 0.12, -7, 7) : rawOffset;
    const next: DragState = {
      ...current,
      axis,
      line,
      offsetPx: clamp(visualOffset, -cellSize * 1.18, cellSize * 1.18),
      offsetCells: clamp(visualOffset / cellSize, -1.18, 1.18),
      intentPx: rawOffset,
      blocked,
    };
    dragRef.current = next;
    setDrag(next);
    event.preventDefault();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    const distance = Math.abs(current.intentPx);
    if (current.axis && distance >= 18) {
      commitMove({
        axis: current.axis,
        line: current.line,
        delta: current.intentPx >= 0 ? 1 : -1,
      });
    }
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const onBoardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      commitMove({ axis: "row", line: CENTER, delta: event.key === "ArrowRight" ? 1 : -1 });
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      commitMove({ axis: "col", line: CENTER, delta: event.key === "ArrowDown" ? 1 : -1 });
    }
  };

  const restart = () => {
    setSelectedUpgrade(null);
    setHintVisible(false);
    setFloorGrid(createFloorGrid(Date.now()));
    setGame(resetGame());
  };

  const chooseUpgrade = (upgrade: UpgradeId) => {
    if (selectedUpgrade) return;
    setSelectedUpgrade(upgrade);
    setGame((current) => ({
      ...current,
      player: upgradePlayer(current.player, upgrade),
      message: `${UPGRADE_POOL.find((option) => option.id === upgrade)?.title ?? "強化"}を獲得！`,
    }));
  };

  const goNextFloor = () => {
    if (!selectedUpgrade) return;
    setSelectedUpgrade(null);
    setFloorGrid(createFloorGrid(game.floor + 1));
    setGame((current) => nextFloor(current, current.player));
  };

  const showHint = () => {
    setHintVisible(true);
    ensureAudio();
  };

  const entities = listEntities(game.board);
  const movedEnemies = new Set(
    game.event.effects.filter((effect) => effect.type === "enemyMove").map((effect) => effect.entityId),
  );
  const hpPercent = `${clamp((game.player.hp / game.player.maxHp) * 100, 0, 100)}%`;
  const xpGoal = xpToNextLevel(game.player.level);
  const xpPercent = `${clamp((game.player.xp / xpGoal) * 100, 0, 100)}%`;
  const objective = game.player.hasKey ? "出口を中央へ運ぶ" : "鍵を中央へ運ぶ";
  const boardClassName = [
    "board-shell",
    game.event.type === "damage" || game.event.type === "gameover" ? "board-shake" : "",
    game.event.type === "clear" ? "board-clear" : "",
    game.event.type === "blocked" ? "board-blocked" : "",
    game.event.type === "levelup" ? "board-levelup" : "",
  ].join(" ");

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> LOOP ROGUE</div>
          <h1>世界をスライドして、運命を中央へ。</h1>
        </div>
        <div className="floor-badge"><span>FLOOR</span><strong>{String(game.floor).padStart(2, "0")}</strong></div>
      </header>

      <section className="hud" aria-label="ゲーム情報">
        <div className="stat stat-hp">
          <div className="stat-heading"><span>HP</span><strong>{game.player.hp} / {game.player.maxHp}</strong></div>
          <div className="hp-track"><span style={{ width: hpPercent }} /></div>
        </div>
        <div className="stat"><span className="stat-label">攻撃</span><strong>⚔ {game.player.attack}</strong></div>
        <div className="stat"><span className="stat-label">防御</span><strong>🛡 {game.player.defense}</strong></div>
        <div className="stat"><span className="stat-label">鍵</span><strong>{game.player.hasKey ? "🔑" : "—"}</strong></div>
        <div className="stat"><span className="stat-label">TURN</span><strong>{game.turn}</strong></div>
      </section>

      <section className="objective-row" aria-live="polite">
        <div className="objective-icon">{game.player.hasKey ? "🚪" : "🔑"}</div>
        <div><span className="section-label">CURRENT OBJECTIVE</span><strong>{objective}</strong></div>
        <div className="level-panel" aria-label={`レベル${game.player.level}、経験値${game.player.xp}/${xpGoal}`}>
          <div><span>LV</span><b>{game.player.level}</b><small>XP {game.player.xp}/{xpGoal}</small></div>
          <div className="xp-track"><i style={{ width: xpPercent }} /></div>
        </div>
      </section>

      <section className="play-area">
        <div className={boardClassName}>
          <div
            ref={boardRef}
            className={`board ${drag ? "is-dragging" : ""} ${moving ? "is-moving" : ""}`}
            role="grid"
            aria-label="7行7列のループ盤面。行または列をスワイプしてください"
            tabIndex={0}
            onPointerDown={startDrag}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
            onPointerLeave={(event) => { if (drag) updateDrag(event); }}
            onKeyDown={onBoardKeyDown}
          >
            {drag?.axis && (
              <div
                className={`line-highlight highlight-${drag.axis} ${drag.blocked ? "highlight-blocked" : ""}`}
                style={{ "--line": drag.line } as CSSProperties}
                aria-hidden="true"
              />
            )}
            <div className="floor-layer" aria-hidden="true">
              {floorGrid.flatMap((rowTiles, row) =>
                rowTiles.flatMap((tileId, col) =>
                  tokenCopies(row, col, drag).map((position, copyIndex) => (
                    <div
                      key={`floor-${tileId}-${copyIndex}`}
                      data-floor-id={tileId}
                      className={`world-floor-tile floor-variant-${tileId % 4} ${drag ? "floor-dragging" : ""}`}
                      style={floorTileStyle(position, tileId)}
                    >
                      <i className="brick-line brick-line-one" />
                      <i className="brick-line brick-line-two" />
                      <i className="brick-joint brick-joint-one" />
                      <i className="brick-joint brick-joint-two" />
                      <i className="brick-joint brick-joint-three" />
                    </div>
                  )),
                ),
              )}
            </div>
            <div className="center-floor-glow" aria-hidden="true" />

            <div className="board-tokens" aria-hidden="true">
              {entities.flatMap(({ entity, row, col }) => {
                const meta = entityToken(entity.kind);
                return tokenCopies(row, col, drag).map((position, copyIndex) => (
                  <div
                    key={`${entity.id}-${copyIndex}`}
                    className={`board-token token-${meta.className} ${drag ? "token-dragging" : ""} ${movedEnemies.has(entity.id) ? "token-enemy-moved" : ""}`}
                    style={tokenStyle(position)}
                    title={cellDescription(entity)}
                  >
                    <span className="token-glyph">{meta.emoji}</span>
                    {entity.kind === "slime" && <span className="token-hp">{entity.hp ?? 1}</span>}
                  </div>
                ));
              })}
            </div>

            <div className="effects-layer" aria-hidden="true">
              {game.event.effects.map((effect) => (
                <div
                  key={`${game.event.id}-${effect.id}`}
                  className={`visual-effect effect-${effect.type}`}
                  style={tokenStyle({ x: effect.col, y: effect.row })}
                >
                  <span>{effect.type === "attack" ? "⚔" : effect.type === "enemyMove" ? "➜" : effect.type === "blocked" ? "✕" : effect.type === "heal" ? "✦" : effect.text}</span>
                </div>
              ))}
            </div>

            <div className={`center-marker ${game.event.id ? "center-ready" : ""}`}>
              <span>YOU</span>
              <b>✦</b>
            </div>

            {drag?.axis && (
              <div className={`drag-guide guide-${drag.axis}`} style={{ "--line": drag.line } as CSSProperties}>
                {drag.blocked ? "ROCK BLOCK" : drag.axis === "row" ? "ROW" : "COLUMN"}
              </div>
            )}
          </div>
          <div className="board-caption"><span>✦</span> 中央の主人公は動かない <i /> 世界がループする</div>
        </div>

        <div className="message-card" aria-live="polite">
          <span className="message-mark">{game.event.type === "damage" ? "!" : "✦"}</span>
          <p>{game.message}</p>
        </div>

        {hintVisible && game.status === "playing" && (
          <div className="hint-card"><span>💡</span><strong>{hintFor(game)}</strong><button onClick={() => setHintVisible(false)} aria-label="ヒントを閉じる">×</button></div>
        )}
      </section>

      <section className="controls" aria-label="操作説明">
        <div className="gesture-guide"><span className="gesture-icon">↔</span><span>行を左右にスワイプ</span><span className="gesture-icon">↕</span><span>列を上下にスワイプ</span></div>
        <div className="control-buttons">
          <button className="secondary-button" onClick={showHint}>💡 ヒント</button>
          <button className="secondary-button" onClick={restart}>↻ 再スタート</button>
          <button className="sound-button" onClick={() => { setSoundOn((current) => !current); if (!soundOn) ensureAudio(); }} aria-label="音のオンオフ">
            {soundOn ? "♪ ON" : "♪ OFF"}
          </button>
        </div>
      </section>

      <section className="legend" aria-label="オブジェクト一覧">
        <span><b>🔑</b>鍵</span><span><b>🚪</b>出口</span><span><b>🧪</b>回復</span><span><b>🔺</b>トゲ</span><span><b>🪨</b>岩</span><span><b>🟢</b>敵</span>
      </section>

      {game.status !== "playing" && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={game.status === "clear" ? "フロアクリア" : "ゲームオーバー"}>
          <div className={`result-modal ${game.status === "clear" ? "clear-modal" : "gameover-modal"}`}>
            {game.status === "clear" ? (
              <>
                <div className="result-orb">✦</div>
                <span className="result-kicker">FLOOR CLEARED</span>
                <h2>中央を制した。</h2>
                <p>次のフロアへ進む前に、ひとつだけ強化を選ぼう。</p>
                <div className="upgrade-grid">
                  {upgradeOptions.map((option) => (
                    <button key={option.id} className={`upgrade-card ${selectedUpgrade === option.id ? "selected" : ""}`} onClick={() => chooseUpgrade(option.id)}>
                      <span className="upgrade-icon">{option.icon}</span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                      {selectedUpgrade === option.id && <em>選択済み</em>}
                    </button>
                  ))}
                </div>
                <button className="primary-button" disabled={!selectedUpgrade} onClick={goNextFloor}>次のフロアへ <span>→</span></button>
              </>
            ) : (
              <>
                <div className="result-orb danger-orb">×</div>
                <span className="result-kicker">RUN ENDED</span>
                <h2>ここで力尽きた。</h2>
                <p>盤面の端から現れるループを読み直して、もう一度挑戦しよう。</p>
                <button className="primary-button" onClick={restart}>もう一度プレイ <span>↻</span></button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
