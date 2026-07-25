import type { RoomAggregate } from "../domain/room-aggregate.ts";
import type { RoomRepository } from "./room-repository.ts";

export class InMemoryRoomRepository implements RoomRepository {
  private readonly roomsById = new Map<string, RoomAggregate>();
  private readonly roomIdByCode = new Map<string, string>();

  getById(roomId: string): RoomAggregate | null {
    return this.roomsById.get(roomId) ?? null;
  }

  getByCode(roomCode: string): RoomAggregate | null {
    const roomId = this.roomIdByCode.get(roomCode);
    return roomId ? this.getById(roomId) : null;
  }

  save(room: RoomAggregate): void {
    this.roomsById.set(room.roomId, room);
    this.roomIdByCode.set(room.roomCode, room.roomId);
  }

  delete(roomId: string): void {
    const room = this.roomsById.get(roomId);
    if (!room) return;
    this.roomsById.delete(roomId);
    this.roomIdByCode.delete(room.roomCode);
  }
}
