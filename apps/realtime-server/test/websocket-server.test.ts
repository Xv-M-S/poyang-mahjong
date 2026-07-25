import assert from "node:assert/strict";
import test from "node:test";

import WebSocket from "ws";

import { DEVELOPMENT_ROOM_RULES } from "../src/config.ts";
import { createRealtimeServer } from "../src/transport/websocket-server.ts";

test("WebSocket client connects and creates a room", async () => {
  const server = createRealtimeServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      roomRules: DEVELOPMENT_ROOM_RULES,
    },
  });
  await onceListening(server);
  const address = server.address();
  assert.ok(address);

  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}?userId=integration-user`,
  );
  const inbox = createMessageInbox(socket);
  const connected = await inbox.waitFor(
    (message) => message.type === "session.connected",
  );
  assert.equal(connected.type, "session.connected");

  socket.send(JSON.stringify({
    type: "room.create",
    requestId: "ws-create-1",
    roomId: null,
    expectedVersion: 0,
    payload: {},
  }));

  const publicSnapshot = await inbox.waitFor(
    (message) => message.type === "room.snapshot",
  );
  const privateSnapshot = await inbox.waitFor(
    (message) => message.type === "room.snapshot.private",
  );
  assert.equal(publicSnapshot.payload.players.length, 1);
  assert.equal(privateSnapshot.payload.seat, 0);

  const closed = onceClosed(socket);
  socket.close();
  await closed;
  await server.close();
});

function onceListening(server: {
  address(): unknown;
  webSocketServer: { once(event: "listening", listener: () => void): unknown };
}): Promise<void> {
  if (server.address()) return Promise.resolve();
  return new Promise((resolve) =>
    server.webSocketServer.once("listening", resolve),
  );
}

function createMessageInbox(socket: WebSocket) {
  const messages: any[] = [];
  const waiters: Array<{
    predicate: (message: any) => boolean;
    resolve: (message: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      messages.push(message);
    }
  });

  return {
    waitFor(predicate: (message: any) => boolean): Promise<any> {
      const messageIndex = messages.findIndex(predicate);
      if (messageIndex >= 0) {
        return Promise.resolve(messages.splice(messageIndex, 1)[0]);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timed out waiting for WebSocket message")),
          3_000,
        );
        waiters.push({ predicate, resolve, reject, timer });
      });
    },
  };
}

function onceClosed(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => socket.once("close", () => resolve()));
}


test("four WebSocket clients join, ready, and receive isolated private hands", async () => {
  const server = createRealtimeServer({ config: { host: "127.0.0.1", port: 0, roomRules: DEVELOPMENT_ROOM_RULES } });
  await onceListening(server);
  const address = server.address();
  assert.ok(address);
  const sockets = Array.from({ length: 4 }, (_, seat) => new WebSocket(`ws://127.0.0.1:${address.port}?userId=ws-user-${seat}`));
  const inboxes = sockets.map(createMessageInbox);
  await Promise.all(inboxes.map((inbox) => inbox.waitFor((message) => message.type === "session.connected")));
  sockets[0].send(JSON.stringify({ type: "room.create", requestId: "multi-create", roomId: null, expectedVersion: 0, payload: {} }));
  let publicState = await inboxes[0].waitFor((message) => message.type === "room.snapshot");
  const roomId = publicState.roomId;
  const roomCode = publicState.payload.roomCode;
  for (let seat = 1; seat < 4; seat += 1) {
    sockets[seat].send(JSON.stringify({ type: "room.join", requestId: `multi-join-${seat}`, roomId: null, expectedVersion: 0, payload: { roomCode } }));
    publicState = await inboxes[seat].waitFor((message) => message.type === "room.snapshot" && message.version > publicState.version);
  }
  for (let seat = 0; seat < 4; seat += 1) {
    const previousVersion = publicState.version;
    sockets[seat].send(JSON.stringify({ type: "room.ready", requestId: `multi-ready-${seat}`, roomId, expectedVersion: previousVersion, payload: { ready: true } }));
    publicState = await inboxes[seat].waitFor((message) => message.type === "room.snapshot" && message.version > previousVersion);
  }
  const previousVersion = publicState.version;
  sockets[0].send(JSON.stringify({ type: "room.start", requestId: "multi-start", roomId, expectedVersion: previousVersion, payload: {} }));
  const privateStates = await Promise.all(inboxes.map((inbox) => inbox.waitFor((message) => message.type === "room.snapshot.private" && message.version > previousVersion && message.payload.hand.length >= 13)));
  const playing = await inboxes[0].waitFor((message) => message.type === "room.snapshot" && message.version > previousVersion && message.payload.phase === "PLAYING");
  assert.equal("hands" in playing.payload.round, false);
  assert.deepEqual(privateStates.map((state) => state.payload.seat).sort(), [0, 1, 2, 3]);
  assert.deepEqual(privateStates.map((state) => state.payload.hand.length).sort(), [13, 13, 13, 14]);
  const allPrivateIds = privateStates.flatMap((state) => state.payload.hand.map((tile) => tile.id));
  assert.equal(new Set(allPrivateIds).size, 53);
  await Promise.all(sockets.map(async (socket) => { const closed = onceClosed(socket); socket.close(); await closed; }));
  await server.close();
});
