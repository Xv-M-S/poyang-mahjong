import type { DispatchResult } from "./messages.ts";

export interface IdempotencyStore {
  get(userId: string, requestId: string): DispatchResult | null;
  save(userId: string, requestId: string, result: DispatchResult): void;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly results = new Map<string, DispatchResult>();

  get(userId: string, requestId: string): DispatchResult | null {
    return this.results.get(key(userId, requestId)) ?? null;
  }

  save(userId: string, requestId: string, result: DispatchResult): void {
    this.results.set(key(userId, requestId), result);
  }
}

function key(userId: string, requestId: string): string {
  return `${userId}:${requestId}`;
}
