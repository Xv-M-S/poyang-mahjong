function createRequestId(userId, sequence) {
  return userId + "-" + Date.now() + "-" + sequence;
}

class RealtimeClient {
  constructor(options) {
    this.wx = options.wxApi;
    this.baseUrl = options.baseUrl;
    this.userId = options.userId;
    this.onState = options.onState || function () {};
    this.onError = options.onError || function () {};
    this.socket = null;
    this.connected = false;
    this.manualClose = false;
    this.reconnectAttempt = 0;
    this.sequence = 0;
    this.queue = [];
    this.publicSnapshot = null;
    this.privateSnapshot = null;
  }

  connect() {
    if (this.socket && this.connected) return;
    this.manualClose = false;
    const separator = this.baseUrl.indexOf("?") >= 0 ? "&" : "?";
    const url = this.baseUrl + separator + "userId=" + encodeURIComponent(this.userId);
    this.onState({ connectionState: "CONNECTING" });
    const socket = this.wx.connectSocket({ url });
    this.socket = socket;
    socket.onOpen(() => {
      if (this.socket !== socket) return;
      this.connected = true;
      this.reconnectAttempt = 0;
      this.onState({ connectionState: "CONNECTED" });
      this.flushQueue();
      if (this.publicSnapshot && this.publicSnapshot.roomId) this.requestSnapshot();
    });
    socket.onMessage((event) => this.handleMessage(event.data));
    socket.onError(() => this.onError({ code: "SOCKET_ERROR", message: "实时连接发生错误" }));
    socket.onClose(() => {
      if (this.socket !== socket) return;
      this.connected = false;
      this.socket = null;
      this.onState({ connectionState: "DISCONNECTED" });
      if (!this.manualClose) this.scheduleReconnect();
    });
  }

  close() {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) this.socket.close({ code: 1000, reason: "client closed" });
    this.socket = null;
    this.connected = false;
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 8000);
    this.reconnectAttempt += 1;
    this.onState({ connectionState: "RECONNECTING", reconnectDelay: delay });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  sendCommand(type, payload, options) {
    const config = options || {};
    const envelope = {
      type,
      requestId: config.requestId || createRequestId(this.userId, ++this.sequence),
      roomId: config.roomId === undefined ? (this.publicSnapshot ? this.publicSnapshot.roomId : null) : config.roomId,
      expectedVersion: config.expectedVersion === undefined ? (this.publicSnapshot ? this.publicSnapshot.version : 0) : config.expectedVersion,
      payload: payload || {}
    };
    if (!this.connected || !this.socket) {
      this.queue.push(envelope);
      this.connect();
    } else {
      this.sendEnvelope(envelope);
    }
    return envelope.requestId;
  }

  sendEnvelope(envelope) {
    this.socket.send({ data: JSON.stringify(envelope) });
  }

  flushQueue() {
    const queued = this.queue.splice(0);
    queued.forEach((envelope) => this.sendEnvelope(envelope));
  }

  requestSnapshot() {
    if (!this.publicSnapshot) return;
    this.sendCommand("game.reconnect", {}, { roomId: this.publicSnapshot.roomId });
  }

  clearRoom(patch) {
    this.publicSnapshot = null;
    this.privateSnapshot = null;
    this.onState(Object.assign({
      connectionState: this.connected ? "CONNECTED" : "CONNECTING",
      publicSnapshot: null,
      privateSnapshot: null
    }, patch || {}));
  }

  handleMessage(raw) {
    let message;
    try {
      message = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw));
    } catch (error) {
      this.onError({ code: "INVALID_SERVER_MESSAGE", message: "收到无法解析的服务器消息" });
      return;
    }
    if (message.type === "error") {
      const code = message.payload && message.payload.code ? message.payload.code : "SERVER_ERROR";
      this.onError({ code, message: code });
      if (code === "STALE_VERSION") this.requestSnapshot();
      return;
    }
    if (message.type === "room.left") {
      this.clearRoom({ roomLeft: true, roomClosed: Boolean(message.payload && message.payload.closed), message });
      return;
    }
    if (message.type === "room.snapshot") {
      if (message.payload && message.payload.phase === "CLOSED") {
        this.clearRoom({ roomLeft: true, roomClosed: true, message });
        return;
      }
      this.publicSnapshot = message.payload;
    }
    if (message.type === "room.snapshot.private") this.privateSnapshot = message.payload;
    this.onState({
      connectionState: this.connected ? "CONNECTED" : "CONNECTING",
      publicSnapshot: this.publicSnapshot,
      privateSnapshot: this.privateSnapshot,
      roomLeft: false,
      roomClosed: false,
      message
    });
  }
}

module.exports = { RealtimeClient, createRequestId };
