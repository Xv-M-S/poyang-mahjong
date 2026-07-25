export type RoomErrorCode =
  | "STALE_VERSION"
  | "ROOM_FULL"
  | "PLAYER_NOT_FOUND"
  | "OWNER_ONLY"
  | "PLAYERS_NOT_READY"
  | "WRONG_PHASE"
  | "MATCH_NOT_STARTED";

export class RoomError extends Error {
  readonly code: RoomErrorCode;

  constructor(code: RoomErrorCode, message: string) {
    super(message);
    this.name = "RoomError";
    this.code = code;
  }
}
