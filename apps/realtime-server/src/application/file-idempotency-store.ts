import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import type { DispatchResult } from "./messages.ts";
import type { IdempotencyStore } from "./idempotency-store.ts";

export class FileIdempotencyStore implements IdempotencyStore {
  private readonly filePath: string;
  private readonly results = new Map<string, DispatchResult>();

  constructor(filePath: string) {
    this.filePath = filePath;
    if (existsSync(filePath)) {
      const stored = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, DispatchResult>;
      for (const [key, value] of Object.entries(stored)) this.results.set(key, value);
    }
  }

  get(userId: string, requestId: string): DispatchResult | null {
    return this.results.get(this.key(userId, requestId)) ?? null;
  }

  save(userId: string, requestId: string, result: DispatchResult): void {
    this.results.set(this.key(userId, requestId), result);
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = this.filePath + ".tmp";
    writeFileSync(temporaryPath, JSON.stringify(Object.fromEntries(this.results)), "utf8");
    replaceFile(temporaryPath, this.filePath);
  }

  private key(userId: string, requestId: string): string {
    return userId + ":" + requestId;
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