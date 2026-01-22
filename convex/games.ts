import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { playerColors, type PlayerColor } from "./schema";

// Generate a random 4-letter code
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Letters only, avoid confusing I/O
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create a new game
export const createGame = mutation({
  args: {
    playerName: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate unique code
    let code: string;
    let existingGame;
    do {
      code = generateCode();
      existingGame = await ctx.db
        .query("games")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
    } while (existingGame);

    // Create the game
    const gameId = await ctx.db.insert("games", {
      code,
      status: "waiting",
      startingChips: 7,
      createdAt: Date.now(),
    });

    // Create the first player (creator)
    const playerId = await ctx.db.insert("players", {
      gameId,
      name: args.playerName,
      color: playerColors[0], // First player gets red
      sessionId: args.sessionId,
      isDefeated: false,
      chips: { red: 7, blue: 0, green: 0, yellow: 0 },
      joinOrder: 0,
      handicap: 0,
    });

    // Log
    await ctx.db.insert("gameLogs", {
      gameId,
      message: `${args.playerName} created the game`,
      timestamp: Date.now(),
    });

    return { gameId, playerId, code };
  },
});

// Join an existing game
export const joinGame = mutation({
  args: {
    code: v.string(),
    playerName: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.toUpperCase();

    // Find the game
    const game = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!game) {
      throw new Error("Game not found");
    }

    if (game.status !== "waiting") {
      throw new Error("Game has already started");
    }

    // Check if player already in game
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_game_and_session", (q) =>
        q.eq("gameId", game._id).eq("sessionId", args.sessionId)
      )
      .first();

    if (existingPlayer) {
      return { gameId: game._id, playerId: existingPlayer._id };
    }

    // Get current players
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    if (players.length >= 4) {
      throw new Error("Game is full");
    }

    // Assign first available color
    const takenColors = new Set(players.map((p) => p.color));
    const color = playerColors.find((c) => !takenColors.has(c));
    if (!color) {
      throw new Error("No available colors");
    }
    const initialChips = { red: 0, blue: 0, green: 0, yellow: 0 };
    initialChips[color] = game.startingChips ?? 7;

    // Create the player
    const playerId = await ctx.db.insert("players", {
      gameId: game._id,
      name: args.playerName,
      color,
      sessionId: args.sessionId,
      isDefeated: false,
      chips: initialChips,
      joinOrder: players.length,
      handicap: 0,
    });

    // Log
    await ctx.db.insert("gameLogs", {
      gameId: game._id,
      message: `${args.playerName} joined the game`,
      timestamp: Date.now(),
    });

    return { gameId: game._id, playerId };
  },
});

// Remove a player from the lobby (any player can remove any player)
export const removePlayer = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Game has already started");

    // Verify the session is a player in this game
    const requestingPlayer = await ctx.db
      .query("players")
      .withIndex("by_game_and_session", (q) =>
        q.eq("gameId", args.gameId).eq("sessionId", args.sessionId)
      )
      .first();
    if (!requestingPlayer) throw new Error("You are not in this game");

    // Get the player to remove
    const playerToRemove = await ctx.db.get(args.playerId);
    if (!playerToRemove || playerToRemove.gameId !== args.gameId) {
      throw new Error("Player not found");
    }

    // Delete the player
    await ctx.db.delete(args.playerId);

    // Log
    if (requestingPlayer._id === args.playerId) {
      await ctx.db.insert("gameLogs", {
        gameId: args.gameId,
        message: `${playerToRemove.name} left the game`,
        timestamp: Date.now(),
      });
    } else {
      await ctx.db.insert("gameLogs", {
        gameId: args.gameId,
        message: `${requestingPlayer.name} removed ${playerToRemove.name} from the game`,
        timestamp: Date.now(),
      });
    }

    return { success: true };
  },
});

