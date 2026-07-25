import type {
  ClientCommand,
  ServerEvent,
} from "./messages.ts";

export type DeclareConcealedKongCommand = ClientCommand<
  "game.kong.concealed",
  { readonly tileIds: readonly [number, number, number, number] }
>;

export type ProposeAddedKongCommand = ClientCommand<
  "game.kong.added",
  { readonly tileId: number }
>;

export type RobKongReactionCommand = ClientCommand<
  "game.kong.react",
  { readonly action: "HU" | "PASS" }
>;

export type KongType = "EXPOSED" | "CONCEALED" | "ADDED";

export type KongDeclaredEvent = ServerEvent<
  "game.kong.declared",
  {
    readonly seat: number;
    readonly kongType: KongType;
    readonly tileIds: readonly number[];
    readonly nextAction: "DRAW_REPLACEMENT";
  }
>;

export type AddedKongProposedEvent = ServerEvent<
  "game.kong.added.proposed",
  {
    readonly seat: number;
    readonly tileId: number;
    readonly tileKind: number;
  }
>;

export type RobKongReactionSubmittedEvent = ServerEvent<
  "game.kong.reaction.submitted",
  {
    readonly seat: number;
    readonly respondedSeats: readonly number[];
    readonly pendingSeats: readonly number[];
  }
>;

export type RobKongResolvedEvent = ServerEvent<
  "game.kong.rob.resolved",
  {
    readonly action: "HU" | "NO_CLAIM";
    readonly winnerSeat: number | null;
    readonly kongSeat: number;
    readonly tileId: number;
  }
>;
