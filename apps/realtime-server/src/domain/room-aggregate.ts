import {
  MatchEngine,
  SingleRoundEngine,
  type MatchSnapshot,
  type AvailableRoundAction,
  type ReactionAction,
  type RoundSnapshot,
} from "@poyang-mahjong/game-rules";

import type { RoomRules } from "../config.ts";
import { RoomError } from "./room-errors.ts";
import type { RoomPlayer } from "./room-player.ts";

export type RoomPhase =
  | "WAITING"
  | "PLAYING"
  | "BETWEEN_ROUNDS"
  | "COMPLETED"
  | "CLOSED";

export interface PublicRoomSnapshot {
  readonly roomId: string;
  readonly roomCode: string;
  readonly ownerId: string;
  readonly version: number;
  readonly phase: RoomPhase;
  readonly players: readonly {
    readonly userId: string;
    readonly seat: number;
    readonly ready: boolean;
    readonly connected: boolean;
  }[];
  readonly match: MatchSnapshot | null;
  readonly round: PublicRoundSnapshot | null;
  readonly actionDeadlineAt: number | null;
}

export interface PublicRoundSnapshot {
  readonly roundId: string;
  readonly version: number;
  readonly phase: RoundSnapshot["phase"];
  readonly dealerSeat: number;
  readonly currentSeat: number | null;
  readonly turnAction: RoundSnapshot["turnAction"];
  readonly remainingTiles: number;
  readonly handCounts: readonly number[];
  readonly discards: readonly (readonly {
    readonly id: number;
    readonly kind: number;
  }[])[];
  readonly melds: readonly (readonly {
    readonly type: string;
    readonly kongType: string | null;
    readonly fromSeat: number;
    readonly tileIds: readonly number[];
    readonly tileKinds: readonly number[];
  }[])[];
  readonly pendingDiscard: { readonly seat: number; readonly tileId: number; readonly tileKind: number } | null;
  readonly respondedSeats: readonly number[];
  readonly outcome: RoundSnapshot["outcome"];
}

export interface PrivateRoomSnapshot {
  readonly userId: string;
  readonly seat: number;
  readonly roomVersion: number;
  readonly roundVersion: number | null;
  readonly hand: readonly {
    readonly id: number;
    readonly kind: number;
  }[];
  readonly availableActions: readonly AvailableRoundAction[];
}

export interface CreateRoomOptions {
  readonly roomId: string;
  readonly roomCode: string;
  readonly ownerId: string;
  readonly rules: RoomRules;
  readonly now?: () => Date;
}

export interface RoomPersistenceSnapshot {
  readonly roomId: string;
  readonly roomCode: string;
  readonly ownerId: string;
  readonly rules: RoomRules;
  readonly version: number;
  readonly phase: RoomPhase;
  readonly players: readonly RoomPlayer[];
  readonly match: MatchSnapshot | null;
  readonly round: RoundSnapshot | null;
  readonly actionDeadlineAt: number | null;
}
export class RoomAggregate {
  readonly roomId: string;
  readonly roomCode: string;
  readonly ownerId: string;

  private readonly rules: RoomRules;
  private readonly now: () => Date;
  private readonly players: RoomPlayer[] = [];
  private version = 0;
  private phase: RoomPhase = "WAITING";
  private match: MatchEngine | null = null;
  private round: SingleRoundEngine | null = null;
  private actionDeadlineAt: number | null = null;

  constructor(options: CreateRoomOptions) {
    this.roomId = options.roomId;
    this.roomCode = options.roomCode;
    this.ownerId = options.ownerId;
    this.rules = options.rules;
    this.now = options.now ?? (() => new Date());
    this.addPlayer(options.ownerId);
  }

  static fromPersistenceSnapshot(
    snapshot: RoomPersistenceSnapshot,
    now?: () => Date,
  ): RoomAggregate {
    const room = new RoomAggregate({
      roomId: snapshot.roomId,
      roomCode: snapshot.roomCode,
      ownerId: snapshot.ownerId,
      rules: snapshot.rules,
      now,
    });
    room.players.splice(0, room.players.length, ...snapshot.players.map((player) => ({ ...player })));
    room.version = snapshot.version;
    room.phase = snapshot.phase;
    room.match = snapshot.match ? MatchEngine.fromSnapshot(snapshot.match, snapshot.rules) : null;
    room.round = snapshot.round ? SingleRoundEngine.fromSnapshot(snapshot.round) : null;
    room.actionDeadlineAt = snapshot.actionDeadlineAt;
    return room;
  }

