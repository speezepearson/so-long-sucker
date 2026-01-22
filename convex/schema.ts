import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const playerColors = ["red", "blue", "green", "yellow"] as const;
export type PlayerColor = (typeof playerColors)[number];

export default defineSchema({
  numbers: defineTable({
    value: v.number(),
  }),

  games: defineTable({
    code: v.string(),
    status: v.union(
      v.literal("waiting"),
      v.literal("playing"),
      v.literal("finished")
    ),
    startingChips: v.number(),
    createdAt: v.number(),
    currentPlayerId: v.optional(v.id("players")),
    turnGiverId: v.optional(v.id("players")),
    winnerId: v.optional(v.id("players")),
  }).index("by_code", ["code"]),

  players: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    color: v.string(),
    sessionId: v.string(),
    isDefeated: v.boolean(),
    chips: v.object({
      red: v.number(),
      blue: v.number(),
      green: v.number(),
      yellow: v.number(),
    }),
    joinOrder: v.number(),
    handicap: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_and_session", ["gameId", "sessionId"]),

  piles: defineTable({
    gameId: v.id("games"),
    chips: v.array(v.string()),
    order: v.number(),
  }).index("by_game", ["gameId"]),

  gameLogs: defineTable({
    gameId: v.id("games"),
    message: v.string(),
    timestamp: v.number(),
  }).index("by_game", ["gameId"]),
});
