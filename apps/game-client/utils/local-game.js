const HONOR_SYMBOLS = ["东", "南", "西", "北", "中", "发", "白"];
const SUIT_UNITS = ["万", "筒", "条"];
const SEAT_NAMES = ["我", "下家", "对家", "上家"];
const PRIORITY = { HU: 4, GANG: 3, PENG: 2, CHI: 1 };
const ACTION_LABELS = { HU: "胡", GANG: "杠", PENG: "碰", CHI: "吃" };
const PATTERN_LABELS = {
  ALL_SIMPLES: "断幺",
  ALL_PUNGS: "碰碰胡",
  ONE_DRAGON: "一条龙",
  SEVEN_PAIRS: "七对",
  PURE_ONE_SUIT: "清一色",
  MIXED_ONE_SUIT: "混一色",
  ALL_HONORS: "字一色",
  THIRTEEN_ORPHANS: "十三幺",
  GREEN_HAND: "绿一色"
};
const ORPHAN_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function createTile(kind, copy) {
  const suited = kind < 27;
  const suitIndex = suited ? Math.floor(kind / 9) : 3;
  const rank = suited ? (kind % 9) + 1 : kind - 27;
  return {
    id: kind * 4 + copy,
    kind,
    rank,
    suitIndex,
    symbol: suited ? String(rank) : HONOR_SYMBOLS[rank],
    unit: suited ? SUIT_UNITS[suitIndex] : "",
    suitClass: suited ? ["wan", "tong", "tiao"][suitIndex] : "honor"
  };
}

function createWall() {
  const wall = [];
  for (let kind = 0; kind < 34; kind += 1) {
    for (let copy = 0; copy < 4; copy += 1) wall.push(createTile(kind, copy));
  }
  return wall;
}

function shuffle(wall) {
  for (let index = wall.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const tile = wall[index];
    wall[index] = wall[swapIndex];
    wall[swapIndex] = tile;
  }
  return wall;
}

function sortHand(hand) {
  hand.sort((left, right) => left.kind - right.kind || left.id - right.id);
}

function countsFromTiles(tiles) {
  const counts = Array(34).fill(0);
  tiles.forEach((tile) => { counts[tile.kind] += 1; });
  return counts;
}

function countTiles(hand, kind) {
  return hand.reduce((count, tile) => count + (tile.kind === kind ? 1 : 0), 0);
}

function sum(counts) {
  return counts.reduce((total, count) => total + count, 0);
}

function canFormMelds(counts, meldsNeeded, memo) {
  if (meldsNeeded === 0) return sum(counts) === 0;
  const key = meldsNeeded + ":" + counts.join("");
  if (memo[key] !== undefined) return memo[key];
  const first = counts.findIndex((count) => count > 0);
  if (first < 0) return false;

  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (canFormMelds(counts, meldsNeeded - 1, memo)) {
      counts[first] += 3;
      memo[key] = true;
      return true;
    }
    counts[first] += 3;
  }

  if (first < 27 && first % 9 <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    if (canFormMelds(counts, meldsNeeded - 1, memo)) {
      counts[first] += 1;
      counts[first + 1] += 1;
      counts[first + 2] += 1;
      memo[key] = true;
      return true;
    }
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }

  memo[key] = false;
  return false;
}

function isStandardWin(counts, openMeldCount) {
  const meldsNeeded = 4 - openMeldCount;
  if (meldsNeeded < 0 || sum(counts) !== meldsNeeded * 3 + 2) return false;
  for (let pair = 0; pair < 34; pair += 1) {
    if (counts[pair] < 2) continue;
    const remainder = counts.slice();
    remainder[pair] -= 2;
    if (canFormMelds(remainder, meldsNeeded, {})) return true;
  }
  return false;
}

function isSevenPairs(counts, openMeldCount) {
  return openMeldCount === 0 && sum(counts) === 14
    && counts.every((count) => count % 2 === 0)
    && counts.reduce((pairs, count) => pairs + Math.floor(count / 2), 0) === 7;
}

