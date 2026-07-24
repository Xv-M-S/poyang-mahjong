export type GamePhase =
  | "WAITING"
  | "READY"
  | "DEALING"
  | "PLAYING"
  | "REACTION_WINDOW"
  | "ROUND_SETTLEMENT"
  | "MATCH_SETTLEMENT"
  | "CLOSED";

export interface ClientCommand<TType extends string, TPayload> {
  readonly type: TType;
  readonly requestId: string;
  readonly roomId: string;
  readonly roundId: string | null;
  readonly expectedVersion: number;
  readonly payload: TPayload;
}

export type DiscardCommand = ClientCommand<
  "game.discard",
  { readonly tileId: number }
>;

export type ClaimAction = "CHI" | "PENG" | "GANG" | "HU" | "PASS";

export type ClaimCommand = ClientCommand<
  "game.claim",
  { readonly action: ClaimAction; readonly tileIds: readonly number[] }
>;

export interface ServerEvent<TType extends string, TPayload> {
  readonly type: TType;
  readonly roomId: string;
  readonly roundId: string | null;
  readonly version: number;
  readonly serverTime: string;
  readonly payload: TPayload;
}

export interface RoomSnapshot {
  readonly roomId: string;
  readonly phase: GamePhase;
  readonly version: number;
  readonly ruleVersion: string;
  readonly currentSeat: number | null;
}
