import {
  DEFAULT_REACTION_PRIORITY,
  resolveReactionClaims,
  type ReactionAction,
  type ReactionClaim,
  type ReactionPriorityPolicy,
  type ReactionResolution,
} from "./claim-resolver.ts";
import {
  evaluateHand,
  type OpenMeld,
  type PatternCode,
} from "./patterns.ts";
import {
  STANDARD_WALL_SIZE,
  TILE_KIND_COUNT,
  type Tile,
} from "./tile.ts";
import {
  createShuffledWall,
  dealInitialHands,
  validateWall,
} from "./wall.ts";

export type RoundPhase = "PLAYING" | "REACTION_WINDOW" | "ROUND_SETTLEMENT";
export type TurnAction = "DRAW" | "DRAW_REPLACEMENT" | "DISCARD";
export type RoundEndReason = "SELF_DRAW" | "DISCARD_WIN" | "WALL_EXHAUSTED";
export type MeldType = "CHI" | "PENG" | "GANG";

export type RoundErrorCode =
  | "INVALID_SEAT"
  | "STALE_VERSION"
  | "ROUND_NOT_ACTIVE"
  | "WRONG_PHASE"
  | "NOT_CURRENT_PLAYER"
  | "WRONG_TURN_ACTION"
  | "TILE_NOT_IN_HAND"
  | "NO_PENDING_DISCARD"
  | "DISCARDER_CANNOT_CLAIM"
  | "REACTION_ALREADY_SUBMITTED"
  | "REACTIONS_PENDING"
  | "ILLEGAL_CLAIM"
  | "ILLEGAL_WIN";

export interface PendingDiscard {
  readonly seat: number;
  readonly tile: Tile;
}

export interface DeclaredMeld {
  readonly type: MeldType;
  readonly tiles: readonly Tile[];
  readonly fromSeat: number;
  readonly claimedTileId: number;
}

export interface RoundOutcome {
  readonly reason: RoundEndReason;
  readonly winnerSeat: number | null;
  readonly loserSeat: number | null;
  readonly winningTileId: number | null;
  readonly patterns: readonly PatternCode[];
}

export type RoundEventType =
  | "ROUND_STARTED"
  | "TILE_DRAWN"
  | "TILE_DISCARDED"
  | "REACTION_SUBMITTED"
  | "REACTIONS_RESOLVED"
  | "MELD_DECLARED"
  | "ROUND_SETTLED";

export interface RoundEvent {
  readonly sequence: number;
  readonly roundId: string;
  readonly type: RoundEventType;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RoundSnapshot {
  readonly roundId: string;
  readonly version: number;
  readonly phase: RoundPhase;
  readonly dealerSeat: number;
  readonly currentSeat: number | null;
  readonly turnAction: TurnAction | null;
  readonly drawIndex: number;
  readonly remainingTiles: number;
  readonly hands: readonly (readonly Tile[])[];
  readonly melds: readonly (readonly DeclaredMeld[])[];
  readonly discards: readonly (readonly Tile[])[];
  readonly pendingDiscard: PendingDiscard | null;
  readonly reactionClaims: readonly ReactionClaim[];
  readonly outcome: RoundOutcome | null;
}

export interface StartRoundOptions {
  readonly roundId: string;
  readonly dealerSeat?: number;
  readonly wall?: readonly Tile[];
  readonly reactionPriority?: ReactionPriorityPolicy;
}

export class RoundEngineError extends Error {
  readonly code: RoundErrorCode;

  constructor(code: RoundErrorCode, message: string) {
    super(message);
    this.name = "RoundEngineError";
    this.code = code;
  }
}

export class SingleRoundEngine {
  readonly roundId: string;
  readonly dealerSeat: number;

  private readonly wall: Tile[];
  private readonly hands: Tile[][];
  private readonly melds: DeclaredMeld[][];
  private readonly discards: Tile[][];
  private readonly events: RoundEvent[] = [];
  private readonly reactionPriority: ReactionPriorityPolicy;
  private readonly reactionClaims = new Map<number, ReactionClaim>();
  private drawIndex: number;
  private version = 0;
  private phase: RoundPhase = "PLAYING";
  private currentSeat: number | null;
  private turnAction: TurnAction | null = "DISCARD";
  private pendingDiscard: PendingDiscard | null = null;
  private outcome: RoundOutcome | null = null;