function isThirteenOrphans(counts, openMeldCount) {
  if (openMeldCount !== 0 || sum(counts) !== 14) return false;
  const orphanSet = new Set(ORPHAN_KINDS);
  let pairFound = false;
  for (let kind = 0; kind < 34; kind += 1) {
    const count = counts[kind];
    if (!orphanSet.has(kind) && count !== 0) return false;
    if (orphanSet.has(kind)) {
      if (count === 0 || count > 2) return false;
      if (count === 2) pairFound = true;
    }
  }
  return pairFound;
}

function fullCounts(concealedCounts, melds) {
  const result = concealedCounts.slice();
  melds.forEach((meld) => meld.tiles.forEach((tile) => { result[tile.kind] += 1; }));
  return result;
}

function presentKinds(counts) {
  const result = [];
  counts.forEach((count, kind) => { if (count > 0) result.push(kind); });
  return result;
}

function isAllPungs(counts, melds) {
  if (melds.some((meld) => meld.type === "CHI")) return false;
  for (let pair = 0; pair < 34; pair += 1) {
    if (counts[pair] < 2) continue;
    const remainder = counts.slice();
    remainder[pair] -= 2;
    if (remainder.every((count) => count % 3 === 0)) return true;
  }
  return false;
}

function evaluateWin(hand, melds) {
  const counts = countsFromTiles(hand);
  const standard = isStandardWin(counts, melds.length);
  const sevenPairs = isSevenPairs(counts, melds.length);
  const thirteenOrphans = isThirteenOrphans(counts, melds.length);
  if (!standard && !sevenPairs && !thirteenOrphans) return { eligible: false, patterns: [] };

  const merged = fullCounts(counts, melds);
  const kinds = presentKinds(merged);
  const patterns = [];
  if (sevenPairs) patterns.push("SEVEN_PAIRS");
  if (thirteenOrphans) patterns.push("THIRTEEN_ORPHANS");
  if (kinds.every((kind) => kind < 27 && kind % 9 >= 1 && kind % 9 <= 7)) patterns.push("ALL_SIMPLES");
  if (standard && isAllPungs(counts, melds)) patterns.push("ALL_PUNGS");
  if ([0, 9, 18].some((offset) => Array.from({ length: 9 }, (_, rank) => merged[offset + rank] > 0).every(Boolean))) patterns.push("ONE_DRAGON");
  const suits = new Set(kinds.map((kind) => kind < 27 ? Math.floor(kind / 9) : 3));
  if (suits.size === 1 && !suits.has(3)) patterns.push("PURE_ONE_SUIT");
  if (suits.size === 2 && suits.has(3)) patterns.push("MIXED_ONE_SUIT");
  if (kinds.every((kind) => kind >= 27)) patterns.push("ALL_HONORS");
  const greenKinds = new Set([19, 20, 21, 23, 25, 32]);
  if (kinds.every((kind) => greenKinds.has(kind))) patterns.push("GREEN_HAND");
  return { eligible: patterns.length > 0, patterns };
}

function findChiChoices(hand, tile) {
  if (tile.kind >= 27) return [];
  const rankIndex = tile.kind % 9;
  const starts = [rankIndex - 2, rankIndex - 1, rankIndex];
  const choices = [];
  starts.forEach((start) => {
    if (start < 0 || start > 6) return;
    const offset = tile.kind - rankIndex;
    const sequence = [offset + start, offset + start + 1, offset + start + 2];
    const neededKinds = sequence.filter((kind) => kind !== tile.kind);
    if (neededKinds.every((kind) => countTiles(hand, kind) >= 1)) {
      choices.push({ neededKinds, sequence });
    }
  });
  return choices;
}

function removeKinds(hand, kinds) {
  const removed = [];
  kinds.forEach((kind) => {
    const index = hand.findIndex((tile) => tile.kind === kind);
    if (index < 0) throw new Error("Missing tile for meld");
    removed.push(hand.splice(index, 1)[0]);
  });
  return removed;
}

function resolveClaims(discarderSeat, claims) {
  if (!claims.length) return null;
  return claims.slice().sort((left, right) => {
    const priority = PRIORITY[right.action] - PRIORITY[left.action];
    if (priority !== 0) return priority;
    const leftDistance = (left.seat - discarderSeat + 4) % 4;
    const rightDistance = (right.seat - discarderSeat + 4) % 4;
    return leftDistance - rightDistance;
  })[0];
}

