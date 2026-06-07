import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;
const LETTERS_BY_LANGUAGE = {
  Russian: ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К", "Л", "М", "Н", "О", "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Э", "Ю", "Я"],
  English: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  Japanese: ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"],
};

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

export const startRound = mutation({
  args: {
    code: v.string(),
    hostToken: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();

    if (!room) throw new ConvexError("Room not found.");
    if (room.hostToken !== args.hostToken) {
      throw new ConvexError("Only the host can start the round.");
    }
    if (room.status !== "lobby") {
      throw new ConvexError("This room is not waiting to start.");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (queryBuilder) => queryBuilder.eq("roomId", room._id))
      .collect();

    if (players.length < 2) {
      throw new ConvexError("At least two players are required.");
    }
    if (players.some((player) => !player.ready)) {
      throw new ConvexError("Every player must be ready.");
    }

    const letters = LETTERS_BY_LANGUAGE[room.language];
    if (!letters) throw new ConvexError("Unsupported room language.");

    const roundNumber = (room.roundNumber ?? 0) + 1;
    const letter = letters[Math.floor(Math.random() * letters.length)];
    const roundEndsAt = Date.now() + room.durationSeconds * 1000;

    await ctx.db.patch(room._id, {
      status: "playing",
      roundNumber,
      letter,
      roundEndsAt,
    });
    await ctx.scheduler.runAt(roundEndsAt, internal.rooms.finishRound, {
      roomId: room._id,
      roundNumber,
    });

    return { letter, roundEndsAt, roundNumber };
  },
});

export const finishRound = internalMutation({
  args: {
    roomId: v.id("rooms"),
    roundNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get("rooms", args.roomId);
    if (
      !room ||
      room.status !== "playing" ||
      room.roundNumber !== args.roundNumber
    ) {
      return;
    }

    await ctx.db.patch(room._id, { status: "reveal", revealIndex: 0 });
  },
});

export const saveAnswer = mutation({
  args: {
    code: v.string(),
    playerToken: v.string(),
    categoryIndex: v.number(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();

    if (!room) throw new ConvexError("Room not found.");
    if (
      room.status !== "playing" ||
      !room.roundEndsAt ||
      Date.now() >= room.roundEndsAt
    ) {
      throw new ConvexError("This round is closed.");
    }
    if (
      !Number.isInteger(args.categoryIndex) ||
      args.categoryIndex < 0 ||
      args.categoryIndex >= room.categories.length
    ) {
      throw new ConvexError("Unknown category.");
    }
    if (args.value.length > 120) {
      throw new ConvexError("Answers must be 120 characters or fewer.");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_room_and_token", (queryBuilder) =>
        queryBuilder.eq("roomId", room._id).eq("token", args.playerToken),
      )
      .unique();
    if (!player) throw new ConvexError("Join the room before answering.");

    const roundNumber = room.roundNumber ?? 0;
    const existingAnswer = await ctx.db
      .query("answers")
      .withIndex("by_room_round_player_category", (queryBuilder) =>
        queryBuilder
          .eq("roomId", room._id)
          .eq("roundNumber", roundNumber)
          .eq("playerId", player._id)
          .eq("categoryIndex", args.categoryIndex),
      )
      .unique();

    if (existingAnswer) {
      await ctx.db.patch(existingAnswer._id, { value: args.value });
    } else {
      await ctx.db.insert("answers", {
        roomId: room._id,
        roundNumber,
        playerId: player._id,
        categoryIndex: args.categoryIndex,
        value: args.value,
      });
    }
  },
});

export const advanceReveal = mutation({
  args: {
    code: v.string(),
    hostToken: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();

    if (!room) throw new ConvexError("Room not found.");
    if (room.hostToken !== args.hostToken) {
      throw new ConvexError("Only the host can advance the reveal.");
    }
    if (room.status !== "reveal") {
      throw new ConvexError("This room is not revealing answers.");
    }

    const revealIndex = room.revealIndex ?? 0;
    if (revealIndex >= room.categories.length - 1) {
      const players = await ctx.db
        .query("players")
        .withIndex("by_room", (queryBuilder) =>
          queryBuilder.eq("roomId", room._id),
        )
        .collect();
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_room_round_player_category", (queryBuilder) =>
          queryBuilder
            .eq("roomId", room._id)
            .eq("roundNumber", room.roundNumber ?? 0),
        )
        .collect();
      const scores = new Map(
        players.map((player) => [
          player._id,
          answers.filter(
            (answer) =>
              answer.playerId === player._id && answer.value.trim().length > 0,
          ).length,
        ]),
      );
      const maxScore = Math.max(...scores.values());

      for (const player of players) {
        if (scores.get(player._id) === maxScore) {
          await ctx.db.patch(player._id, {
            points: (player.points ?? 0) + 1,
          });
        }
      }

      await ctx.db.patch(room._id, { status: "results" });
      return;
    }

    await ctx.db.patch(room._id, { revealIndex: revealIndex + 1 });
  },
});

