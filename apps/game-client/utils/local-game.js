const HONOR_SYMBOLS = ["东", "南", "西", "北", "中", "发", "白"];
const SUIT_UNITS = ["万", "筒", "条"];
const SEAT_NAMES = ["我", "下家", "对家", "上家"];

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
    for (let copy = 0; copy < 4; copy += 1) {
      wall.push(createTile(kind, copy));
    }
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
    this.history = [];
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
    this.finished = false;
    this.message = "庄家先出牌";
  }

  discard(seat, tileId) {
    if (this.finished || seat !== this.turn) return false;
    const hand = this.hands[seat];
    const tileIndex = hand.findIndex((tile) => tile.id === tileId);
    if (tileIndex < 0 || hand.length % 3 !== 2) return false;

    const discarded = hand.splice(tileIndex, 1)[0];
    this.discards[seat].push(discarded);
    this.history.push({ seat, tile: discarded });
    this.message = SEAT_NAMES[seat] + "打出" + discarded.symbol + discarded.unit;
    this.advanceTurn();
    return true;
  }

  discardForBot() {
    if (this.turn === 0 || this.finished) return false;
    const hand = this.hands[this.turn];
    const recentTile = hand[hand.length - 1];
    const candidates = hand.filter((tile) => tile.id !== recentTile.id);
    const source = candidates.length ? candidates : hand;
    const chosen = source[Math.floor(Math.random() * source.length)];
    return this.discard(this.turn, chosen.id);
  }

  advanceTurn() {
    if (this.wall.length === 0) {
      this.finished = true;
      this.message = "牌墙已摸完，本局流局";
      return;
    }

    this.turn = (this.turn + 1) % 4;
    const drawn = this.wall.shift();
    this.hands[this.turn].push(drawn);
    sortHand(this.hands[this.turn]);
    this.message = this.turn === 0 ? "轮到你出牌" : SEAT_NAMES[this.turn] + "正在思考";
  }

  snapshot(selectedId) {
    return {
      round: this.round,
      dealerSeat: this.dealerSeat,
      currentSeat: this.turn,
      currentName: SEAT_NAMES[this.turn],
      wallCount: this.wall.length,
      finished: this.finished,
      message: this.message,
      hand: this.hands[0].map((tile) => ({
        ...tile,
        selected: tile.id === selectedId
      })),
      opponents: [
        { seat: 2, name: "对家", initial: "对", position: "top", count: this.hands[2].length, active: this.turn === 2 },
        { seat: 3, name: "上家", initial: "上", position: "left", count: this.hands[3].length, active: this.turn === 3 },
        { seat: 1, name: "下家", initial: "下", position: "right", count: this.hands[1].length, active: this.turn === 1 }
      ],
      discards: this.discards.map((tiles) => tiles.map((tile) => ({ ...tile }))),
      lastDiscard: this.history.length ? this.history[this.history.length - 1] : null
    };
  }
}

function createLocalGame() {
  return new LocalMahjongGame();
}

module.exports = {
  createLocalGame
};
