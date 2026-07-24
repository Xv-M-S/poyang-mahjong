import assert from "node:assert/strict";
import test from "node:test";

import { assertTransition, canTransition } from "../src/index.ts";

test("allows the normal start-of-round path", () => {
  assert.equal(canTransition("WAITING", "READY"), true);
  assert.equal(canTransition("READY", "DEALING"), true);
  assert.equal(canTransition("DEALING", "PLAYING"), true);
});

test("rejects skipping directly from waiting to playing", () => {
  assert.equal(canTransition("WAITING", "PLAYING"), false);
  assert.throws(
    () => assertTransition("WAITING", "PLAYING"),
    /Invalid game phase transition/,
  );
});
