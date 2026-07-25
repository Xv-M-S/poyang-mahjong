import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveReactionClaims,
  seatDistance,
  type ReactionClaim,
} from "../src/claim-resolver.ts";

test("reaction priority is HU > GANG > PENG > CHI", () => {
  const claims: ReactionClaim[] = [
    { seat: 1, action: "CHI", tileIds: [1, 2] },
    { seat: 2, action: "PENG", tileIds: [3, 4] },
    { seat: 3, action: "HU", tileIds: [] },
  ];
  const result = resolveReactionClaims(0, claims);
  assert.equal(result.action, "HU");
  assert.equal(result.claim?.seat, 3);
});

test("GANG beats PENG and CHI", () => {
  const result = resolveReactionClaims(0, [
    { seat: 1, action: "CHI", tileIds: [1, 2] },
    { seat: 2, action: "PENG", tileIds: [3, 4] },
    { seat: 3, action: "GANG", tileIds: [5, 6, 7] },
  ]);
  assert.equal(result.action, "GANG");
  assert.equal(result.claim?.seat, 3);
});

test("nearest seat wins when claims have the same priority", () => {
  const claims: ReactionClaim[] = [
    { seat: 1, action: "PENG", tileIds: [1, 2] },
    { seat: 3, action: "PENG", tileIds: [3, 4] },
  ];
  const result = resolveReactionClaims(0, claims);
  assert.equal(result.action, "PENG");
  assert.equal(result.claim?.seat, 1);
  assert.equal(seatDistance(3, 1), 2);
});

test("passes result in no claim", () => {
  const result = resolveReactionClaims(2, [
    { seat: 0, action: "PASS", tileIds: [] },
    { seat: 1, action: "PASS", tileIds: [] },
    { seat: 3, action: "PASS", tileIds: [] },
  ]);
  assert.deepEqual(result, { action: "NO_CLAIM", claim: null });
});
