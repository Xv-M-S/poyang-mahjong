const app = getApp();
Page({
 data:{roomCode:"------",players:[],connectionState:"CONNECTING",isOwner:false,myReady:false,canStart:false,errorText:""},
 onLoad(){this.unsubscribe=app.subscribeNetwork((state)=>this.applyState(state));app.getRealtimeClient().connect();},
 onUnload(){if(this.unsubscribe)this.unsubscribe();},
 toggleReady(){const state=app.globalData.networkState;const pub=state.publicSnapshot;const priv=state.privateSnapshot;if(!pub||!priv)return;const me=pub.players.find((p)=>p.seat===priv.seat);app.getRealtimeClient().sendCommand("room.ready",{ready:!me.ready});},
 startGame(){app.getRealtimeClient().sendCommand("room.start",{});},
 copyCode(){wx.setClipboardData({data:this.data.roomCode});},
 applyState(state){const pub=state.publicSnapshot;const priv=state.privateSnapshot;if(!pub)return;const players=[0,1,2,3].map((seat)=>{const player=pub.players.find((p)=>p.seat===seat);return player?{seat,userId:player.userId,name:player.userId===app.getUserId()?"我":player.userId.slice(-6),ready:player.ready,connected:player.connected,empty:false}:{seat,name:"等待玩家",ready:false,connected:false,empty:true};});const me=priv?pub.players.find((p)=>p.seat===priv.seat):null;this.setData({roomCode:pub.roomCode,players,connectionState:state.connectionState||"CONNECTING",isOwner:pub.ownerId===app.getUserId(),myReady:me?me.ready:false,canStart:pub.players.length===4&&pub.players.every((p)=>p.ready),errorText:state.error?state.error.code:""});if(pub.phase==="PLAYING"&&!this.navigating){this.navigating=true;wx.redirectTo({url:"/pages/online-table/index"});}},
 leaveRoom(){wx.redirectTo({url:"/pages/network/index"});}
});
