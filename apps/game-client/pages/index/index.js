const { createLocalGame } = require("../../utils/local-game");

Page({
  data: {
    screen: "lobby",
    selectedId: null,
    round: 1,
    currentSeat: 0,
    currentName: "我",
    phase: "DISCARD",
    wallCount: 83,
    finished: false,
    message: "",
    playerStatusText: "轮到你出牌",
    hand: [],
    playerMelds: [],
    availableActions: [],
    awaitingReaction: false,
    opponents: [],
    discards: [[], [], [], []],
    winnerName: "",
    resultTitle: "本局结束",
    winType: "",
    winPatternText: ""
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
    if (!this.game || this.game.finished || this.game.phase !== "DISCARD" || this.game.turn !== 0) return;
    const tileId = Number(event.currentTarget.dataset.id);
    const selectedId = this.data.selectedId === tileId ? null : tileId;
    this.setData({ selectedId });
    this.renderGame();
  },

  discardSelected() {
    if (!this.game || this.game.finished) return;
    if (this.game.phase !== "DISCARD" || this.game.turn !== 0) {
      wx.showToast({ title: "当前不能出牌", icon: "none" });
      return;
    }
    if (this.data.selectedId === null) {
      wx.showToast({ title: "请先选择一张牌", icon: "none" });
      return;
    }
    if (!this.game.discard(0, this.data.selectedId)) {
      wx.showToast({ title: "当前不能打出这张牌", icon: "none" });
      return;
    }
    this.setData({ selectedId: null });
    this.renderGame();
    this.scheduleAutomation();
  },

  chooseAction(event) {
    if (!this.game || this.game.finished) return;
    const action = event.currentTarget.dataset.action;
    const source = event.currentTarget.dataset.source;
    const choiceIndex = Number(event.currentTarget.dataset.choiceIndex);
    const kind = Number(event.currentTarget.dataset.kind);
    const accepted = source === "REACTION"
      ? this.game.respondHuman(action, choiceIndex)
      : this.game.declareHumanAction(action, kind);
    if (!accepted) {
      wx.showToast({ title: "该操作已失效", icon: "none" });
      return;
    }
    this.setData({ selectedId: null });
    this.renderGame();
    this.scheduleAutomation();
  },

  passReaction() {
    if (!this.game || !this.game.respondHuman("PASS", -1)) return;
    this.setData({ selectedId: null });
    this.renderGame();
    this.scheduleAutomation();
  },

  scheduleAutomation() {
    this.clearBotTimer();
    if (!this.game || this.game.finished || this.game.hasHumanReaction()) return;
    const needsStep = this.game.phase === "REACTION"
      || (this.game.phase === "DISCARD" && this.game.turn !== 0);
    if (!needsStep) return;

    this.botTimer = setTimeout(() => {
      if (!this.game || this.game.finished || this.game.hasHumanReaction()) return;
      if (this.game.phase === "REACTION") {
        this.game.resolveReactions(null);
      } else if (this.game.turn !== 0) {
        this.game.playBotTurn();
      }
      this.renderGame();
      this.scheduleAutomation();
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
    if (snapshot.awaitingReaction) {
      snapshot.playerStatusText = "请选择响应操作";
    } else if (snapshot.currentSeat === 0) {
      snapshot.playerStatusText = "轮到你出牌";
    } else {
      snapshot.playerStatusText = "等待" + snapshot.currentName + "出牌";
    }
    this.setData(snapshot);
  }
});
