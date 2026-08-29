export type UpgradeId =
  | "heavy-hands"
  | "shockwave-core"
  | "rush-drive"
  | "ore-reactor"
  | "combo-repair"
  | "deep-diver"
  | "overdrive"
  | "breaker-rhythm"
  | "blast-lattice"
  | "second-wind";

export interface UpgradeCard {
  id: UpgradeId;
  title: string;
  description: string;
  rarity: "COMMON" | "RARE" | "EPIC";
}

export interface RunModifiers {
  moveSpeed: number;
  acceleration: number;
  jumpVelocity: number;
  punchCooldown: number;
  punchRange: number;
  punchRadius: number;
  groundPoundRadius: number;
  blastRadius: number;
  enemyDamage: number;
  enemyKnockback: number;
  momentumGain: number;
  momentumDecay: number;
  healOnCombo: number;
}

export interface MetaProgression {
  cores: number;
  runs: number;
  clears: number;
  bossKills: number;
  bestDepth: number;
  legacyRank: number;
}

export interface RunDirectorSnapshot {
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
  meta: MetaProgression;
  targetSeconds: number;
  pace: number;
}

interface StoredMeta {
  cores?: number;
  runs?: number;
  clears?: number;
  bossKills?: number;
  bestDepth?: number;
}

const META_KEY = "loop-rogue:meta-v2";
const UPGRADE_THRESHOLDS = [90, 220, 390, 610, 880, 1200] as const;

