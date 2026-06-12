import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;
const PRESENCE_TIMEOUT_MS = 30_000;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const LETTERS_BY_LANGUAGE = {
  Russian: ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К", "Л", "М", "Н", "О", "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Э", "Ю", "Я"],
  Kazakh: ["А", "Ә", "Б", "В", "Г", "Ғ", "Д", "Е", "Ж", "З", "И", "К", "Қ", "Л", "М", "Н", "О", "Ө", "П", "Р", "С", "Т", "У", "Ұ", "Ү", "Ф", "Х", "Һ", "Ц", "Ч", "Ш", "Ы", "І", "Э", "Ю", "Я"],
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

async function schedulePresenceTimeout(ctx, playerId, lastSeenAt) {
  await ctx.scheduler.runAt(
    lastSeenAt + PRESENCE_TIMEOUT_MS,
    internal.rooms.markPlayerOffline,
    { playerId, lastSeenAt },
  );
}

async function deleteRoomData(ctx, roomId) {
  const answers = await ctx.db
    .query("answers")
    .withIndex("by_room_round_player_category", (queryBuilder) =>
      queryBuilder.eq("roomId", roomId),
    )
    .collect();
  const players = await ctx.db
    .query("players")
    .withIndex("by_room", (queryBuilder) => queryBuilder.eq("roomId", roomId))
    .collect();
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_room_round_category_answer_voter", (queryBuilder) =>
      queryBuilder.eq("roomId", roomId),
    )
    .collect();

  for (const answer of answers) await ctx.db.delete(answer._id);
  for (const vote of votes) await ctx.db.delete(vote._id);
  for (const player of players) await ctx.db.delete(player._id);
  await ctx.db.delete(roomId);
}

function getRoundPlayers(players, roundNumber) {
  const participants = players.filter(
    (player) => player.activeRoundNumber === roundNumber,
  );
  return participants.length > 0 ? participants : players;
}

function isAnswerVotingComplete(players, answer, votes) {
  const connectedPlayers = players.filter((player) => player.online !== false);
  return connectedPlayers
    .filter((player) => player._id !== answer.playerId)
    .every((player) =>
      votes.some(
        (vote) =>
          vote.answerPlayerId === answer.playerId &&
          vote.voterPlayerId === player._id,
      ),
    );
}

function isVotingComplete(players, answers, votes) {
  return answers
    .filter((answer) => answer.value.trim())
    .every((answer) => isAnswerVotingComplete(players, answer, votes));
}

function isAnswerApproved(answer, votes, playerCount) {
  if (!answer.value.trim()) return false;
  const approvals =
    1 +
    votes.filter(
      (vote) =>
        vote.answerPlayerId === answer.playerId &&
        vote.categoryIndex === answer.categoryIndex &&
        vote.approved,
    ).length;
  return approvals >= Math.floor(playerCount / 2) + 1;
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
    const expiresAt = Date.now() + ROOM_TTL_MS;
    const roomId = await ctx.db.insert("rooms", {
      code,
      status: "lobby",
      language: args.language,
      categories: normalizeCategories(args.categories),
      durationSeconds: args.durationSeconds,
      hostToken: args.hostToken,
      expiresAt,
    });

    const lastSeenAt = Date.now();
    const playerId = await ctx.db.insert("players", {
      roomId,
      token: args.hostToken,
      name: normalizeName(args.hostName),
      isHost: true,
      ready: false,
      online: true,
      lastSeenAt,
    });
    await schedulePresenceTimeout(ctx, playerId, lastSeenAt);
    await ctx.scheduler.runAt(expiresAt, internal.rooms.expireRoom, {
      roomId,
      expiresAt,
    });

    return { code };
  },
});

export const expireRoom = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get("rooms", args.roomId);
    if (!room || room.expiresAt !== args.expiresAt) return;
    await deleteRoomData(ctx, room._id);
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
      const lastSeenAt = Date.now();
      await ctx.db.patch(existingPlayer._id, {
        name: normalizeName(args.playerName),
        online: true,
        lastSeenAt,
      });
      await schedulePresenceTimeout(ctx, existingPlayer._id, lastSeenAt);
      return { code: room.code };
    }

    const lastSeenAt = Date.now();
    const playerId = await ctx.db.insert("players", {
      roomId: room._id,
      token: args.playerToken,
      name: normalizeName(args.playerName),
      isHost: false,
      ready: false,
      online: true,
      lastSeenAt,
    });
    await schedulePresenceTimeout(ctx, playerId, lastSeenAt);

    return { code: room.code };
  },
});

