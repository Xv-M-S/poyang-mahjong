const app = getApp();
Page({
  data: { serverUrl: "ws://127.0.0.1:8080", roomCode: "", connectionState: "DISCONNECTED", errorText: "" },
  onLoad() {
    this.unsubscribe = app.subscribeNetwork((state) => this.applyState(state));
  },
  onUnload() { if (this.unsubscribe) this.unsubscribe(); },
  onServerInput(event) { this.setData({ serverUrl: event.detail.value }); },
  onRoomCodeInput(event) { this.setData({ roomCode: event.detail.value.replace(/\D/g, "").slice(0, 6) }); },
  connect() {
    const client = app.resetRealtimeClient(this.data.serverUrl.trim());
    client.connect();
  },
  createRoom() {
    const client = app.getRealtimeClient(this.data.serverUrl.trim());
    client.connect();
    client.sendCommand("room.create", {}, { roomId: null, expectedVersion: 0 });
  },
  joinRoom() {
    if (this.data.roomCode.length !== 6) return wx.showToast({ title: "请输入6位房间号", icon: "none" });
    const client = app.getRealtimeClient(this.data.serverUrl.trim());
    client.connect();
    client.sendCommand("room.join", { roomCode: this.data.roomCode }, { roomId: null, expectedVersion: 0 });
  },
  applyState(state) {
    this.setData({ connectionState: state.connectionState || "DISCONNECTED", errorText: state.error ? state.error.code : "" });
    if (state.publicSnapshot && !this.navigating) {
      this.navigating = true;
      wx.redirectTo({ url: "/pages/room/index" });
    }
  }
});