const UPGRADE_CATALOG: readonly UpgradeCard[] = [
  { id: "heavy-hands", title: "HEAVY HANDS", description: "パンチ破壊範囲+18% / 敵ダメージ+1", rarity: "COMMON" },
  { id: "shockwave-core", title: "SHOCKWAVE CORE", description: "地面叩き範囲+28% / 衝撃破壊力上昇", rarity: "RARE" },
  { id: "rush-drive", title: "RUSH DRIVE", description: "移動速度+14% / 加速+18%", rarity: "COMMON" },
  { id: "ore-reactor", title: "ORE REACTOR", description: "鉱石・連鎖破壊のMomentum獲得+35%", rarity: "RARE" },
  { id: "combo-repair", title: "COMBO REPAIR", description: "COMBO 4以上の撃破時にHPを回復", rarity: "RARE" },
  { id: "deep-diver", title: "DEEP DIVER", description: "深部ほど移動と破壊が加速する", rarity: "COMMON" },
  { id: "overdrive", title: "OVERDRIVE", description: "BREAK MODEの持続時間+1.5秒", rarity: "EPIC" },
  { id: "breaker-rhythm", title: "BREAKER RHYTHM", description: "パンチ間隔-16% / リーチ+10%", rarity: "COMMON" },
  { id: "blast-lattice", title: "BLAST LATTICE", description: "鉱石爆発範囲+24% / 敵への押し出し強化", rarity: "RARE" },
  { id: "second-wind", title: "SECOND WIND", description: "取得時にHP回復 / Momentum減衰-15%", rarity: "EPIC" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashText(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export class RunDirector {
  private seed = "run";
  private difficulty: "easy" | "normal" | "hard" = "normal";
  private momentum = 0;
  private breakSeconds = 0;
  private depthTier = 1;
  private danger = 1;
  private runLevel = 0;
  private runXp = 0;
  private pendingChoices: UpgradeCard[] = [];
  private upgrades: UpgradeId[] = [];
  private bossActive = false;
  private bossDefeated = false;
  private bossHp = 0;
  private bossMaxHp = 0;
  private maxDepth = 0;
  private runEnded = false;
  private meta = this.loadMeta();
  private pace = 0;

  reset(seed: string, difficulty: "easy" | "normal" | "hard" = "normal"): void {
    this.seed = seed || "run";
    this.difficulty = difficulty;
    this.momentum = Math.min(24, this.meta.legacyRank * 3);
    this.breakSeconds = 0;
    this.depthTier = 1;
    this.danger = 1;
    this.runLevel = 0;
    this.runXp = 0;
    this.pendingChoices = [];
    this.upgrades = [];
    this.bossActive = false;
    this.bossDefeated = false;
    this.bossHp = 0;
    this.bossMaxHp = 0;
    this.maxDepth = 0;
    this.runEnded = false;
    this.pace = 0;
  }

  get isUpgradePending(): boolean {
    return this.pendingChoices.length > 0;
  }

  update(delta: number, depthProgress: number, elapsedSeconds: number): void {
    const normalizedDepth = clamp(depthProgress, 0, 1);
    this.maxDepth = Math.max(this.maxDepth, normalizedDepth);
    const timeProgress = clamp(elapsedSeconds / 600, 0, 1);
    this.pace = Math.max(normalizedDepth, timeProgress * 0.82);
    this.depthTier = clamp(1 + Math.floor(this.pace * 5), 1, 6);
    const difficultyBase = this.difficulty === "easy" ? 0.86 : this.difficulty === "hard" ? 1.2 : 1;
    this.danger = Math.round((difficultyBase * (1 + this.pace * 1.8)) * 100) / 100;

    if (this.isUpgradePending) return;
    if (this.breakSeconds > 0) {
      this.breakSeconds = Math.max(0, this.breakSeconds - delta);
      if (this.breakSeconds === 0) this.momentum = Math.max(this.momentum, 32);
      return;
    }

    const modifiers = this.getModifiers();
    const decay = (5.2 + this.depthTier * 0.32) * modifiers.momentumDecay * delta;
    this.momentum = Math.max(0, this.momentum - decay);
    if (this.momentum >= 100) this.activateBreakMode();
  }

  recordDestruction(destroyed: number, oreDestroyed: number): void {
    if (destroyed <= 0 && oreDestroyed <= 0) return;
    const modifiers = this.getModifiers();
    this.runXp += destroyed * 1.45 + oreDestroyed * 14;
    this.addMomentum((destroyed * 2.4 + oreDestroyed * 12) * modifiers.momentumGain);
    this.checkUpgradeThreshold();
  }

  recordEnemyDefeat(isBoss = false): void {
    this.runXp += isBoss ? 220 : 48;
    this.addMomentum(isBoss ? 65 : 24);
    if (isBoss) {
      this.bossActive = false;
      this.bossDefeated = true;
      this.bossHp = 0;
    }
    this.checkUpgradeThreshold();
  }

  recordGroundPound(destroyed: number, enemiesHit: number): void {
    this.runXp += destroyed * 1.1 + enemiesHit * 24;
    this.addMomentum(8 + destroyed * 1.4 + enemiesHit * 14);
    this.checkUpgradeThreshold();
  }

  selectUpgrade(id: UpgradeId): boolean {
    if (!this.pendingChoices.some((choice) => choice.id === id)) return false;
    this.upgrades.push(id);
    this.pendingChoices = [];
    this.runLevel += 1;
    return true;
  }

  getUpgradeChoice(id: UpgradeId): UpgradeCard | undefined {
    return UPGRADE_CATALOG.find((entry) => entry.id === id);
  }

  shouldSpawnBoss(depthProgress: number, elapsedSeconds: number): boolean {
    if (this.bossActive || this.bossDefeated) return false;
    const enoughGrowth = this.runLevel >= 2 || this.runXp >= 360;
    return enoughGrowth && (depthProgress >= 0.72 || elapsedSeconds >= 480);
  }

  beginBoss(maxHp: number): void {
    this.bossActive = true;
    this.bossDefeated = false;
    this.bossMaxHp = Math.max(1, maxHp);
    this.bossHp = this.bossMaxHp;
    this.addMomentum(20);
  }

  updateBossHp(hp: number, maxHp = this.bossMaxHp): void {
    this.bossMaxHp = Math.max(1, maxHp);
    this.bossHp = clamp(hp, 0, this.bossMaxHp);
  }

  healAmountForCombo(combo: number): number {
    const heal = this.getModifiers().healOnCombo;
    return combo >= 4 ? heal : 0;
  }

  finishRun(cleared: boolean): MetaProgression {
    if (this.runEnded) return this.meta;
    this.runEnded = true;
    const earned = (this.bossDefeated ? 1 : 0) + (cleared ? 2 : 0) + (this.maxDepth >= 0.9 ? 1 : 0);
    const next: StoredMeta = {
      cores: this.meta.cores + earned,
      runs: this.meta.runs + 1,
      clears: this.meta.clears + (cleared ? 1 : 0),
      bossKills: this.meta.bossKills + (this.bossDefeated ? 1 : 0),
      bestDepth: Math.max(this.meta.bestDepth, Math.round(this.maxDepth * 100)),
    };
    this.meta = this.normalizeMeta(next);
    this.saveMeta(next);
    return this.meta;
  }

  getModifiers(): RunModifiers {
    const count = (id: UpgradeId) => this.upgrades.reduce((total, upgrade) => total + (upgrade === id ? 1 : 0), 0);
    const heavy = count("heavy-hands");
    const shockwave = count("shockwave-core");
    const rush = count("rush-drive");
    const reactor = count("ore-reactor");
    const repair = count("combo-repair");
    const diver = count("deep-diver");
    const overdrive = count("overdrive");
    const rhythm = count("breaker-rhythm");
    const blast = count("blast-lattice");
    const secondWind = count("second-wind");
    const legacy = this.meta.legacyRank;
    const breakActive = this.breakSeconds > 0;
    const deepScale = 1 + diver * Math.max(0, this.depthTier - 1) * 0.025;

    return {
      moveSpeed: (1 + legacy * 0.015 + rush * 0.14) * deepScale * (breakActive ? 1.55 : 1),
      acceleration: (1 + rush * 0.18) * (breakActive ? 1.3 : 1),
      jumpVelocity: 1 + rush * 0.04 + (breakActive ? 0.08 : 0),
      punchCooldown: Math.max(0.42, 1 - rhythm * 0.16) * (breakActive ? 0.58 : 1),
      punchRange: 1 + rhythm * 0.1 + (breakActive ? 0.08 : 0),
      punchRadius: (1 + heavy * 0.18) * deepScale * (breakActive ? 1.36 : 1),
      groundPoundRadius: (1 + shockwave * 0.28) * deepScale * (breakActive ? 1.3 : 1),
      blastRadius: (1 + blast * 0.24) * (breakActive ? 1.18 : 1),
      enemyDamage: 1 + heavy + (breakActive ? 2 : 0),
      enemyKnockback: 1 + blast * 0.22 + (breakActive ? 0.65 : 0),
      momentumGain: 1 + reactor * 0.35 + legacy * 0.015,
      momentumDecay: Math.max(0.5, 1 - secondWind * 0.15 - overdrive * 0.05),
      healOnCombo: repair > 0 ? 2 + repair : 0,
    };
  }

  get snapshot(): RunDirectorSnapshot {
    return {
      momentum: Math.round(this.momentum),
      breakMode: this.breakSeconds > 0,
      breakSeconds: Math.round(this.breakSeconds * 10) / 10,
      depthTier: this.depthTier,
      danger: this.danger,
      runLevel: this.runLevel,
      runXp: Math.round(this.runXp),
      nextUpgradeXp: UPGRADE_THRESHOLDS[this.runLevel] ?? UPGRADE_THRESHOLDS[UPGRADE_THRESHOLDS.length - 1],
      pendingUpgrade: this.isUpgradePending,
      upgradeChoices: this.pendingChoices,
      upgrades: this.upgrades,
      bossActive: this.bossActive,
      bossDefeated: this.bossDefeated,
      bossHp: this.bossHp,
      bossMaxHp: this.bossMaxHp,
      meta: this.meta,
      targetSeconds: 600,
      pace: Math.round(this.pace * 100),
    };
  }

  getBreakVisualStrength(): number {
    if (this.breakSeconds <= 0) return this.momentum / 100;
    return 1;
  }

  private addMomentum(amount: number): void {
    if (this.breakSeconds > 0) {
      this.breakSeconds = Math.min(this.breakDuration() + 2.5, this.breakSeconds + amount * 0.008);
      return;
    }
    this.momentum = clamp(this.momentum + Math.max(0, amount), 0, 100);
    if (this.momentum >= 100) this.activateBreakMode();
  }

  private activateBreakMode(): void {
    this.momentum = 100;
    this.breakSeconds = this.breakDuration();
  }

  private breakDuration(): number {
    const overdrive = this.upgrades.filter((upgrade) => upgrade === "overdrive").length;
    return 5.5 + overdrive * 1.5 + this.meta.legacyRank * 0.12;
  }

  private checkUpgradeThreshold(): void {
    if (this.isUpgradePending || this.runLevel >= UPGRADE_THRESHOLDS.length) return;
    if (this.runXp < UPGRADE_THRESHOLDS[this.runLevel]) return;
    this.pendingChoices = this.buildChoices(this.runLevel);
  }

  private buildChoices(level: number): UpgradeCard[] {
    const start = hashText(`${this.seed}:${level}:${Math.floor(this.runXp)}`) % UPGRADE_CATALOG.length;
    const choices: UpgradeCard[] = [];
    for (let offset = 0; offset < UPGRADE_CATALOG.length && choices.length < 3; offset += 1) {
      const choice = UPGRADE_CATALOG[(start + offset * 3) % UPGRADE_CATALOG.length];
      const stacks = this.upgrades.filter((upgrade) => upgrade === choice.id).length;
      if (stacks >= 2) continue;
      if (!choices.some((entry) => entry.id === choice.id)) choices.push(choice);
    }
    return choices;
  }

  private loadMeta(): MetaProgression {
    if (typeof window === "undefined") return this.normalizeMeta({});
    try {
      const parsed = JSON.parse(window.localStorage.getItem(META_KEY) ?? "{}") as StoredMeta;
      return this.normalizeMeta(parsed);
    } catch {
      return this.normalizeMeta({});
    }
  }

  private saveMeta(meta: StoredMeta): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {
      // Storage can be unavailable in Safari private browsing. Run progression still works in-memory.
    }
  }

  private normalizeMeta(meta: StoredMeta): MetaProgression {
    const cores = Math.max(0, Math.floor(meta.cores ?? 0));
    return {
      cores,
      runs: Math.max(0, Math.floor(meta.runs ?? 0)),
      clears: Math.max(0, Math.floor(meta.clears ?? 0)),
      bossKills: Math.max(0, Math.floor(meta.bossKills ?? 0)),
      bestDepth: clamp(Math.floor(meta.bestDepth ?? 0), 0, 100),
      legacyRank: clamp(Math.floor(cores / 3), 0, 8),
    };
  }
}