  constructor(options: StartRoundOptions) {
    if (!options.roundId.trim()) throw new Error("roundId is required");
    this.roundId = options.roundId;
    this.dealerSeat = options.dealerSeat ?? 0;
    assertSeat(this.dealerSeat);
    this.reactionPriority = options.reactionPriority ?? DEFAULT_REACTION_PRIORITY;

    this.wall = options.wall ? [...options.wall] : createShuffledWall();
    validateWall(this.wall);
    const deal = dealInitialHands(this.wall, this.dealerSeat);
    this.hands = deal.hands.map((hand) => [...hand]);
    this.melds = Array.from({ length: 4 }, () => []);
    this.discards = Array.from({ length: 4 }, () => []);
    this.drawIndex = deal.drawIndex;
    this.currentSeat = this.dealerSeat;

    this.publish("ROUND_STARTED", {
      dealerSeat: this.dealerSeat,
      handTileIds: this.hands.map((hand) => hand.map((tile) => tile.id)),
      remainingTiles: this.remainingTiles,
    });
    this.assertConservation();
  }

  get remainingTiles(): number {
    return this.wall.length - this.drawIndex;
  }

  getSnapshot(): RoundSnapshot {
    return {
      roundId: this.roundId,
      version: this.version,
      phase: this.phase,
      dealerSeat: this.dealerSeat,
      currentSeat: this.currentSeat,
      turnAction: this.turnAction,
      drawIndex: this.drawIndex,
      remainingTiles: this.remainingTiles,
      hands: this.hands.map((hand) => [...hand]),
      melds: this.melds.map((seatMelds) =>
        seatMelds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
      ),
      discards: this.discards.map((discardPile) => [...discardPile]),
      pendingDiscard: this.pendingDiscard
        ? { seat: this.pendingDiscard.seat, tile: this.pendingDiscard.tile }
        : null,
      reactionClaims: [...this.reactionClaims.values()].map((claim) => ({
        ...claim,
        tileIds: [...claim.tileIds],
      })),
      outcome: this.outcome
        ? { ...this.outcome, patterns: [...this.outcome.patterns] }
        : null,
    };
  }

  getEvents(afterSequence = 0): readonly RoundEvent[] {
    return this.events.filter((event) => event.sequence > afterSequence);
  }

  discard(seat: number, tileId: number, expectedVersion: number): Tile {
    this.assertVersion(expectedVersion);
    this.assertPlayingTurn(seat, "DISCARD");

    const tileIndex = this.hands[seat].findIndex((tile) => tile.id === tileId);
    if (tileIndex < 0) {
      throw new RoundEngineError(
        "TILE_NOT_IN_HAND",
        `Tile ${tileId} is not in seat ${seat}'s hand`,
      );
    }

    const [tile] = this.hands[seat].splice(tileIndex, 1);
    this.discards[seat].push(tile);
    this.pendingDiscard = { seat, tile };
    this.reactionClaims.clear();
    this.phase = "REACTION_WINDOW";
    this.turnAction = null;

    this.publish("TILE_DISCARDED", {
      seat,
      tileId: tile.id,
      tileKind: tile.kind,
    });
    this.assertConservation();
    return tile;
  }

  submitReaction(
    seat: number,
    action: ReactionAction,
    tileIds: readonly number[],
    expectedVersion: number,
  ): ReactionClaim {
    this.assertVersion(expectedVersion);
    this.assertReactionWindow();
    assertSeat(seat);
    if (seat === this.pendingDiscard!.seat) {
      throw new RoundEngineError(
        "DISCARDER_CANNOT_CLAIM",
        "The discarder cannot react to their own tile",
      );
    }
    if (this.reactionClaims.has(seat)) {
      throw new RoundEngineError(
        "REACTION_ALREADY_SUBMITTED",
        `Seat ${seat} has already submitted a reaction`,
      );
    }

    this.validateReaction(seat, action, tileIds);
    const claim: ReactionClaim = { seat, action, tileIds: [...tileIds] };
    this.reactionClaims.set(seat, claim);
    this.publish("REACTION_SUBMITTED", {
      seat,
      action,
      tileIds: [...tileIds],
      respondedSeats: [...this.reactionClaims.keys()],
    });
    return claim;
  }

