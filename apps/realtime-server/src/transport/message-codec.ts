import type { RealtimeCommand } from "../application/messages.ts";

export function decodeCommand(raw: string): RealtimeCommand {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (!isRecord(value)) throw new Error("INVALID_COMMAND");
  if (
    typeof value.type !== "string"
    || typeof value.requestId !== "string"
    || !(typeof value.roomId === "string" || value.roomId === null)
    || !Number.isInteger(value.expectedVersion)
    || !isRecord(value.payload)
  ) {
    throw new Error("INVALID_COMMAND");
  }
  return value as unknown as RealtimeCommand;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
