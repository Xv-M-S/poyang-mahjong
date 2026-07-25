import { evaluateHand, type PatternCode } from "./patterns.ts";
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
export type TurnAction = "DRAW" | "DISCARD";
export type RoundEndReason = "SELF_DRAW" | "DISCARD_WIN" | "WALL_EXHAUSTED";

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
  | "ILLEGAL_WIN";

export interface PendingDiscard {
  readonly seat: number;
  readonly tile: Tile;
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
  | "REACTIONS_RESOLVED"
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
  readonly discards: readonly (readonly Tile[])[];
  readonly pendingDiscard: PendingDiscard | null;
  readonly outcome: RoundOutcome | null;
}

export interface StartRoundOptions {
  readonly roundId: string;
  readonly dealerSeat?: number;
  readonly wall?: readonly Tile[];
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
  private readonly discards: Tile[][];
  private readonly events: RoundEvent[] = [];
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

    this.wall = options.wall ? [...options.wall] : createShuffledWall();
    validateWall(this.wall);
    const deal = dealInitialHands(this.wall, this.dealerSeat);
    this.hands = deal.hands.map((hand) => [...hand]);
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
      discards: this.discards.map((discardPile) => [...discardPile]),
      pendingDiscard: this.pendingDiscard
        ? { seat: this.pendingDiscard.seat, tile: this.pendingDiscard.tile }
        : null,
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

  resolveNoClaim(expectedVersion: number): void {
    this.assertVersion(expectedVersion);
    this.assertActive();
    if (this.phase !== "REACTION_WINDOW") {
      throw new RoundEngineError(
        "WRONG_PHASE",
        `Cannot resolve reactions during ${this.phase}`,
      );
    }
    if (!this.pendingDiscard) {
      throw new RoundEngineError("NO_PENDING_DISCARD", "There is no pending discard");
    }

    const discardedBy = this.pendingDiscard.seat;
    const tileId = this.pendingDiscard.tile.id;
    const nextSeat = (discardedBy + 1) % 4;
    this.pendingDiscard = null;
    this.phase = "PLAYING";
    this.currentSeat = nextSeat;
    this.turnAction = "DRAW";
    this.publish("REACTIONS_RESOLVED", {
      resolution: "NO_CLAIM",
      tileId,
      nextSeat,
    });
    this.assertConservation();
  }

  draw(seat: number, expectedVersion: number): Tile | null {
    this.assertVersion(expectedVersion);
    this.assertPlayingTurn(seat, "DRAW");

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

    const tile = this.wall[this.drawIndex];
    this.drawIndex += 1;
    this.hands[seat].push(tile);
    this.turnAction = "DISCARD";
    this.publish("TILE_DRAWN", {
      seat,
      tileId: tile.id,
      tileKind: tile.kind,
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
    this.assertActive();
    assertSeat(seat);
    if (this.phase !== "REACTION_WINDOW") {
      throw new RoundEngineError(
        "WRONG_PHASE",
        `Cannot claim a discard during ${this.phase}`,
      );
    }
    if (!this.pendingDiscard) {
      throw new RoundEngineError("NO_PENDING_DISCARD", "There is no pending discard");
    }
    if (this.pendingDiscard.seat === seat) {
      throw new RoundEngineError(
        "DISCARDER_CANNOT_CLAIM",
        "A player cannot claim their own discard",
      );
    }

    const evaluation = evaluateHand({
      concealedCounts: countsFromTiles([
        ...this.hands[seat],
        this.pendingDiscard.tile,
      ]),
    });
    if (!evaluation.isEligiblePoyangWin) {
      throw new RoundEngineError("ILLEGAL_WIN", "The hand is not an eligible Poyang win");
    }

    return this.settle({
      reason: "DISCARD_WIN",
      winnerSeat: seat,
      loserSeat: this.pendingDiscard.seat,
      winningTileId: this.pendingDiscard.tile.id,
      patterns: evaluation.patterns,
    });
  }

  private settle(outcome: RoundOutcome): RoundOutcome {
    this.outcome = outcome;
    this.phase = "ROUND_SETTLEMENT";
    this.currentSeat = null;
    this.turnAction = null;
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

  private assertConservation(): void {
    const liveTiles = [
      ...this.hands.flat(),
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

function assertSeat(seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= 4) {
    throw new RoundEngineError("INVALID_SEAT", "Seat must be between 0 and 3");
  }
}
