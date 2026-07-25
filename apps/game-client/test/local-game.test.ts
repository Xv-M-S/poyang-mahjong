import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadClientRules(seed = 1) {
  const source = readFileSync(new URL("../utils/local-game.js", import.meta.url), "utf8");
  const module = { exports: {} };
  let state = seed >>> 0;
  const seededMath = Object.create(Math);
  seededMath.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  vm.runInNewContext(source, { module, exports: module.exports, Math: seededMath, console });
  return module.exports;
}

function tileFromCode(api, code, copy = 0) {
  const suffix = code.slice(-1);
  const rank = Number(code[0]);
  const offset = suffix === "m" ? 0 : suffix === "p" ? 9 : 18;
  return api.createTile(offset + rank - 1, copy);
}

test("client recognizes an eligible all-simples win", () => {
  const { __test: api } = loadClientRules();
  const codes = ["2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "6s", "7s", "8s", "5p", "5p"];
  const result = api.evaluateWin(codes.map((code, index) => tileFromCode(api, code, index % 4)), []);
  assert.equal(result.eligible, true);
  assert.equal(result.patterns.includes("ALL_SIMPLES"), true);
});

test("client finds chi choices and resolves HU above other claims", () => {
  const { __test: api } = loadClientRules();
  const choices = api.findChiChoices(
    [tileFromCode(api, "1m"), tileFromCode(api, "3m")],
    tileFromCode(api, "2m", 1),
  );
  assert.equal(choices.length, 1);

  const winner = api.resolveClaims(0, [
    { seat: 1, action: "CHI" },
    { seat: 2, action: "PENG" },
    { seat: 3, action: "HU" },
  ]);
  assert.equal(winner.action, "HU");
  assert.equal(winner.seat, 3);
});

test("local client games preserve all 136 tiles through claims and kongs", () => {
  for (let gameIndex = 0; gameIndex < 12; gameIndex += 1) {
    const { createLocalGame } = loadClientRules(gameIndex + 10);
    const game = createLocalGame();
    let steps = 0;

    while (!game.finished && steps < 600) {
      if (game.hasHumanReaction()) {
        const option = game.reactionOptions[0][0];
        game.respondHuman(option.action, option.choiceIndex ?? -1);
      } else if (game.phase === "REACTION") {
        game.resolveReactions(null);
      } else if (game.turn === 0) {
        const action = game.humanActions()[0];
        if (action?.action === "HU") game.declareHumanAction("HU", -1);
        else if (action?.action === "GANG") game.declareHumanAction("GANG", action.kind);
        else game.discard(0, game.hands[0][0].id);
      } else {
        game.playBotTurn();
      }

      const tileCount = game.wall.length
        + game.hands.reduce((total, hand) => total + hand.length, 0)
        + game.discards.reduce((total, pile) => total + pile.length, 0)
        + game.melds.reduce(
          (total, meldList) => total + meldList.reduce((count, meld) => count + meld.tiles.length, 0),
          0,
        );
      assert.equal(tileCount, 136);
      steps += 1;
    }

    assert.equal(game.finished, true);
  }
});