  toPersistenceSnapshot(): RoomPersistenceSnapshot {
    return {
      roomId: this.roomId,
      roomCode: this.roomCode,
      ownerId: this.ownerId,
      rules: this.rules,
      version: this.version,
      phase: this.phase,
      players: this.players.map((player) => ({ ...player })),
      match: this.match?.getSnapshot() ?? null,
      round: this.round?.getSnapshot() ?? null,
      actionDeadlineAt: this.actionDeadlineAt,
    };
  }
  getVersion(): number {
    return this.version;
  }

  getPlayerIds(): readonly string[] {
    return this.players.map((player) => player.userId);
  }

  getPlayer(userId: string): Readonly<RoomPlayer> | null {
    return this.players.find((player) => player.userId === userId) ?? null;
  }

  join(userId: string, expectedVersion: number): number {
    this.assertVersion(expectedVersion);
    this.assertWaiting();
    const existing = this.players.find((player) => player.userId === userId);
    if (existing) return existing.seat;
    if (this.players.length >= 4) {
      throw new RoomError("ROOM_FULL", "The room already has four players");
    }
    const player = this.addPlayer(userId);
    return player.seat;
  }

  leave(userId: string, expectedVersion: number): { readonly closed: boolean } {
    this.assertVersion(expectedVersion);
    if (this.phase !== "WAITING" && this.phase !== "COMPLETED") {
      throw new RoomError("WRONG_PHASE", "Cannot leave during " + this.phase);
    }
    const playerIndex = this.players.findIndex(
      (player) => player.userId === userId,
    );
    if (playerIndex < 0) {
      throw new RoomError("PLAYER_NOT_FOUND", `User ${userId} is not in the room`);
    }

    if (userId === this.ownerId || this.phase === "COMPLETED") {
      this.players.splice(0);
      this.phase = "CLOSED";
      this.version += 1;
      return { closed: true };
    }

    this.players.splice(playerIndex, 1);
    this.players.forEach((player, seat) => {
      player.seat = seat;
    });
    this.version += 1;
    return { closed: false };
  }

  dissolve(userId: string, expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    if (userId !== this.ownerId) {
      throw new RoomError("OWNER_ONLY", "Only the room owner may dissolve the room");
    }
    this.phase = "CLOSED";
    this.actionDeadlineAt = null;
    this.version += 1;
  }

  restart(userId: string, expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    if (userId !== this.ownerId) {
      throw new RoomError("OWNER_ONLY", "Only the room owner may restart the match");
    }
    if (this.phase !== "COMPLETED") {
      throw new RoomError("WRONG_PHASE", "Cannot restart during " + this.phase);
    }
    this.match = null;
    this.round = null;
    this.phase = "WAITING";
    this.actionDeadlineAt = null;
    for (const player of this.players) player.ready = false;
    this.version += 1;
  }
  setReady(userId: string, ready: boolean, expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    this.assertWaiting();
    const player = this.requirePlayer(userId);
    if (player.ready === ready) return;
    player.ready = ready;
    this.version += 1;
  }

  setConnected(userId: string, connected: boolean): void {
    const player = this.requirePlayer(userId);
    if (player.connected === connected) return;
    player.connected = connected;
    this.version += 1;
  }

  startNextRound(userId: string, expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    if (userId !== this.ownerId) {
      throw new RoomError("OWNER_ONLY", "Only the room owner may start a round");
    }

    if (this.phase === "WAITING") {
      if (this.players.length !== 4 || this.players.some((player) => !player.ready)) {
        throw new RoomError(
          "PLAYERS_NOT_READY",
          "Four ready players are required to start",
        );
      }
      this.match = new MatchEngine({
        matchId: `${this.roomId}-match`,
        roundLimit: this.rules.roundLimit,
        dealerContinuation: this.rules.dealerContinuation,
        scoring: this.rules.scoring,
      });
    } else if (this.phase !== "BETWEEN_ROUNDS") {
      throw new RoomError(
        "WRONG_PHASE",
        `Cannot start a round during ${this.phase}`,
      );
    }

    const match = this.requireMatch();
    const descriptor = match.startRound(match.getSnapshot().version);
    this.round = new SingleRoundEngine({
      roundId: descriptor.roundId,
      dealerSeat: descriptor.dealerSeat,
    });
    this.phase = "PLAYING";
    this.version += 1;
  }