// Start the game (2-4 players)
export const startGame = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Game already started");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    if (players.length < 3) {
      throw new Error("Need at least 3 players to start");
    }

    // Verify the session is a player in this game
    const isPlayer = players.some((p) => p.sessionId === args.sessionId);
    if (!isPlayer) throw new Error("You are not in this game");

    // Pick random starting player
    const startingPlayer = players[Math.floor(Math.random() * players.length)];

    await ctx.db.patch(args.gameId, {
      status: "playing",
      currentPlayerId: startingPlayer._id,
    });

    await ctx.db.insert("gameLogs", {
      gameId: args.gameId,
      message: `Game started! ${startingPlayer.name} goes first`,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Reset game to lobby (play again with same players)
export const resetGame = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    // Verify the session is a player in this game
    const isPlayer = players.some((p) => p.sessionId === args.sessionId);
    if (!isPlayer) throw new Error("You are not in this game");

    // Reset each player's chips to startingChips minus handicap
    const startingChips = game.startingChips ?? 7;
    for (const player of players) {
      const handicap = player.handicap ?? 0;
      const playerChips = Math.max(2, startingChips - handicap);
      const initialChips = { red: 0, blue: 0, green: 0, yellow: 0 };
      initialChips[player.color as PlayerColor] = playerChips;
      await ctx.db.patch(player._id, {
        chips: initialChips,
        isDefeated: false,
      });
    }

    // Delete all piles
    const piles = await ctx.db
      .query("piles")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const pile of piles) {
      await ctx.db.delete(pile._id);
    }

    // Reset game state
    await ctx.db.patch(args.gameId, {
      status: "waiting",
      currentPlayerId: undefined,
      turnGiverId: undefined,
      winnerId: undefined,
    });

    // Add log
    await ctx.db.insert("gameLogs", {
      gameId: args.gameId,
      message: "Game reset - waiting to start again",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Update starting chips (only in lobby)
export const updateStartingChips = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    startingChips: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Can only change in lobby");

    // Validate range
    const chips = Math.max(2, Math.min(10, Math.floor(args.startingChips)));

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    // Verify the session is a player in this game
    const isPlayer = players.some((p) => p.sessionId === args.sessionId);
    if (!isPlayer) throw new Error("You are not in this game");

    // Update game setting
    await ctx.db.patch(args.gameId, { startingChips: chips });

    // Update all current players' chips (applying handicaps)
    for (const player of players) {
      const handicap = player.handicap ?? 0;
      const playerChips = Math.max(2, chips - handicap);
      const initialChips = { red: 0, blue: 0, green: 0, yellow: 0 };
      initialChips[player.color as PlayerColor] = playerChips;
      await ctx.db.patch(player._id, { chips: initialChips });
    }

    return { success: true };
  },
});

// Update player handicap (only in lobby)
export const updateHandicap = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    sessionId: v.string(),
    handicap: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Can only change in lobby");

    const player = await ctx.db.get(args.playerId);
    if (!player || player.gameId !== args.gameId) throw new Error("Player not found");

    // Verify the session is a player in this game
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const isPlayer = players.some((p) => p.sessionId === args.sessionId);
    if (!isPlayer) throw new Error("You are not in this game");

    const startingChips = game.startingChips ?? 7;
    // Handicap can be 0 to startingChips-2 (must have at least 2 chips)
    const handicap = Math.max(0, Math.min(startingChips - 2, Math.floor(args.handicap)));

    // Update player handicap and chips
    const playerChips = Math.max(2, startingChips - handicap);
    const initialChips = { red: 0, blue: 0, green: 0, yellow: 0 };
    initialChips[player.color as PlayerColor] = playerChips;

    await ctx.db.patch(args.playerId, { handicap, chips: initialChips });

    return { success: true };
  },
});

// Get game state
export const getGame = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const piles = await ctx.db
      .query("piles")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const logs = await ctx.db
      .query("gameLogs")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .order("desc")
      .take(20);

    return {
      ...game,
      players: players.sort((a, b) => a.joinOrder - b.joinOrder),
      piles: piles.sort((a, b) => a.order - b.order),
      logs: logs.reverse(),
    };
  },
});

// Get game by code
export const getGameByCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.toUpperCase();
    return await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
  },
});

// Get player by session for a game
export const getPlayerBySession = query({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_game_and_session", (q) =>
        q.eq("gameId", args.gameId).eq("sessionId", args.sessionId)
      )
      .first();
  },
});

