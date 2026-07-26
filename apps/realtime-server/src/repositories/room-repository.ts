import type { RoomAggregate } from "../domain/room-aggregate.ts";

export interface RoomRepository {
  getById(roomId: string): RoomAggregate | null;
  getByCode(roomCode: string): RoomAggregate | null;
  findByUserId(userId: string): RoomAggregate | null;
  list(): readonly RoomAggregate[];
  save(room: RoomAggregate): void;
  delete(roomId: string): void;
}