class LocalMahjongGame {
  constructor() {
    this.round = 1;
    this.dealerSeat = 0;
    this.start();
  }

  start() {
    const source = shuffle(createWall());
    this.hands = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.history = [];
    this.pendingDiscard = null;
    this.reactionOptions = [[], [], [], []];
    this.winnerSeat = null;
    this.winType = null;
    this.winPatterns = [];
    let drawIndex = 0;

    for (let dealRound = 0; dealRound < 3; dealRound += 1) {
      for (let seat = 0; seat < 4; seat += 1) {
        this.hands[seat].push(...source.slice(drawIndex, drawIndex + 4));
        drawIndex += 4;
      }
    }
    for (let seat = 0; seat < 4; seat += 1) {
      this.hands[seat].push(source[drawIndex]);
      drawIndex += 1;
    }
    this.hands[this.dealerSeat].push(source[drawIndex]);
    drawIndex += 1;

    this.wall = source.slice(drawIndex);
    this.hands.forEach(sortHand);
    this.turn = this.dealerSeat;
    this.phase = "DISCARD";
    this.canSelfAction = true;
    this.finished = false;
    this.message = "庄家先出牌";
  }

  discard(seat, tileId) {
    if (this.finished || this.phase !== "DISCARD" || seat !== this.turn) return false;
    const hand = this.hands[seat];
    const tileIndex = hand.findIndex((tile) => tile.id === tileId);
    if (tileIndex < 0 || hand.length % 3 !== 2) return false;

    const discarded = hand.splice(tileIndex, 1)[0];
    this.discards[seat].push(discarded);
    this.history.push({ seat, tile: discarded });
    this.pendingDiscard = { seat, tile: discarded };
    this.canSelfAction = false;
    this.phase = "REACTION";
    this.reactionOptions = this.collectReactions(seat, discarded);
    this.message = SEAT_NAMES[seat] + "打出" + discarded.symbol + discarded.unit;
    return true;
  }

  collectReactions(discarderSeat, tile) {
    return this.hands.map((hand, seat) => {
      if (seat === discarderSeat) return [];
      const options = [];
      const win = evaluateWin(hand.concat(tile), this.melds[seat]);
      if (win.eligible) options.push({ action: "HU", patterns: win.patterns });
      if (countTiles(hand, tile.kind) >= 3) options.push({ action: "GANG" });
      if (countTiles(hand, tile.kind) >= 2) options.push({ action: "PENG" });
      if (seat === (discarderSeat + 1) % 4) {
        findChiChoices(hand, tile).forEach((choice, choiceIndex) => {
          options.push({ action: "CHI", choiceIndex, neededKinds: choice.neededKinds, sequence: choice.sequence });
        });
      }
      return options;
    });
  }

  hasHumanReaction() {
    return this.phase === "REACTION" && this.reactionOptions[0].length > 0;
  }

  humanActions() {
    if (this.finished) return [];
    if (this.hasHumanReaction()) {
      return this.reactionOptions[0].map((option) => this.actionView(option, "REACTION"));
    }
    if (this.phase === "DISCARD" && this.turn === 0 && this.canSelfAction) {
      const actions = [];
      const win = evaluateWin(this.hands[0], this.melds[0]);
      if (win.eligible) actions.push({ action: "HU", patterns: win.patterns });
      this.concealedKongKinds(0).forEach((kind) => actions.push({ action: "GANG", kind, kongType: "CONCEALED" }));
      return actions.map((option) => this.actionView(option, "SELF"));
    }
    return [];
  }