export const heartbeat = mutation({
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
    if (!room) throw new ConvexError("Room not found.");

    const player = await ctx.db
      .query("players")
      .withIndex("by_room_and_token", (queryBuilder) =>
        queryBuilder.eq("roomId", room._id).eq("token", args.playerToken),
      )
      .unique();
    if (!player) throw new ConvexError("Join the room before reconnecting.");

    const lastSeenAt = Date.now();
    await ctx.db.patch(player._id, { online: true, lastSeenAt });
    await schedulePresenceTimeout(ctx, player._id, lastSeenAt);

    if (room.hostToken !== player.token) {
      const currentHost = await ctx.db
        .query("players")
        .withIndex("by_room_and_token", (queryBuilder) =>
          queryBuilder.eq("roomId", room._id).eq("token", room.hostToken),
        )
        .unique();
      if (!currentHost || currentHost.online === false) {
        if (currentHost) {
          await ctx.db.patch(currentHost._id, { isHost: false });
        }
        await ctx.db.patch(player._id, { isHost: true });
        await ctx.db.patch(room._id, { hostToken: player.token });
      }
    }
  },
});

export const markPlayerOffline = internalMutation({
  args: {
    playerId: v.id("players"),
    lastSeenAt: v.number(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get("players", args.playerId);
    if (!player || player.lastSeenAt !== args.lastSeenAt) return;

    await ctx.db.patch(player._id, { online: false });
    if (!player.isHost) return;

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (queryBuilder) =>
        queryBuilder.eq("roomId", player.roomId),
      )
      .collect();
    const nextHost = players
      .filter((candidate) => candidate._id !== player._id && candidate.online)
      .sort((first, second) => first._creationTime - second._creationTime)[0];
    if (!nextHost) return;

    await ctx.db.patch(player._id, { isHost: false });
    await ctx.db.patch(nextHost._id, { isHost: true });
    await ctx.db.patch(player.roomId, { hostToken: nextHost.token });
  },
});

