/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

afterEach(() => {
  vi.useRealTimers();
});

test("creating a room makes the creator its host", async () => {
  const t = convexTest(schema, modules);

  const result = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "Russian",
    categories: ["Болезнь", "Фильм"],
    durationSeconds: 60,
  });

  expect(result.code).toMatch(/^[A-Z]{6}$/);

  const room = await t.query(api.rooms.get, {
    code: result.code,
    playerToken: "host-browser-token",
  });

  expect(room).toMatchObject({
    code: result.code,
    status: "lobby",
    language: "Russian",
    categories: ["Болезнь", "Фильм"],
    durationSeconds: 60,
    viewer: {
      name: "Dastan",
      isHost: true,
      ready: false,
    },
    players: [
      {
        name: "Dastan",
        isHost: true,
        ready: false,
      },
    ],
  });
});

test("a second browser can join an existing lobby by code", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });

  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });

  expect(room?.viewer).toMatchObject({
    name: "Masha",
    isHost: false,
    ready: false,
  });
  expect(room?.players).toMatchObject([
    { name: "Dastan", isHost: true },
    { name: "Masha", isHost: false },
  ]);
});

test("rejoining with the same browser token does not duplicate the player", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  const joinArgs = {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  };

  await t.mutation(api.rooms.join, joinArgs);
  await t.mutation(api.rooms.join, joinArgs);

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });

  expect(room?.players).toHaveLength(2);
});

test("host authority transfers when the host disconnects", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-08T00:00:00Z"));
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });

  vi.advanceTimersByTime(29_000);
  await t.mutation(api.rooms.heartbeat, {
    code,
    playerToken: "friend-browser-token",
  });
  vi.advanceTimersByTime(1_001);
  await t.finishInProgressScheduledFunctions();

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });

  expect(room?.players).toMatchObject([
    { name: "Dastan", isHost: false, online: false },
    { name: "Masha", isHost: true, online: true },
  ]);
  expect(room?.viewer).toMatchObject({
    name: "Masha",
    isHost: true,
    online: true,
  });
});

test("the first player back becomes host when everyone disconnected", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-08T00:00:00Z"));
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });

  vi.advanceTimersByTime(30_001);
  await t.finishInProgressScheduledFunctions();
  await t.mutation(api.rooms.heartbeat, {
    code,
    playerToken: "host-browser-token",
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "host-browser-token",
  });
  expect(room?.viewer).toMatchObject({
    name: "Dastan",
    isHost: true,
    online: true,
  });
});

test("a disconnected player reconnects with the same seat during a round", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-08T00:00:00Z"));
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  for (const playerToken of ["host-browser-token", "friend-browser-token"]) {
    await t.mutation(api.rooms.setReady, { code, playerToken, ready: true });
  }
  await t.mutation(api.rooms.startRound, {
    code,
    hostToken: "host-browser-token",
  });
  await t.mutation(api.rooms.saveAnswer, {
    code,
    playerToken: "friend-browser-token",
    categoryIndex: 0,
    value: "The Matrix",
  });

  vi.advanceTimersByTime(29_000);
  await t.mutation(api.rooms.heartbeat, {
    code,
    playerToken: "host-browser-token",
  });
  vi.advanceTimersByTime(1_001);
  await t.finishInProgressScheduledFunctions();

  const disconnectedRoom = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });
  const playerId = disconnectedRoom?.viewer?.id;
  expect(disconnectedRoom?.viewer?.online).toBe(false);

  await t.mutation(api.rooms.heartbeat, {
    code,
    playerToken: "friend-browser-token",
  });
  const reconnectedRoom = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });

  expect(reconnectedRoom?.players).toHaveLength(2);
  expect(reconnectedRoom?.viewer).toMatchObject({
    id: playerId,
    name: "Masha",
    online: true,
  });
  expect(reconnectedRoom?.viewerAnswers).toEqual(["The Matrix", ""]);
});

test("leaving removes the player and immediately transfers host authority", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });

  await t.mutation(api.rooms.leave, {
    code,
    playerToken: "host-browser-token",
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });

  expect(room?.players).toMatchObject([
    { name: "Masha", isHost: true, online: true },
  ]);
  expect(room?.viewer).toMatchObject({
    name: "Masha",
    isHost: true,
  });
});

test("rooms expire after 24 hours", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-08T00:00:00Z"));
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });

  vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
  await t.finishInProgressScheduledFunctions();

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "host-browser-token",
  });
  expect(room).toBeNull();
});

test("a player can change their own ready state", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });

  await t.mutation(api.rooms.setReady, {
    code,
    playerToken: "friend-browser-token",
    ready: true,
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });

  expect(room?.viewer?.ready).toBe(true);
  expect(room?.players).toMatchObject([
    { name: "Dastan", ready: false },
    { name: "Masha", ready: true },
  ]);
});