export const returnToLobby = mutation({
  args: {
    code: v.string(),
    hostToken: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();

    if (!room) throw new ConvexError("Room not found.");
    if (room.hostToken !== args.hostToken) {
      throw new ConvexError("Only the host can start another round.");
    }
    if (room.status !== "results") {
      throw new ConvexError("This round is not finished.");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (queryBuilder) => queryBuilder.eq("roomId", room._id))
      .collect();

    for (const player of players) {
      await ctx.db.patch(player._id, { ready: false });
    }
    await ctx.db.patch(room._id, { status: "lobby" });
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

    const orderedPlayers = players.sort(
      (first, second) => first._creationTime - second._creationTime,
    );
    const publicPlayers = orderedPlayers.map((player) => ({
      id: player._id,
      name: player.name,
      isHost: player.isHost,
      ready: player.ready,
      points: player.points ?? 0,
    }));
    const viewer = players.find((player) => player.token === args.playerToken);
    const viewerAnswers = Array.from(
      { length: room.categories.length },
      () => "",
    );

    if (viewer && room.roundNumber) {
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_room_round_player_category", (queryBuilder) =>
          queryBuilder
            .eq("roomId", room._id)
            .eq("roundNumber", room.roundNumber)
            .eq("playerId", viewer._id),
        )
        .collect();

      for (const answer of answers) {
        viewerAnswers[answer.categoryIndex] = answer.value;
      }
    }

    let reveal = null;
    if (room.status === "reveal" && room.roundNumber) {
      const categoryIndex = room.revealIndex ?? 0;
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_room_round_player_category", (queryBuilder) =>
          queryBuilder
            .eq("roomId", room._id)
            .eq("roundNumber", room.roundNumber),
        )
        .collect();

      reveal = {
        categoryIndex,
        category: room.categories[categoryIndex],
        answers: orderedPlayers.map((player) => {
          const answer = answers.find(
            (candidate) =>
              candidate.playerId === player._id &&
              candidate.categoryIndex === categoryIndex,
          );
          const value = answer?.value ?? "";
          return {
            playerId: player._id,
            name: player.name,
            value,
            score: value.trim() ? 1 : 0,
          };
        }),
      };
    }

    let results = null;
    if (room.status === "results" && room.roundNumber) {
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_room_round_player_category", (queryBuilder) =>
          queryBuilder
            .eq("roomId", room._id)
            .eq("roundNumber", room.roundNumber),
        )
        .collect();
      const standings = orderedPlayers.map((player) => ({
        playerId: player._id,
        name: player.name,
        roundScore: answers.filter(
          (answer) =>
            answer.playerId === player._id && answer.value.trim().length > 0,
        ).length,
        points: player.points ?? 0,
      }));
      const maxScore = Math.max(
        ...standings.map((standing) => standing.roundScore),
      );

      results = {
        winners: standings
          .filter((standing) => standing.roundScore === maxScore)
          .map((standing) => ({
            playerId: standing.playerId,
            name: standing.name,
          })),
        standings: standings
          .map((standing) => ({
            ...standing,
            isWinner: standing.roundScore === maxScore,
          }))
          .sort((first, second) => second.roundScore - first.roundScore),
      };
    }

    return {
      code: room.code,
      status: room.status,
      language: room.language,
      categories: room.categories,
      durationSeconds: room.durationSeconds,
      roundNumber: room.roundNumber ?? 0,
      letter: room.letter ?? null,
      roundEndsAt: room.roundEndsAt ?? null,
      revealIndex: room.revealIndex ?? 0,
      viewerAnswers,
      reveal,
      results,
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