  resolveReactions(
    expectedVersion: number,
    forceTimeout = false,
  ): ReactionResolution {
    this.assertVersion(expectedVersion);
    this.assertReactionWindow();
    if (!forceTimeout && this.reactionClaims.size < 3) {
      throw new RoundEngineError(
        "REACTIONS_PENDING",
        "Not every eligible seat has submitted a reaction",
      );
    }

    const discarderSeat = this.pendingDiscard!.seat;
    const resolution = resolveReactionClaims(
      discarderSeat,
      [...this.reactionClaims.values()],
      this.reactionPriority,
    );

    if (resolution.action === "NO_CLAIM") {
      const tileId = this.pendingDiscard!.tile.id;
      const nextSeat = (discarderSeat + 1) % 4;
      this.pendingDiscard = null;
      this.reactionClaims.clear();
      this.phase = "PLAYING";
      this.currentSeat = nextSeat;
      this.turnAction = "DRAW";
      this.publish("REACTIONS_RESOLVED", {
        action: "NO_CLAIM",
        seat: null,
        tileId,
        nextSeat,
      });
      this.assertConservation();
      return resolution;
    }

    const claim = resolution.claim!;
    this.publish("REACTIONS_RESOLVED", {
      action: resolution.action,
      seat: claim.seat,
      tileId: this.pendingDiscard!.tile.id,
      nextSeat: resolution.action === "HU" ? null : claim.seat,
    });

    if (resolution.action === "HU") {
      this.settleDiscardWin(claim.seat);
    } else {
      this.applyMeld(claim);
    }
    return resolution;
  }

  resolveNoClaim(expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    if ([...this.reactionClaims.values()].some((claim) => claim.action !== "PASS")) {
      throw new RoundEngineError(
        "ILLEGAL_CLAIM",
        "A non-pass reaction has already been submitted",
      );
    }
    this.resolveReactions(expectedVersion, true);
  }

  draw(seat: number, expectedVersion: number): Tile | null {
    this.assertVersion(expectedVersion);
    this.assertPlayingDraw(seat);

    if (this.remainingTiles === 0) {
      this.settle({
        reason: "WALL_EXHAUSTED",
        winnerSeat: null,
        loserSeat: null,
        winningTileId: null,
        patterns: [],
      });
      return null;
    }

    const drawAction = this.turnAction;
    const tile = this.wall[this.drawIndex];
    this.drawIndex += 1;
    this.hands[seat].push(tile);
    this.turnAction = "DISCARD";
    this.publish("TILE_DRAWN", {
      seat,
      tileId: tile.id,
      tileKind: tile.kind,
      source: drawAction === "DRAW_REPLACEMENT" ? "KONG_REPLACEMENT" : "WALL",
      remainingTiles: this.remainingTiles,
    });
    this.assertConservation();
    return tile;
  }

  declareSelfDrawWin(seat: number, expectedVersion: number): RoundOutcome {
    this.assertVersion(expectedVersion);
    this.assertPlayingTurn(seat, "DISCARD");
    const evaluation = evaluateHand({
      concealedCounts: countsFromTiles(this.hands[seat]),
      openMelds: this.evaluationMelds(seat),
    });
    if (!evaluation.isEligiblePoyangWin) {
      throw new RoundEngineError("ILLEGAL_WIN", "The hand is not an eligible Poyang win");
    }

    const winningTile = this.hands[seat][this.hands[seat].length - 1];
    return this.settle({
      reason: "SELF_DRAW",
      winnerSeat: seat,
      loserSeat: null,
      winningTileId: winningTile?.id ?? null,
      patterns: evaluation.patterns,
    });
  }

  declareDiscardWin(seat: number, expectedVersion: number): RoundOutcome {
    this.assertVersion(expectedVersion);
    this.assertReactionWindow();
    assertSeat(seat);
    if (this.pendingDiscard!.seat === seat) {
      throw new RoundEngineError(
        "DISCARDER_CANNOT_CLAIM",
        "A player cannot claim their own discard",
      );
    }
    return this.settleDiscardWin(seat);
  }

  private settleDiscardWin(seat: number): RoundOutcome {
    const pending = this.pendingDiscard!;
    const evaluation = evaluateHand({
      concealedCounts: countsFromTiles([
        ...this.hands[seat],
        pending.tile,
      ]),
      openMelds: this.evaluationMelds(seat),
    });
    if (!evaluation.isEligiblePoyangWin) {
      throw new RoundEngineError("ILLEGAL_WIN", "The hand is not an eligible Poyang win");
    }

    return this.settle({
      reason: "DISCARD_WIN",
      winnerSeat: seat,
      loserSeat: pending.seat,
      winningTileId: pending.tile.id,
      patterns: evaluation.patterns,
    });
  }