// Determine next player based on pile state
function determineNextPlayer(
  pile: PlayerColor[],
  players: Array<{ _id: string; color: PlayerColor; isDefeated: boolean }>,
  _currentPlayerId: string
): { nextPlayerId: string; eligiblePlayerIds: string[] } | null {
  // Get active (non-defeated) players
  const activePlayers = players.filter((p) => !p.isDefeated);
  if (activePlayers.length === 0) return null;

  // Find each player's highest position in pile (from top, index 0 = top)
  // Pile array is bottom to top, so we need to reverse for top-down
  const pileFromTop = [...pile].reverse();

  const playerPositions: Map<string, number> = new Map();
  for (const player of activePlayers) {
    const position = pileFromTop.findIndex((c) => c === player.color);
    if (position !== -1) {
      playerPositions.set(player._id, position);
    }
  }

  // Players NOT in the pile are eligible
  const eligiblePlayers = activePlayers.filter(
    (p) => !playerPositions.has(p._id)
  );

  if (eligiblePlayers.length === 1) {
    return {
      nextPlayerId: eligiblePlayers[0]._id,
      eligiblePlayerIds: [eligiblePlayers[0]._id],
    };
  } else if (eligiblePlayers.length > 1) {
    // Current player can choose - return eligible list
    return {
      nextPlayerId: "", // Will be chosen
      eligiblePlayerIds: eligiblePlayers.map((p) => p._id),
    };
  }

  // All players are in pile - use the elimination procedure
  // Go top-down, eliminating players until one remains
  let remainingPlayers = [...activePlayers];
  for (const chipColor of pileFromTop) {
    const playerWithColor = remainingPlayers.find((p) => p.color === chipColor);
    if (playerWithColor && remainingPlayers.length > 1) {
      remainingPlayers = remainingPlayers.filter(
        (p) => p._id !== playerWithColor._id
      );
    }
    if (remainingPlayers.length === 1) {
      return {
        nextPlayerId: remainingPlayers[0]._id,
        eligiblePlayerIds: [remainingPlayers[0]._id],
      };
    }
  }

  // If still multiple, current player chooses among remaining
  return {
    nextPlayerId: "",
    eligiblePlayerIds: remainingPlayers.map((p) => p._id),
  };
}

