import assert from "node:assert/strict";
import test from "node:test";

import {
  SingleRoundEngine,
  type RoundEngineError,
} from "../src/round-engine.ts";
import {
  createStandardWall,
  parseTile,
  type Tile,
} from "../src/tile.ts";

test("next seat can CHI and must discard without drawing", () => {
  const round = roundWithRequiredHands({
    0: ["5m"],
    1: ["4m", "6m"],
  });
  discardFirstTile(round, 0);

  const chiTiles = findTileIds(round, 1, ["4m", "6m"]);
  submit(round, 1, "CHI", chiTiles);
  submit(round, 2, "PASS", []);
  submit(round, 3, "PASS", []);
  const result = round.resolveReactions(round.getSnapshot().version);
  const snapshot = round.getSnapshot();

  assert.equal(result.action, "CHI");
  assert.equal(snapshot.currentSeat, 1);
  assert.equal(snapshot.turnAction, "DISCARD");
  assert.equal(snapshot.hands[1].length, 11);
  assert.equal(snapshot.melds[1][0].type, "CHI");
  assert.equal(snapshot.melds[1][0].tiles.length, 3);
  assert.equal(snapshot.discards[0].length, 0);
});

test("PENG beats CHI when players react to the same discard", () => {
  const round = roundWithRequiredHands({
    0: ["5m"],
    1: ["4m", "6m"],
    2: ["5m", "5m"],
  });
  discardFirstTile(round, 0);

  submit(round, 1, "CHI", findTileIds(round, 1, ["4m", "6m"]));
  submit(round, 2, "PENG", findTileIds(round, 2, ["5m", "5m"]));
  submit(round, 3, "PASS", []);
  const result = round.resolveReactions(round.getSnapshot().version);
  const snapshot = round.getSnapshot();

  assert.equal(result.action, "PENG");
  assert.equal(result.claim?.seat, 2);
  assert.equal(snapshot.currentSeat, 2);
  assert.equal(snapshot.turnAction, "DISCARD");
  assert.equal(snapshot.melds[1].length, 0);
  assert.equal(snapshot.melds[2][0].type, "PENG");
});

test("GANG claims four tiles and requires a replacement draw", () => {
  const round = roundWithRequiredHands({
    0: ["F"],
    3: ["F", "F", "F"],
  });
  discardFirstTile(round, 0);

  submit(round, 1, "PASS", []);
  submit(round, 2, "PASS", []);
  submit(round, 3, "GANG", findTileIds(round, 3, ["F", "F", "F"]));
  const result = round.resolveReactions(round.getSnapshot().version);
  const beforeDraw = round.getSnapshot();

  assert.equal(result.action, "GANG");
  assert.equal(beforeDraw.currentSeat, 3);
  assert.equal(beforeDraw.turnAction, "DRAW_REPLACEMENT");
  assert.equal(beforeDraw.hands[3].length, 10);
  assert.equal(beforeDraw.melds[3][0].tiles.length, 4);

  const drawn = round.draw(3, beforeDraw.version);
  const afterDraw = round.getSnapshot();
  assert.ok(drawn);
  assert.equal(afterDraw.hands[3].length, 11);
  assert.equal(afterDraw.turnAction, "DISCARD");
  assert.equal(round.getEvents().at(-1)?.payload.source, "KONG_REPLACEMENT");
});

test("HU beats CHI and settles the round", () => {
  const round = roundWithRequiredHands({
    0: ["5p"],
    1: ["4p", "6p"],
    3: [
      "2m", "3m", "4m",
      "3m", "4m", "5m",
      "4p", "5p", "6p",
      "6s", "7s", "8s",
      "5p",
    ],
  });
  discardFirstTile(round, 0);

  submit(round, 1, "CHI", findTileIds(round, 1, ["4p", "6p"]));
  submit(round, 2, "PASS", []);
  submit(round, 3, "HU", []);
  const result = round.resolveReactions(round.getSnapshot().version);
  const snapshot = round.getSnapshot();

  assert.equal(result.action, "HU");
  assert.equal(snapshot.phase, "ROUND_SETTLEMENT");
  assert.equal(snapshot.outcome?.reason, "DISCARD_WIN");
  assert.equal(snapshot.outcome?.winnerSeat, 3);
  assert.ok(snapshot.outcome?.patterns.includes("ALL_SIMPLES"));
});

