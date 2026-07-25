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
      } else if (game.phase === "ROB_KONG") {
        game.resolveRobKongReactions(null);
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


test("added kong can be robbed and passing upgrades the peng", () => {
  const { createLocalGame, __test: api } = loadClientRules(50);
  const kind = tileFromCode(api, "4p").kind;

  const completedKong = createLocalGame();
  completedKong.hands = [[], [api.createTile(kind, 3)], [], []];
  completedKong.melds = [[], [{ type: "PENG", tiles: [0, 1, 2].map((copy) => api.createTile(kind, copy)), fromSeat: 0 }], [], []];
  completedKong.turn = 1;
  completedKong.phase = "DISCARD";
  completedKong.canSelfAction = true;
  assert.equal(completedKong.proposeAddedKong(1, kind), true);
  assert.equal(completedKong.phase, "ROB_KONG");
  completedKong.resolveRobKongReactions(null);
  assert.equal(completedKong.melds[1][0].kongType, "ADDED");
  assert.deepEqual(Array.from(completedKong.roundKongDeltas), [-1, 3, -1, -1]);

  const robbedKong = createLocalGame();
  const waitCodes = ["2m", "3m", "4m", "3m", "4m", "5m", "5p", "6p", "6s", "7s", "8s", "7p", "7p"];
  robbedKong.hands = [
    waitCodes.map((code, index) => tileFromCode(api, code, index % 4)),
    [api.createTile(kind, 3)],
    [],
    [],
  ];
  robbedKong.melds = [[], [{ type: "PENG", tiles: [0, 1, 2].map((copy) => api.createTile(kind, copy)), fromSeat: 0 }], [], []];
  robbedKong.turn = 1;
  robbedKong.phase = "DISCARD";
  robbedKong.canSelfAction = true;
  robbedKong.proposeAddedKong(1, kind);
  assert.equal(robbedKong.hasHumanReaction(), true);
  robbedKong.respondHuman("HU", -1);
  assert.equal(robbedKong.roundSettlement.reason, "ROB_KONG_WIN");
  assert.deepEqual(Array.from(robbedKong.winnerSeats), [0]);
  assert.equal(robbedKong.melds[1][0].type, "PENG");
});

test("multiple HU claims settle together and passing HU creates a restriction", () => {
  const { createLocalGame, __test: api } = loadClientRules(70);
  const game = createLocalGame();
  const discard = tileFromCode(api, "5p");
  game.phase = "REACTION";
  game.pendingDiscard = { seat: 0, tile: discard, lastTile: false };
  game.discards[0] = [discard];
  game.reactionOptions = [
    [],
    [{ action: "HU", patterns: ["ALL_SIMPLES"] }],
    [{ action: "HU", patterns: ["ALL_SIMPLES"] }],
    [],
  ];
  game.resolveReactions(null);
  assert.deepEqual(Array.from(game.winnerSeats), [1, 2]);
  assert.equal(game.winType, "一炮多响");
  assert.equal(game.roundSettlement.deltas.reduce((total, delta) => total + delta, 0), 0);

  const passGame = createLocalGame();
  passGame.phase = "REACTION";
  passGame.pendingDiscard = { seat: 1, tile: discard, lastTile: false };
  passGame.reactionOptions = [[{ action: "HU", patterns: ["ALL_SIMPLES"] }], [], [], []];
  passGame.respondHuman("PASS", -1);
  assert.equal(passGame.passedHu[0], true);
});

test("a four-round local match accumulates zero-sum scores and settles", () => {
  const { createLocalGame } = loadClientRules(90);
  const game = createLocalGame();
  let guard = 0;
  while (!game.matchFinished && guard < 3000) {
    while (!game.finished && guard < 3000) {
      if (game.hasHumanReaction()) {
        const option = game.reactionOptions[0][0];
        game.respondHuman(option.action, option.choiceIndex ?? -1);
      } else if (game.phase === "REACTION") game.resolveReactions(null);
      else if (game.phase === "ROB_KONG") game.resolveRobKongReactions(null);
      else if (game.turn === 0) {
        const action = game.humanActions()[0];
        if (action?.action === "HU") game.declareHumanAction("HU", -1);
        else if (action?.action === "GANG") game.declareHumanAction("GANG", action.kind);
        else game.discard(0, game.hands[0][0].id);
      } else game.playBotTurn();
      guard += 1;
    }
    assert.equal(game.scores.reduce((total, score) => total + score, 0), 0);
    if (!game.matchFinished) game.startNextRound();
  }
  assert.equal(game.matchFinished, true);
  assert.equal(game.completedRounds, 4);
  assert.equal(game.matchHistory.length, 4);
});


test("kong bloom, last-tile contexts, kong points, and dealer changes are settled", () => {
  const { createLocalGame } = loadClientRules(120);
  const contextGame = createLocalGame();
  contextGame.lastDrawSource = "KONG_REPLACEMENT";
  contextGame.lastDrawWasLastTile = true;
  contextGame.finishSelfWin(0, ["ALL_SIMPLES"]);
  assert.deepEqual(Array.from(contextGame.roundSettlement.contextLabels), ["杠上开花", "海底捞月"]);
  assert.equal(contextGame.roundSettlement.dealerContinues, true);
  assert.equal(contextGame.dealerSeat, 0);

  const kongGame = createLocalGame();
  kongGame.scoreKong("CONCEALED", 0, 0);
  kongGame.scoreKong("EXPOSED", 1, 0);
  assert.deepEqual(Array.from(kongGame.roundKongDeltas), [3, 1, -2, -2]);
  assert.equal(kongGame.roundKongDeltas.reduce((total, score) => total + score, 0), 0);

  const rotationGame = createLocalGame();
  rotationGame.finishWins([{ seat: 1, patterns: ["ALL_SIMPLES"] }], "DISCARD_WIN", 0, []);
  assert.equal(rotationGame.roundSettlement.dealerContinues, false);
  assert.equal(rotationGame.dealerSeat, 1);
});