test("players cannot join after the room leaves the lobby", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });

  await t.run(async (ctx) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();
    await ctx.db.patch(room._id, { status: "playing" });
  });

  await expect(
    t.mutation(api.rooms.join, {
      code,
      playerToken: "late-browser-token",
      playerName: "Late friend",
    }),
  ).rejects.toThrow("This room has already started.");
});

test("the host starts a shared round after everyone is ready", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-08T00:00:00Z"));
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  await t.mutation(api.rooms.setReady, {
    code,
    playerToken: "host-browser-token",
    ready: true,
  });
  await t.mutation(api.rooms.setReady, {
    code,
    playerToken: "friend-browser-token",
    ready: true,
  });

  await t.mutation(api.rooms.startRound, {
    code,
    hostToken: "host-browser-token",
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });

  expect(room).toMatchObject({
    status: "playing",
    roundNumber: 1,
    roundEndsAt: Date.now() + 60_000,
  });
  expect(room?.letter).toMatch(/^[A-Z]$/);
});

test("a non-host cannot start the round", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  await t.mutation(api.rooms.setReady, {
    code,
    playerToken: "host-browser-token",
    ready: true,
  });
  await t.mutation(api.rooms.setReady, {
    code,
    playerToken: "friend-browser-token",
    ready: true,
  });

  await expect(
    t.mutation(api.rooms.startRound, {
      code,
      hostToken: "friend-browser-token",
    }),
  ).rejects.toThrow("Only the host can start the round.");
});

test("the host cannot start until every player is ready", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  await t.mutation(api.rooms.setReady, {
    code,
    playerToken: "host-browser-token",
    ready: true,
  });

  await expect(
    t.mutation(api.rooms.startRound, {
      code,
      hostToken: "host-browser-token",
    }),
  ).rejects.toThrow("Every player must be ready.");
});

test("disconnected players do not join a round or block it from starting", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-08T00:00:00Z"));
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "stale-browser-token",
    playerName: "Alex",
  });

  vi.advanceTimersByTime(29_000);
  for (const playerToken of ["host-browser-token", "friend-browser-token"]) {
    await t.mutation(api.rooms.heartbeat, { code, playerToken });
  }
  vi.advanceTimersByTime(1_001);
  await t.finishInProgressScheduledFunctions();
  for (const playerToken of ["host-browser-token", "friend-browser-token"]) {
    await t.mutation(api.rooms.setReady, { code, playerToken, ready: true });
  }

  await t.mutation(api.rooms.startRound, {
    code,
    hostToken: "host-browser-token",
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "host-browser-token",
  });
  expect(room?.status).toBe("playing");
  expect(room?.players).toMatchObject([
    { name: "Dastan", online: true },
    { name: "Masha", online: true },
    { name: "Alex", online: false },
  ]);

  await t.run(async (ctx) => {
    const storedRoom = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();
    await ctx.db.patch(storedRoom._id, {
      status: "reveal",
      revealIndex: 1,
    });
  });
  await t.mutation(api.rooms.advanceReveal, {
    code,
    hostToken: "host-browser-token",
  });
  const resultsRoom = await t.query(api.rooms.get, {
    code,
    playerToken: "host-browser-token",
  });
  expect(resultsRoom?.results?.standings.map((standing) => standing.name)).toEqual([
    "Dastan",
    "Masha",
  ]);
});

test("the room advances when the shared deadline expires", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-08T00:00:00Z"));
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 15,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  await t.mutation(api.rooms.setReady, {
    code,
    playerToken: "host-browser-token",
    ready: true,
  });
  await t.mutation(api.rooms.setReady, {
    code,
    playerToken: "friend-browser-token",
    ready: true,
  });
  await t.mutation(api.rooms.startRound, {
    code,
    hostToken: "host-browser-token",
  });

  vi.advanceTimersByTime(15_001);
  await t.finishInProgressScheduledFunctions();

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "host-browser-token",
  });

  expect(room?.status).toBe("reveal");
});

test("a player can save private answers during the round", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  for (const playerToken of ["host-browser-token", "friend-browser-token"]) {
    await t.mutation(api.rooms.setReady, {
      code,
      playerToken,
      ready: true,
    });
  }
  await t.mutation(api.rooms.startRound, {
    code,
    hostToken: "host-browser-token",
  });

  await t.mutation(api.rooms.saveAnswer, {
    code,
    playerToken: "friend-browser-token",
    categoryIndex: 0,
    value: "The Matrix",
  });

  const friendRoom = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });
  const hostRoom = await t.query(api.rooms.get, {
    code,
    playerToken: "host-browser-token",
  });

  expect(friendRoom?.viewerAnswers).toEqual(["The Matrix", ""]);
  expect(hostRoom?.viewerAnswers).toEqual(["", ""]);
});