  actionView(option, source) {
    let detail = "";
    if (option.action === "CHI") {
      detail = option.sequence.map((kind) => createTile(kind, 0).symbol).join("") + createTile(option.sequence[0], 0).unit;
    } else if (option.action === "HU" && option.patterns && option.patterns.length) {
      detail = option.patterns.map((pattern) => PATTERN_LABELS[pattern]).join("·");
    } else if (option.action === "GANG" && option.kind !== undefined) {
      const tile = createTile(option.kind, 0);
      detail = tile.symbol + tile.unit;
    }
    return {
      action: option.action,
      key: source + ":" + option.action + ":" + (option.choiceIndex === undefined ? -1 : option.choiceIndex) + ":" + (option.kind === undefined ? -1 : option.kind),
      choiceIndex: option.choiceIndex === undefined ? -1 : option.choiceIndex,
      kind: option.kind === undefined ? -1 : option.kind,
      source,
      label: ACTION_LABELS[option.action],
      actionClass: option.action.toLowerCase(),
      detail
    };
  }

  respondHuman(action, choiceIndex) {
    if (!this.hasHumanReaction()) return false;
    const options = this.reactionOptions[0];
    const chosen = action === "PASS" ? null : options.find((option) => option.action === action && (action !== "CHI" || option.choiceIndex === choiceIndex));
    if (action !== "PASS" && !chosen) return false;
    return this.resolveReactions(chosen ? { seat: 0, ...chosen } : null);
  }

  resolveReactions(humanClaim) {
    if (this.phase !== "REACTION" || !this.pendingDiscard) return false;
    const claims = [];
    if (humanClaim) claims.push(humanClaim);
    for (let seat = 1; seat < 4; seat += 1) {
      const options = this.reactionOptions[seat];
      if (options.length) claims.push({ seat, ...options[0] });
    }
    const winner = resolveClaims(this.pendingDiscard.seat, claims);
    if (!winner) {
      const nextSeat = (this.pendingDiscard.seat + 1) % 4;
      this.pendingDiscard = null;
      this.reactionOptions = [[], [], [], []];
      this.drawFor(nextSeat);
      return true;
    }
    this.applyClaim(winner);
    return true;
  }

  applyClaim(claim) {
    const pending = this.pendingDiscard;
    const tile = pending.tile;
    if (claim.action === "HU") {
      this.finishWin(claim.seat, "点炮胡", claim.patterns || evaluateWin(this.hands[claim.seat].concat(tile), this.melds[claim.seat]).patterns);
      return;
    }

    const discardPile = this.discards[pending.seat];
    if (!discardPile.length || discardPile[discardPile.length - 1].id !== tile.id) throw new Error("Claimed discard is missing");
    discardPile.pop();
    let ownTiles;
    if (claim.action === "CHI") ownTiles = removeKinds(this.hands[claim.seat], claim.neededKinds);
    if (claim.action === "PENG") ownTiles = removeKinds(this.hands[claim.seat], [tile.kind, tile.kind]);
    if (claim.action === "GANG") ownTiles = removeKinds(this.hands[claim.seat], [tile.kind, tile.kind, tile.kind]);
    const meldTiles = ownTiles.concat(tile).sort((left, right) => left.kind - right.kind);
    this.melds[claim.seat].push({ type: claim.action, tiles: meldTiles, fromSeat: pending.seat });
    this.turn = claim.seat;
    this.pendingDiscard = null;
    this.reactionOptions = [[], [], [], []];
    this.phase = "DISCARD";
    this.canSelfAction = false;
    this.message = SEAT_NAMES[claim.seat] + ACTION_LABELS[claim.action];
    if (claim.action === "GANG") this.drawReplacement(claim.seat);
    sortHand(this.hands[claim.seat]);
  }

  concealedKongKinds(seat) {
    const counts = countsFromTiles(this.hands[seat]);
    return counts.map((count, kind) => count === 4 ? kind : -1).filter((kind) => kind >= 0);
  }

  declareHumanAction(action, kind) {
    if (this.finished || this.phase !== "DISCARD" || this.turn !== 0 || !this.canSelfAction) return false;
    if (action === "HU") {
      const win = evaluateWin(this.hands[0], this.melds[0]);
      if (!win.eligible) return false;
      this.finishWin(0, "自摸", win.patterns);
      return true;
    }
    if (action === "GANG" && this.concealedKongKinds(0).includes(kind)) {
      this.applyConcealedKong(0, kind);
      return true;
    }
    return false;
  }

