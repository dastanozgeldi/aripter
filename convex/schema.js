import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    status: v.union(
      v.literal("lobby"),
      v.literal("playing"),
      v.literal("reveal"),
      v.literal("results"),
    ),
    language: v.string(),
    categories: v.array(v.string()),
    durationSeconds: v.number(),
    hostToken: v.string(),
    roundNumber: v.optional(v.number()),
    letter: v.optional(v.string()),
    letterHistory: v.optional(v.array(v.string())),
    roundEndsAt: v.optional(v.number()),
    skipVoteRoundNumber: v.optional(v.number()),
    skipVotes: v.optional(
      v.array(
        v.object({
          playerId: v.id("players"),
          skip: v.boolean(),
        }),
      ),
    ),
    revealIndex: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_expires_at", ["expiresAt"]),

  players: defineTable({
    roomId: v.id("rooms"),
    token: v.string(),
    name: v.string(),
    isHost: v.boolean(),
    ready: v.boolean(),
    points: v.optional(v.number()),
    online: v.optional(v.boolean()),
    lastSeenAt: v.optional(v.number()),
    activeRoundNumber: v.optional(v.number()),
  })
    .index("by_room", ["roomId"])
    .index("by_room_and_token", ["roomId", "token"]),

  answers: defineTable({
    roomId: v.id("rooms"),
    roundNumber: v.number(),
    playerId: v.id("players"),
    categoryIndex: v.number(),
    value: v.string(),
  }).index("by_room_round_player_category", [
    "roomId",
    "roundNumber",
    "playerId",
    "categoryIndex",
  ]),

  votes: defineTable({
    roomId: v.id("rooms"),
    roundNumber: v.number(),
    categoryIndex: v.number(),
    answerPlayerId: v.id("players"),
    voterPlayerId: v.id("players"),
    approved: v.boolean(),
  }).index("by_room_round_category_answer_voter", [
    "roomId",
    "roundNumber",
    "categoryIndex",
    "answerPlayerId",
    "voterPlayerId",
  ]),
});