test("answers cannot be changed after the shared deadline", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-08T00:00:00Z"));
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 15,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  for (const playerToken of ["host-browser-token", "friend-browser-token"]) {
    await t.mutation(api.rooms.setReady, {
      code,
      playerToken,
      ready: true,
    });
  }
  await t.mutation(api.rooms.startRound, {
    code,
    hostToken: "host-browser-token",
  });

  vi.advanceTimersByTime(15_001);

  await expect(
    t.mutation(api.rooms.saveAnswer, {
      code,
      playerToken: "friend-browser-token",
      categoryIndex: 0,
      value: "Too late",
    }),
  ).rejects.toThrow("This round is closed.");
});

test("locked answers are revealed one shared category at a time", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  for (const playerToken of ["host-browser-token", "friend-browser-token"]) {
    await t.mutation(api.rooms.setReady, { code, playerToken, ready: true });
  }
  await t.mutation(api.rooms.startRound, {
    code,
    hostToken: "host-browser-token",
  });
  await t.mutation(api.rooms.saveAnswer, {
    code,
    playerToken: "host-browser-token",
    categoryIndex: 0,
    value: "The Matrix",
  });
  await t.mutation(api.rooms.saveAnswer, {
    code,
    playerToken: "friend-browser-token",
    categoryIndex: 0,
    value: "Titanic",
  });

  await t.run(async (ctx) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();
    await ctx.db.patch(room._id, { status: "reveal", revealIndex: 0 });
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });

  expect(room?.reveal).toEqual({
    categoryIndex: 0,
    category: "Movie",
    answers: [
      {
        playerId: room?.players[0].id,
        name: "Dastan",
        value: "The Matrix",
        score: 1,
      },
      {
        playerId: room?.players[1].id,
        name: "Masha",
        value: "Titanic",
        score: 1,
      },
    ],
  });
});

test("only the host advances the shared reveal category", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  await t.run(async (ctx) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();
    await ctx.db.patch(room._id, {
      status: "reveal",
      roundNumber: 1,
      revealIndex: 0,
    });
  });

  await expect(
    t.mutation(api.rooms.advanceReveal, {
      code,
      hostToken: "friend-browser-token",
    }),
  ).rejects.toThrow("Only the host can advance the reveal.");

  await t.mutation(api.rooms.advanceReveal, {
    code,
    hostToken: "host-browser-token",
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "friend-browser-token",
  });
  expect(room?.reveal).toMatchObject({
    categoryIndex: 1,
    category: "Song",
  });
});

test("finishing the reveal scores non-empty answers and awards all tied winners", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  for (const playerToken of ["host-browser-token", "friend-browser-token"]) {
    await t.mutation(api.rooms.setReady, { code, playerToken, ready: true });
  }
  await t.mutation(api.rooms.startRound, {
    code,
    hostToken: "host-browser-token",
  });
  await t.mutation(api.rooms.saveAnswer, {
    code,
    playerToken: "host-browser-token",
    categoryIndex: 0,
    value: "The Matrix",
  });
  await t.mutation(api.rooms.saveAnswer, {
    code,
    playerToken: "friend-browser-token",
    categoryIndex: 1,
    value: "Thriller",
  });
  await t.run(async (ctx) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();
    await ctx.db.patch(room._id, { status: "reveal", revealIndex: 1 });
  });

  await t.mutation(api.rooms.advanceReveal, {
    code,
    hostToken: "host-browser-token",
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "host-browser-token",
  });

  expect(room?.status).toBe("results");
  expect(room?.results).toEqual({
    winners: [
      { playerId: room?.players[0].id, name: "Dastan" },
      { playerId: room?.players[1].id, name: "Masha" },
    ],
    standings: [
      {
        playerId: room?.players[0].id,
        name: "Dastan",
        roundScore: 1,
        points: 1,
        isWinner: true,
      },
      {
        playerId: room?.players[1].id,
        name: "Masha",
        roundScore: 1,
        points: 1,
        isWinner: true,
      },
    ],
  });
});

test("the host can return everyone to the lobby while preserving points", async () => {
  const t = convexTest(schema, modules);
  const { code } = await t.mutation(api.rooms.create, {
    hostToken: "host-browser-token",
    hostName: "Dastan",
    language: "English",
    categories: ["Movie", "Song"],
    durationSeconds: 60,
  });
  await t.mutation(api.rooms.join, {
    code,
    playerToken: "friend-browser-token",
    playerName: "Masha",
  });
  await t.run(async (ctx) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (queryBuilder) => queryBuilder.eq("roomId", room._id))
      .collect();
    await ctx.db.patch(room._id, { status: "results", roundNumber: 1 });
    for (const player of players) {
      await ctx.db.patch(player._id, { ready: true, points: 1 });
    }
  });

  await t.mutation(api.rooms.returnToLobby, {
    code,
    hostToken: "host-browser-token",
  });

  const room = await t.query(api.rooms.get, {
    code,
    playerToken: "host-browser-token",
  });

  expect(room?.status).toBe("lobby");
  expect(room?.players).toMatchObject([
    { name: "Dastan", ready: false, points: 1 },
    { name: "Masha", ready: false, points: 1 },
  ]);
});
