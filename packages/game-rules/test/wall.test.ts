import assert from "node:assert/strict";
import test from "node:test";

import {
  createSeededWall,
  dealInitialHands,
  validateWall,
} from "../src/wall.ts";

test("seeded shuffle is deterministic and keeps a valid wall", () => {
  const first = createSeededWall("round-2026-001");
  const second = createSeededWall("round-2026-001");
  const different = createSeededWall("round-2026-002");

  assert.deepEqual(
    first.map((tile) => tile.id),
    second.map((tile) => tile.id),
  );
  assert.notDeepEqual(
    first.map((tile) => tile.id),
    different.map((tile) => tile.id),
  );
  assert.doesNotThrow(() => validateWall(first));
});

test("initial deal gives dealer 14 tiles, others 13, and leaves 83", () => {
  const wall = createSeededWall("deal-test");
  const deal = dealInitialHands(wall, 2);

  assert.deepEqual(deal.hands.map((hand) => hand.length), [13, 13, 14, 13]);
  assert.equal(deal.drawIndex, 53);
  assert.equal(deal.remainingCount, 83);

  const dealtIds = deal.hands.flat().map((tile) => tile.id);
  assert.equal(dealtIds.length, 53);
  assert.equal(new Set(dealtIds).size, 53);
  assert.ok(dealtIds.every((id) => !wall.slice(deal.drawIndex).some((tile) => tile.id === id)));
});
