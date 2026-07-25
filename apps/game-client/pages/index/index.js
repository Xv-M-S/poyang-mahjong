const { createLocalGame } = require("../../utils/local-game");

Page({
  data: {
    screen: "lobby",
    selectedId: null,
    round: 1,
    currentSeat: 0,
    currentName: "我",
    wallCount: 83,
    finished: false,
    message: "",
    playerStatusText: "轮到你出牌",
    hand: [],
    opponents: [],
    discards: [[], [], [], []]
  },

  onUnload() {
    this.clearBotTimer();
  },

  startGame() {
    this.clearBotTimer();
    this.game = createLocalGame();
    this.setData({ screen: "table", selectedId: null });
    this.renderGame();
  },

  backToLobby() {
    this.clearBotTimer();
    this.game = null;
    this.setData({ screen: "lobby", selectedId: null });
  },

  selectTile(event) {
    if (!this.game || this.game.finished || this.game.turn !== 0) return;
    const tileId = Number(event.currentTarget.dataset.id);
    const selectedId = this.data.selectedId === tileId ? null : tileId;
    this.setData({ selectedId });
    this.renderGame();
  },

  discardSelected() {
    if (!this.game || this.game.finished) return;
    if (this.game.turn !== 0) {
      wx.showToast({ title: "还没轮到你", icon: "none" });
      return;
    }
    if (this.data.selectedId === null) {
      wx.showToast({ title: "请先选择一张牌", icon: "none" });
      return;
    }

    const discarded = this.game.discard(0, this.data.selectedId);
    if (!discarded) {
      wx.showToast({ title: "当前不能打出这张牌", icon: "none" });
      return;
    }
    this.setData({ selectedId: null });
    this.renderGame();
    this.scheduleBotTurn();
  },

  scheduleBotTurn() {
    this.clearBotTimer();
    if (!this.game || this.game.finished || this.game.turn === 0) return;
    this.botTimer = setTimeout(() => {
      if (!this.game) return;
      this.game.discardForBot();
      this.renderGame();
      this.scheduleBotTurn();
    }, 650);
  },

  clearBotTimer() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  },

  renderGame() {
    if (!this.game) return;
    const snapshot = this.game.snapshot(this.data.selectedId);
    snapshot.playerStatusText = snapshot.currentSeat === 0
      ? "轮到你出牌"
      : "等待" + snapshot.currentName + "出牌";
    this.setData(snapshot);
  }
});