  draw(userId: string, expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    const seat = this.requirePlayer(userId).seat;
    const round = this.requirePlayingRound();
    round.draw(seat, round.getSnapshot().version);
    this.finishRoundIfSettled();
    this.version += 1;
  }

  discard(userId: string, tileId: number, expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    const seat = this.requirePlayer(userId).seat;
    const round = this.requirePlayingRound();
    round.discard(seat, tileId, round.getSnapshot().version);
    this.version += 1;
  }

  submitClaim(
    userId: string,
    action: ReactionAction,
    tileIds: readonly number[],
    expectedVersion: number,
  ): void {
    this.assertVersion(expectedVersion);
    const seat = this.requirePlayer(userId).seat;
    const round = this.requirePlayingRound();
    round.submitReaction(seat, action, tileIds, round.getSnapshot().version);
    if (round.getSnapshot().reactionClaims.length === 3) {
      round.resolveReactions(round.getSnapshot().version);
    }
    this.finishRoundIfSettled();
    this.version += 1;
  }

  declareConcealedKong(
    userId: string,
    tileIds: readonly number[],
    expectedVersion: number,
  ): void {
    this.assertVersion(expectedVersion);
    const seat = this.requirePlayer(userId).seat;
    const round = this.requirePlayingRound();
    round.declareConcealedKong(seat, tileIds, round.getSnapshot().version);
    this.version += 1;
  }

  proposeAddedKong(
    userId: string,
    tileId: number,
    expectedVersion: number,
  ): void {
    this.assertVersion(expectedVersion);
    const seat = this.requirePlayer(userId).seat;
    const round = this.requirePlayingRound();
    round.proposeAddedKong(seat, tileId, round.getSnapshot().version);
    this.version += 1;
  }

  submitRobKongReaction(
    userId: string,
    action: "HU" | "PASS",
    expectedVersion: number,
  ): void {
    this.assertVersion(expectedVersion);
    const seat = this.requirePlayer(userId).seat;
    const round = this.requirePlayingRound();
    round.submitRobKongReaction(seat, action, round.getSnapshot().version);
    if (round.getSnapshot().reactionClaims.length === 3) {
      round.resolveRobKongReactions(round.getSnapshot().version);
    }
    this.finishRoundIfSettled();
    this.version += 1;
  }

  declareSelfDrawWin(userId: string, expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    const seat = this.requirePlayer(userId).seat;
    const round = this.requirePlayingRound();
    round.declareSelfDrawWin(seat, round.getSnapshot().version);
    this.finishRoundIfSettled();
    this.version += 1;
  }

  getPublicSnapshot(): PublicRoomSnapshot {
    return {
      roomId: this.roomId,
      roomCode: this.roomCode,
      ownerId: this.ownerId,
      version: this.version,
      phase: this.phase,
      players: this.players.map((player) => ({
        userId: player.userId,
        seat: player.seat,
        ready: player.ready,
        connected: player.connected,
      })),
      match: this.match?.getSnapshot() ?? null,
      round: this.round ? projectPublicRound(this.round.getSnapshot()) : null,
      actionDeadlineAt: this.actionDeadlineAt,
    };
  }

  getPrivateSnapshot(userId: string): PrivateRoomSnapshot {
    const player = this.requirePlayer(userId);
    const round = this.round?.getSnapshot() ?? null;
    return {
      userId,
      seat: player.seat,
      roomVersion: this.version,
      roundVersion: round?.version ?? null,
      hand:
        round?.hands[player.seat].map((tile) => ({
          id: tile.id,
          kind: tile.kind,
        })) ?? [],
      availableActions: this.round?.getAvailableActions(player.seat) ?? [],
    };
  }

  refreshActionDeadline(
    turnTimeoutMs: number,
    reactionTimeoutMs: number,
    nowMs = Date.now(),
  ): void {
    const snapshot = this.round?.getSnapshot();
    if (this.phase !== "PLAYING" || !snapshot || snapshot.phase === "ROUND_SETTLEMENT") {
      this.actionDeadlineAt = null;
      return;
    }
    this.actionDeadlineAt = nowMs + (
      snapshot.phase === "REACTION_WINDOW" || snapshot.phase === "ROB_KONG_WINDOW"
        ? reactionTimeoutMs
        : turnTimeoutMs
    );
  }

