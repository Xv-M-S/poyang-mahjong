import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import {
  RoomAggregate,
  type RoomPersistenceSnapshot,
} from "../domain/room-aggregate.ts";
import type { RoomRepository } from "./room-repository.ts";

interface StoredRooms {
  readonly schemaVersion: 1;
  readonly rooms: readonly RoomPersistenceSnapshot[];
}

export class FileRoomRepository implements RoomRepository {
  private readonly filePath: string;
  private readonly roomsById = new Map<string, RoomAggregate>();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  getById(roomId: string): RoomAggregate | null {
    return this.roomsById.get(roomId) ?? null;
  }

  getByCode(roomCode: string): RoomAggregate | null {
    return this.list().find((room) => room.roomCode === roomCode) ?? null;
  }

  findByUserId(userId: string): RoomAggregate | null {
    return this.list().find((room) => room.getPlayer(userId)) ?? null;
  }

  list(): readonly RoomAggregate[] {
    return [...this.roomsById.values()];
  }

  save(room: RoomAggregate): void {
    this.roomsById.set(room.roomId, room);
    this.flush();
  }

  delete(roomId: string): void {
    if (!this.roomsById.delete(roomId)) return;
    this.flush();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    const stored = JSON.parse(readFileSync(this.filePath, "utf8")) as StoredRooms;
    if (stored.schemaVersion !== 1 || !Array.isArray(stored.rooms)) {
      throw new Error("Unsupported room persistence file");
    }
    for (const snapshot of stored.rooms) {
      const room = RoomAggregate.fromPersistenceSnapshot(snapshot);
      this.roomsById.set(room.roomId, room);
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = this.filePath + ".tmp";
    const value: StoredRooms = {
      schemaVersion: 1,
      rooms: this.list().map((room) => room.toPersistenceSnapshot()),
    };
    writeFileSync(temporaryPath, JSON.stringify(value), "utf8");
    replaceFile(temporaryPath, this.filePath);
  }
}
function replaceFile(temporaryPath: string, targetPath: string): void {
  const backupPath = targetPath + ".bak";
  if (existsSync(backupPath)) rmSync(backupPath);
  if (existsSync(targetPath)) renameSync(targetPath, backupPath);
  try {
    renameSync(temporaryPath, targetPath);
    if (existsSync(backupPath)) rmSync(backupPath);
  } catch (error) {
    if (!existsSync(targetPath) && existsSync(backupPath)) {
      renameSync(backupPath, targetPath);
    }
    throw error;
  }
}