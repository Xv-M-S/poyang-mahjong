export interface RuleConfig {
  readonly version: string;
  readonly playerCount: 4;
  readonly allowPlainStandardWin: boolean;
  readonly allowMultipleWinners: boolean | null;
  readonly concealedKongKeepsClosedHand: boolean | null;
  readonly baseScore: number | null;
  readonly scoreCap: number | null;
}

export const POYANG_RULES_V1: RuleConfig = Object.freeze({
  version: "poyang-v1-draft",
  playerCount: 4,
  allowPlainStandardWin: false,
  allowMultipleWinners: null,
  concealedKongKeepsClosedHand: null,
  baseScore: null,
  scoreCap: null,
});
