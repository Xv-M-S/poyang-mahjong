export interface RoomPlayer {
  readonly userId: string;
  seat: number;
  readonly joinedAt: string;
  ready: boolean;
  connected: boolean;
}
