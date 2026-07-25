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

const DEMO_SCORING = {
  name: "四局演示计分",
  roundLimit: 4,
  basePoints: 1,
  maxFan: 4,
  maxPoints: 16,
  patternFans: {
    ALL_SIMPLES: 1, ALL_PUNGS: 2, ONE_DRAGON: 2, SEVEN_PAIRS: 2,
    PURE_ONE_SUIT: 3, MIXED_ONE_SUIT: 2, ALL_HONORS: 4,
    THIRTEEN_ORPHANS: 4, GREEN_HAND: 4,
    KONG_BLOOM: 1, LAST_TILE_DRAW: 1, LAST_TILE_DISCARD: 1, ROB_KONG: 1
  },
  selfDrawBonusFan: 1,
  discarderMultiplier: 3,
  dealerMultiplier: 2,
  kongPoints: { CONCEALED: 2, EXPOSED: 3, ADDED: 1 }
};
const CONTEXT_LABELS = {
  KONG_BLOOM: "杠上开花", LAST_TILE_DRAW: "海底捞月",
  LAST_TILE_DISCARD: "河底捞鱼", ROB_KONG: "抢杠胡"
};

function addDelta(deltas, fromSeat, toSeat, points) {
  deltas[fromSeat] -= points;
  deltas[toSeat] += points;
}

