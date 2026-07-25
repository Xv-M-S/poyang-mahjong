import assert from "node:assert/strict";
import test from "node:test";

import { CommandRouter } from "../src/application/command-router.ts";
import { DEVELOPMENT_ROOM_RULES } from "../src/config.ts";
import { InMemoryRoomRepository } from "../src/repositories/in-memory-room-repository.ts";

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
  assert.deepEqual(repeated, first);
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
