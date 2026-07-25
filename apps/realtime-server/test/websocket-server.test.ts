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
