import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandRouter } from "../src/application/command-router.ts";
import { DEVELOPMENT_ROOM_RULES } from "../src/config.ts";
import { RoomAggregate } from "../src/domain/room-aggregate.ts";
import { InMemoryRoomRepository } from "../src/repositories/in-memory-room-repository.ts";
import { FileRoomRepository } from "../src/repositories/file-room-repository.ts";

test("four players can join, ready, and start a private-hand round", () => {
  const rooms = new InMemoryRoomRepository();
  const router = new CommandRouter({
    rooms,
    rules: DEVELOPMENT_ROOM_RULES,
    createRoomId: () => "room-001",
    createRoomCode: () => "123456",
  });

  const created = router.handle("user-0", {
    type: "room.create",
    requestId: "create-1",
    roomId: null,
    expectedVersion: 0,
    payload: {},
  });
  assert.equal(created.roomCode, "123456");

  for (let seat = 1; seat < 4; seat += 1) {
    router.handle(`user-${seat}`, {
      type: "room.join",
      requestId: `join-${seat}`,
      roomId: null,
      expectedVersion: 0,
      payload: { roomCode: "123456" },
    });
  }

  const room = rooms.getById("room-001");
  assert.ok(room);
  assert.equal(room.getPublicSnapshot().players.length, 4);

  for (let seat = 0; seat < 4; seat += 1) {
    router.handle(`user-${seat}`, {
      type: "room.ready",
      requestId: `ready-${seat}`,
      roomId: room.roomId,
      expectedVersion: room.getVersion(),
      payload: { ready: true },
    });
  }

  const started = router.handle("user-0", {
    type: "room.start",
    requestId: "start-1",
    roomId: room.roomId,
    expectedVersion: room.getVersion(),
    payload: {},
  });
  const publicSnapshot = room.getPublicSnapshot();
  assert.equal(publicSnapshot.phase, "PLAYING");
  assert.deepEqual(publicSnapshot.round?.handCounts, [14, 13, 13, 13]);
  assert.equal("hands" in (publicSnapshot.round ?? {}), false);

  const privateEvents = started.events.filter(
    (event) => event.type === "room.snapshot.private",
  );
  assert.equal(privateEvents.length, 4);
  assert.equal(room.getPrivateSnapshot("user-0").hand.length, 14);
  assert.equal(room.getPrivateSnapshot("user-1").hand.length, 13);
  assert.equal(room.getPrivateSnapshot("user-0").availableActions[0]?.type, "DISCARD");
  assert.deepEqual(room.getPrivateSnapshot("user-1").availableActions, []);

  const dealerTileId = room.getPrivateSnapshot("user-0").hand[0].id;
  router.handle("user-0", {
    type: "game.discard",
    requestId: "discard-1",
    roomId: room.roomId,
    expectedVersion: room.getVersion(),
    payload: { tileId: dealerTileId },
  });
  assert.equal(room.getPublicSnapshot().round?.phase, "REACTION_WINDOW");
  assert.equal(room.getPrivateSnapshot("user-0").hand.length, 13);
  assert.ok(room.getPublicSnapshot().round?.pendingDiscard);
  assert.equal(room.getPrivateSnapshot("user-1").availableActions.some((action) => action.type === "PASS"), true);
});

test("duplicate requestId returns the cached result without a second room", () => {
  const rooms = new InMemoryRoomRepository();
  let roomSequence = 0;
  const router = new CommandRouter({
    rooms,
    rules: DEVELOPMENT_ROOM_RULES,
    createRoomId: () => `room-${++roomSequence}`,
    createRoomCode: () => "654321",
  });
  const command = {
    type: "room.create" as const,
    requestId: "same-request",
    roomId: null,
    expectedVersion: 0,
    payload: {},
  };

  const first = router.handle("owner", command);
  const repeated = router.handle("owner", command);
  assert.equal(repeated.roomId, first.roomId);
  assert.equal(repeated.idempotentReplay, true);
  assert.equal(repeated.events.every((event) => event.audience.kind === "USER"), true);
  assert.equal(roomSequence, 1);
  assert.equal(rooms.getByCode("654321")?.roomId, "room-1");
});

test("stale room version is rejected", () => {
  const rooms = new InMemoryRoomRepository();
  const router = new CommandRouter({
    rooms,
    rules: DEVELOPMENT_ROOM_RULES,
    createRoomId: () => "room-stale",
    createRoomCode: () => "111111",
  });
  const result = router.handle("owner", {
    type: "room.create",
    requestId: "create-stale",
    roomId: null,
    expectedVersion: 0,
    payload: {},
  });

  assert.throws(
    () =>
      router.handle("owner", {
        type: "room.ready",
        requestId: "ready-stale",
        roomId: result.roomId,
        expectedVersion: 0,
        payload: { ready: true },
      }),
    (error: unknown) =>
      error instanceof Error
      && "code" in error
      && error.code === "STALE_VERSION",
  );
});