function cloneDeltas(source) {
  return [source[0], source[1], source[2], source[3]];
}

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
    this.roundLimit = DEMO_SCORING.roundLimit;
    this.completedRounds = 0;
    this.scores = [0, 0, 0, 0];
    this.dealerSeat = 0;
    this.matchHistory = [];
    this.matchFinished = false;
    this.startRound();
  }

  startRound() {
    if (this.matchFinished) return false;
    this.round = this.completedRounds + 1;
    const source = shuffle(createWall());
    this.hands = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.history = [];
    this.pendingDiscard = null;
    this.pendingAddedKong = null;
    this.reactionOptions = [[], [], [], []];
    this.passedHu = [false, false, false, false];
    this.roundKongDeltas = [0, 0, 0, 0];
    this.kongRecords = [];
    this.roundSettlement = null;
    this.winnerSeats = [];
    this.winType = null;
    this.winPatterns = [];
    this.lastDrawSource = "INITIAL";
    this.lastDrawWasLastTile = false;
    let drawIndex = 0;

    for (let dealRound = 0; dealRound < 3; dealRound += 1) {
      for (let offset = 0; offset < 4; offset += 1) {
        const seat = (this.dealerSeat + offset) % 4;
        this.hands[seat].push(...source.slice(drawIndex, drawIndex + 4));
        drawIndex += 4;
      }
    }
    for (let offset = 0; offset < 4; offset += 1) {
      const seat = (this.dealerSeat + offset) % 4;
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
    this.message = "第" + this.round + "局，" + SEAT_NAMES[this.dealerSeat] + "坐庄";
    return true;
  }

  startNextRound() {
    if (!this.finished || this.matchFinished) return false;
    return this.startRound();
  }

  discard(seat, tileId) {
    if (this.finished || this.phase !== "DISCARD" || seat !== this.turn) return false;
    const hand = this.hands[seat];
    const tileIndex = hand.findIndex((tile) => tile.id === tileId);
    if (tileIndex < 0 || hand.length % 3 !== 2) return false;
    const discarded = hand.splice(tileIndex, 1)[0];
    this.discards[seat].push(discarded);
    this.history.push({ seat, tile: discarded });
    this.pendingDiscard = { seat, tile: discarded, lastTile: this.lastDrawWasLastTile };
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
      if (win.eligible && !this.passedHu[seat]) options.push({ action: "HU", patterns: win.patterns });
      if (countTiles(hand, tile.kind) >= 3) options.push({ action: "GANG" });
      if (countTiles(hand, tile.kind) >= 2) options.push({ action: "PENG" });
      if (seat === (discarderSeat + 1) % 4) {
        findChiChoices(hand, tile).forEach((choice, choiceIndex) => options.push({ action: "CHI", choiceIndex, ...choice }));
      }
      return options;
    });
  }

  collectRobKongReactions(declarerSeat, tile) {
    return this.hands.map((hand, seat) => {
      if (seat === declarerSeat || this.passedHu[seat]) return [];
      const win = evaluateWin(hand.concat(tile), this.melds[seat]);
      return win.eligible ? [{ action: "HU", patterns: win.patterns }] : [];
    });
  }

  hasHumanReaction() {
    return (this.phase === "REACTION" || this.phase === "ROB_KONG") && this.reactionOptions[0].length > 0;
  }

  kongOptions(seat) {
    const options = [];
    const counts = countsFromTiles(this.hands[seat]);
    counts.forEach((count, kind) => {
      if (count === 4) options.push({ action: "GANG", kind, kongType: "CONCEALED" });
    });
    this.melds[seat].forEach((meld) => {
      if (meld.type === "PENG" && countTiles(this.hands[seat], meld.tiles[0].kind) > 0) {
        options.push({ action: "GANG", kind: meld.tiles[0].kind, kongType: "ADDED" });
      }
    });
    return options;
  }

  humanActions() {
    if (this.finished) return [];
    if (this.hasHumanReaction()) return this.reactionOptions[0].map((option) => this.actionView(option, "REACTION"));
    if (this.phase === "DISCARD" && this.turn === 0 && this.canSelfAction) {
      const actions = [];
      const win = evaluateWin(this.hands[0], this.melds[0]);
      if (win.eligible) actions.push({ action: "HU", patterns: win.patterns });
      actions.push(...this.kongOptions(0));
      return actions.map((option) => this.actionView(option, "SELF"));
    }
    return [];
  }

  actionView(option, source) {
    let detail = "";
    if (option.action === "CHI") {
      detail = option.sequence.map((kind) => createTile(kind, 0).symbol).join("") + createTile(option.sequence[0], 0).unit;
    } else if (option.action === "HU" && option.patterns) {
      detail = option.patterns.map((pattern) => PATTERN_LABELS[pattern]).join("·");
    } else if (option.action === "GANG" && option.kind !== undefined) {
      const tile = createTile(option.kind, 0);
      detail = (option.kongType === "ADDED" ? "补" : "") + tile.symbol + tile.unit;
    }
    return {
      action: option.action,
      key: source + ":" + option.action + ":" + (option.choiceIndex === undefined ? -1 : option.choiceIndex) + ":" + (option.kind === undefined ? -1 : option.kind) + ":" + (option.kongType || ""),
      choiceIndex: option.choiceIndex === undefined ? -1 : option.choiceIndex,
      kind: option.kind === undefined ? -1 : option.kind,
      kongType: option.kongType || "",
      source,
      label: ACTION_LABELS[option.action],
      actionClass: option.action.toLowerCase(),
      detail
    };
  }

  respondHuman(action, choiceIndex) {
    if (!this.hasHumanReaction()) return false;
    const options = this.reactionOptions[0];
    const hadHu = options.some((option) => option.action === "HU");
    const chosen = action === "PASS" ? null : options.find((option) => option.action === action && (action !== "CHI" || option.choiceIndex === choiceIndex));
    if (action !== "PASS" && !chosen) return false;
    if (hadHu && action !== "HU") this.passedHu[0] = true;
    const claim = chosen ? { seat: 0, ...chosen } : null;
    return this.phase === "ROB_KONG" ? this.resolveRobKongReactions(claim) : this.resolveReactions(claim);
  }

  collectClaims(humanClaim) {
    const claims = humanClaim ? [humanClaim] : [];
    for (let seat = 1; seat < 4; seat += 1) {
      if (this.reactionOptions[seat].length) claims.push({ seat, ...this.reactionOptions[seat][0] });
    }
    return claims;
  }

  resolveReactions(humanClaim) {
    if (this.phase !== "REACTION" || !this.pendingDiscard) return false;
    const claims = this.collectClaims(humanClaim);
    const huClaims = claims.filter((claim) => claim.action === "HU");
    if (huClaims.length) {
      const pending = this.pendingDiscard;
      const contexts = pending.lastTile ? ["LAST_TILE_DISCARD"] : [];
      this.finishWins(huClaims, "DISCARD_WIN", pending.seat, contexts);
      return true;
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
    const discardPile = this.discards[pending.seat];
    discardPile.pop();
    let ownTiles = [];
    if (claim.action === "CHI") ownTiles = removeKinds(this.hands[claim.seat], claim.neededKinds);
    if (claim.action === "PENG") ownTiles = removeKinds(this.hands[claim.seat], [tile.kind, tile.kind]);
    if (claim.action === "GANG") ownTiles = removeKinds(this.hands[claim.seat], [tile.kind, tile.kind, tile.kind]);
    const meldTiles = ownTiles.concat(tile).sort((left, right) => left.kind - right.kind);
    this.melds[claim.seat].push({ type: claim.action, kongType: claim.action === "GANG" ? "EXPOSED" : null, tiles: meldTiles, fromSeat: pending.seat });
    this.turn = claim.seat;
    this.pendingDiscard = null;
    this.reactionOptions = [[], [], [], []];
    this.phase = "DISCARD";
    this.canSelfAction = false;
    this.lastDrawWasLastTile = false;
    this.message = SEAT_NAMES[claim.seat] + ACTION_LABELS[claim.action];
    if (claim.action === "GANG") {
      this.scoreKong("EXPOSED", claim.seat, pending.seat);
      this.drawReplacement(claim.seat);
    }
    sortHand(this.hands[claim.seat]);
  }

  declareHumanAction(action, kind) {
    if (this.finished || this.phase !== "DISCARD" || this.turn !== 0 || !this.canSelfAction) return false;
    if (action === "HU") {
      const win = evaluateWin(this.hands[0], this.melds[0]);
      if (!win.eligible) return false;
      this.finishSelfWin(0, win.patterns);
      return true;
    }
    if (action === "GANG") {
      const option = this.kongOptions(0).find((item) => item.kind === kind);
      if (!option) return false;
      if (option.kongType === "ADDED") this.proposeAddedKong(0, kind);
      else this.applyConcealedKong(0, kind);
      return true;
    }
    return false;
  }

  applyConcealedKong(seat, kind) {
    const tiles = removeKinds(this.hands[seat], [kind, kind, kind, kind]);
    this.melds[seat].push({ type: "GANG", kongType: "CONCEALED", tiles, fromSeat: seat });
    this.scoreKong("CONCEALED", seat, seat);
    this.message = SEAT_NAMES[seat] + "暗杠";
    this.drawReplacement(seat);
  }

  proposeAddedKong(seat, kind) {
    const meldIndex = this.melds[seat].findIndex((meld) => meld.type === "PENG" && meld.tiles[0].kind === kind);
    const tile = this.hands[seat].find((candidate) => candidate.kind === kind);
    if (meldIndex < 0 || !tile) return false;
    this.pendingAddedKong = { seat, kind, tileId: tile.id, meldIndex };
    this.phase = "ROB_KONG";
    this.reactionOptions = this.collectRobKongReactions(seat, tile);
    this.message = SEAT_NAMES[seat] + "声明补杠，等待抢杠";
    return true;
  }

  resolveRobKongReactions(humanClaim) {
    if (this.phase !== "ROB_KONG" || !this.pendingAddedKong) return false;
    const claims = this.collectClaims(humanClaim).filter((claim) => claim.action === "HU");
    if (claims.length) {
      const declarer = this.pendingAddedKong.seat;
      this.finishWins(claims, "ROB_KONG_WIN", declarer, ["ROB_KONG"]);
      return true;
    }
    const pending = this.pendingAddedKong;
    const hand = this.hands[pending.seat];
    const tileIndex = hand.findIndex((tile) => tile.id === pending.tileId);
    const tile = hand.splice(tileIndex, 1)[0];
    const meld = this.melds[pending.seat][pending.meldIndex];
    meld.type = "GANG";
    meld.kongType = "ADDED";
    meld.tiles.push(tile);
    this.scoreKong("ADDED", pending.seat, pending.seat);
    this.pendingAddedKong = null;
    this.reactionOptions = [[], [], [], []];
    this.message = SEAT_NAMES[pending.seat] + "补杠成功";
    this.drawReplacement(pending.seat);
    return true;
  }

  scoreKong(kongType, winnerSeat, fromSeat) {
    const deltas = [0, 0, 0, 0];
    const unit = DEMO_SCORING.kongPoints[kongType];
    if (kongType === "EXPOSED") {
      addDelta(deltas, fromSeat, winnerSeat, unit);
    } else {
      for (let seat = 0; seat < 4; seat += 1) {
        if (seat !== winnerSeat) addDelta(deltas, seat, winnerSeat, unit);
      }
    }
    for (let seat = 0; seat < 4; seat += 1) this.roundKongDeltas[seat] += deltas[seat];
    this.kongRecords.push({ kongType, winnerSeat, fromSeat, deltas });
  }

  drawReplacement(seat) {
    if (!this.wall.length) return this.finishDraw();
    this.hands[seat].push(this.wall.pop());
    sortHand(this.hands[seat]);
    this.turn = seat;
    this.phase = "DISCARD";
    this.canSelfAction = true;
    this.lastDrawSource = "KONG_REPLACEMENT";
    this.lastDrawWasLastTile = this.wall.length === 0;
    this.passedHu[seat] = false;
  }

  drawFor(seat) {
    if (!this.wall.length) return this.finishDraw();
    this.turn = seat;
    this.hands[seat].push(this.wall.shift());
    sortHand(this.hands[seat]);
    this.phase = "DISCARD";
    this.canSelfAction = true;
    this.lastDrawSource = "NORMAL";
    this.lastDrawWasLastTile = this.wall.length === 0;
    this.passedHu[seat] = false;
    this.message = seat === 0 ? "轮到你出牌" : SEAT_NAMES[seat] + "正在思考";
  }

  playBotTurn() {
    if (this.finished || this.phase !== "DISCARD" || this.turn === 0) return false;
    if (this.canSelfAction) {
      const win = evaluateWin(this.hands[this.turn], this.melds[this.turn]);
      if (win.eligible) return this.finishSelfWin(this.turn, win.patterns);
      const kong = this.kongOptions(this.turn)[0];
      if (kong) {
        if (kong.kongType === "ADDED") this.proposeAddedKong(this.turn, kong.kind);
        else this.applyConcealedKong(this.turn, kong.kind);
        return true;
      }
    }
    const hand = this.hands[this.turn];
    return this.discard(this.turn, hand[Math.floor(Math.random() * hand.length)].id);
  }

  finishSelfWin(seat, patterns) {
    const contexts = [];
    if (this.lastDrawSource === "KONG_REPLACEMENT") contexts.push("KONG_BLOOM");
    if (this.lastDrawWasLastTile) contexts.push("LAST_TILE_DRAW");
    this.finishWins([{ seat, action: "HU", patterns }], "SELF_DRAW", null, contexts);
    return true;
  }

  finishWins(claims, reason, loserSeat, contexts) {
    const winners = claims.map((claim) => ({ seat: claim.seat, patterns: claim.patterns || [] }));
    this.winnerSeats = winners.map((winner) => winner.seat);
    this.winType = reason === "SELF_DRAW" ? "自摸" : reason === "ROB_KONG_WIN" ? "抢杠胡" : winners.length > 1 ? "一炮多响" : "点炮胡";
    this.winPatterns = winners.length ? winners[0].patterns : [];
    this.settleRound({ reason, winners, loserSeat, contexts });
  }

  finishDraw() {
    this.settleRound({ reason: "WALL_EXHAUSTED", winners: [], loserSeat: null, contexts: [] });
    return true;
  }

  calculateWinDeltas(outcome) {
    const deltas = [0, 0, 0, 0];
    const details = [];
    outcome.winners.forEach((winner) => {
      const items = winner.patterns.map((pattern) => ({ code: pattern, label: PATTERN_LABELS[pattern], fan: DEMO_SCORING.patternFans[pattern] || 0 }));
      outcome.contexts.forEach((context) => items.push({ code: context, label: CONTEXT_LABELS[context], fan: DEMO_SCORING.patternFans[context] || 0 }));
      if (outcome.reason === "SELF_DRAW") items.push({ code: "SELF_DRAW", label: "自摸", fan: DEMO_SCORING.selfDrawBonusFan });
      const rawFan = items.reduce((total, item) => total + item.fan, 0);
      const totalFan = Math.min(rawFan, DEMO_SCORING.maxFan);
      const points = Math.min(DEMO_SCORING.basePoints * 2 ** totalFan, DEMO_SCORING.maxPoints);
      if (outcome.reason === "SELF_DRAW") {
        for (let payer = 0; payer < 4; payer += 1) {
          if (payer === winner.seat) continue;
          const factor = payer === this.dealerSeat || winner.seat === this.dealerSeat ? DEMO_SCORING.dealerMultiplier : 1;
          addDelta(deltas, payer, winner.seat, points * factor);
        }
      } else {
        const factor = outcome.loserSeat === this.dealerSeat || winner.seat === this.dealerSeat ? DEMO_SCORING.dealerMultiplier : 1;
        addDelta(deltas, outcome.loserSeat, winner.seat, points * DEMO_SCORING.discarderMultiplier * factor);
      }
      details.push({ seat: winner.seat, items, totalFan, points });
    });
    return { deltas, details };
  }

  settleRound(outcome) {
    const winScore = this.calculateWinDeltas(outcome);
    const deltas = winScore.deltas.map((value, seat) => value + this.roundKongDeltas[seat]);
    for (let seat = 0; seat < 4; seat += 1) this.scores[seat] += deltas[seat];
    const dealerBefore = this.dealerSeat;
    const dealerContinues = outcome.reason === "WALL_EXHAUSTED" || outcome.winners.some((winner) => winner.seat === dealerBefore);
    if (!dealerContinues) this.dealerSeat = (this.dealerSeat + 1) % 4;
    this.completedRounds += 1;
    this.matchFinished = this.completedRounds >= this.roundLimit;
    this.finished = true;
    this.phase = "ROUND_SETTLEMENT";
    const reasonLabel = outcome.reason === "WALL_EXHAUSTED" ? "流局" : this.winType;
    this.message = outcome.reason === "WALL_EXHAUSTED" ? "牌墙已摸完，本局流局" : this.winnerSeats.map((seat) => SEAT_NAMES[seat]).join("、") + reasonLabel;
    this.roundSettlement = {
      round: this.round,
      reason: outcome.reason,
      reasonLabel,
      winnerSeats: this.winnerSeats.slice(),
      winnerNames: this.winnerSeats.map((seat) => SEAT_NAMES[seat]).join("、"),
      loserSeat: outcome.loserSeat,
      contextLabels: outcome.contexts.map((context) => CONTEXT_LABELS[context]),
      winDetails: winScore.details,
      kongDeltas: cloneDeltas(this.roundKongDeltas),
      deltas: cloneDeltas(deltas),
      totals: cloneDeltas(this.scores),
      dealerBefore,
      nextDealerSeat: this.dealerSeat,
      dealerContinues
    };
    this.matchHistory.push(this.roundSettlement);
  }

  snapshot(selectedId) {
    const meldView = (meld) => ({
      type: meld.type,
      label: meld.type === "CHI" ? "吃" : meld.type === "PENG" ? "碰" : meld.kongType === "CONCEALED" ? "暗杠" : meld.kongType === "ADDED" ? "补杠" : "明杠",
      tiles: meld.tiles.map((tile) => ({ ...tile }))
    });
    const scoreRows = this.scores.map((score, seat) => ({ seat, name: SEAT_NAMES[seat], score, dealer: seat === this.dealerSeat }));
    const settlementRows = this.roundSettlement ? this.roundSettlement.deltas.map((delta, seat) => ({ seat, name: SEAT_NAMES[seat], delta, deltaText: delta > 0 ? "+" + delta : String(delta), total: this.scores[seat] })) : [];
    const rankings = scoreRows.slice().sort((left, right) => right.score - left.score).map((item, index) => ({ ...item, rank: index + 1 }));
    const resultLabels = [];
    if (this.roundSettlement) {
      this.roundSettlement.winDetails.forEach((detail) => {
        detail.items.forEach((item) => {
          if (!resultLabels.includes(item.label)) resultLabels.push(item.label);
        });
      });
    }
    return {
      round: this.round,
      roundLimit: this.roundLimit,
      completedRounds: this.completedRounds,
      currentSeat: this.turn,
      currentName: SEAT_NAMES[this.turn],
      phase: this.phase,
      wallCount: this.wall.length,
      finished: this.finished,
      matchFinished: this.matchFinished,
      scoringName: DEMO_SCORING.name,
      message: this.message,
      resultTitle: this.matchFinished ? "比赛结束" : "第" + this.round + "局结束",
      winType: this.winType || "",
      winPatternText: resultLabels.join(" · "),
      hand: this.hands[0].map((tile) => ({ ...tile, selected: tile.id === selectedId })),
      playerMelds: this.melds[0].map(meldView),
      availableActions: this.humanActions(),
      awaitingReaction: this.hasHumanReaction(),
      scores: scoreRows,
      settlementRows,
      roundSettlement: this.roundSettlement,
      rankings,
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
