import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useState, useEffect, useCallback } from "react";

// Generate a session ID and store in localStorage
function getSessionId(): string {
  const key = "so-long-sucker-session";
  let sessionId = localStorage.getItem(key);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(key, sessionId);
  }
  return sessionId;
}

const sessionId = getSessionId();

type PlayerColor = "red" | "blue" | "green" | "yellow";

const colorClasses: Record<PlayerColor, { bg: string; text: string; border: string; chip: string }> = {
  red: { bg: "bg-red-500", text: "text-red-500", border: "border-red-500", chip: "bg-red-500 shadow-red-500/50" },
  blue: { bg: "bg-blue-500", text: "text-blue-500", border: "border-blue-500", chip: "bg-blue-500 shadow-blue-500/50" },
  green: { bg: "bg-green-500", text: "text-green-500", border: "border-green-500", chip: "bg-green-500 shadow-green-500/50" },
  yellow: { bg: "bg-yellow-400", text: "text-yellow-400", border: "border-yellow-400", chip: "bg-yellow-400 shadow-yellow-400/50" },
};

export default function App() {
  const [gameId, setGameId] = useState<Id<"games"> | null>(() => {
    const stored = localStorage.getItem("so-long-sucker-game");
    return stored ? (stored as Id<"games">) : null;
  });

  useEffect(() => {
    if (gameId) {
      localStorage.setItem("so-long-sucker-game", gameId);
    } else {
      localStorage.removeItem("so-long-sucker-game");
    }
  }, [gameId]);

  const handleLeaveGame = useCallback(() => {
    setGameId(null);
    // Clear the hash when leaving
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">So Long Sucker</h1>
          {gameId && (
            <button
              onClick={handleLeaveGame}
              className="text-sm text-slate-400 hover:text-white"
            >
              Leave Game
            </button>
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4">
        {gameId ? (
          <GameView gameId={gameId} onLeave={handleLeaveGame} />
        ) : (
          <HomePage onJoinGame={setGameId} />
        )}
      </main>
    </div>
  );
}

function HomePage({ onJoinGame }: { onJoinGame: (id: Id<"games">) => void }) {
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState(() => localStorage.getItem("so-long-sucker-name") || "");

  const createGame = useMutation(api.games.createGame);

  // Track URL hash in state so React re-renders when it changes (e.g. after
  // clicking Join or hitting Enter, which set window.location.hash).
  const [hashCode, setHashCode] = useState(() =>
    window.location.hash.slice(1).toUpperCase()
  );
  useEffect(() => {
    const onHashChange = () => {
      setHashCode(window.location.hash.slice(1).toUpperCase());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const isValidCode = /^[A-Z]{4}$/.test(hashCode);

  // Query for game if there's a valid code in the hash
  const gameFromHash = useQuery(
    api.games.getGameByCode,
    isValidCode ? { code: hashCode } : "skip"
  );

  // Auto-navigate to game view if there's a valid game in the hash
  useEffect(() => {
    if (isValidCode && gameFromHash) {
      onJoinGame(gameFromHash._id);
    }
  }, [isValidCode, gameFromHash, onJoinGame]);

  // Pre-fill join code from hash if valid
  useEffect(() => {
    if (isValidCode && !joinCode) {
      setJoinCode(hashCode);
    }
  }, [isValidCode, hashCode, joinCode]);

  const handleCreate = async () => {
    if (!createName.trim()) {
      setError("Please enter your name");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      localStorage.setItem("so-long-sucker-name", createName.trim());
      const result = await createGame({ playerName: createName.trim(), sessionId });
      window.location.hash = result.code;
      onJoinGame(result.gameId);
    } catch (e: any) {
      setError(e.message || "Failed to create game");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinNavigate = () => {
    if (!joinCode.trim()) {
      setError("Please enter a game code");
      return;
    }
    // Just navigate to the game - the GameView will handle prompting for name
    window.location.hash = joinCode.trim().toUpperCase();
  };

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="text-center">
        <h2 className="text-4xl font-bold mb-4">So Long Sucker</h2>
        <p className="text-slate-400 max-w-md">
          A 4-player strategy game invented by John Nash. Make alliances, break promises, and be the last one standing.
        </p>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-sm">
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {showCreateForm ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium">Your Name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Enter your name"
                autoFocus
                className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isLoading}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
                >
                  {isLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Create New Game
            </button>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800 text-slate-400">or join existing</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoinNavigate()}
              placeholder="Code"
              maxLength={4}
              className="flex-1 min-w-24 px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none uppercase tracking-wider text-center"
            />
            <button
              onClick={handleJoinNavigate}
              className="flex-1 min-w-20 px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
            >
              Join
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-6 max-w-lg text-sm text-slate-400">
        <h3 className="font-bold text-white mb-2">How to Play</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>Each player starts with 7 chips of their color</li>
          <li>On your turn, play a chip to start or add to a pile</li>
          <li>If two chips of the same color are stacked, that color captures the pile</li>
          <li>Captured chips become "prisoners" you can play, give away, or discard</li>
          <li>Players who can't play on their turn are eliminated</li>
          <li>Last player standing wins!</li>
        </ul>
      </div>
    </div>
  );
}

function GameView({ gameId, onLeave }: { gameId: Id<"games">; onLeave: () => void }) {
  const game = useQuery(api.games.getGame, { gameId });
  const me = useQuery(api.games.getPlayerBySession, { gameId, sessionId });

  // Sync URL hash with game code
  useEffect(() => {
    if (game?.code && window.location.hash.slice(1).toUpperCase() !== game.code) {
      window.location.hash = game.code;
    }
  }, [game?.code]);

  if (game === undefined || me === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">Game not found</p>
        <button onClick={onLeave} className="px-4 py-2 bg-slate-700 rounded-lg">
          Back to Home
        </button>
      </div>
    );
  }

  if (game.status === "waiting") {
    return <Lobby game={game} me={me} />;
  }

  if (game.status === "finished") {
    return <GameOver game={game} onLeave={onLeave} />;
  }

  return <GameBoard game={game} me={me} />;
}

function Lobby({ game, me }: { game: any; me: any }) {
  const startGame = useMutation(api.games.startGame);
  const joinGame = useMutation(api.games.joinGame);
  const removePlayer = useMutation(api.games.removePlayer);
  const updateStartingChips = useMutation(api.games.updateStartingChips);
  const updateHandicap = useMutation(api.games.updateHandicap);
  const [isStarting, setIsStarting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinName, setJoinName] = useState(() => localStorage.getItem("so-long-sucker-name") || "");
  const [joinError, setJoinError] = useState("");

  const handleRemovePlayer = async (playerId: Id<"players">) => {
    try {
      await removePlayer({ gameId: game._id, playerId, sessionId });
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleJoin = async () => {
    if (!joinName.trim()) {
      setJoinError("Please enter your name");
      return;
    }
    setIsJoining(true);
    setJoinError("");
    try {
      localStorage.setItem("so-long-sucker-name", joinName.trim());
      await joinGame({ code: game.code, playerName: joinName.trim(), sessionId });
    } catch (e: any) {
      setJoinError(e.message || "Failed to join game");
      setIsJoining(false);
    }
  };

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await startGame({ gameId: game._id, sessionId });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsStarting(false);
    }
  };

  const startingChips = game.startingChips ?? 7;

  const handleChipsChange = async (delta: number) => {
    const newValue = startingChips + delta;
    if (newValue < 2 || newValue > 10) return;
    try {
      await updateStartingChips({ gameId: game._id, sessionId, startingChips: newValue });
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleHandicapChange = async (playerId: Id<"players">, delta: number) => {
    const player = game.players.find((p: any) => p._id === playerId);
    if (!player) return;
    const currentHandicap = player.handicap ?? 0;
    const newHandicap = currentHandicap + delta;
    // Max handicap is startingChips - 2 (must have at least 2 chips)
    if (newHandicap < 0 || newHandicap > startingChips - 2) return;
    try {
      await updateHandicap({ gameId: game._id, playerId, sessionId, handicap: newHandicap });
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Show join form if user is not in the game
  if (!me) {
    const isFull = game.players.length >= 4;
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">Join Game</h2>
          <div className="flex items-center justify-center gap-2">
            <span className="text-slate-400">Game Code:</span>
            <span className="text-2xl font-mono font-bold tracking-wider bg-slate-800 px-4 py-2 rounded-lg">
              {game.code}
            </span>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
          <h3 className="font-bold mb-4">Players ({game.players.length}/4)</h3>
          <div className="space-y-2 mb-4">
            {game.players.map((player: any) => (
              <div
                key={player._id}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50"
              >
                <div className={`w-4 h-4 rounded-full ${colorClasses[player.color as PlayerColor].bg}`}></div>
                <span className="flex-1">{player.name}</span>
              </div>
            ))}
          </div>

          {isFull ? (
            <p className="text-center text-slate-400">This game is full</p>
          ) : (
            <div className="space-y-3">
              {joinError && (
                <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
                  {joinError}
                </div>
              )}
              <input
                type="text"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                placeholder="Enter your name"
                autoFocus
                className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleJoin}
                disabled={isJoining}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-bold transition-colors"
              >
                {isJoining ? "Joining..." : "Join Game"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">Waiting for Players</h2>
        <div className="flex items-center justify-center gap-2">
          <span className="text-slate-400">Game Code:</span>
          <span className="text-2xl font-mono font-bold tracking-wider bg-slate-800 px-4 py-2 rounded-lg">
            {game.code}
          </span>
        </div>
        <p className="text-slate-400 mt-2">Share this code with friends to join!</p>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="font-bold mb-4">Players ({game.players.length})</h3>
        <div className="space-y-2">
          {game.players.map((player: any) => {
            const handicap = player.handicap ?? 0;
            const effectiveChips = Math.max(2, startingChips - handicap);
            return (
              <div
                key={player._id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  player._id === me?._id ? "bg-slate-700" : "bg-slate-700/50"
                }`}
              >
                <div className={`w-4 h-4 rounded-full ${colorClasses[player.color as PlayerColor].bg}`}></div>
                <span className="flex-1">{player.name}</span>
                {player._id === me?._id && (
                  <span className="text-xs text-slate-400">(you)</span>
                )}
                {/* Handicap controls - +/- adjusts effective chips shown */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleHandicapChange(player._id, 1)}
                    disabled={handicap >= startingChips - 2}
                    className="w-6 h-6 rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-30 text-sm font-bold"
                  >
                    -
                  </button>
                  <span className="text-sm w-6 text-center" title={handicap > 0 ? `Handicap: -${handicap}` : "No handicap"}>
                    {effectiveChips}
                  </span>
                  <button
                    onClick={() => handleHandicapChange(player._id, -1)}
                    disabled={handicap <= 0}
                    className="w-6 h-6 rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-30 text-sm font-bold"
                  >
                    +
                  </button>
                </div>
                {/* Remove player button */}
                <button
                  onClick={() => handleRemovePlayer(player._id)}
                  className="w-6 h-6 rounded bg-red-600/50 hover:bg-red-600 text-sm font-bold transition-colors"
                  title={player._id === me?._id ? "Leave game" : `Remove ${player.name}`}
                >
                  ×
                </button>
              </div>
            );
          })}
          {game.players.length < 4 && (
            <p className="text-xs text-slate-500 text-center pt-2">
              {game.players.length < 3 ? `Need ${3 - game.players.length} more player${3 - game.players.length > 1 ? "s" : ""}` : `Room for ${4 - game.players.length} more`}
            </p>
          )}
        </div>
      </div>

      {/* Starting chips setting */}
      <div className="bg-slate-800 rounded-lg p-4 w-full max-w-md">
        <div className="flex items-center justify-between">
          <span className="font-bold">Starting Chips</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleChipsChange(-1)}
              disabled={startingChips <= 2}
              className="w-10 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 font-bold text-xl"
            >
              -
            </button>
            <span className="text-2xl font-bold w-8 text-center">{startingChips}</span>
            <button
              onClick={() => handleChipsChange(1)}
              disabled={startingChips >= 10}
              className="w-10 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 font-bold text-xl"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {game.players.length >= 3 && me && (
        <button
          onClick={handleStart}
          disabled={isStarting}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-bold text-lg transition-colors"
        >
          {isStarting ? "Starting..." : `Start Game (${game.players.length} players)`}
        </button>
      )}

      <details className="bg-slate-800/50 rounded-lg p-4 max-w-md w-full">
        <summary className="font-bold text-sm cursor-pointer">Recent Activity</summary>
        <div className="text-sm text-slate-400 space-y-1 max-h-32 overflow-y-auto mt-2">
          {game.logs.map((log: any, i: number) => (
            <p key={i}>{log.message}</p>
          ))}
        </div>
      </details>
    </div>
  );
}

function GameOver({ game, onLeave }: { game: any; onLeave: () => void }) {
  const winner = game.players.find((p: any) => p._id === game.winnerId);
  const resetGame = useMutation(api.games.resetGame);
  const [isResetting, setIsResetting] = useState(false);

  const handlePlayAgain = async () => {
    setIsResetting(true);
    try {
      await resetGame({ gameId: game._id, sessionId });
    } catch (e: any) {
      alert(e.message);
      setIsResetting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="text-center">
        <h2 className="text-4xl font-bold mb-4">Game Over!</h2>
        {winner && (
          <div className="flex items-center justify-center gap-3">
            <div className={`w-6 h-6 rounded-full ${colorClasses[winner.color as PlayerColor].bg}`}></div>
            <span className={`text-2xl font-bold ${colorClasses[winner.color as PlayerColor].text}`}>
              {winner.name} Wins!
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <button
          onClick={handlePlayAgain}
          disabled={isResetting}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-bold transition-colors"
        >
          {isResetting ? "..." : "Play Again"}
        </button>
        <button
          onClick={onLeave}
          className="px-8 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition-colors"
        >
          Leave
        </button>
      </div>

      <div className="bg-slate-800 rounded-lg p-4 w-full max-w-lg">
        <h4 className="font-bold mb-2">Final Standings</h4>
        <div className="space-y-2">
          {game.players.map((player: any) => (
            <div
              key={player._id}
              className={`flex items-center gap-3 p-2 rounded ${
                player._id === game.winnerId ? "bg-yellow-500/20" : ""
              }`}
            >
              <div className={`w-4 h-4 rounded-full ${colorClasses[player.color as PlayerColor].bg}`}></div>
              <span className="flex-1">{player.name}</span>
              {player._id === game.winnerId && <span>Winner!</span>}
              {player.isDefeated && player._id !== game.winnerId && (
                <span className="text-red-400 text-sm">Defeated</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 max-w-lg w-full">
        <h4 className="font-bold mb-2 text-sm">Game Log</h4>
        <div className="text-sm text-slate-400 space-y-1 max-h-64 overflow-y-auto">
          {game.logs.map((log: any, i: number) => (
            <p key={i}>{log.message}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameBoard({ game, me }: { game: any; me: any }) {
  const [selectedChip, setSelectedChip] = useState<PlayerColor | null>(null);
  const [selectedPile, setSelectedPile] = useState<Id<"piles"> | "new" | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Id<"players"> | "discard" | null>(null);
  const [pendingCaptureColors, setPendingCaptureColors] = useState<PlayerColor[] | null>(null);

  const playChip = useMutation(api.games.playChip);
  const transferChips = useMutation(api.games.transferChips);
  const discardChips = useMutation(api.games.discardChips);
  const forfeitGame = useMutation(api.games.forfeit);

  const eligibleQuery = useQuery(
    api.games.getEligibleNextPlayers,
    selectedChip && selectedPile !== null
      ? {
          gameId: game._id,
          pileId: selectedPile === "new" ? undefined : selectedPile,
          chipColor: selectedChip,
        }
      : "skip"
  );

  // Use player data from game.players for most up-to-date chip counts
  const myPlayer = me ? game.players.find((p: any) => p._id === me._id) : null;
  const isMyTurn = myPlayer && game.currentPlayerId === myPlayer._id && !myPlayer.isDefeated;
  const currentPlayer = game.players.find((p: any) => p._id === game.currentPlayerId);
  const myTotalChips = myPlayer
    ? (Object.values(myPlayer.chips) as number[]).reduce((a, b) => a + b, 0)
    : 0;

  const handlePlayChip = useCallback(async (nextPlayerId?: Id<"players">, removeChipColor?: PlayerColor) => {
    if (!selectedChip || selectedPile === null) return;
    try {
      await playChip({
        gameId: game._id,
        sessionId,
        chipColor: selectedChip,
        pileId: selectedPile === "new" ? undefined : selectedPile,
        nextPlayerId,
        removeChipColor,
      });
      setSelectedChip(null);
      setSelectedPile(null);
      setPendingCaptureColors(null);
    } catch (e: any) {
      alert(e.message);
    }
  }, [selectedChip, selectedPile, playChip, game._id]);

  const handleTransfer = async (color: PlayerColor) => {
    if (!transferTarget || transferTarget === "discard") return;
    try {
      await transferChips({
        gameId: game._id,
        sessionId,
        toPlayerId: transferTarget,
        chipColor: color,
        count: 1,
      });
      // Keep UI open for more transfers
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDiscard = async (color: PlayerColor) => {
    if (!myPlayer || myPlayer.chips[color] <= 0) return;
    try {
      await discardChips({
        gameId: game._id,
        sessionId,
        chipColor: color,
        count: 1,
      });
      // Keep UI open for more discards
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleForfeit = async () => {
    if (!confirm("Are you sure you want to forfeit? You will be eliminated from the game.")) return;
    try {
      await forfeitGame({ gameId: game._id, sessionId });
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Handle chip play when eligible players are known
  useEffect(() => {
    if (eligibleQuery && selectedChip && selectedPile !== null && !pendingCaptureColors) {
      if (eligibleQuery.isCapture) {
        // Capture - check if we need user to choose which color to remove
        const colors = eligibleQuery.captureColors as PlayerColor[] | undefined;
        if (colors && colors.length > 1) {
          // Multiple colors in pile - need user to choose
          setPendingCaptureColors(colors);
        } else {
          // Only one color (or no info) - auto-play
          const removeColor = colors?.[0];
          handlePlayChip(undefined, removeColor);
        }
      } else if (eligibleQuery.eligiblePlayers && eligibleQuery.eligiblePlayers.length <= 1) {
        // Auto-play (no capture, single next player)
        const nextId = eligibleQuery.eligiblePlayers?.[0]?._id as Id<"players"> | undefined;
        handlePlayChip(nextId);
      }
    }
  }, [eligibleQuery, selectedChip, selectedPile, handlePlayChip, pendingCaptureColors]);

  return (
    <div className="pb-48">
      {/* Turn indicator - compact at top */}
      <div className={`text-center p-3 rounded-lg mb-4 ${isMyTurn ? "bg-green-600/20 border border-green-500" : "bg-slate-800"}`}>
        {currentPlayer && (
          <div className="flex items-center justify-center gap-2">
            <div className={`w-4 h-4 rounded-full ${colorClasses[currentPlayer.color as PlayerColor].bg}`}></div>
            <span className="font-bold">
              {isMyTurn ? "Your turn!" : `${currentPlayer.name}'s turn`}
            </span>
          </div>
        )}
      </div>

      {/* Players - compact display */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {game.players.map((player: any) => (
          <PlayerCardCompact
            key={player._id}
            player={player}
            isMe={player._id === myPlayer?._id}
            isCurrent={player._id === game.currentPlayerId}
          />
        ))}
      </div>

      {/* Play Area - piles */}
      <div className="bg-slate-800 rounded-lg p-4 mb-4">
        <h3 className="font-bold mb-3 text-sm">Play Area</h3>
        <div className="flex flex-wrap gap-3 min-h-24">
          {game.piles.map((pile: any) => (
            <Pile
              key={pile._id}
              pile={pile}
              isSelected={selectedPile === pile._id}
              onClick={isMyTurn && selectedChip ? () => setSelectedPile(pile._id) : undefined}
            />
          ))}
          {game.piles.length === 0 && (
            <p className="text-slate-500 text-sm">No piles yet</p>
          )}
        </div>
      </div>

      {/* Game log - collapsible */}
      <details className="bg-slate-800/50 rounded-lg p-3 mb-4">
        <summary className="font-bold text-sm cursor-pointer">Game Log</summary>
        <div className="text-xs text-slate-400 space-y-1 mt-2 max-h-32 overflow-y-auto">
          {game.logs.slice(-10).map((log: any, i: number) => (
            <p key={i}>{log.message}</p>
          ))}
        </div>
      </details>

      {/* FIXED BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-4 safe-bottom">
        {/* Choose which chip to remove on capture */}
        {pendingCaptureColors && pendingCaptureColors.length > 1 ? (
          <div className="space-y-3">
            <p className="text-center text-sm font-bold">Capture! Remove which chip from the pile?</p>
            <div className="grid grid-cols-4 gap-3">
              {pendingCaptureColors.map((color) => (
                <button
                  key={color}
                  onClick={() => handlePlayChip(undefined, color)}
                  className={`py-5 rounded-xl ${colorClasses[color].bg} text-white font-bold text-lg active:scale-95 transition-transform shadow-lg`}
                >
                  {color}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setPendingCaptureColors(null);
                setSelectedChip(null);
                setSelectedPile(null);
              }}
              className="w-full py-2 text-slate-400 text-sm"
            >
              Cancel
            </button>
          </div>
        ) : /* Choose next player modal */
        eligibleQuery && !eligibleQuery.isCapture && eligibleQuery.needsChoice && selectedChip && selectedPile !== null ? (
          <div className="space-y-3">
            <p className="text-center text-sm font-bold">Choose who goes next:</p>
            <div className="grid grid-cols-2 gap-3">
              {eligibleQuery.eligiblePlayers.map((p: any) => (
                <button
                  key={p._id}
                  onClick={() => handlePlayChip(p._id as Id<"players">)}
                  className={`py-4 rounded-xl ${colorClasses[p.color as PlayerColor].bg} text-white font-bold text-lg active:scale-95 transition-transform`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        ) : showTransfer ? (
          /* Transfer/Discard UI */
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-sm">
                {!transferTarget ? "Give or discard:" : transferTarget === "discard" ? "Discard which color?" : "Give which color?"}
              </span>
              <button onClick={() => { setShowTransfer(false); setTransferTarget(null); }} className="text-slate-400 text-sm">Done</button>
            </div>
            {!transferTarget ? (
              /* Step 1: Choose recipient or discard */
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {game.players
                    .filter((p: any) => p._id !== myPlayer?._id && !p.isDefeated)
                    .map((p: any) => (
                      <button
                        key={p._id}
                        onClick={() => setTransferTarget(p._id)}
                        className={`py-3 rounded-xl ${colorClasses[p.color as PlayerColor].bg} text-white font-medium active:scale-95 transition-transform`}
                      >
                        {p.name}
                      </button>
                    ))}
                </div>
                <button
                  onClick={() => setTransferTarget("discard")}
                  className="w-full py-3 rounded-xl bg-red-600 text-white font-medium active:scale-95 transition-transform"
                >
                  Discard (remove from game)
                </button>
              </div>
            ) : (
              /* Step 2: Choose color - immediately executes */
              <div className="grid grid-cols-4 gap-3">
                {(["red", "blue", "green", "yellow"] as PlayerColor[]).map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      if (myPlayer?.chips[color] > 0) {
                        if (transferTarget === "discard") {
                          handleDiscard(color);
                        } else {
                          handleTransfer(color);
                        }
                      }
                    }}
                    disabled={myPlayer?.chips[color] <= 0}
                    className={`py-5 rounded-xl ${colorClasses[color].bg} text-white font-bold text-lg active:scale-95 transition-transform ${
                      myPlayer?.chips[color] <= 0 ? "opacity-30" : ""
                    }`}
                  >
                    {myPlayer?.chips[color] || 0}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : isMyTurn && myPlayer ? (
          /* Main turn UI */
          <div className="space-y-3">
            {myTotalChips === 0 ? (
              /* No chips - must forfeit or wait for someone to give chips */
              <>
                <p className="text-center text-sm text-slate-400">You have no chips to play!</p>
                <p className="text-center text-xs text-slate-500">Wait for someone to give you chips, or forfeit.</p>
                <button
                  onClick={handleForfeit}
                  className="w-full py-4 rounded-xl bg-red-600 text-white font-bold active:scale-95 transition-transform"
                >
                  Forfeit
                </button>
              </>
            ) : !selectedChip ? (
              /* Step 1: Select chip color */
              <>
                <p className="text-center text-sm text-slate-400">Tap a chip to play:</p>
                <div className="grid grid-cols-4 gap-3">
                  {(["red", "blue", "green", "yellow"] as PlayerColor[]).map((color) => (
                    <button
                      key={color}
                      onClick={() => myPlayer.chips[color] > 0 && setSelectedChip(color)}
                      disabled={myPlayer.chips[color] <= 0}
                      className={`py-6 rounded-xl ${colorClasses[color].bg} text-white font-bold text-xl active:scale-95 transition-transform ${
                        myPlayer.chips[color] <= 0 ? "opacity-30" : "shadow-lg"
                      }`}
                    >
                      {myPlayer.chips[color]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowTransfer(true)}
                  className="w-full py-2 text-slate-400 text-sm"
                >
                  Give/Discard chips instead...
                </button>
              </>
            ) : (
              /* Step 2: Select target pile */
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400">Playing:</span>
                    <div className={`w-8 h-8 rounded-full ${colorClasses[selectedChip].bg} shadow-lg`}></div>
                  </div>
                  <button onClick={() => setSelectedChip(null)} className="text-slate-400 text-sm">Cancel</button>
                </div>
                <p className="text-center text-sm">Tap a pile above, or:</p>
                <button
                  onClick={() => setSelectedPile("new")}
                  className={`w-full py-4 rounded-xl font-bold text-lg active:scale-95 transition-transform ${
                    selectedPile === "new"
                      ? "bg-white text-slate-900"
                      : "bg-slate-700 text-white border-2 border-dashed border-slate-500"
                  }`}
                >
                  Start New Pile
                </button>
              </>
            )}
          </div>
        ) : myPlayer && !myPlayer.isDefeated ? (
          /* Not my turn */
          <div className="text-center">
            <p className="text-slate-400 mb-2">Waiting for {currentPlayer?.name}...</p>
            <button
              onClick={() => setShowTransfer(true)}
              className="px-6 py-2 bg-slate-700 rounded-lg text-sm"
            >
              Give/Discard Chips
            </button>
          </div>
        ) : (
          /* Spectator or defeated */
          <p className="text-center text-slate-500">Spectating...</p>
        )}
      </div>
    </div>
  );
}

function PlayerCardCompact({
  player,
  isMe,
  isCurrent,
}: {
  player: any;
  isMe: boolean;
  isCurrent: boolean;
}) {
  const totalChips = Object.values(player.chips as Record<PlayerColor, number>).reduce((a, b) => a + b, 0);
  const colors: PlayerColor[] = ["red", "blue", "green", "yellow"];

  return (
    <div
      className={`rounded-lg p-2 ${
        player.isDefeated
          ? "bg-slate-800/50 opacity-50"
          : isCurrent
          ? `bg-slate-800 border-2 ${colorClasses[player.color as PlayerColor].border}`
          : "bg-slate-800"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-3 h-3 rounded-full ${colorClasses[player.color as PlayerColor].bg}`}></div>
        <span className="font-bold text-sm truncate flex-1">{player.name}</span>
        {isMe && <span className="text-xs text-slate-400">(you)</span>}
      </div>

      {player.isDefeated ? (
        <p className="text-red-400 text-xs">Defeated</p>
      ) : (
        <div className="flex gap-1 items-center">
          {colors.map((color) => {
            const count = player.chips[color];
            if (count === 0) return null;
            return (
              <div key={color} className="flex items-center gap-0.5">
                <div className={`w-4 h-4 rounded-full ${colorClasses[color].bg}`}></div>
                <span className="text-xs">{count}</span>
              </div>
            );
          })}
          <span className="text-xs text-slate-500 ml-auto">{totalChips} total</span>
        </div>
      )}
    </div>
  );
}

function Pile({
  pile,
  isSelected,
  onClick,
}: {
  pile: { _id: Id<"piles">; chips: string[] };
  isSelected: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative w-20 min-h-24 rounded-lg p-2 transition-all active:scale-95 ${
        isSelected
          ? "bg-white/20 border-2 border-white"
          : onClick
          ? "bg-slate-700 active:bg-slate-600 cursor-pointer"
          : "bg-slate-700"
      }`}
    >
      <div className="flex flex-col-reverse items-center">
        {pile.chips.map((color, i) => (
          <div
            key={i}
            className={`w-7 h-7 rounded-full ${colorClasses[color as PlayerColor].chip} shadow-lg`}
            style={{
              marginTop: i > 0 ? "-10px" : "0",
              zIndex: i
            }}
          />
        ))}
      </div>
      <p className="text-xs text-center mt-1 text-slate-400">{pile.chips.length}</p>
    </button>
  );
}