test("players can leave a waiting room and the owner can close it", () => {
  const rooms = new InMemoryRoomRepository();
  let roomSequence = 0;
  let codeSequence = 123455;
  const router = new CommandRouter({
    rooms,
    rules: DEVELOPMENT_ROOM_RULES,
    createRoomId: () => `room-leave-${++roomSequence}`,
    createRoomCode: () => String(++codeSequence),
  });

  const created = router.handle("owner", {
    type: "room.create",
    requestId: "leave-create-1",
    roomId: null,
    expectedVersion: 0,
    payload: {},
  });
  router.handle("guest", {
    type: "room.join",
    requestId: "leave-join-1",
    roomId: null,
    expectedVersion: 0,
    payload: { roomCode: created.roomCode },
  });
  const room = rooms.getById(created.roomId);
  assert.ok(room);

  const guestLeft = router.handle("guest", {
    type: "room.leave",
    requestId: "guest-leave-1",
    roomId: room.roomId,
    expectedVersion: room.getVersion(),
    payload: {},
  });
  assert.equal(guestLeft.leftUserId, "guest");
  assert.equal(guestLeft.roomClosed, false);
  assert.deepEqual(room.getPublicSnapshot().players.map((player) => player.userId), ["owner"]);
  assert.equal(guestLeft.events.some((event) => event.type === "room.left"), true);

  router.handle("guest", {
    type: "room.join",
    requestId: "leave-join-2",
    roomId: null,
    expectedVersion: 0,
    payload: { roomCode: created.roomCode },
  });
  assert.equal(room.getPlayer("guest")?.seat, 1);

  const ownerLeft = router.handle("owner", {
    type: "room.leave",
    requestId: "owner-leave-1",
    roomId: room.roomId,
    expectedVersion: room.getVersion(),
    payload: {},
  });
  assert.equal(ownerLeft.roomClosed, true);
  assert.equal(rooms.getById(room.roomId), null);
  assert.equal(rooms.getByCode(created.roomCode), null);

  const recreated = router.handle("owner", {
    type: "room.create",
    requestId: "leave-create-2",
    roomId: null,
    expectedVersion: 0,
    payload: {},
  });
  assert.notEqual(recreated.roomId, created.roomId);
});

test("server timeout advances turns and resolves missing reactions", () => {
  const rooms = new InMemoryRoomRepository();
  const router = new CommandRouter({
    rooms,
    rules: DEVELOPMENT_ROOM_RULES,
    createRoomId: () => "timeout-room",
    createRoomCode: () => "222222",
    turnTimeoutMs: 50,
    reactionTimeoutMs: 20,
  });
  router.handle("p0", { type: "room.create", requestId: "tc", roomId: null, expectedVersion: 0, payload: {} });
  for (let seat = 1; seat < 4; seat += 1) {
    router.handle("p" + seat, { type: "room.join", requestId: "tj" + seat, roomId: null, expectedVersion: 0, payload: { roomCode: "222222" } });
  }
  const room = rooms.getById("timeout-room")!;
  for (let seat = 0; seat < 4; seat += 1) {
    router.handle("p" + seat, { type: "room.ready", requestId: "tr" + seat, roomId: room.roomId, expectedVersion: room.getVersion(), payload: { ready: true } });
  }
  router.handle("p0", { type: "room.start", requestId: "ts", roomId: room.roomId, expectedVersion: room.getVersion(), payload: {} });
  const tileId = room.getPrivateSnapshot("p0").hand[0].id;
  router.handle("p0", { type: "game.discard", requestId: "td", roomId: room.roomId, expectedVersion: room.getVersion(), payload: { tileId } });
  const timeoutVersion = room.getVersion();
  const result = router.handleTimeout(room.roomId, timeoutVersion);
  assert.ok(result);
  assert.equal(room.getPublicSnapshot().round?.phase, "PLAYING");
  assert.equal(room.getPublicSnapshot().round?.currentSeat, 1);
  assert.equal(room.getPublicSnapshot().round?.turnAction, "DRAW");
  assert.ok(room.getPublicSnapshot().actionDeadlineAt);
});

test("active rooms survive repository restart with private hands intact", () => {
  const directory = mkdtempSync(join(tmpdir(), "poyang-room-"));
  try {
    const path = join(directory, "rooms.json");
    const rooms = new FileRoomRepository(path);
    const router = new CommandRouter({
      rooms,
      rules: DEVELOPMENT_ROOM_RULES,
      createRoomId: () => "persist-room",
      createRoomCode: () => "333333",
    });
    router.handle("p0", { type: "room.create", requestId: "pc", roomId: null, expectedVersion: 0, payload: {} });
    for (let seat = 1; seat < 4; seat += 1) {
      router.handle("p" + seat, { type: "room.join", requestId: "pj" + seat, roomId: null, expectedVersion: 0, payload: { roomCode: "333333" } });
    }
    const room = rooms.getById("persist-room")!;
    for (let seat = 0; seat < 4; seat += 1) {
      router.handle("p" + seat, { type: "room.ready", requestId: "pr" + seat, roomId: room.roomId, expectedVersion: room.getVersion(), payload: { ready: true } });
    }
    router.handle("p0", { type: "room.start", requestId: "ps", roomId: room.roomId, expectedVersion: room.getVersion(), payload: {} });
    const before = room.getPrivateSnapshot("p0");
    const restored = new FileRoomRepository(path).getById("persist-room");
    assert.ok(restored);
    assert.deepEqual(restored.getPrivateSnapshot("p0").hand, before.hand);
    assert.equal(restored.getPublicSnapshot().round?.remainingTiles, 83);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("completed rooms can restart and owners can dissolve them", () => {
  const original = new RoomAggregate({
    roomId: "lifecycle-room",
    roomCode: "444444",
    ownerId: "owner",
    rules: DEVELOPMENT_ROOM_RULES,
  });
  const completed = RoomAggregate.fromPersistenceSnapshot({
    ...original.toPersistenceSnapshot(),
    phase: "COMPLETED",
  });
  completed.restart("owner", completed.getVersion());
  assert.equal(completed.getPublicSnapshot().phase, "WAITING");
  assert.equal(completed.getPublicSnapshot().players.every((player) => !player.ready), true);
  completed.dissolve("owner", completed.getVersion());
  assert.equal(completed.getPublicSnapshot().phase, "CLOSED");
});