import WebSocket from "ws";

export class ConnectionRegistry {
  private readonly socketsByUser = new Map<string, Set<WebSocket>>();
  private readonly usersByRoom = new Map<string, Set<string>>();

  register(userId: string, socket: WebSocket): void {
    const sockets = this.socketsByUser.get(userId) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.socketsByUser.set(userId, sockets);
  }

  unregister(userId: string, socket: WebSocket): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.socketsByUser.delete(userId);
  }

  hasUser(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }
  bindRoom(userId: string, roomId: string): void {
    const users = this.usersByRoom.get(roomId) ?? new Set<string>();
    users.add(userId);
    this.usersByRoom.set(roomId, users);
  }

  unbindRoom(userId: string, roomId: string): void {
    const users = this.usersByRoom.get(roomId);
    if (!users) return;
    users.delete(userId);
    if (users.size === 0) this.usersByRoom.delete(roomId);
  }

  unbindRoomAll(roomId: string): void {
    this.usersByRoom.delete(roomId);
  }

  sendUser(userId: string, message: unknown): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.socketsByUser.get(userId) ?? []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
    }
  }

  sendRoom(roomId: string, message: unknown): void {
    for (const userId of this.usersByRoom.get(roomId) ?? []) {
      this.sendUser(userId, message);
    }
  }
}
