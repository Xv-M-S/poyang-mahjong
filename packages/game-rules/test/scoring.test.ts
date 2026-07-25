import assert from "node:assert/strict";
import test from "node:test";

import {
  scoreRound,
  type ScoringConfig,
} from "../src/scoring.ts";

const config: ScoringConfig = {
  basePoints: 1,
  patternFans: {
    ALL_SIMPLES: 1,
    ALL_PUNGS: 2,
    PURE_ONE_SUIT: 3,
  },
  selfDrawBonusFan: 1,
  robKongBonusFan: 1,
  maxFan: 4,
  maxPointsPerPayment: 12,
  selfDrawPayerMultiplier: 1,
  discarderMultiplier: 3,
  dealerMultiplier: 2,
};

test("self draw collects from all three opponents and remains zero-sum", () => {
  const result = scoreRound(
    {
      reason: "SELF_DRAW",
      winnerSeat: 0,
      loserSeat: null,
      patterns: ["ALL_SIMPLES"],
    },
    0,
    config,
  );

  assert.equal(result.totalFan, 2);
  assert.equal(result.pointsPerPayment, 4);
  assert.deepEqual(result.deltas, [24, -8, -8, -8]);
  assert.equal(result.deltas.reduce((total, delta) => total + delta, 0), 0);
});

test("discard win charges only the discarder", () => {
  const result = scoreRound(
    {
      reason: "DISCARD_WIN",
      winnerSeat: 2,
      loserSeat: 1,
      patterns: ["ALL_PUNGS"],
    },
    0,
    config,
  );

  assert.equal(result.pointsPerPayment, 4);
  assert.deepEqual(result.deltas, [0, -12, 12, 0]);
});

test("rob-kong bonus, fan cap, and point cap are applied", () => {
  const result = scoreRound(
    {
      reason: "ROB_KONG_WIN",
      winnerSeat: 1,
      loserSeat: 0,
      patterns: ["PURE_ONE_SUIT", "ALL_PUNGS"],
    },
    0,
    config,
  );

  assert.equal(result.totalFan, 4);
  assert.equal(result.pointsPerPayment, 12);
  assert.deepEqual(result.deltas, [-72, 72, 0, 0]);
});

test("wall exhaustion has no score transfer", () => {
  const result = scoreRound(
    {
      reason: "WALL_EXHAUSTED",
      winnerSeat: null,
      loserSeat: null,
      patterns: [],
    },
    3,
    config,
  );
  assert.deepEqual(result.deltas, [0, 0, 0, 0]);
  assert.deepEqual(result.transfers, []);
});

test("missing pattern score fails instead of guessing", () => {
  assert.throws(
    () =>
      scoreRound(
        {
          reason: "SELF_DRAW",
          winnerSeat: 1,
          loserSeat: null,
          patterns: ["GREEN_HAND"],
        },
        0,
        config,
      ),
    /Missing fan configuration/,
  );
});


test("duplicate patterns are rejected", () => {
  assert.throws(
    () =>
      scoreRound(
        {
          reason: "SELF_DRAW",
          winnerSeat: 1,
          loserSeat: null,
          patterns: ["ALL_SIMPLES", "ALL_SIMPLES"],
        },
        0,
        config,
      ),
    /patterns must be unique/,
  );
});