  private applyMeld(claim: ReactionClaim): void {
    const pending = this.pendingDiscard!;
    const type = claim.action as MeldType;
    const claimedFromHand = claim.tileIds.map((tileId) =>
      this.removeTileFromHand(claim.seat, tileId),
    );

    const discardPile = this.discards[pending.seat];
    const discardIndex = discardPile.findLastIndex(
      (tile) => tile.id === pending.tile.id,
    );
    if (discardIndex < 0) throw new Error("Claimed discard is missing from discard pile");
    discardPile.splice(discardIndex, 1);

    const meld: DeclaredMeld = {
      type,
      tiles: [...claimedFromHand, pending.tile],
      fromSeat: pending.seat,
      claimedTileId: pending.tile.id,
    };
    this.melds[claim.seat].push(meld);
    this.pendingDiscard = null;
    this.reactionClaims.clear();
    this.phase = "PLAYING";
    this.currentSeat = claim.seat;
    this.turnAction = type === "GANG" ? "DRAW_REPLACEMENT" : "DISCARD";
    this.publish("MELD_DECLARED", {
      seat: claim.seat,
      type,
      fromSeat: meld.fromSeat,
      tileIds: meld.tiles.map((tile) => tile.id),
      nextAction: this.turnAction,
    });
    this.assertConservation();
  }

  private validateReaction(
    seat: number,
    action: ReactionAction,
    tileIds: readonly number[],
  ): void {
    const pending = this.pendingDiscard!;
    if (new Set(tileIds).size !== tileIds.length) {
      throw new RoundEngineError("ILLEGAL_CLAIM", "Claim tile ids must be unique");
    }
    const selected = tileIds.map((tileId) => {
      const tile = this.hands[seat].find((candidate) => candidate.id === tileId);
      if (!tile) {
        throw new RoundEngineError(
          "TILE_NOT_IN_HAND",
          `Tile ${tileId} is not in seat ${seat}'s hand`,
        );
      }
      return tile;
    });

    if (action === "PASS") {
      if (tileIds.length !== 0) {
        throw new RoundEngineError("ILLEGAL_CLAIM", "PASS cannot include tiles");
      }
      return;
    }

    if (action === "HU") {
      if (tileIds.length !== 0) {
        throw new RoundEngineError("ILLEGAL_CLAIM", "HU does not include hand tile ids");
      }
      const evaluation = evaluateHand({
        concealedCounts: countsFromTiles([...this.hands[seat], pending.tile]),
        openMelds: this.evaluationMelds(seat),
      });
      if (!evaluation.isEligiblePoyangWin) {
        throw new RoundEngineError("ILLEGAL_WIN", "The hand cannot claim HU");
      }
      return;
    }

    if (action === "PENG" || action === "GANG") {
      const expectedTileCount = action === "PENG" ? 2 : 3;
      if (
        selected.length !== expectedTileCount
        || selected.some((tile) => tile.kind !== pending.tile.kind)
      ) {
        throw new RoundEngineError(
          "ILLEGAL_CLAIM",
          `${action} requires ${expectedTileCount} matching hand tiles`,
        );
      }
      return;
    }

    if (seat !== (pending.seat + 1) % 4) {
      throw new RoundEngineError(
        "ILLEGAL_CLAIM",
        "Only the next seat may claim CHI",
      );
    }
    if (selected.length !== 2 || !formsSequence([...selected, pending.tile])) {
      throw new RoundEngineError(
        "ILLEGAL_CLAIM",
        "CHI requires two hand tiles forming a suited sequence",
      );
    }
  }

  private evaluationMelds(seat: number): OpenMeld[] {
    return this.melds[seat].map((meld) => ({
      type: meld.type === "CHI" ? "CHOW" : meld.type === "PENG" ? "PUNG" : "KONG",
      tiles: meld.tiles.map((tile) => tile.kind),
    }));
  }

  private removeTileFromHand(seat: number, tileId: number): Tile {
    const index = this.hands[seat].findIndex((tile) => tile.id === tileId);
    if (index < 0) {
      throw new RoundEngineError(
        "TILE_NOT_IN_HAND",
        `Tile ${tileId} is not in seat ${seat}'s hand`,
      );
    }
    return this.hands[seat].splice(index, 1)[0];
  }

