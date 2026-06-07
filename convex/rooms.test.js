/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

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