export const leave = mutation({
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
    if (!room) return;

    const player = await ctx.db
      .query("players")
      .withIndex("by_room_and_token", (queryBuilder) =>
        queryBuilder.eq("roomId", room._id).eq("token", args.playerToken),
      )
      .unique();
    if (!player) return;

    const answers = await ctx.db
      .query("answers")
      .withIndex("by_room_round_player_category", (queryBuilder) =>
        queryBuilder.eq("roomId", room._id),
      )
      .collect();
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_room_round_category_answer_voter", (queryBuilder) =>
        queryBuilder.eq("roomId", room._id),
      )
      .collect();
    for (const answer of answers) {
      if (answer.playerId === player._id) await ctx.db.delete(answer._id);
    }
    for (const vote of votes) {
      if (
        vote.answerPlayerId === player._id ||
        vote.voterPlayerId === player._id
      ) {
        await ctx.db.delete(vote._id);
      }
    }
    await ctx.db.delete(player._id);

    const remainingPlayers = await ctx.db
      .query("players")
      .withIndex("by_room", (queryBuilder) =>
        queryBuilder.eq("roomId", room._id),
      )
      .collect();
    if (remainingPlayers.length === 0) {
      await deleteRoomData(ctx, room._id);
      return;
    }
    if (!player.isHost) return;

    const orderedPlayers = remainingPlayers.sort(
      (first, second) => first._creationTime - second._creationTime,
    );
    const nextHost =
      orderedPlayers.find((candidate) => candidate.online) ?? orderedPlayers[0];
    await ctx.db.patch(nextHost._id, { isHost: true });
    await ctx.db.patch(room._id, { hostToken: nextHost.token });
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
    const connectedPlayers = players.filter((player) => player.online !== false);

    if (connectedPlayers.length < 2) {
      throw new ConvexError("At least two players are required.");
    }
    if (connectedPlayers.some((player) => !player.ready)) {
      throw new ConvexError("Every player must be ready.");
    }

    const letters = LETTERS_BY_LANGUAGE[room.language];
    if (!letters) throw new ConvexError("Unsupported room language.");

    const roundNumber = (room.roundNumber ?? 0) + 1;
    const letter = letters[Math.floor(Math.random() * letters.length)];
    const roundEndsAt = Date.now() + room.durationSeconds * 1000;

    for (const player of connectedPlayers) {
      await ctx.db.patch(player._id, { activeRoundNumber: roundNumber });
    }
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
    if (player.activeRoundNumber !== roundNumber) {
      const players = await ctx.db
        .query("players")
        .withIndex("by_room", (queryBuilder) =>
          queryBuilder.eq("roomId", room._id),
        )
        .collect();
      if (
        players.some(
          (candidate) => candidate.activeRoundNumber === roundNumber,
        )
      ) {
        throw new ConvexError("You are not playing in this round.");
      }
    }
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
    const storedPlayers = await ctx.db
      .query("players")
      .withIndex("by_room", (queryBuilder) => queryBuilder.eq("roomId", room._id))
      .collect();
    const roundPlayers = getRoundPlayers(
      storedPlayers,
      room.roundNumber ?? 0,
    );
    const roundAnswers = await ctx.db
      .query("answers")
      .withIndex("by_room_round_player_category", (queryBuilder) =>
        queryBuilder
          .eq("roomId", room._id)
          .eq("roundNumber", room.roundNumber ?? 0),
      )
      .collect();
    const categoryAnswers = roundAnswers.filter(
      (answer) => answer.categoryIndex === revealIndex,
    );
    const categoryVotes = await ctx.db
      .query("votes")
      .withIndex("by_room_round_category_answer_voter", (queryBuilder) =>
        queryBuilder
          .eq("roomId", room._id)
          .eq("roundNumber", room.roundNumber ?? 0)
          .eq("categoryIndex", revealIndex),
      )
      .collect();
    if (!isVotingComplete(roundPlayers, categoryAnswers, categoryVotes)) {
      throw new ConvexError("Waiting for every connected player to vote.");
    }

    if (revealIndex >= room.categories.length - 1) {
      const players = roundPlayers;
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_room_round_player_category", (queryBuilder) =>
          queryBuilder
            .eq("roomId", room._id)
            .eq("roundNumber", room.roundNumber ?? 0),
        )
        .collect();
      const votes = await ctx.db
        .query("votes")
        .withIndex("by_room_round_category_answer_voter", (queryBuilder) =>
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
              answer.playerId === player._id &&
              isAnswerApproved(answer, votes, players.length),
          ).length,
        ]),
      );
      const maxScore = Math.max(...scores.values());

      if (maxScore > 0) {
        for (const player of players) {
          if (scores.get(player._id) === maxScore) {
            await ctx.db.patch(player._id, {
              points: (player.points ?? 0) + 1,
            });
          }
        }
      }

      await ctx.db.patch(room._id, { status: "results" });
      return;
    }

    await ctx.db.patch(room._id, { revealIndex: revealIndex + 1 });
  },
});

