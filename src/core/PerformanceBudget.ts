export interface PerformanceBudget {
  maxPixelRatio: number;
  maxChunkRebuildsPerFrame: number;
  maxDebris: number;
  maxDust: number;
  maxEnemies: number;
}

export const IPHONE_PERFORMANCE_BUDGET: Readonly<PerformanceBudget> = Object.freeze({
  maxPixelRatio: 1.5,
  maxChunkRebuildsPerFrame: 1,
  maxDebris: 40,
  maxDust: 100,
  maxEnemies: 5,
});
