import assert from "node:assert/strict";
import test from "node:test";

import { SingleRoundEngine } from "../src/round-engine.ts";
import {
  createStandardWall,
  parseTile,
  type Tile,
} from "../src/tile.ts";

test("concealed kong removes four hand tiles and requires a replacement draw", () => {
  const round = createRound({ 0: ["F", "F", "F", "F"] });
  const kongIds = findTileIds(round, 0, ["F", "F", "F", "F"]);

  const meld = round.declareConcealedKong(
    0,
    kongIds,
    round.getSnapshot().version,
  );
  const beforeDraw = round.getSnapshot();
  assert.equal(meld.kongType, "CONCEALED");
  assert.equal(beforeDraw.hands[0].length, 10);
  assert.equal(beforeDraw.melds[0][0].tiles.length, 4);
  assert.equal(beforeDraw.turnAction, "DRAW_REPLACEMENT");

  round.draw(0, beforeDraw.version);
  assert.equal(round.getSnapshot().hands[0].length, 11);
  assert.equal(round.getSnapshot().turnAction, "DISCARD");
});

test("added kong upgrades an existing PENG after all players pass", () => {
  const round = createRound({
    0: ["4p"],
    1: ["4p", "4p", "4p"],
  });
  createPengForSeatOne(round, "4p");

  const addedTileId = findTileIds(round, 1, ["4p"])[0];
  round.proposeAddedKong(1, addedTileId, round.getSnapshot().version);
  assert.equal(round.getSnapshot().phase, "ROB_KONG_WINDOW");

  for (const seat of [0, 2, 3]) {
    round.submitRobKongReaction(
      seat,
      "PASS",
      round.getSnapshot().version,
    );
  }
  const result = round.resolveRobKongReactions(round.getSnapshot().version);
  const snapshot = round.getSnapshot();

  assert.equal(result.action, "NO_CLAIM");
  assert.equal(snapshot.phase, "PLAYING");
  assert.equal(snapshot.currentSeat, 1);
  assert.equal(snapshot.turnAction, "DRAW_REPLACEMENT");
  assert.equal(snapshot.melds[1][0].type, "GANG");
  assert.equal(snapshot.melds[1][0].kongType, "ADDED");
  assert.equal(snapshot.melds[1][0].tiles.length, 4);
});

test("rob-kong HU cancels the added kong and settles against declarer", () => {
  const round = createRound({
    0: ["4p"],
    1: ["4p", "4p", "4p"],
    3: [
      "2m", "3m", "4m",
      "3m", "4m", "5m",
      "5p", "6p",
      "6s", "7s", "8s",
      "7p", "7p",
    ],
  });
  createPengForSeatOne(round, "4p");

  const addedTileId = findTileIds(round, 1, ["4p"])[0];
  round.proposeAddedKong(1, addedTileId, round.getSnapshot().version);
  round.submitRobKongReaction(0, "PASS", round.getSnapshot().version);
  round.submitRobKongReaction(2, "PASS", round.getSnapshot().version);
  round.submitRobKongReaction(3, "HU", round.getSnapshot().version);
  const result = round.resolveRobKongReactions(round.getSnapshot().version);
  const snapshot = round.getSnapshot();

  assert.equal(result.action, "HU");
  assert.equal(snapshot.phase, "ROUND_SETTLEMENT");
  assert.equal(snapshot.outcome?.reason, "ROB_KONG_WIN");
  assert.equal(snapshot.outcome?.winnerSeat, 3);
  assert.equal(snapshot.outcome?.loserSeat, 1);
  assert.equal(snapshot.melds[1][0].type, "PENG");
  assert.equal(snapshot.hands[1].some((tile) => tile.id === addedTileId), true);
});

type Seat = 0 | 1 | 2 | 3;

function createRound(
  requirements: Partial<Record<Seat, readonly string[]>>,
): SingleRoundEngine {
  return new SingleRoundEngine({
    roundId: "advanced-kong-test",
    wall: wallWithRequiredHands(requirements),
  });
}

function createPengForSeatOne(round: SingleRoundEngine, code: string): void {
  const initial = round.getSnapshot();
  const discard = initial.hands[0].find((tile) => tile.kind === parseTile(code));
  assert.ok(discard);
  round.discard(0, discard.id, initial.version);
  round.submitReaction(
    1,
    "PENG",
    findTileIds(round, 1, [code, code]),
    round.getSnapshot().version,
  );
  round.submitReaction(2, "PASS", [], round.getSnapshot().version);
  round.submitReaction(3, "PASS", [], round.getSnapshot().version);
  round.resolveReactions(round.getSnapshot().version);
  assert.equal(round.getSnapshot().melds[1][0].type, "PENG");
}

function wallWithRequiredHands(
  requirements: Partial<Record<Seat, readonly string[]>>,
): Tile[] {
  const positions: Record<Seat, readonly number[]> = {
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
    codes.forEach((code, index) => {
      const kind = parseTile(code);
      const tile = source.find(
        (candidate) => candidate.kind === kind && !usedIds.has(candidate.id),
      );
      assert.ok(tile, `not enough physical copies of ${code}`);
      wall[positions[seat][index]] = tile;
      usedIds.add(tile.id);
    });
  }

  const remaining = source.filter((tile) => !usedIds.has(tile.id));
  let cursor = 0;
  for (let index = 0; index < wall.length; index += 1) {
    if (!wall[index]) {
      wall[index] = remaining[cursor];
      cursor += 1;
    }
  }
  return wall;
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
