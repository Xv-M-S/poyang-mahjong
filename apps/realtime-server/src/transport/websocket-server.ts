import type { AddressInfo } from "node:net";

import {
  WebSocketServer,
  type WebSocket,
} from "ws";

import { CommandRouter } from "../application/command-router.ts";
import type {
  OutboundEvent,
} from "../application/messages.ts";
import type { RealtimeServerConfig } from "../config.ts";
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

export function createRealtimeServer(
  options: CreateRealtimeServerOptions,
): RealtimeServer {
  const connections = options.connections ?? new ConnectionRegistry();
  const router =
    options.router
    ?? new CommandRouter({
      rooms: new InMemoryRoomRepository(),
      rules: options.config.roomRules,
    });
  const webSocketServer = new WebSocketServer({
    host: options.config.host,
    port: options.config.port,
    maxPayload: 64 * 1024,
  });

  webSocketServer.on("connection", (socket, request) => {
    const userId = readUserId(request.url);
    if (!userId) {
      socket.close(1008, "userId is required");
      return;
    }

    connections.register(userId, socket);
    socket.send(JSON.stringify({
      type: "session.connected",
      payload: { userId },
    }));

    socket.on("message", (raw) => {
      try {
        const command = decodeCommand(raw.toString());
        const result = router.handle(userId, command);
        connections.bindRoom(userId, result.roomId);
        dispatchEvents(result.events, connections);
      } catch (error) {
        sendError(socket, error);
      }
    });

    socket.on("close", () => {
      connections.unregister(userId, socket);
    });
  });

  return {
    webSocketServer,
    address() {
      const address = webSocketServer.address();
      return typeof address === "object" ? address : null;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        webSocketServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

function dispatchEvents(
  events: readonly OutboundEvent[],
  connections: ConnectionRegistry,
): void {
  for (const event of events) {
    if (event.audience.kind === "ROOM") {
      connections.sendRoom(event.audience.roomId, event);
    } else {
      connections.sendUser(event.audience.userId, event);
    }
  }
}

function readUserId(requestUrl: string | undefined): string | null {
  const url = new URL(requestUrl ?? "/", "ws://localhost");
  const userId = url.searchParams.get("userId")?.trim() ?? "";
  return userId && userId.length <= 128 ? userId : null;
}

function sendError(socket: WebSocket, error: unknown): void {
  const code =
    error instanceof Error && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.message
        : "INTERNAL_ERROR";
  socket.send(JSON.stringify({
    type: "error",
    payload: { code },
  }));
}
