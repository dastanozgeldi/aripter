import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

function normalizeName(name) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || normalized.length > 24) {
    throw new ConvexError("Name must be between 1 and 24 characters.");
  }
  return normalized;
}

function normalizeCategories(categories) {
  const normalized = categories.map((category) => category.trim()).filter(Boolean);
  if (normalized.length < 2 || normalized.length > 8) {
    throw new ConvexError("Choose between 2 and 8 categories.");
  }
  return normalized;
}

async function createUniqueCode(ctx) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = "";
    for (let index = 0; index < CODE_LENGTH; index += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }

    const existingRoom = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();

    if (!existingRoom) return code;
  }

  throw new ConvexError("Could not create a unique room code.");
}

export const create = mutation({
  args: {
    hostToken: v.string(),
    hostName: v.string(),
    language: v.string(),
    categories: v.array(v.string()),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    if (!args.hostToken) throw new ConvexError("Missing browser identity.");
    if (![15, 60, 120].includes(args.durationSeconds)) {
      throw new ConvexError("Unsupported round duration.");
    }

    const code = await createUniqueCode(ctx);
    const roomId = await ctx.db.insert("rooms", {
      code,
      status: "lobby",
      language: args.language,
      categories: normalizeCategories(args.categories),
      durationSeconds: args.durationSeconds,
      hostToken: args.hostToken,
    });

    await ctx.db.insert("players", {
      roomId,
      token: args.hostToken,
      name: normalizeName(args.hostName),
      isHost: true,
      ready: false,
    });

    return { code };
  },
});

export const join = mutation({
  args: {
    code: v.string(),
    playerToken: v.string(),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.playerToken) throw new ConvexError("Missing browser identity.");

    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();

    if (!room) throw new ConvexError("Room not found.");
    if (room.status !== "lobby") {
      throw new ConvexError("This room has already started.");
    }

    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_room_and_token", (queryBuilder) =>
        queryBuilder.eq("roomId", room._id).eq("token", args.playerToken),
      )
      .unique();

    if (existingPlayer) {
      await ctx.db.patch(existingPlayer._id, {
        name: normalizeName(args.playerName),
      });
      return { code: room.code };
    }

    await ctx.db.insert("players", {
      roomId: room._id,
      token: args.playerToken,
      name: normalizeName(args.playerName),
      isHost: false,
      ready: false,
    });

    return { code: room.code };
  },
});

export const setReady = mutation({
  args: {
    code: v.string(),
    playerToken: v.string(),
    ready: v.boolean(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();

    if (!room) throw new ConvexError("Room not found.");
    if (room.status !== "lobby") {
      throw new ConvexError("Ready state is locked after the game starts.");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_room_and_token", (queryBuilder) =>
        queryBuilder.eq("roomId", room._id).eq("token", args.playerToken),
      )
      .unique();

    if (!player) throw new ConvexError("Join the room before marking ready.");

    await ctx.db.patch(player._id, { ready: args.ready });
  },
});

export const get = query({
  args: {
    code: v.string(),
    playerToken: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();

    if (!room) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (queryBuilder) => queryBuilder.eq("roomId", room._id))
      .collect();

    const publicPlayers = players
      .sort((first, second) => first._creationTime - second._creationTime)
      .map((player) => ({
        id: player._id,
        name: player.name,
        isHost: player.isHost,
        ready: player.ready,
      }));
    const viewer = players.find((player) => player.token === args.playerToken);

    return {
      code: room.code,
      status: room.status,
      language: room.language,
      categories: room.categories,
      durationSeconds: room.durationSeconds,
      players: publicPlayers,
      viewer: viewer
        ? {
            id: viewer._id,
            name: viewer.name,
            isHost: viewer.isHost,
            ready: viewer.ready,
          }
        : null,
    };
  },
});
