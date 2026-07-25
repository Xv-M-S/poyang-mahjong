import type {
  ClientCommand,
  ServerEvent,
} from "./messages.ts";

export type DrawCommand = ClientCommand<"game.draw", Record<string, never>>;

export interface RoundStartedPayload {
  readonly dealerSeat: number;
  readonly currentSeat: number;
  readonly remainingTiles: number;
}

export type RoundStartedEvent = ServerEvent<
  "game.round.started",
  RoundStartedPayload
>;

export interface TileDrawnPayload {
  readonly seat: number;
  readonly remainingTiles: number;
}

export type TileDrawnEvent = ServerEvent<
  "game.tile.drawn",
  TileDrawnPayload
>;

export type PrivateTileDrawnEvent = ServerEvent<
  "game.tile.drawn.private",
  TileDrawnPayload & { readonly tileId: number; readonly tileKind: number }
>;

export interface TileDiscardedPayload {
  readonly seat: number;
  readonly tileId: number;
  readonly tileKind: number;
}

export type TileDiscardedEvent = ServerEvent<
  "game.tile.discarded",
  TileDiscardedPayload
>;

export type ReactionsResolvedEvent = ServerEvent<
  "game.reactions.resolved",
  {
    readonly resolution: "NO_CLAIM" | "DISCARD_WIN";
    readonly tileId: number;
    readonly nextSeat: number | null;
  }
>;

export type RoundEndReason =
  | "SELF_DRAW"
  | "DISCARD_WIN"
  | "ROB_KONG_WIN"
  | "WALL_EXHAUSTED";

export type RoundSettledEvent = ServerEvent<
  "game.round.settled",
  {
    readonly reason: RoundEndReason;
    readonly winnerSeat: number | null;
    readonly loserSeat: number | null;
    readonly winningTileId: number | null;
    readonly patterns: readonly string[];
  }
>;