// Play a chip
export const playChip = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    chipColor: v.union(
      v.literal("red"),
      v.literal("blue"),
      v.literal("green"),
      v.literal("yellow")
    ),
    pileId: v.optional(v.id("piles")), // If undefined, start new pile
    nextPlayerId: v.optional(v.id("players")), // If player gets to choose
    removeChipColor: v.optional(v.union(
      v.literal("red"),
      v.literal("blue"),
      v.literal("green"),
      v.literal("yellow")
    )), // Which chip color to remove on capture
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");

    // Get current player
    const player = await ctx.db
      .query("players")
      .withIndex("by_game_and_session", (q) =>
        q.eq("gameId", args.gameId).eq("sessionId", args.sessionId)
      )
      .first();

    if (!player) throw new Error("You are not in this game");
    if (game.currentPlayerId !== player._id)
      throw new Error("It's not your turn");

    // Check player has the chip
    if (player.chips[args.chipColor] <= 0) {
      throw new Error(`You don't have any ${args.chipColor} chips`);
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    let pile: { _id: string; chips: PlayerColor[]; order: number } | null =
      null;

    if (args.pileId) {
      const pileDoc = await ctx.db.get(args.pileId);
      if (!pileDoc || pileDoc.gameId !== args.gameId) {
        throw new Error("Invalid pile");
      }
      pile = { _id: pileDoc._id, chips: pileDoc.chips as PlayerColor[], order: pileDoc.order };
    }

    // Remove chip from player's hand
    const newChips = { ...player.chips };
    newChips[args.chipColor]--;
    await ctx.db.patch(player._id, { chips: newChips });

    // Add chip to pile (or create new pile)
    let newPileChips: PlayerColor[];
    let pileIdToUpdate: string;

    if (pile) {
      newPileChips = [...pile.chips, args.chipColor];
      pileIdToUpdate = pile._id;
      await ctx.db.patch(pile._id as any, { chips: newPileChips });
    } else {
      // Create new pile
      const existingPiles = await ctx.db
        .query("piles")
        .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
        .collect();
      const newOrder =
        existingPiles.length > 0
          ? Math.max(...existingPiles.map((p) => p.order)) + 1
          : 0;
      pileIdToUpdate = await ctx.db.insert("piles", {
        gameId: args.gameId,
        chips: [args.chipColor],
        order: newOrder,
      });
      newPileChips = [args.chipColor];
    }

    // Check for capture (top two chips same color)
    const topChip = newPileChips[newPileChips.length - 1];
    const secondChip =
      newPileChips.length >= 2 ? newPileChips[newPileChips.length - 2] : null;

    if (secondChip && topChip === secondChip) {
      // Capture!
      const captureColor = topChip;
      const capturePlayer = players.find((p) => p.color === captureColor);

      if (capturePlayer && !capturePlayer.isDefeated) {
        // Give all chips to the capture player
        const capturedChips = { red: 0, blue: 0, green: 0, yellow: 0 };
        for (const chip of newPileChips) {
          capturedChips[chip]++;
        }

        // Remove one chip from the game - player chooses which color
        // If only one color in pile, auto-remove that color
        const colorsInPile = (Object.keys(capturedChips) as PlayerColor[]).filter(
          (c) => capturedChips[c] > 0
        );

        let colorToRemove: PlayerColor;
        if (colorsInPile.length === 1) {
          colorToRemove = colorsInPile[0];
        } else if (args.removeChipColor && capturedChips[args.removeChipColor] > 0) {
          colorToRemove = args.removeChipColor;
        } else {
          throw new Error("Must specify which chip color to remove from captured pile");
        }

        capturedChips[colorToRemove]--;

        // Add to capture player's chips
        // If the capture player is the same as the playing player, use newChips (already decremented)
        // Otherwise use the capture player's current chips
        const baseChips = capturePlayer._id === player._id ? newChips : { ...capturePlayer.chips };
        for (const color of playerColors) {
          baseChips[color] += capturedChips[color];
        }

        await ctx.db.patch(capturePlayer._id, { chips: baseChips });

        // Remove the pile
        await ctx.db.delete(pileIdToUpdate as any);

        await ctx.db.insert("gameLogs", {
          gameId: args.gameId,
          message: `${player.name} played ${args.chipColor} - ${capturePlayer.name} captured the pile (removed 1 ${colorToRemove})!`,
          timestamp: Date.now(),
        });

        // Capture player takes next turn
        await ctx.db.patch(args.gameId, {
          currentPlayerId: capturePlayer._id,
          turnGiverId: player._id,
        });

        // Check for victory
        await checkVictory(ctx, args.gameId, players);

        return { captured: true, capturePlayer: capturePlayer.name };
      } else {
        // Capture color player is defeated - eliminate the pile
        await ctx.db.delete(pileIdToUpdate as any);

        await ctx.db.insert("gameLogs", {
          gameId: args.gameId,
          message: `${player.name} played ${args.chipColor} on ${captureColor} - pile eliminated (${captureColor} is defeated)`,
          timestamp: Date.now(),
        });

        // Player who played gets another turn
        // But first check if they can play
        const totalChips = Object.values(newChips).reduce((a, b) => a + b, 0);
        if (totalChips === 0) {
          // Player is defeated
          await handleDefeat(ctx, args.gameId, player._id, game.turnGiverId);
        }

        return { eliminated: true };
      }
    }

    // No capture - determine next player
    await ctx.db.insert("gameLogs", {
      gameId: args.gameId,
      message: `${player.name} played ${args.chipColor}`,
      timestamp: Date.now(),
    });

    const nextPlayerResult = determineNextPlayer(
      newPileChips,
      players.map((p) => ({
        _id: p._id,
        color: p.color as PlayerColor,
        isDefeated: p.isDefeated,
      })),
      player._id
    );

    if (!nextPlayerResult) {
      throw new Error("Could not determine next player");
    }

    if (nextPlayerResult.eligiblePlayerIds.length === 1) {
      // Auto-assign
      const nextPlayer = players.find(
        (p) => p._id === nextPlayerResult.eligiblePlayerIds[0]
      );
      await ctx.db.patch(args.gameId, {
        currentPlayerId: nextPlayerResult.eligiblePlayerIds[0] as any,
        turnGiverId: player._id,
      });

      // Check if next player can play
      if (nextPlayer) {
        const totalChips = Object.values(nextPlayer.chips).reduce(
          (a, b) => a + b,
          0
        );
        if (totalChips === 0) {
          await handleDefeat(ctx, args.gameId, nextPlayer._id, player._id);
        }
      }
    } else if (args.nextPlayerId) {
      // Player chose next player
      if (!nextPlayerResult.eligiblePlayerIds.includes(args.nextPlayerId)) {
        throw new Error("Invalid next player choice");
      }
      const nextPlayer = players.find((p) => p._id === args.nextPlayerId);
      await ctx.db.patch(args.gameId, {
        currentPlayerId: args.nextPlayerId,
        turnGiverId: player._id,
      });

      // Check if chosen player can play
      if (nextPlayer) {
        const totalChips = Object.values(nextPlayer.chips).reduce(
          (a, b) => a + b,
          0
        );
        if (totalChips === 0) {
          await handleDefeat(ctx, args.gameId, nextPlayer._id, player._id);
        }
      }
    } else {
      // Need player to choose - this shouldn't happen with current flow
      // Store eligible players somehow or handle in UI
      throw new Error("Must specify nextPlayerId when multiple players are eligible");
    }

    // Check for victory
    await checkVictory(ctx, args.gameId, players);

    return { success: true };
  },
});

