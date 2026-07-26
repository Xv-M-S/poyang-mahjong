import type {
  DealerContinuationPolicy,
  ScoringConfig,
} from "@poyang-mahjong/game-rules";

export interface RoomRules {
  readonly roundLimit: number;
  readonly dealerContinuation: DealerContinuationPolicy;
  readonly scoring: ScoringConfig;
}

export interface RealtimeServerConfig {
  readonly host: string;
  readonly port: number;
  readonly roomRules: RoomRules;
  readonly dataDirectory?: string;
  readonly turnTimeoutMs?: number;
  readonly reactionTimeoutMs?: number;
  readonly heartbeatIntervalMs?: number;
}

// Development-only values. Production must load an approved, versioned rule set.
export const DEVELOPMENT_ROOM_RULES: RoomRules = Object.freeze({
  roundLimit: 4,
  dealerContinuation: "WIN_OR_DRAW",
  scoring: Object.freeze({
    basePoints: 1,
    patternFans: Object.freeze({
      ALL_SIMPLES: 1,
      ALL_PUNGS: 2,
      ONE_DRAGON: 2,
      SEVEN_PAIRS: 2,
      PURE_ONE_SUIT: 3,
      MIXED_ONE_SUIT: 2,
      ALL_HONORS: 4,
      THIRTEEN_ORPHANS: 4,
      GREEN_HAND: 4,
    }),
    selfDrawBonusFan: 1,
    robKongBonusFan: 1,
    maxFan: 4,
    maxPointsPerPayment: null,
    selfDrawPayerMultiplier: 1,
    discarderMultiplier: 3,
    dealerMultiplier: 2,
  }),
});

export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RealtimeServerConfig {
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new RangeError("PORT must be an integer between 0 and 65535");
  }
  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    dataDirectory: env.DATA_DIRECTORY ?? "apps/realtime-server/.data",
    turnTimeoutMs: Number(env.TURN_TIMEOUT_MS ?? 30000),
    reactionTimeoutMs: Number(env.REACTION_TIMEOUT_MS ?? 12000),
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS ?? 15000),
    roomRules: DEVELOPMENT_ROOM_RULES,
  };
}