  applyConcealedKong(seat, kind) {
    const tiles = removeKinds(this.hands[seat], [kind, kind, kind, kind]);
    this.melds[seat].push({ type: "AN_GANG", tiles, fromSeat: seat });
    this.message = SEAT_NAMES[seat] + "暗杠";
    this.drawReplacement(seat);
    sortHand(this.hands[seat]);
  }

  drawReplacement(seat) {
    if (!this.wall.length) {
      this.finishDraw();
      return;
    }
    this.hands[seat].push(this.wall.pop());
    this.turn = seat;
    this.phase = "DISCARD";
    this.canSelfAction = true;
  }

  drawFor(seat) {
    if (!this.wall.length) {
      this.finishDraw();
      return;
    }
    this.turn = seat;
    this.hands[seat].push(this.wall.shift());
    sortHand(this.hands[seat]);
    this.phase = "DISCARD";
    this.canSelfAction = true;
    this.message = seat === 0 ? "轮到你出牌" : SEAT_NAMES[seat] + "正在思考";
  }

  playBotTurn() {
    if (this.finished || this.phase !== "DISCARD" || this.turn === 0) return false;
    if (this.canSelfAction) {
      const win = evaluateWin(this.hands[this.turn], this.melds[this.turn]);
      if (win.eligible) {
        this.finishWin(this.turn, "自摸", win.patterns);
        return true;
      }
      const kongKind = this.concealedKongKinds(this.turn)[0];
      if (kongKind !== undefined) {
        this.applyConcealedKong(this.turn, kongKind);
        return true;
      }
    }
    const hand = this.hands[this.turn];
    const chosen = hand[Math.floor(Math.random() * hand.length)];
    return this.discard(this.turn, chosen.id);
  }

  finishWin(seat, winType, patterns) {
    this.finished = true;
    this.phase = "FINISHED";
    this.winnerSeat = seat;
    this.winType = winType;
    this.winPatterns = patterns || [];
    this.message = SEAT_NAMES[seat] + winType + " · " + this.winPatterns.map((pattern) => PATTERN_LABELS[pattern]).join(" · ");
  }

  finishDraw() {
    this.finished = true;
    this.phase = "FINISHED";
    this.message = "牌墙已摸完，本局流局";
  }

  snapshot(selectedId) {
    const meldView = (meld) => ({
      type: meld.type,
      label: meld.type === "CHI" ? "吃" : meld.type === "PENG" ? "碰" : meld.type === "AN_GANG" ? "暗杠" : "杠",
      tiles: meld.tiles.map((tile) => ({ ...tile }))
    });
    return {
      round: this.round,
      currentSeat: this.turn,
      currentName: SEAT_NAMES[this.turn],
      phase: this.phase,
      wallCount: this.wall.length,
      finished: this.finished,
      message: this.message,
      winnerName: this.winnerSeat === null ? "" : SEAT_NAMES[this.winnerSeat],
      resultTitle: this.winnerSeat === null ? "本局结束" : SEAT_NAMES[this.winnerSeat] + (this.winType || "胡牌"),
      winType: this.winType || "",
      winPatternText: this.winPatterns.map((pattern) => PATTERN_LABELS[pattern]).join(" · "),
      hand: this.hands[0].map((tile) => ({ ...tile, selected: tile.id === selectedId })),
      playerMelds: this.melds[0].map(meldView),
      availableActions: this.humanActions(),
      awaitingReaction: this.hasHumanReaction(),
      opponents: [
        { seat: 2, name: "对家", initial: "对", position: "top", count: this.hands[2].length, meldCount: this.melds[2].length, active: this.turn === 2 },
        { seat: 3, name: "上家", initial: "上", position: "left", count: this.hands[3].length, meldCount: this.melds[3].length, active: this.turn === 3 },
        { seat: 1, name: "下家", initial: "下", position: "right", count: this.hands[1].length, meldCount: this.melds[1].length, active: this.turn === 1 }
      ],
      discards: this.discards.map((tiles) => tiles.map((tile) => ({ ...tile })))
    };
  }
}

function createLocalGame() {
  return new LocalMahjongGame();
}

module.exports = {
  createLocalGame,
  __test: { createTile, evaluateWin, findChiChoices, resolveClaims }
};
