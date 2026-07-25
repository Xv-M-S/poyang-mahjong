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
import { createSeededWall } from "../src/wall.ts";

test("round starts with dealer ready to discard", () => {
  const round = new SingleRoundEngine({
    roundId: "round-start",
    dealerSeat: 2,
    wall: createSeededWall("round-start"),
  });
  const snapshot = round.getSnapshot();

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.phase, "PLAYING");
  assert.equal(snapshot.currentSeat, 2);
  assert.equal(snapshot.turnAction, "DISCARD");
  assert.deepEqual(snapshot.hands.map((hand) => hand.length), [13, 13, 14, 13]);
  assert.equal(snapshot.remainingTiles, 83);
  assert.deepEqual(round.getEvents().map((event) => event.type), ["ROUND_STARTED"]);
});

test("discard, reaction resolution, and next draw advance one turn", () => {
  const round = new SingleRoundEngine({
    roundId: "round-turn",
    wall: createSeededWall("round-turn"),
  });

  const initial = round.getSnapshot();
  const discarded = round.discard(0, initial.hands[0][0].id, initial.version);
  const reaction = round.getSnapshot();
  assert.equal(reaction.phase, "REACTION_WINDOW");
  assert.equal(reaction.hands[0].length, 13);
  assert.equal(reaction.pendingDiscard?.tile.id, discarded.id);

  round.resolveNoClaim(reaction.version);
  const awaitingDraw = round.getSnapshot();
  assert.equal(awaitingDraw.currentSeat, 1);
  assert.equal(awaitingDraw.turnAction, "DRAW");

  const drawn = round.draw(1, awaitingDraw.version);
  const afterDraw = round.getSnapshot();
  assert.ok(drawn);
  assert.equal(afterDraw.hands[1].length, 14);
  assert.equal(afterDraw.turnAction, "DISCARD");
  assert.equal(afterDraw.remainingTiles, 82);
  assert.deepEqual(
    round.getEvents().map((event) => event.sequence),
    [1, 2, 3, 4],
  );
});

test("round rejects stale, out-of-turn, and foreign-tile operations", () => {
  const round = new SingleRoundEngine({
    roundId: "round-errors",
    wall: createSeededWall("round-errors"),
  });
  const snapshot = round.getSnapshot();

  assertRoundError(
    () => round.discard(1, snapshot.hands[1][0].id, snapshot.version),
    "NOT_CURRENT_PLAYER",
  );
  assertRoundError(
    () => round.discard(0, snapshot.hands[1][0].id, snapshot.version),
    "TILE_NOT_IN_HAND",
  );

  round.discard(0, snapshot.hands[0][0].id, snapshot.version);
  assertRoundError(
    () => round.resolveNoClaim(snapshot.version),
    "STALE_VERSION",
  );
});

test("eligible dealer hand can settle by self draw", () => {
  const winningKinds = [
    "2m", "3m", "4m",
    "3m", "4m", "5m",
    "4p", "5p", "6p",
    "6s", "7s", "8s",
    "5p", "5p",
  ].map(parseTile);
  const round = new SingleRoundEngine({
    roundId: "round-self-draw",
    wall: wallWithDealerKinds(winningKinds),
  });

  const outcome = round.declareSelfDrawWin(0, round.getSnapshot().version);
  const settled = round.getSnapshot();
  assert.equal(outcome.reason, "SELF_DRAW");
  assert.equal(outcome.winnerSeat, 0);
  assert.ok(outcome.patterns.includes("ALL_SIMPLES"));
  assert.equal(settled.phase, "ROUND_SETTLEMENT");
  assert.equal(settled.currentSeat, null);
  assert.equal(round.getEvents().at(-1)?.type, "ROUND_SETTLED");
});

test("round settles as a draw when all wall tiles are consumed", () => {
  const round = new SingleRoundEngine({
    roundId: "round-wall-exhausted",
    wall: createSeededWall("round-wall-exhausted"),
  });

  let operations = 0;
  while (round.getSnapshot().phase !== "ROUND_SETTLEMENT") {
    const snapshot = round.getSnapshot();
    operations += 1;
    assert.ok(operations < 300, "round should settle before operation guard");

    if (snapshot.phase === "REACTION_WINDOW") {
      round.resolveNoClaim(snapshot.version);
    } else if (snapshot.turnAction === "DRAW") {
      round.draw(snapshot.currentSeat!, snapshot.version);
    } else {
      const seat = snapshot.currentSeat!;
      round.discard(seat, snapshot.hands[seat][0].id, snapshot.version);
    }
  }

  const settled = round.getSnapshot();
  assert.equal(settled.remainingTiles, 0);
  assert.equal(settled.outcome?.reason, "WALL_EXHAUSTED");
  assert.equal(settled.outcome?.winnerSeat, null);
});

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

function wallWithDealerKinds(kinds: readonly number[]): Tile[] {
  assert.equal(kinds.length, 14);
  const source = createStandardWall();
  const selectedIds = new Set<number>();
  const dealerPositions = [0, 1, 2, 3, 16, 17, 18, 19, 32, 33, 34, 35, 48, 52];
  const selected = kinds.map((kind) => {
    const tile = source.find(
      (candidate) =>
        candidate.kind === kind
        && !selectedIds.has(candidate.id),
    );
    assert.ok(tile, `missing physical tile for kind ${kind}`);
    selectedIds.add(tile.id);
    return tile;
  });

  const remaining = source.filter((tile) => !selectedIds.has(tile.id));
  const wall = Array<Tile>(source.length);
  dealerPositions.forEach((position, index) => {
    wall[position] = selected[index];
  });
  let remainingIndex = 0;
  for (let index = 0; index < wall.length; index += 1) {
    if (!wall[index]) {
      wall[index] = remaining[remainingIndex];
      remainingIndex += 1;
    }
  }
  return wall;
}
