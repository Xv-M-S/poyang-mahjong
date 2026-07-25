import { randomUUID } from "node:crypto";

import type { RoomRules } from "../config.ts";
import { RoomAggregate } from "../domain/room-aggregate.ts";
import type { RoomRepository } from "../repositories/room-repository.ts";
import { projectRoomSnapshots } from "./event-projector.ts";
import {
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from "./idempotency-store.ts";
import type {
  DispatchResult,
  RealtimeCommand,
} from "./messages.ts";

export interface CommandRouterOptions {
  readonly rooms: RoomRepository;
  readonly rules: RoomRules;
  readonly idempotency?: IdempotencyStore;
  readonly createRoomId?: () => string;
  readonly createRoomCode?: () => string;
}

export class CommandRouter {
  private readonly rooms: RoomRepository;
  private readonly rules: RoomRules;
  private readonly idempotency: IdempotencyStore;
  private readonly createRoomId: () => string;
  private readonly createRoomCode: () => string;

  constructor(options: CommandRouterOptions) {
    this.rooms = options.rooms;
    this.rules = options.rules;
    this.idempotency =
      options.idempotency ?? new InMemoryIdempotencyStore();
    this.createRoomId = options.createRoomId ?? randomUUID;
    this.createRoomCode = options.createRoomCode ?? randomRoomCode;
  }

  handle(userId: string, command: RealtimeCommand): DispatchResult {
    assertIdentifier(userId, "userId");
    assertIdentifier(command.requestId, "requestId");
    const cached = this.idempotency.get(userId, command.requestId);
    if (cached) return cached;

    const room =
      command.type === "room.create"
        ? this.createRoom(userId, command)
        : this.resolveRoom(command);

    switch (command.type) {
      case "room.create":
        break;
      case "room.join":
        room.join(userId, room.getVersion());
        break;
      case "room.ready":
        room.setReady(userId, command.payload.ready, command.expectedVersion);
        break;
      case "room.start":
        room.startNextRound(userId, command.expectedVersion);
        break;
      case "game.draw":
        room.draw(userId, command.expectedVersion);
        break;
      case "game.discard":
        room.discard(userId, command.payload.tileId, command.expectedVersion);
        break;
      case "game.claim":
        room.submitClaim(
          userId,
          command.payload.action,
          command.payload.tileIds,
          command.expectedVersion,
        );
        break;
      case "game.kong.concealed":
        room.declareConcealedKong(
          userId,
          command.payload.tileIds,
          command.expectedVersion,
        );
        break;
      case "game.kong.added":
        room.proposeAddedKong(
          userId,
          command.payload.tileId,
          command.expectedVersion,
        );
        break;
      case "game.kong.react":
        room.submitRobKongReaction(
          userId,
          command.payload.action,
          command.expectedVersion,
        );
        break;
      case "game.win.selfDraw":
        room.declareSelfDrawWin(userId, command.expectedVersion);
        break;
      case "game.reconnect":
        room.getPrivateSnapshot(userId);
        break;
      default:
        assertNever(command);
    }

    this.rooms.save(room);
    const result: DispatchResult = {
      roomId: room.roomId,
      roomCode: room.roomCode,
      events: projectRoomSnapshots(room),
    };
    this.idempotency.save(userId, command.requestId, result);
    return result;
  }

  private createRoom(
    userId: string,
    command: Extract<RealtimeCommand, { type: "room.create" }>,
  ): RoomAggregate {
    if (command.expectedVersion !== 0) {
      throw new Error("room.create expectedVersion must be 0");
    }
    let roomCode = this.createRoomCode();
    let attempts = 0;
    while (this.rooms.getByCode(roomCode)) {
      attempts += 1;
      if (attempts >= 10) throw new Error("Unable to allocate a unique room code");
      roomCode = this.createRoomCode();
    }
    return new RoomAggregate({
      roomId: this.createRoomId(),
      roomCode,
      ownerId: userId,
      rules: this.rules,
    });
  }

  private resolveRoom(command: Exclude<RealtimeCommand, { type: "room.create" }>) {
    const room =
      command.type === "room.join"
        ? this.rooms.getByCode(command.payload.roomCode)
        : command.roomId
          ? this.rooms.getById(command.roomId)
          : null;
    if (!room) throw new Error("ROOM_NOT_FOUND");
    return room;
  }
}

function randomRoomCode(): string {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

function assertIdentifier(value: string, field: string): void {
  if (!value.trim() || value.length > 128) {
    throw new Error(`${field} must contain between 1 and 128 characters`);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
}
