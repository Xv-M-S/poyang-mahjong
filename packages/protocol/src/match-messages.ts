import type {
  ClientCommand,
  ServerEvent,
} from "./messages.ts";

export type StartNextRoundCommand = ClientCommand<
  "match.round.start",
  Record<string, never>
>;

export type MatchPhase =
  | "BETWEEN_ROUNDS"
  | "ROUND_IN_PROGRESS"
  | "MATCH_SETTLEMENT";

export interface MatchSnapshotPayload {
  readonly matchId: string;
  readonly phase: MatchPhase;
  readonly completedRounds: number;
  readonly roundLimit: number;
  readonly dealerSeat: number;
  readonly scores: readonly [number, number, number, number];
  readonly activeRoundId: string | null;
}

export type MatchSnapshotEvent = ServerEvent<
  "match.snapshot",
  MatchSnapshotPayload
>;

export type RoundScoredEvent = ServerEvent<
  "match.round.scored",
  {
    readonly roundNumber: number;
    readonly deltas: readonly [number, number, number, number];
    readonly totalScores: readonly [number, number, number, number];
    readonly nextDealerSeat: number;
  }
>;

export type MatchSettledEvent = ServerEvent<
  "match.settled",
  {
    readonly totalScores: readonly [number, number, number, number];
    readonly ranking: readonly number[];
  }
>;
