const { RealtimeClient } = require("./utils/realtime-client");

App({
  globalData: {
    appName: "鄱阳麻将",
    realtimeUrl: "ws://127.0.0.1:8080",
    networkState: {},
    networkListeners: []
  },

  getUserId() {
    let userId = wx.getStorageSync("developmentUserId");
    if (!userId) {
      userId = "wx-user-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
      wx.setStorageSync("developmentUserId", userId);
    }
    return userId;
  },

  getRealtimeClient(baseUrl) {
    if (baseUrl) this.globalData.realtimeUrl = baseUrl;
    if (!this.realtimeClient) {
      this.realtimeClient = new RealtimeClient({
        wxApi: wx,
        baseUrl: this.globalData.realtimeUrl,
        userId: this.getUserId(),
        onState: (patch) => this.publishNetworkState(patch),
        onError: (error) => this.publishNetworkState({ error })
      });
    }
    return this.realtimeClient;
  },

  resetRealtimeClient(baseUrl) {
    if (this.realtimeClient) this.realtimeClient.close();
    this.realtimeClient = null;
    this.globalData.networkState = {};
    return this.getRealtimeClient(baseUrl);
  },

  subscribeNetwork(listener) {
    this.globalData.networkListeners.push(listener);
    listener(this.globalData.networkState);
    return () => {
      const index = this.globalData.networkListeners.indexOf(listener);
      if (index >= 0) this.globalData.networkListeners.splice(index, 1);
    };
  },

  publishNetworkState(patch) {
    this.globalData.networkState = Object.assign({}, this.globalData.networkState, patch);
    this.globalData.networkListeners.slice().forEach((listener) => listener(this.globalData.networkState));
  }
});
