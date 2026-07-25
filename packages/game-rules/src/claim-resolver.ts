export type ReactionAction = "CHI" | "PENG" | "GANG" | "HU" | "PASS";

export interface ReactionClaim {
  readonly seat: number;
  readonly action: ReactionAction;
  readonly tileIds: readonly number[];
}

export interface ReactionPriorityPolicy {
  readonly priority: Readonly<Record<Exclude<ReactionAction, "PASS">, number>>;
  readonly tieBreak: "NEAREST_TO_DISCARDER";
}

export interface ReactionResolution {
  readonly action: Exclude<ReactionAction, "PASS"> | "NO_CLAIM";
  readonly claim: ReactionClaim | null;
}

export const DEFAULT_REACTION_PRIORITY: ReactionPriorityPolicy = Object.freeze({
  priority: Object.freeze({
    HU: 4,
    GANG: 3,
    PENG: 2,
    CHI: 1,
  }),
  tieBreak: "NEAREST_TO_DISCARDER",
});

export function resolveReactionClaims(
  discarderSeat: number,
  claims: readonly ReactionClaim[],
  policy: ReactionPriorityPolicy = DEFAULT_REACTION_PRIORITY,
): ReactionResolution {
  assertSeat(discarderSeat);
  const seenSeats = new Set<number>();
  const candidates: ReactionClaim[] = [];

  for (const claim of claims) {
    assertSeat(claim.seat);
    if (claim.seat === discarderSeat) {
      throw new Error("The discarder cannot submit a reaction claim");
    }
    if (seenSeats.has(claim.seat)) {
      throw new Error(`Seat ${claim.seat} submitted more than one reaction`);
    }
    seenSeats.add(claim.seat);
    if (claim.action !== "PASS") candidates.push(claim);
  }

  candidates.sort((left, right) => {
    const priorityDifference =
      policy.priority[right.action as Exclude<ReactionAction, "PASS">]
      - policy.priority[left.action as Exclude<ReactionAction, "PASS">];
    if (priorityDifference !== 0) return priorityDifference;
    return seatDistance(discarderSeat, left.seat)
      - seatDistance(discarderSeat, right.seat);
  });

  const winner = candidates[0];
  return winner
    ? { action: winner.action as Exclude<ReactionAction, "PASS">, claim: winner }
    : { action: "NO_CLAIM", claim: null };
}

export function seatDistance(fromSeat: number, toSeat: number): number {
  assertSeat(fromSeat);
  assertSeat(toSeat);
  const distance = (toSeat - fromSeat + 4) % 4;
  if (distance === 0) throw new Error("Seats must be different");
  return distance;
}

function assertSeat(seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
    throw new RangeError("Seat must be between 0 and 3");
  }
}