  handleTimeout(expectedVersion: number): boolean {
    this.assertVersion(expectedVersion);
    if (this.phase !== "PLAYING" || !this.round) return false;
    const snapshot = this.round.getSnapshot();
    if (snapshot.phase === "REACTION_WINDOW") {
      this.round.resolveReactions(snapshot.version, true);
    } else if (snapshot.phase === "ROB_KONG_WINDOW") {
      this.round.resolveRobKongReactions(snapshot.version, true);
    } else if (snapshot.turnAction === "DRAW" || snapshot.turnAction === "DRAW_REPLACEMENT") {
      this.round.draw(snapshot.currentSeat!, snapshot.version);
    } else if (snapshot.turnAction === "DISCARD") {
      const tile = snapshot.hands[snapshot.currentSeat!][0];
      if (!tile) throw new Error("Timed-out player has no tile to discard");
      this.round.discard(snapshot.currentSeat!, tile.id, snapshot.version);
    } else {
      return false;
    }
    this.finishRoundIfSettled();
    this.version += 1;
    return true;
  }
  private addPlayer(userId: string): RoomPlayer {
    const player: RoomPlayer = {
      userId,
      seat: this.players.length,
      joinedAt: this.now().toISOString(),
      ready: false,
      connected: true,
    };
    this.players.push(player);
    this.version += 1;
    return player;
  }

  private finishRoundIfSettled(): void {
    if (!this.round || this.round.getSnapshot().phase !== "ROUND_SETTLEMENT") return;
    const outcome = this.round.getSnapshot().outcome;
    if (!outcome) throw new Error("Settled round is missing an outcome");
    const match = this.requireMatch();
    match.settleRound(
      this.round.roundId,
      outcome,
      match.getSnapshot().version,
    );
    this.phase =
      match.getSnapshot().phase === "MATCH_SETTLEMENT"
        ? "COMPLETED"
        : "BETWEEN_ROUNDS";
  }

  private assertVersion(expectedVersion: number): void {
    if (expectedVersion !== this.version) {
      throw new RoomError(
        "STALE_VERSION",
        `Expected room version ${expectedVersion}, current version is ${this.version}`,
      );
    }
  }

  private assertWaiting(): void {
    if (this.phase !== "WAITING") {
      throw new RoomError(
        "WRONG_PHASE",
        `Room membership cannot change during ${this.phase}`,
      );
    }
  }

  private requirePlayer(userId: string): RoomPlayer {
    const player = this.players.find((candidate) => candidate.userId === userId);
    if (!player) {
      throw new RoomError("PLAYER_NOT_FOUND", `User ${userId} is not in the room`);
    }
    return player;
  }

  private requireMatch(): MatchEngine {
    if (!this.match) {
      throw new RoomError("MATCH_NOT_STARTED", "The match has not started");
    }
    return this.match;
  }

  private requirePlayingRound(): SingleRoundEngine {
    if (this.phase !== "PLAYING" || !this.round) {
      throw new RoomError("WRONG_PHASE", `No playable round during ${this.phase}`);
    }
    return this.round;
  }
}

function projectPublicRound(round: RoundSnapshot): PublicRoundSnapshot {
  return {
    roundId: round.roundId,
    version: round.version,
    phase: round.phase,
    dealerSeat: round.dealerSeat,
    currentSeat: round.currentSeat,
    turnAction: round.turnAction,
    remainingTiles: round.remainingTiles,
    handCounts: round.hands.map((hand) => hand.length),
    discards: round.discards.map((pile) =>
      pile.map((tile) => ({ id: tile.id, kind: tile.kind })),
    ),
    melds: round.melds.map((seatMelds) =>
      seatMelds.map((meld) => ({
        type: meld.type,
        kongType: meld.kongType,
        fromSeat: meld.fromSeat,
        tileIds: meld.tiles.map((tile) => tile.id),
        tileKinds: meld.tiles.map((tile) => tile.kind),
      })),
    ),
    pendingDiscard: round.pendingDiscard
      ? { seat: round.pendingDiscard.seat, tileId: round.pendingDiscard.tile.id, tileKind: round.pendingDiscard.tile.kind }
      : null,
    respondedSeats: round.reactionClaims.map((claim) => claim.seat),
    outcome: round.outcome,
  };
}
