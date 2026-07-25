import type {
  ClaimAction,
  ClaimCommand,
  ServerEvent,
} from "./messages.ts";

export type { ClaimAction, ClaimCommand };

export type ReactionSubmittedEvent = ServerEvent<
  "game.reaction.submitted",
  {
    readonly seat: number;
    readonly respondedSeats: readonly number[];
    readonly pendingSeats: readonly number[];
  }
>;

export type MeldType = "CHI" | "PENG" | "GANG";

export type MeldDeclaredEvent = ServerEvent<
  "game.meld.declared",
  {
    readonly seat: number;
    readonly type: MeldType;
    readonly fromSeat: number;
    readonly tileIds: readonly number[];
    readonly nextAction: "DISCARD" | "DRAW_REPLACEMENT";
  }
>;

export type ReactionResolutionEvent = ServerEvent<
  "game.reactions.resolved",
  {
    readonly action: Exclude<ClaimAction, "PASS"> | "NO_CLAIM";
    readonly seat: number | null;
    readonly nextSeat: number | null;
  }
>;
