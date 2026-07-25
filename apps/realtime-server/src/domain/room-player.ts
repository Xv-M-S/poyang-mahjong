export interface RoomPlayer {
  readonly userId: string;
  readonly seat: number;
  readonly joinedAt: string;
  ready: boolean;
  connected: boolean;
}
