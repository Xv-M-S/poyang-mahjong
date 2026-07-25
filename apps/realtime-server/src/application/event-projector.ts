import type { RoomAggregate } from "../domain/room-aggregate.ts";
import type { OutboundEvent } from "./messages.ts";

export function projectRoomSnapshots(room: RoomAggregate): OutboundEvent[] {
  const publicSnapshot = room.getPublicSnapshot();
  const events: OutboundEvent[] = [
    {
      audience: { kind: "ROOM", roomId: room.roomId },
      type: "room.snapshot",
      roomId: room.roomId,
      version: room.getVersion(),
      payload: publicSnapshot,
    },
  ];

  for (const userId of room.getPlayerIds()) {
    events.push({
      audience: { kind: "USER", userId },
      type: "room.snapshot.private",
      roomId: room.roomId,
      version: room.getVersion(),
      payload: room.getPrivateSnapshot(userId),
    });
  }
  return events;
}
