import assert from "node:assert/strict";
import test from "node:test";

import {
  MatchEngine,
  type MatchEngineError,
} from "../src/match-engine.ts";
import type { ScoringConfig } from "../src/scoring.ts";

const scoring: ScoringConfig = {
  basePoints: 1,
  patternFans: { ALL_SIMPLES: 1 },
  selfDrawBonusFan: 0,
  robKongBonusFan: 0,
  maxFan: null,
  maxPointsPerPayment: null,
  selfDrawPayerMultiplier: 1,
  discarderMultiplier: 3,
  dealerMultiplier: 1,
};

test("match accumulates scores, continues dealer, rotates, and settles", () => {
  const match = new MatchEngine({
    matchId: "match-001",
    roundLimit: 2,
    dealerContinuation: "WIN_ONLY",
    scoring,
  });

  const first = match.startRound(match.getSnapshot().version);
  assert.equal(first.dealerSeat, 0);
  match.settleRound(
    first.roundId,
    {
      reason: "SELF_DRAW",
      winnerSeat: 0,
      loserSeat: null,
      patterns: ["ALL_SIMPLES"],
    },
    match.getSnapshot().version,
  );
  assert.equal(match.getSnapshot().dealerSeat, 0);
  assert.deepEqual(match.getSnapshot().totalScores, [6, -2, -2, -2]);

  const second = match.startRound(match.getSnapshot().version);
  assert.equal(second.dealerSeat, 0);
  match.settleRound(
    second.roundId,
    {
      reason: "DISCARD_WIN",
      winnerSeat: 1,
      loserSeat: 0,
      patterns: ["ALL_SIMPLES"],
    },
    match.getSnapshot().version,
  );

  const settled = match.getSnapshot();
  assert.equal(settled.phase, "MATCH_SETTLEMENT");
  assert.equal(settled.completedRounds, 2);
  assert.equal(settled.dealerSeat, 1);
  assert.deepEqual(settled.totalScores, [0, 4, -2, -2]);
  assert.equal(settled.history.length, 2);
});

test("WIN_OR_DRAW keeps dealer after wall exhaustion", () => {
  const match = new MatchEngine({
    matchId: "match-draw",
    roundLimit: 2,
    initialDealerSeat: 3,
    dealerContinuation: "WIN_OR_DRAW",
    scoring,
  });
  const round = match.startRound(0);
  match.settleRound(
    round.roundId,
    {
      reason: "WALL_EXHAUSTED",
      winnerSeat: null,
      loserSeat: null,
      patterns: [],
    },
    1,
  );
  assert.equal(match.getSnapshot().dealerSeat, 3);
  assert.equal(match.getSnapshot().phase, "BETWEEN_ROUNDS");
});

test("match rejects stale versions and wrong round ids", () => {
  const match = new MatchEngine({
    matchId: "match-errors",
    roundLimit: 1,
    dealerContinuation: "NEVER",
    scoring,
  });
  const round = match.startRound(0);
  assertMatchError(() => match.startRound(0), "STALE_VERSION");
  assertMatchError(
    () =>
      match.settleRound(
        "wrong-round",
        {
          reason: "WALL_EXHAUSTED",
          winnerSeat: null,
          loserSeat: null,
          patterns: [],
        },
        1,
      ),
    "ROUND_ID_MISMATCH",
  );
  assert.equal(match.getSnapshot().activeRound?.roundId, round.roundId);
});

function assertMatchError(
  operation: () => unknown,
  code: MatchEngineError["code"],
): void {
  assert.throws(operation, (error: unknown) => {
    return error instanceof Error
      && "code" in error
      && error.code === code;
  });
}
