import type { ReactionAction } from "@poyang-mahjong/game-rules";

export type RealtimeCommand =
  | Command<"room.create", Record<string, never>>
  | Command<"room.join", { readonly roomCode: string }>
  | Command<"room.ready", { readonly ready: boolean }>
  | Command<"room.start", Record<string, never>>
  | Command<"game.draw", Record<string, never>>
  | Command<"game.discard", { readonly tileId: number }>
  | Command<
      "game.claim",
      { readonly action: ReactionAction; readonly tileIds: readonly number[] }
    >
  | Command<
      "game.kong.concealed",
      { readonly tileIds: readonly number[] }
    >
  | Command<"game.kong.added", { readonly tileId: number }>
  | Command<"game.kong.react", { readonly action: "HU" | "PASS" }>
  | Command<"game.win.selfDraw", Record<string, never>>
  | Command<"game.reconnect", Record<string, never>>;

export interface Command<TType extends string, TPayload> {
  readonly type: TType;
  readonly requestId: string;
  readonly roomId: string | null;
  readonly expectedVersion: number;
  readonly payload: TPayload;
}

export interface OutboundEvent {
  readonly audience:
    | { readonly kind: "ROOM"; readonly roomId: string }
    | { readonly kind: "USER"; readonly userId: string };
  readonly type: string;
  readonly roomId: string;
  readonly version: number;
  readonly payload: unknown;
}

export interface DispatchResult {
  readonly roomId: string;
  readonly roomCode: string;
  readonly events: readonly OutboundEvent[];
}