export const voteAnswer = mutation({
  args: {
    code: v.string(),
    playerToken: v.string(),
    answerPlayerId: v.id("players"),
    approved: v.boolean(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", code))
      .unique();
    if (!room) throw new ConvexError("Room not found.");
    if (room.status !== "reveal" || !room.roundNumber) {
      throw new ConvexError("Voting is only open during the reveal.");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (queryBuilder) => queryBuilder.eq("roomId", room._id))
      .collect();
    const roundPlayers = getRoundPlayers(players, room.roundNumber);
    const voter = roundPlayers.find(
      (player) => player.token === args.playerToken,
    );
    const answerPlayer = roundPlayers.find(
      (player) => player._id === args.answerPlayerId,
    );
    if (!voter) throw new ConvexError("You are not voting in this round.");
    if (!answerPlayer) throw new ConvexError("Unknown answer.");
    if (voter._id === answerPlayer._id) {
      throw new ConvexError("Your own answer already has your approval.");
    }

    const categoryIndex = room.revealIndex ?? 0;
    const answer = await ctx.db
      .query("answers")
      .withIndex("by_room_round_player_category", (queryBuilder) =>
        queryBuilder
          .eq("roomId", room._id)
          .eq("roundNumber", room.roundNumber)
          .eq("playerId", answerPlayer._id)
          .eq("categoryIndex", categoryIndex),
      )
      .unique();
    if (!answer?.value.trim()) {
      throw new ConvexError("There is no answer to vote on.");
    }

    const existingVote = await ctx.db
      .query("votes")
      .withIndex("by_room_round_category_answer_voter", (queryBuilder) =>
        queryBuilder
          .eq("roomId", room._id)
          .eq("roundNumber", room.roundNumber)
          .eq("categoryIndex", categoryIndex)
          .eq("answerPlayerId", answerPlayer._id)
          .eq("voterPlayerId", voter._id),
      )
      .unique();
    if (existingVote) {
      await ctx.db.patch(existingVote._id, { approved: args.approved });
      return;
    }

    await ctx.db.insert("votes", {
      roomId: room._id,
      roundNumber: room.roundNumber,
      categoryIndex,
      answerPlayerId: answerPlayer._id,
      voterPlayerId: voter._id,
      approved: args.approved,
    });
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
    const roundPlayers = getRoundPlayers(
      orderedPlayers,
      room.roundNumber ?? 0,
    );
    const publicPlayers = orderedPlayers.map((player) => ({
      id: player._id,
      name: player.name,
      isHost: player.isHost,
      ready: player.ready,
      points: player.points ?? 0,
      online: player.online ?? false,
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
      const votes = await ctx.db
        .query("votes")
        .withIndex("by_room_round_category_answer_voter", (queryBuilder) =>
          queryBuilder
            .eq("roomId", room._id)
            .eq("roundNumber", room.roundNumber)
            .eq("categoryIndex", categoryIndex),
        )
        .collect();
      const requiredApprovals = Math.floor(roundPlayers.length / 2) + 1;

      reveal = {
        categoryIndex,
        category: room.categories[categoryIndex],
        votingComplete: isVotingComplete(roundPlayers, answers, votes),
        answers: roundPlayers.map((player) => {
          const answer = answers.find(
            (candidate) =>
              candidate.playerId === player._id &&
              candidate.categoryIndex === categoryIndex,
          );
          const value = answer?.value ?? "";
          const answerVotes = votes.filter(
            (vote) => vote.answerPlayerId === player._id,
          );
          const approvals =
            (value.trim() ? 1 : 0) +
            answerVotes.filter((vote) => vote.approved).length;
          const approved =
            Boolean(value.trim()) && approvals >= requiredApprovals;
          const viewerVote =
            viewer?._id === player._id
              ? true
              : answerVotes.find(
                  (vote) => vote.voterPlayerId === viewer?._id,
                )?.approved ?? null;
          return {
            playerId: player._id,
            name: player.name,
            value,
            score: approved ? 1 : 0,
            approvals,
            rejections: answerVotes.filter((vote) => !vote.approved).length,
            requiredApprovals,
            approved,
            viewerVote,
            votingComplete: answer
              ? isAnswerVotingComplete(roundPlayers, answer, votes)
              : true,
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
      const votes = await ctx.db
        .query("votes")
        .withIndex("by_room_round_category_answer_voter", (queryBuilder) =>
          queryBuilder
            .eq("roomId", room._id)
            .eq("roundNumber", room.roundNumber),
        )
        .collect();
      const standings = roundPlayers.map((player) => ({
        playerId: player._id,
        name: player.name,
        roundScore: answers.filter(
          (answer) =>
            answer.playerId === player._id &&
            isAnswerApproved(answer, votes, roundPlayers.length),
        ).length,
        points: player.points ?? 0,
      }));
      const maxScore = Math.max(
        ...standings.map((standing) => standing.roundScore),
      );

      results = {
        winners: standings
          .filter(
            (standing) =>
              maxScore > 0 && standing.roundScore === maxScore,
          )
          .map((standing) => ({
            playerId: standing.playerId,
            name: standing.name,
          })),
        standings: standings
          .map((standing) => ({
            ...standing,
            isWinner:
              maxScore > 0 && standing.roundScore === maxScore,
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
            online: viewer.online ?? false,
          }
        : null,
    };
  },
});
