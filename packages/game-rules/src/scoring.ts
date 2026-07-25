import type { PatternCode } from "./patterns.ts";

export type ScoringReason =
  | "SELF_DRAW"
  | "DISCARD_WIN"
  | "ROB_KONG_WIN"
  | "WALL_EXHAUSTED";

export interface ScorableRoundOutcome {
  readonly reason: ScoringReason;
  readonly winnerSeat: number | null;
  readonly loserSeat: number | null;
  readonly patterns: readonly PatternCode[];
}

export interface ScoringConfig {
  readonly basePoints: number;
  readonly patternFans: Readonly<Partial<Record<PatternCode, number>>>;
  readonly selfDrawBonusFan: number;
  readonly robKongBonusFan: number;
  readonly maxFan: number | null;
  readonly maxPointsPerPayment: number | null;
  readonly selfDrawPayerMultiplier: number;
  readonly discarderMultiplier: number;
  readonly dealerMultiplier: number;
}

export interface ScoreTransfer {
  readonly fromSeat: number;
  readonly toSeat: number;
  readonly points: number;
}

export interface RoundScoreResult {
  readonly reason: ScoringReason;
  readonly winnerSeat: number | null;
  readonly patternFans: readonly {
    readonly pattern: PatternCode;
    readonly fan: number;
  }[];
  readonly bonusFan: number;
  readonly totalFan: number;
  readonly pointsPerPayment: number;
  readonly transfers: readonly ScoreTransfer[];
  readonly deltas: readonly [number, number, number, number];
}

export function scoreRound(
  outcome: ScorableRoundOutcome,
  dealerSeat: number,
  config: ScoringConfig,
): RoundScoreResult {
  assertSeat(dealerSeat);
  validateScoringConfig(config);

  if (outcome.reason === "WALL_EXHAUSTED") {
    if (outcome.winnerSeat !== null || outcome.loserSeat !== null) {
      throw new Error("A wall-exhausted round cannot have a winner or loser");
    }
    return {
      reason: outcome.reason,
      winnerSeat: null,
      patternFans: [],
      bonusFan: 0,
      totalFan: 0,
      pointsPerPayment: 0,
      transfers: [],
      deltas: [0, 0, 0, 0],
    };
  }

  if (outcome.winnerSeat === null) throw new Error("Winning outcome requires a winner");
  assertSeat(outcome.winnerSeat);

  if (new Set(outcome.patterns).size !== outcome.patterns.length) {
    throw new Error("Winning patterns must be unique");
  }
  const patternFans = outcome.patterns.map((pattern) => {
    const fan = config.patternFans[pattern];
    if (fan === undefined) {
      throw new Error(`Missing fan configuration for pattern ${pattern}`);
    }
    return { pattern, fan };
  });
  const bonusFan =
    outcome.reason === "SELF_DRAW"
      ? config.selfDrawBonusFan
      : outcome.reason === "ROB_KONG_WIN"
        ? config.robKongBonusFan
        : 0;
  const uncappedFan =
    patternFans.reduce((total, item) => total + item.fan, 0) + bonusFan;
  const totalFan =
    config.maxFan === null ? uncappedFan : Math.min(uncappedFan, config.maxFan);
  const rawPoints = config.basePoints * 2 ** totalFan;
  if (!Number.isFinite(rawPoints)) {
    throw new RangeError("Calculated points exceed the supported numeric range");
  }
  const pointsPerPayment =
    config.maxPointsPerPayment === null
      ? rawPoints
      : Math.min(rawPoints, config.maxPointsPerPayment);

  const transfers: ScoreTransfer[] = [];
  if (outcome.reason === "SELF_DRAW") {
    for (let payer = 0; payer < 4; payer += 1) {
      if (payer === outcome.winnerSeat) continue;
      transfers.push({
        fromSeat: payer,
        toSeat: outcome.winnerSeat,
        points:
          pointsPerPayment
          * config.selfDrawPayerMultiplier
          * dealerFactor(payer, outcome.winnerSeat, dealerSeat, config),
      });
    }
  } else {
    if (outcome.loserSeat === null) {
      throw new Error(`${outcome.reason} requires a loser seat`);
    }
    assertSeat(outcome.loserSeat);
    if (outcome.loserSeat === outcome.winnerSeat) {
      throw new Error("Winner and loser must be different seats");
    }
    transfers.push({
      fromSeat: outcome.loserSeat,
      toSeat: outcome.winnerSeat,
      points:
        pointsPerPayment
        * config.discarderMultiplier
        * dealerFactor(
          outcome.loserSeat,
          outcome.winnerSeat,
          dealerSeat,
          config,
        ),
    });
  }

  const deltas: [number, number, number, number] = [0, 0, 0, 0];
  for (const transfer of transfers) {
    deltas[transfer.fromSeat] -= transfer.points;
    deltas[transfer.toSeat] += transfer.points;
  }
  if (Math.abs(deltas.reduce((total, delta) => total + delta, 0)) > 1e-9) {
    throw new Error("Round score must be zero-sum");
  }

  return {
    reason: outcome.reason,
    winnerSeat: outcome.winnerSeat,
    patternFans,
    bonusFan,
    totalFan,
    pointsPerPayment,
    transfers,
    deltas,
  };
}

function dealerFactor(
  fromSeat: number,
  toSeat: number,
  dealerSeat: number,
  config: ScoringConfig,
): number {
  return fromSeat === dealerSeat || toSeat === dealerSeat
    ? config.dealerMultiplier
    : 1;
}

function validateScoringConfig(config: ScoringConfig): void {
  const nonNegative = [
    config.basePoints,
    config.selfDrawBonusFan,
    config.robKongBonusFan,
    config.selfDrawPayerMultiplier,
    config.discarderMultiplier,
    config.dealerMultiplier,
  ];
  if (nonNegative.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Scoring values must be finite and non-negative");
  }
  if (config.basePoints === 0) throw new RangeError("basePoints must be positive");
  if (config.maxFan !== null && config.maxFan < 0) {
    throw new RangeError("maxFan cannot be negative");
  }
  if (config.maxPointsPerPayment !== null && config.maxPointsPerPayment < 0) {
    throw new RangeError("maxPointsPerPayment cannot be negative");
  }
  for (const fan of Object.values(config.patternFans)) {
    if (fan !== undefined && (!Number.isFinite(fan) || fan < 0)) {
      throw new RangeError("Pattern fan values must be finite and non-negative");
    }
  }
}

function assertSeat(seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
    throw new RangeError("Seat must be between 0 and 3");
  }
}