  private settle(outcome: RoundOutcome): RoundOutcome {
    this.outcome = outcome;
    this.phase = "ROUND_SETTLEMENT";
    this.currentSeat = null;
    this.turnAction = null;
    this.reactionClaims.clear();
    this.publish("ROUND_SETTLED", {
      ...outcome,
      patterns: [...outcome.patterns],
    });
    this.assertConservation();
    return outcome;
  }

  private publish(
    type: RoundEventType,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    this.version += 1;
    this.events.push({
      sequence: this.version,
      roundId: this.roundId,
      type,
      payload,
    });
  }

  private assertVersion(expectedVersion: number): void {
    if (expectedVersion !== this.version) {
      throw new RoundEngineError(
        "STALE_VERSION",
        `Expected version ${expectedVersion}, current version is ${this.version}`,
      );
    }
  }

  private assertActive(): void {
    if (this.phase === "ROUND_SETTLEMENT") {
      throw new RoundEngineError("ROUND_NOT_ACTIVE", "The round has already settled");
    }
  }

  private assertReactionWindow(): void {
    this.assertActive();
    if (this.phase !== "REACTION_WINDOW") {
      throw new RoundEngineError(
        "WRONG_PHASE",
        `Expected REACTION_WINDOW, current phase is ${this.phase}`,
      );
    }
    if (!this.pendingDiscard) {
      throw new RoundEngineError("NO_PENDING_DISCARD", "There is no pending discard");
    }
  }

  private assertPlayingTurn(seat: number, action: TurnAction): void {
    this.assertActive();
    assertSeat(seat);
    if (this.phase !== "PLAYING") {
      throw new RoundEngineError(
        "WRONG_PHASE",
        `Expected PLAYING phase, current phase is ${this.phase}`,
      );
    }
    if (seat !== this.currentSeat) {
      throw new RoundEngineError(
        "NOT_CURRENT_PLAYER",
        `Seat ${seat} is not the current player`,
      );
    }
    if (this.turnAction !== action) {
      throw new RoundEngineError(
        "WRONG_TURN_ACTION",
        `Expected ${this.turnAction}, received ${action}`,
      );
    }
  }

  private assertPlayingDraw(seat: number): void {
    this.assertActive();
    assertSeat(seat);
    if (this.phase !== "PLAYING") {
      throw new RoundEngineError(
        "WRONG_PHASE",
        `Expected PLAYING phase, current phase is ${this.phase}`,
      );
    }
    if (seat !== this.currentSeat) {
      throw new RoundEngineError(
        "NOT_CURRENT_PLAYER",
        `Seat ${seat} is not the current player`,
      );
    }
    if (this.turnAction !== "DRAW" && this.turnAction !== "DRAW_REPLACEMENT") {
      throw new RoundEngineError(
        "WRONG_TURN_ACTION",
        `Expected ${this.turnAction}, received DRAW`,
      );
    }
  }

  private assertConservation(): void {
    const liveTiles = [
      ...this.hands.flat(),
      ...this.melds.flatMap((seatMelds) =>
        seatMelds.flatMap((meld) => meld.tiles),
      ),
      ...this.discards.flat(),
      ...this.wall.slice(this.drawIndex),
    ];
    if (liveTiles.length !== STANDARD_WALL_SIZE) {
      throw new Error(`Tile conservation failed: ${liveTiles.length} tiles`);
    }
    if (new Set(liveTiles.map((tile) => tile.id)).size !== STANDARD_WALL_SIZE) {
      throw new Error("Tile conservation failed: duplicate or missing physical tile");
    }
  }
}

function countsFromTiles(tiles: readonly Tile[]): number[] {
  const counts = Array<number>(TILE_KIND_COUNT).fill(0);
  for (const tile of tiles) {
    counts[tile.kind] += 1;
    if (counts[tile.kind] > 4) {
      throw new Error(`A hand cannot contain more than four tiles of kind ${tile.kind}`);
    }
  }
  return counts;
}

function formsSequence(tiles: readonly Tile[]): boolean {
  if (tiles.length !== 3 || tiles.some((tile) => tile.kind >= 27)) return false;
  const kinds = tiles.map((tile) => tile.kind).sort((left, right) => left - right);
  return Math.floor(kinds[0] / 9) === Math.floor(kinds[2] / 9)
    && kinds[1] === kinds[0] + 1
    && kinds[2] === kinds[1] + 1;
}

function assertSeat(seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= 4) {
    throw new RoundEngineError("INVALID_SEAT", "Seat must be between 0 and 3");
  }
}
