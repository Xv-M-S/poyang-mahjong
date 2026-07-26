import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { WebSocketServer, type WebSocket } from "ws";

import { CommandRouter } from "../application/command-router.ts";
import { FileIdempotencyStore } from "../application/file-idempotency-store.ts";
import type { DispatchResult, OutboundEvent } from "../application/messages.ts";
import type { RealtimeServerConfig } from "../config.ts";
import { FileRoomRepository } from "../repositories/file-room-repository.ts";
import { InMemoryRoomRepository } from "../repositories/in-memory-room-repository.ts";
import { ConnectionRegistry } from "../sessions/connection-registry.ts";
import { decodeCommand } from "./message-codec.ts";

export interface RealtimeServer {
  readonly webSocketServer: WebSocketServer;
  address(): AddressInfo | null;
  close(): Promise<void>;
}

export interface CreateRealtimeServerOptions {
  readonly config: RealtimeServerConfig;
  readonly router?: CommandRouter;
  readonly connections?: ConnectionRegistry;
}

export function createRealtimeServer(options: CreateRealtimeServerOptions): RealtimeServer {
  const connections = options.connections ?? new ConnectionRegistry();
  const rooms = options.config.dataDirectory
    ? new FileRoomRepository(join(options.config.dataDirectory, "rooms.json"))
    : new InMemoryRoomRepository();
  const router = options.router ?? new CommandRouter({
    rooms,
    rules: options.config.roomRules,
    idempotency: options.config.dataDirectory
      ? new FileIdempotencyStore(join(options.config.dataDirectory, "requests.json"))
      : undefined,
    turnTimeoutMs: options.config.turnTimeoutMs,
    reactionTimeoutMs: options.config.reactionTimeoutMs,
  });
  router.resetConnections();

  const webSocketServer = new WebSocketServer({
    host: options.config.host,
    port: options.config.port,
    maxPayload: 64 * 1024,
  });
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const alive = new WeakMap<WebSocket, boolean>();

  const processResult = (result: DispatchResult): void => {
    dispatchEvents(result.events, connections);
    schedule(result.roomId);
  };

  const schedule = (roomId: string): void => {
    const previous = timers.get(roomId);
    if (previous) clearTimeout(previous);
    timers.delete(roomId);
    const room = router.listRooms().find((candidate) => candidate.roomId === roomId);
    if (!room) return;
    const snapshot = room.getPublicSnapshot();
    if (snapshot.actionDeadlineAt === null) return;
    const expectedVersion = snapshot.version;
    const timer = setTimeout(() => {
      timers.delete(roomId);
      const result = router.handleTimeout(roomId, expectedVersion);
      if (result) processResult(result);
      else schedule(roomId);
    }, Math.max(0, snapshot.actionDeadlineAt - Date.now()));
    timer.unref();
    timers.set(roomId, timer);
  };

  for (const room of router.listRooms()) schedule(room.roomId);

  webSocketServer.on("connection", (socket, request) => {
    const userId = readUserId(request.url);
    if (!userId) {
      socket.close(1008, "userId is required");
      return;
    }

    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));
    connections.register(userId, socket);
    socket.send(JSON.stringify({ type: "session.connected", payload: { userId } }));

    const recovered = router.connectUser(userId);
    if (recovered) {
      connections.bindRoom(userId, recovered.roomId);
      processResult(recovered);
    }

    socket.on("message", (raw) => {
      try {
        const command = decodeCommand(raw.toString());
        const result = router.handle(userId, command);
        if (!result.leftUserId) connections.bindRoom(userId, result.roomId);
        processResult(result);
        if (result.leftUserId) {
          if (result.roomClosed) connections.unbindRoomAll(result.roomId);
          else connections.unbindRoom(result.leftUserId, result.roomId);
        }
      } catch (error) {
        sendError(socket, error);
      }
    });

    socket.on("close", () => {
      connections.unregister(userId, socket);
      if (!connections.hasUser(userId)) {
        const result = router.disconnectUser(userId);
        if (result) processResult(result);
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, options.config.heartbeatIntervalMs ?? 15_000);
  heartbeat.unref();

  return {
    webSocketServer,
    address() {
      const address = webSocketServer.address();
      return typeof address === "object" ? address : null;
    },
    close() {
      clearInterval(heartbeat);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      return new Promise<void>((resolve, reject) => {
        webSocketServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

function dispatchEvents(events: readonly OutboundEvent[], connections: ConnectionRegistry): void {
  for (const event of events) {
    if (event.audience.kind === "ROOM") connections.sendRoom(event.audience.roomId, event);
    else connections.sendUser(event.audience.userId, event);
  }
}

function readUserId(requestUrl: string | undefined): string | null {
  const url = new URL(requestUrl ?? "/", "ws://localhost");
  const userId = url.searchParams.get("userId")?.trim() ?? "";
  return userId && userId.length <= 128 ? userId : null;
}

function sendError(socket: WebSocket, error: unknown): void {
  const code = error instanceof Error && "code" in error
    ? String(error.code)
    : error instanceof Error
      ? error.message
      : "INTERNAL_ERROR";
  socket.send(JSON.stringify({ type: "error", payload: { code } }));
}