test("CHI is rejected from a seat other than the next player", () => {
  const round = roundWithRequiredHands({
    0: ["5m"],
    2: ["4m", "6m"],
  });
  discardFirstTile(round, 0);

  assertRoundError(
    () =>
      round.submitReaction(
        2,
        "CHI",
        findTileIds(round, 2, ["4m", "6m"]),
        round.getSnapshot().version,
      ),
    "ILLEGAL_CLAIM",
  );
});

test("resolution waits for every seat unless timeout is forced", () => {
  const round = roundWithRequiredHands({ 0: ["1m"] });
  discardFirstTile(round, 0);
  submit(round, 1, "PASS", []);

  assertRoundError(
    () => round.resolveReactions(round.getSnapshot().version),
    "REACTIONS_PENDING",
  );

  const result = round.resolveReactions(round.getSnapshot().version, true);
  assert.equal(result.action, "NO_CLAIM");
  assert.equal(round.getSnapshot().currentSeat, 1);
});

type Seat = 0 | 1 | 2 | 3;

function roundWithRequiredHands(
  requirements: Partial<Record<Seat, readonly string[]>>,
): SingleRoundEngine {
  return new SingleRoundEngine({
    roundId: `meld-test-${Math.random()}`,
    wall: wallWithRequiredHands(requirements),
  });
}

function wallWithRequiredHands(
  requirements: Partial<Record<Seat, readonly string[]>>,
): Tile[] {
  const handPositions: Record<Seat, readonly number[]> = {
    0: [0, 1, 2, 3, 16, 17, 18, 19, 32, 33, 34, 35, 48, 52],
    1: [4, 5, 6, 7, 20, 21, 22, 23, 36, 37, 38, 39, 49],
    2: [8, 9, 10, 11, 24, 25, 26, 27, 40, 41, 42, 43, 50],
    3: [12, 13, 14, 15, 28, 29, 30, 31, 44, 45, 46, 47, 51],
  };
  const source = createStandardWall();
  const usedIds = new Set<number>();
  const wall = Array<Tile>(source.length);

  for (const seat of [0, 1, 2, 3] as const) {
    const codes = requirements[seat] ?? [];
    assert.ok(codes.length <= handPositions[seat].length);
    codes.forEach((code, index) => {
      const kind = parseTile(code);
      const tile = source.find(
        (candidate) => candidate.kind === kind && !usedIds.has(candidate.id),
      );
      assert.ok(tile, `not enough physical copies of ${code}`);
      wall[handPositions[seat][index]] = tile;
      usedIds.add(tile.id);
    });
  }

  const remaining = source.filter((tile) => !usedIds.has(tile.id));
  let remainingIndex = 0;
  for (let index = 0; index < wall.length; index += 1) {
    if (!wall[index]) {
      wall[index] = remaining[remainingIndex];
      remainingIndex += 1;
    }
  }
  return wall;
}

function discardFirstTile(round: SingleRoundEngine, seat: number): void {
  const snapshot = round.getSnapshot();
  round.discard(seat, snapshot.hands[seat][0].id, snapshot.version);
}

function findTileIds(
  round: SingleRoundEngine,
  seat: number,
  codes: readonly string[],
): number[] {
  const available = [...round.getSnapshot().hands[seat]];
  return codes.map((code) => {
    const kind = parseTile(code);
    const index = available.findIndex((tile) => tile.kind === kind);
    assert.ok(index >= 0, `seat ${seat} is missing ${code}`);
    return available.splice(index, 1)[0].id;
  });
}

function submit(
  round: SingleRoundEngine,
  seat: number,
  action: "CHI" | "PENG" | "GANG" | "HU" | "PASS",
  tileIds: readonly number[],
): void {
  round.submitReaction(seat, action, tileIds, round.getSnapshot().version);
}

function assertRoundError(
  operation: () => unknown,
  code: RoundEngineError["code"],
): void {
  assert.throws(operation, (error: unknown) => {
    return error instanceof Error
      && "code" in error
      && error.code === code;
  });
}
