import {
  createStandardWall,
  STANDARD_WALL_SIZE,
  TILE_KIND_COUNT,
  type Tile,
} from "./tile.ts";

export type RandomSource = () => number;

export interface InitialDeal {
  readonly hands: readonly (readonly Tile[])[];
  readonly drawIndex: number;
  readonly remainingCount: number;
}

const PLAYER_COUNT = 4;
const DEALER_HAND_SIZE = 14;
const OTHER_HAND_SIZE = 13;

export function createShuffledWall(random: RandomSource = secureRandom): Tile[] {
  return shuffleWall(createStandardWall(), random);
}

export function createSeededWall(seed: string | number): Tile[] {
  return createShuffledWall(createSeededRandom(seed));
}

export function shuffleWall(
  source: readonly Tile[],
  random: RandomSource,
): Tile[] {
  validateWall(source);
  const wall = [...source];
  for (let index = wall.length - 1; index > 0; index -= 1) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Random source must return a value in [0, 1)");
    }
    const swapIndex = Math.floor(value * (index + 1));
    [wall[index], wall[swapIndex]] = [wall[swapIndex], wall[index]];
  }
  return wall;
}

export function dealInitialHands(
  wall: readonly Tile[],
  dealerSeat = 0,
): InitialDeal {
  validateWall(wall);
  assertSeat(dealerSeat);

  const hands = Array.from({ length: PLAYER_COUNT }, () => [] as Tile[]);
  let drawIndex = 0;

  // Three rounds of four tiles, starting from the dealer.
  for (let round = 0; round < 3; round += 1) {
    for (let offset = 0; offset < PLAYER_COUNT; offset += 1) {
      const seat = (dealerSeat + offset) % PLAYER_COUNT;
      hands[seat].push(...wall.slice(drawIndex, drawIndex + 4));
      drawIndex += 4;
    }
  }

  // Each player receives a thirteenth tile, then the dealer receives one extra.
  for (let offset = 0; offset < PLAYER_COUNT; offset += 1) {
    const seat = (dealerSeat + offset) % PLAYER_COUNT;
    hands[seat].push(wall[drawIndex]);
    drawIndex += 1;
  }
  hands[dealerSeat].push(wall[drawIndex]);
  drawIndex += 1;

  if (
    hands[dealerSeat].length !== DEALER_HAND_SIZE
    || hands.some(
      (hand, seat) => seat !== dealerSeat && hand.length !== OTHER_HAND_SIZE,
    )
  ) {
    throw new Error("Initial deal invariant failed");
  }

  return {
    hands,
    drawIndex,
    remainingCount: wall.length - drawIndex,
  };
}

export function validateWall(wall: readonly Tile[]): void {
  if (wall.length !== STANDARD_WALL_SIZE) {
    throw new RangeError(`A standard wall must contain ${STANDARD_WALL_SIZE} tiles`);
  }

  const ids = new Set<number>();
  const kindCounts = Array<number>(TILE_KIND_COUNT).fill(0);
  for (const tile of wall) {
    if (!Number.isInteger(tile.id) || tile.id < 0 || tile.id >= STANDARD_WALL_SIZE) {
      throw new RangeError(`Invalid physical tile id: ${tile.id}`);
    }
    if (ids.has(tile.id)) throw new Error(`Duplicate physical tile id: ${tile.id}`);
    ids.add(tile.id);
    if (!Number.isInteger(tile.kind) || tile.kind < 0 || tile.kind >= TILE_KIND_COUNT) {
      throw new RangeError(`Invalid tile kind: ${tile.kind}`);
    }
    kindCounts[tile.kind] += 1;
  }

  if (kindCounts.some((count) => count !== 4)) {
    throw new Error("A standard wall must contain four tiles of every kind");
  }
}

export function createSeededRandom(seed: string | number): RandomSource {
  let state = hashSeed(String(seed));
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function secureRandom(): number {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("A cryptographically secure random source is required");
  }
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] / 4_294_967_296;
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function assertSeat(seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= PLAYER_COUNT) {
    throw new RangeError(`Seat must be between 0 and ${PLAYER_COUNT - 1}`);
  }
}
