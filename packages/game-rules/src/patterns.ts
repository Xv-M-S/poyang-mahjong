import { detectWinningShapes, type WinningShape } from "./hu-detector.ts";
import { assertCounts, tileRank, tileSuit } from "./tile.ts";

export type MeldType = "CHOW" | "PUNG" | "KONG";

export interface OpenMeld {
  readonly type: MeldType;
  readonly tiles: readonly number[];
}

export type PatternCode =
  | "ALL_SIMPLES"
  | "ALL_PUNGS"
  | "ONE_DRAGON"
  | "SEVEN_PAIRS"
  | "PURE_ONE_SUIT"
  | "MIXED_ONE_SUIT"
  | "ALL_HONORS"
  | "THIRTEEN_ORPHANS"
  | "GREEN_HAND";

export interface HandContext {
  readonly concealedCounts: readonly number[];
  readonly openMelds?: readonly OpenMeld[];
}

export interface HandEvaluation {
  readonly isWinningShape: boolean;
  readonly isEligiblePoyangWin: boolean;
  readonly shapes: readonly WinningShape[];
  readonly patterns: readonly PatternCode[];
}

export function evaluateHand(context: HandContext): HandEvaluation {
  const openMelds = context.openMelds ?? [];
  assertCounts(context.concealedCounts);
  const shapes = detectWinningShapes(context.concealedCounts, openMelds.length);
  if (shapes.length === 0) {
    return {
      isWinningShape: false,
      isEligiblePoyangWin: false,
      shapes,
      patterns: [],
    };
  }

  const fullCounts = mergeOpenMelds(context.concealedCounts, openMelds);
  const patterns = new Set<PatternCode>();

  if (shapes.includes("SEVEN_PAIRS")) patterns.add("SEVEN_PAIRS");
  if (shapes.includes("THIRTEEN_ORPHANS")) patterns.add("THIRTEEN_ORPHANS");
  if (isAllSimples(fullCounts)) patterns.add("ALL_SIMPLES");
  if (isAllPungs(context.concealedCounts, openMelds, shapes)) {
    patterns.add("ALL_PUNGS");
  }
  if (hasOneDragon(fullCounts)) patterns.add("ONE_DRAGON");
  if (isPureOneSuit(fullCounts)) patterns.add("PURE_ONE_SUIT");
  if (isMixedOneSuit(fullCounts)) patterns.add("MIXED_ONE_SUIT");
  if (isAllHonors(fullCounts)) patterns.add("ALL_HONORS");
  if (isGreenHand(fullCounts)) patterns.add("GREEN_HAND");

  return {
    isWinningShape: true,
    isEligiblePoyangWin: patterns.size > 0,
    shapes,
    patterns: [...patterns],
  };
}

function mergeOpenMelds(
  concealedCounts: readonly number[],
  openMelds: readonly OpenMeld[],
): number[] {
  const result = [...concealedCounts];
  for (const meld of openMelds) {
    for (const kind of meld.tiles) {
      if (!Number.isInteger(kind) || kind < 0 || kind >= result.length) {
        throw new RangeError(`Invalid tile kind in open meld: ${kind}`);
      }
      result[kind] += 1;
      if (result[kind] > 4) throw new Error("A hand cannot contain five identical tiles");
    }
  }
  return result;
}

function isAllSimples(counts: readonly number[]): boolean {
  return everyPresentTile(counts, (kind) => {
    const suit = tileSuit(kind);
    const rank = tileRank(kind);
    return suit !== "HONOR" && rank >= 2 && rank <= 8;
  });
}

function isPureOneSuit(counts: readonly number[]): boolean {
  const suits = presentSuits(counts);
  return suits.size === 1 && !suits.has("HONOR");
}

function isMixedOneSuit(counts: readonly number[]): boolean {
  const suits = presentSuits(counts);
  return suits.has("HONOR") && suits.size === 2;
}

function isAllHonors(counts: readonly number[]): boolean {
  return everyPresentTile(counts, (kind) => tileSuit(kind) === "HONOR");
}

function hasOneDragon(counts: readonly number[]): boolean {
  for (const offset of [0, 9, 18]) {
    if (Array.from({ length: 9 }, (_, rank) => counts[offset + rank] > 0).every(Boolean)) {
      return true;
    }
  }
  return false;
}

function isGreenHand(counts: readonly number[]): boolean {
  const greenKinds = new Set([19, 20, 21, 23, 25, 32]);
  return everyPresentTile(counts, (kind) => greenKinds.has(kind));
}

function isAllPungs(
  concealedCounts: readonly number[],
  openMelds: readonly OpenMeld[],
  shapes: readonly WinningShape[],
): boolean {
  if (!shapes.includes("STANDARD") || openMelds.some((meld) => meld.type === "CHOW")) {
    return false;
  }

  for (let pair = 0; pair < concealedCounts.length; pair += 1) {
    if (concealedCounts[pair] < 2) continue;
    const remainder = [...concealedCounts];
    remainder[pair] -= 2;
    if (remainder.every((count) => count % 3 === 0)) return true;
  }
  return false;
}

function presentSuits(counts: readonly number[]): Set<string> {
  const suits = new Set<string>();
  counts.forEach((count, kind) => {
    if (count > 0) suits.add(tileSuit(kind));
  });
  return suits;
}

function everyPresentTile(
  counts: readonly number[],
  predicate: (kind: number) => boolean,
): boolean {
  let found = false;
  for (let kind = 0; kind < counts.length; kind += 1) {
    if (counts[kind] === 0) continue;
    found = true;
    if (!predicate(kind)) return false;
  }
  return found;
}
