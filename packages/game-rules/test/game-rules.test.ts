import assert from "node:assert/strict";
import test from "node:test";

import {
  countsFromCodes,
  createStandardWall,
  detectWinningShapes,
  evaluateHand,
  parseTile,
  tileCode,
} from "../src/index.ts";

test("standard wall contains 136 unique physical tiles and four of every kind", () => {
  const wall = createStandardWall();
  assert.equal(wall.length, 136);
  assert.equal(new Set(wall.map((tile) => tile.id)).size, 136);
  const copies = new Map<number, number>();
  wall.forEach((tile) => copies.set(tile.kind, (copies.get(tile.kind) ?? 0) + 1));
  assert.equal(copies.size, 34);
  assert.ok([...copies.values()].every((count) => count === 4));
});

test("tile codes round-trip", () => {
  for (const code of ["1m", "9m", "1p", "9p", "1s", "9s", "E", "F", "P"]) {
    assert.equal(tileCode(parseTile(code)), code);
  }
});

test("detects a standard four-meld-and-pair shape", () => {
  const counts = countsFromCodes([
    "1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p",
    "3s", "4s", "5s", "2p", "2p",
  ]);
  assert.deepEqual(detectWinningShapes(counts), ["STANDARD"]);
});

test("plain standard hand cannot win under the documented Poyang rule", () => {
  const result = evaluateHand({
    concealedCounts: countsFromCodes([
      "1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p",
      "3s", "4s", "5s", "2p", "2p",
    ]),
  });
  assert.equal(result.isWinningShape, true);
  assert.equal(result.isEligiblePoyangWin, false);
  assert.deepEqual(result.patterns, []);
});

test("all-simples hand is an eligible Poyang win", () => {
  const result = evaluateHand({
    concealedCounts: countsFromCodes([
      "2m", "3m", "4m", "3m", "4m", "5m", "4p", "5p", "6p",
      "6s", "7s", "8s", "5p", "5p",
    ]),
  });
  assert.equal(result.isEligiblePoyangWin, true);
  assert.ok(result.patterns.includes("ALL_SIMPLES"));
});

test("seven pairs is detected and eligible", () => {
  const result = evaluateHand({
    concealedCounts: countsFromCodes([
      "1m", "1m", "2m", "2m", "3m", "3m", "4m", "4m",
      "5m", "5m", "6m", "6m", "7m", "7m",
    ]),
  });
  assert.ok(result.shapes.includes("SEVEN_PAIRS"));
  assert.ok(result.patterns.includes("SEVEN_PAIRS"));
  assert.ok(result.patterns.includes("PURE_ONE_SUIT"));
});

test("thirteen orphans is detected and eligible", () => {
  const result = evaluateHand({
    concealedCounts: countsFromCodes([
      "1m", "9m", "1p", "9p", "1s", "9s",
      "E", "S", "W", "N", "C", "F", "P", "E",
    ]),
  });
  assert.deepEqual(result.shapes, ["THIRTEEN_ORPHANS"]);
  assert.deepEqual(result.patterns, ["THIRTEEN_ORPHANS"]);
});

test("one dragon can combine with another winning shape", () => {
  const result = evaluateHand({
    concealedCounts: countsFromCodes([
      "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
      "2p", "3p", "4p", "E", "E",
    ]),
  });
  assert.equal(result.isEligiblePoyangWin, true);
  assert.ok(result.patterns.includes("ONE_DRAGON"));
});