// Handle player defeat
async function handleDefeat(
  ctx: any,
  gameId: string,
  defeatedPlayerId: string,
  turnGiverId: string | undefined
) {
  const defeatedPlayer = await ctx.db.get(defeatedPlayerId);
  if (!defeatedPlayer || defeatedPlayer.isDefeated) return;

  await ctx.db.patch(defeatedPlayerId, { isDefeated: true });

  await ctx.db.insert("gameLogs", {
    gameId,
    message: `${defeatedPlayer.name} has been defeated!`,
    timestamp: Date.now(),
  });

  // Turn goes back to whoever gave the turn
  if (turnGiverId) {
    const turnGiver = await ctx.db.get(turnGiverId);
    if (turnGiver && !turnGiver.isDefeated) {
      // Check if turn giver can play
      const totalChips = (Object.values(turnGiver.chips) as number[]).reduce(
        (a, b) => a + b,
        0
      );
      if (totalChips === 0) {
        // Chain defeat
        const game = await ctx.db.get(gameId);
        await handleDefeat(ctx, gameId, turnGiverId, game?.turnGiverId);
      } else {
        await ctx.db.patch(gameId, {
          currentPlayerId: turnGiverId,
        });
      }
    } else {
      // Turn giver also defeated, find any non-defeated player
      const players = await ctx.db
        .query("players")
        .withIndex("by_game", (q: any) => q.eq("gameId", gameId))
        .collect();
      const activePlayers = players.filter((p: any) => !p.isDefeated);
      if (activePlayers.length > 0) {
        await ctx.db.patch(gameId, {
          currentPlayerId: activePlayers[0]._id,
        });
      }
    }
  }
}

// Check for victory
async function checkVictory(ctx: any, gameId: string, players: any[]) {
  const currentPlayers = await Promise.all(
    players.map((p) => ctx.db.get(p._id))
  );
  const activePlayers = currentPlayers.filter((p: any) => p && !p.isDefeated);

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    await ctx.db.patch(gameId, {
      status: "finished",
      winnerId: winner._id,
    });
    await ctx.db.insert("gameLogs", {
      gameId,
      message: `${winner.name} wins the game!`,
      timestamp: Date.now(),
    });
  } else if (activePlayers.length === 0) {
    // Shouldn't happen but handle gracefully
    await ctx.db.patch(gameId, {
      status: "finished",
    });
  }
}

