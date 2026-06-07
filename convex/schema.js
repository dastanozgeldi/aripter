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
  }).index("by_code", ["code"]),

  players: defineTable({
    roomId: v.id("rooms"),
    token: v.string(),
    name: v.string(),
    isHost: v.boolean(),
    ready: v.boolean(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_and_token", ["roomId", "token"]),
});
