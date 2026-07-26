import {
  scoreRound,
  type RoundScoreResult,
  type ScorableRoundOutcome,
  type ScoringConfig,
} from "./scoring.ts";

export type MatchPhase =
  | "BETWEEN_ROUNDS"
  | "ROUND_IN_PROGRESS"
  | "MATCH_SETTLEMENT";

export type DealerContinuationPolicy = "WIN_ONLY" | "WIN_OR_DRAW" | "NEVER";

export interface MatchConfig {
  readonly matchId: string;
  readonly roundLimit: number;
  readonly initialDealerSeat?: number;
  readonly initialScores?: readonly [number, number, number, number];
  readonly dealerContinuation: DealerContinuationPolicy;
  readonly scoring: ScoringConfig;
}

export interface RoundDescriptor {
  readonly roundId: string;
  readonly roundNumber: number;
  readonly dealerSeat: number;
}

export interface MatchRoundRecord {
  readonly descriptor: RoundDescriptor;
  readonly outcome: ScorableRoundOutcome;
  readonly score: RoundScoreResult;
  readonly totalScores: readonly [number, number, number, number];
  readonly nextDealerSeat: number;
}

export interface MatchSnapshot {
  readonly matchId: string;
  readonly version: number;
  readonly phase: MatchPhase;
  readonly roundLimit: number;
  readonly completedRounds: number;
  readonly dealerSeat: number;
  readonly totalScores: readonly [number, number, number, number];
  readonly activeRound: RoundDescriptor | null;
  readonly history: readonly MatchRoundRecord[];
}

export type MatchErrorCode =
  | "STALE_VERSION"
  | "WRONG_PHASE"
  | "ROUND_ID_MISMATCH";

export class MatchEngineError extends Error {
  readonly code: MatchErrorCode;

  constructor(code: MatchErrorCode, message: string) {
    super(message);
    this.name = "MatchEngineError";
    this.code = code;
  }
}

export class MatchEngine {
  readonly matchId: string;

  private readonly config: MatchConfig;
  private version = 0;
  private phase: MatchPhase = "BETWEEN_ROUNDS";
  private completedRounds = 0;
  private dealerSeat: number;
  private totalScores: [number, number, number, number];
  private activeRound: RoundDescriptor | null = null;
  private readonly history: MatchRoundRecord[] = [];

  constructor(config: MatchConfig) {
    if (!config.matchId.trim()) throw new Error("matchId is required");
    if (!Number.isInteger(config.roundLimit) || config.roundLimit <= 0) {
      throw new RangeError("roundLimit must be a positive integer");
    }
    this.matchId = config.matchId;
    this.config = config;
    this.dealerSeat = config.initialDealerSeat ?? 0;
    assertSeat(this.dealerSeat);
    this.totalScores = [...(config.initialScores ?? [0, 0, 0, 0])];
    if (this.totalScores.some((score) => !Number.isFinite(score))) {
      throw new RangeError("Initial scores must be finite");
    }
  }

  static fromSnapshot(
    snapshot: MatchSnapshot,
    options: Pick<MatchConfig, "dealerContinuation" | "scoring">,
  ): MatchEngine {
    const engine = new MatchEngine({
      matchId: snapshot.matchId,
      roundLimit: snapshot.roundLimit,
      initialDealerSeat: snapshot.dealerSeat,
      initialScores: snapshot.totalScores,
      dealerContinuation: options.dealerContinuation,
      scoring: options.scoring,
    });
    engine.version = snapshot.version;
    engine.phase = snapshot.phase;
    engine.completedRounds = snapshot.completedRounds;
    engine.dealerSeat = snapshot.dealerSeat;
    engine.totalScores = [...snapshot.totalScores];
    engine.activeRound = snapshot.activeRound ? { ...snapshot.activeRound } : null;
    engine.history.splice(0, engine.history.length, ...snapshot.history.map((record) => ({
      descriptor: { ...record.descriptor },
      outcome: { ...record.outcome, patterns: [...record.outcome.patterns] },
      score: cloneScore(record.score),
      totalScores: [...record.totalScores],
      nextDealerSeat: record.nextDealerSeat,
    })));
    return engine;
  }
  getSnapshot(): MatchSnapshot {
    return {
      matchId: this.matchId,
      version: this.version,
      phase: this.phase,
      roundLimit: this.config.roundLimit,
      completedRounds: this.completedRounds,
      dealerSeat: this.dealerSeat,
      totalScores: [...this.totalScores],
      activeRound: this.activeRound ? { ...this.activeRound } : null,
      history: this.history.map((record) => ({
        descriptor: { ...record.descriptor },
        outcome: { ...record.outcome, patterns: [...record.outcome.patterns] },
        score: cloneScore(record.score),
        totalScores: [...record.totalScores],
        nextDealerSeat: record.nextDealerSeat,
      })),
    };
  }