// Transfer chips (prisoners) to another player
export const transferChips = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    toPlayerId: v.id("players"),
    chipColor: v.union(
      v.literal("red"),
      v.literal("blue"),
      v.literal("green"),
      v.literal("yellow")
    ),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");

    const fromPlayer = await ctx.db
      .query("players")
      .withIndex("by_game_and_session", (q) =>
        q.eq("gameId", args.gameId).eq("sessionId", args.sessionId)
      )
      .first();

    if (!fromPlayer) throw new Error("You are not in this game");

    const toPlayer = await ctx.db.get(args.toPlayerId);
    if (!toPlayer || toPlayer.gameId !== args.gameId) {
      throw new Error("Invalid recipient");
    }

    if (fromPlayer.chips[args.chipColor] < args.count) {
      throw new Error("Not enough chips");
    }

    // Transfer
    const fromChips = { ...fromPlayer.chips };
    fromChips[args.chipColor] -= args.count;
    await ctx.db.patch(fromPlayer._id, { chips: fromChips });

    const toChips = { ...toPlayer.chips };
    toChips[args.chipColor] += args.count;
    await ctx.db.patch(toPlayer._id, { chips: toChips });

    await ctx.db.insert("gameLogs", {
      gameId: args.gameId,
      message: `${fromPlayer.name} gave ${args.count} ${args.chipColor} chip(s) to ${toPlayer.name}`,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Discard chips (eliminate prisoners from game)
export const discardChips = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    chipColor: v.union(
      v.literal("red"),
      v.literal("blue"),
      v.literal("green"),
      v.literal("yellow")
    ),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");

    const player = await ctx.db
      .query("players")
      .withIndex("by_game_and_session", (q) =>
        q.eq("gameId", args.gameId).eq("sessionId", args.sessionId)
      )
      .first();

    if (!player) throw new Error("You are not in this game");

    if (player.chips[args.chipColor] < args.count) {
      throw new Error("Not enough chips");
    }

    // Discard
    const newChips = { ...player.chips };
    newChips[args.chipColor] -= args.count;
    await ctx.db.patch(player._id, { chips: newChips });

    await ctx.db.insert("gameLogs", {
      gameId: args.gameId,
      message: `${player.name} discarded ${args.count} ${args.chipColor} chip(s)`,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Forfeit (voluntary defeat when you have no chips on your turn)
export const forfeit = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");

    const player = await ctx.db
      .query("players")
      .withIndex("by_game_and_session", (q) =>
        q.eq("gameId", args.gameId).eq("sessionId", args.sessionId)
      )
      .first();

    if (!player) throw new Error("You are not in this game");
    if (game.currentPlayerId !== player._id) throw new Error("It's not your turn");
    if (player.isDefeated) throw new Error("You are already defeated");

    // Check they actually have no chips
    const totalChips = (Object.values(player.chips) as number[]).reduce((a, b) => a + b, 0);
    if (totalChips > 0) throw new Error("You still have chips to play");

    // Mark as defeated
    await ctx.db.patch(player._id, { isDefeated: true });

    await ctx.db.insert("gameLogs", {
      gameId: args.gameId,
      message: `${player.name} forfeited!`,
      timestamp: Date.now(),
    });

    // Find next active player
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const activePlayers = players.filter((p) => !p.isDefeated && p._id !== player._id);

    if (activePlayers.length === 1) {
      // Winner!
      const winner = activePlayers[0];
      await ctx.db.patch(args.gameId, {
        status: "finished",
        winnerId: winner._id,
      });
      await ctx.db.insert("gameLogs", {
        gameId: args.gameId,
        message: `${winner.name} wins the game!`,
        timestamp: Date.now(),
      });
    } else if (activePlayers.length > 1) {
      // Pass turn to next active player (by join order)
      const sortedActive = activePlayers.sort((a, b) => a.joinOrder - b.joinOrder);
      const currentIndex = sortedActive.findIndex((p) => p.joinOrder > player.joinOrder);
      const nextPlayer = currentIndex >= 0 ? sortedActive[currentIndex] : sortedActive[0];
      await ctx.db.patch(args.gameId, {
        currentPlayerId: nextPlayer._id,
        turnGiverId: undefined,
      });
    } else {
      // No one left (shouldn't happen in normal play)
      await ctx.db.patch(args.gameId, {
        status: "finished",
      });
    }

    return { success: true };
  },
});

// Get eligible next players for current pile (for UI)
export const getEligibleNextPlayers = query({
  args: {
    gameId: v.id("games"),
    pileId: v.optional(v.id("piles")),
    chipColor: v.union(
      v.literal("red"),
      v.literal("blue"),
      v.literal("green"),
      v.literal("yellow")
    ),
  },
  handler: async (ctx, args) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    let pileChips: PlayerColor[] = [];
    if (args.pileId) {
      const pile = await ctx.db.get(args.pileId);
      if (pile) {
        pileChips = [...(pile.chips as PlayerColor[]), args.chipColor];
      }
    } else {
      pileChips = [args.chipColor];
    }

    // Check for capture first
    const topChip = pileChips[pileChips.length - 1];
    const secondChip =
      pileChips.length >= 2 ? pileChips[pileChips.length - 2] : null;

    if (secondChip && topChip === secondChip) {
      // Would be a capture - return colors in pile for removal choice
      const colorCounts: Record<string, number> = {};
      for (const chip of pileChips) {
        colorCounts[chip] = (colorCounts[chip] || 0) + 1;
      }
      const colorsInPile = Object.keys(colorCounts) as PlayerColor[];
      return {
        isCapture: true,
        eligiblePlayers: [],
        captureColors: colorsInPile,
        captureColorCounts: colorCounts,
      };
    }

    const result = determineNextPlayer(
      pileChips,
      players.map((p) => ({
        _id: p._id,
        color: p.color as PlayerColor,
        isDefeated: p.isDefeated,
      })),
      "" // Not relevant for this query
    );

    if (!result) return { isCapture: false, eligiblePlayers: [] };

    const eligiblePlayers = players.filter((p) =>
      result.eligiblePlayerIds.includes(p._id)
    );

    return {
      isCapture: false,
      eligiblePlayers: eligiblePlayers.map((p) => ({
        _id: p._id,
        name: p.name,
        color: p.color,
      })),
      needsChoice: result.eligiblePlayerIds.length > 1,
    };
  },
});
