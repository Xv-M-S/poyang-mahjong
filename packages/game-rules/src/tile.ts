export type Suit = "WAN" | "TONG" | "TIAO" | "HONOR";

export interface Tile {
  readonly id: number;
  readonly kind: number;
  readonly suit: Suit;
  readonly rank: number;
}

const HONOR_CODES = ["E", "S", "W", "N", "C", "F", "P"] as const;
const SUIT_OFFSETS: Readonly<Record<Exclude<Suit, "HONOR">, number>> = {
  WAN: 0,
  TONG: 9,
  TIAO: 18,
};

export const TILE_KIND_COUNT = 34;
export const STANDARD_WALL_SIZE = 136;

export function tileKind(suit: Suit, rank: number): number {
  if (suit === "HONOR") {
    if (!Number.isInteger(rank) || rank < 1 || rank > 7) {
      throw new RangeError(`Honor rank must be between 1 and 7: ${rank}`);
    }
    return 27 + rank - 1;
  }

  if (!Number.isInteger(rank) || rank < 1 || rank > 9) {
    throw new RangeError(`Suited tile rank must be between 1 and 9: ${rank}`);
  }
  return SUIT_OFFSETS[suit] + rank - 1;
}

export function tileSuit(kind: number): Suit {
  assertTileKind(kind);
  if (kind < 9) return "WAN";
  if (kind < 18) return "TONG";
  if (kind < 27) return "TIAO";
  return "HONOR";
}

export function tileRank(kind: number): number {
  assertTileKind(kind);
  return kind < 27 ? (kind % 9) + 1 : kind - 27 + 1;
}

export function tileCode(kind: number): string {
  const suit = tileSuit(kind);
  const rank = tileRank(kind);
  if (suit === "HONOR") return HONOR_CODES[rank - 1];
  const suffix = suit === "WAN" ? "m" : suit === "TONG" ? "p" : "s";
  return `${rank}${suffix}`;
}

export function parseTile(code: string): number {
  const normalized = code.trim();
  const honorIndex = HONOR_CODES.indexOf(
    normalized.toUpperCase() as (typeof HONOR_CODES)[number],
  );
  if (honorIndex >= 0) return tileKind("HONOR", honorIndex + 1);

  const match = /^([1-9])([mps])$/i.exec(normalized);
  if (!match) throw new Error(`Invalid tile code: ${code}`);
  const suit: Exclude<Suit, "HONOR"> =
    match[2].toLowerCase() === "m"
      ? "WAN"
      : match[2].toLowerCase() === "p"
        ? "TONG"
        : "TIAO";
  return tileKind(suit, Number(match[1]));
}

export function countsFromCodes(codes: readonly string[]): number[] {
  const counts = emptyCounts();
  for (const code of codes) {
    const kind = parseTile(code);
    counts[kind] += 1;
    if (counts[kind] > 4) throw new Error(`More than four copies of ${code}`);
  }
  return counts;
}

export function emptyCounts(): number[] {
  return Array<number>(TILE_KIND_COUNT).fill(0);
}

export function createStandardWall(): Tile[] {
  const wall: Tile[] = [];
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      wall.push({
        id: kind * 4 + copy,
        kind,
        suit: tileSuit(kind),
        rank: tileRank(kind),
      });
    }
  }
  return wall;
}

export function assertCounts(counts: readonly number[]): void {
  if (counts.length !== TILE_KIND_COUNT) {
    throw new RangeError(`Expected ${TILE_KIND_COUNT} tile counts`);
  }
  counts.forEach((count, kind) => {
    if (!Number.isInteger(count) || count < 0 || count > 4) {
      throw new RangeError(`Invalid count ${count} for ${tileCode(kind)}`);
    }
  });
}

function assertTileKind(kind: number): void {
  if (!Number.isInteger(kind) || kind < 0 || kind >= TILE_KIND_COUNT) {
    throw new RangeError(`Invalid tile kind: ${kind}`);
  }
}