  startRound(expectedVersion: number): RoundDescriptor {
    this.assertVersion(expectedVersion);
    if (this.phase !== "BETWEEN_ROUNDS") {
      throw new MatchEngineError(
        "WRONG_PHASE",
        `Cannot start a round during ${this.phase}`,
      );
    }

    const descriptor: RoundDescriptor = {
      roundId: `${this.matchId}-round-${this.completedRounds + 1}`,
      roundNumber: this.completedRounds + 1,
      dealerSeat: this.dealerSeat,
    };
    this.activeRound = descriptor;
    this.phase = "ROUND_IN_PROGRESS";
    this.version += 1;
    return descriptor;
  }

  settleRound(
    roundId: string,
    outcome: ScorableRoundOutcome,
    expectedVersion: number,
  ): MatchRoundRecord {
    this.assertVersion(expectedVersion);
    if (this.phase !== "ROUND_IN_PROGRESS" || !this.activeRound) {
      throw new MatchEngineError(
        "WRONG_PHASE",
        `Cannot settle a round during ${this.phase}`,
      );
    }
    if (roundId !== this.activeRound.roundId) {
      throw new MatchEngineError(
        "ROUND_ID_MISMATCH",
        `Expected ${this.activeRound.roundId}, received ${roundId}`,
      );
    }

    const score = scoreRound(outcome, this.dealerSeat, this.config.scoring);
    for (let seat = 0; seat < 4; seat += 1) {
      this.totalScores[seat] += score.deltas[seat];
    }
    this.completedRounds += 1;

    if (!dealerContinues(outcome, this.dealerSeat, this.config.dealerContinuation)) {
      this.dealerSeat = (this.dealerSeat + 1) % 4;
    }

    const record: MatchRoundRecord = {
      descriptor: this.activeRound,
      outcome: { ...outcome, patterns: [...outcome.patterns] },
      score,
      totalScores: [...this.totalScores],
      nextDealerSeat: this.dealerSeat,
    };
    this.history.push(record);
    this.activeRound = null;
    this.phase =
      this.completedRounds >= this.config.roundLimit
        ? "MATCH_SETTLEMENT"
        : "BETWEEN_ROUNDS";
    this.version += 1;
    return record;
  }

  private assertVersion(expectedVersion: number): void {
    if (expectedVersion !== this.version) {
      throw new MatchEngineError(
        "STALE_VERSION",
        `Expected version ${expectedVersion}, current version is ${this.version}`,
      );
    }
  }
}

function dealerContinues(
  outcome: ScorableRoundOutcome,
  dealerSeat: number,
  policy: DealerContinuationPolicy,
): boolean {
  if (policy === "NEVER") return false;
  if (outcome.reason === "WALL_EXHAUSTED") return policy === "WIN_OR_DRAW";
  return outcome.winnerSeat === dealerSeat;
}

function cloneScore(score: RoundScoreResult): RoundScoreResult {
  return {
    ...score,
    patternFans: score.patternFans.map((item) => ({ ...item })),
    transfers: score.transfers.map((transfer) => ({ ...transfer })),
    deltas: [
      score.deltas[0],
      score.deltas[1],
      score.deltas[2],
      score.deltas[3],
    ],
  };
}

function assertSeat(seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
    throw new RangeError("Seat must be between 0 and 3");
  }
}
