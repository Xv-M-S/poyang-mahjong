import type { GamePhase } from "./messages.ts";

const TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  WAITING: ["READY", "CLOSED"],
  READY: ["WAITING", "DEALING", "CLOSED"],
  DEALING: ["PLAYING", "CLOSED"],
  PLAYING: ["REACTION_WINDOW", "ROUND_SETTLEMENT", "CLOSED"],
  REACTION_WINDOW: ["PLAYING", "ROUND_SETTLEMENT", "CLOSED"],
  ROUND_SETTLEMENT: ["DEALING", "MATCH_SETTLEMENT", "CLOSED"],
  MATCH_SETTLEMENT: ["CLOSED"],
  CLOSED: [],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: GamePhase, to: GamePhase): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid game phase transition: ${from} -> ${to}`);
  }
}
