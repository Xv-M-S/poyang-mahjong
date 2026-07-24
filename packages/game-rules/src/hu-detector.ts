import { assertCounts } from "./tile.ts";

export type WinningShape = "STANDARD" | "SEVEN_PAIRS" | "THIRTEEN_ORPHANS";

const ORPHAN_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

export function detectWinningShapes(
  concealedCounts: readonly number[],
  openMeldCount = 0,
): WinningShape[] {
  assertCounts(concealedCounts);
  const shapes: WinningShape[] = [];
  if (isStandardWin(concealedCounts, openMeldCount)) shapes.push("STANDARD");
  if (openMeldCount === 0 && isSevenPairs(concealedCounts)) {
    shapes.push("SEVEN_PAIRS");
  }
  if (openMeldCount === 0 && isThirteenOrphans(concealedCounts)) {
    shapes.push("THIRTEEN_ORPHANS");
  }
  return shapes;
}

export function isStandardWin(
  concealedCounts: readonly number[],
  openMeldCount = 0,
): boolean {
  assertCounts(concealedCounts);
  if (!Number.isInteger(openMeldCount) || openMeldCount < 0 || openMeldCount > 4) {
    return false;
  }

  const meldsNeeded = 4 - openMeldCount;
  if (sum(concealedCounts) !== meldsNeeded * 3 + 2) return false;

  for (let pair = 0; pair < concealedCounts.length; pair += 1) {
    if (concealedCounts[pair] < 2) continue;
    const remainder = [...concealedCounts];
    remainder[pair] -= 2;
    if (canFormMelds(remainder, meldsNeeded, new Map<string, boolean>())) {
      return true;
    }
  }
  return false;
}

export function isSevenPairs(counts: readonly number[]): boolean {
  assertCounts(counts);
  if (sum(counts) !== 14) return false;
  return counts.reduce((pairs, count) => pairs + Math.floor(count / 2), 0) === 7
    && counts.every((count) => count % 2 === 0);
}

export function isThirteenOrphans(counts: readonly number[]): boolean {
  assertCounts(counts);
  if (sum(counts) !== 14) return false;

  const orphanSet = new Set(ORPHAN_KINDS);
  let pairFound = false;
  for (let kind = 0; kind < counts.length; kind += 1) {
    const count = counts[kind];
    if (!orphanSet.has(kind) && count !== 0) return false;
    if (orphanSet.has(kind)) {
      if (count === 0) return false;
      if (count === 2) pairFound = true;
      if (count > 2) return false;
    }
  }
  return pairFound;
}

function canFormMelds(
  counts: number[],
  meldsNeeded: number,
  memo: Map<string, boolean>,
): boolean {
  if (meldsNeeded === 0) return sum(counts) === 0;

  const key = `${meldsNeeded}:${counts.join("")}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const first = counts.findIndex((count) => count > 0);
  if (first < 0) return false;

  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (canFormMelds(counts, meldsNeeded - 1, memo)) {
      counts[first] += 3;
      memo.set(key, true);
      return true;
    }
    counts[first] += 3;
  }

  const rankIndex = first % 9;
  if (
    first < 27
    && rankIndex <= 6
    && counts[first + 1] > 0
    && counts[first + 2] > 0
  ) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    if (canFormMelds(counts, meldsNeeded - 1, memo)) {
      counts[first] += 1;
      counts[first + 1] += 1;
      counts[first + 2] += 1;
      memo.set(key, true);
      return true;
    }
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }

  memo.set(key, false);
  return false;
}

function sum(counts: readonly number[]): number {
  return counts.reduce((total, count) => total + count, 0);
}
