import React, { useEffect, useMemo, useState } from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
} from "convex/react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

const LANGUAGES = ["Russian", "English", "Japanese"];
const INITIAL_CATEGORIES = [
  "Болезнь",
  "Фильм",
  "Песня",
  "Станция в Токио",
];
const PLAYER_TOKEN_KEY = "wordlord-player-token";
const LEGACY_PLAYER_TOKEN_KEY = "obds-player-token";

function getPlayerToken() {
  const storedToken = window.localStorage.getItem(PLAYER_TOKEN_KEY);
  if (storedToken) return storedToken;

  const legacyToken = window.localStorage.getItem(LEGACY_PLAYER_TOKEN_KEY);
  if (legacyToken) {
    window.localStorage.setItem(PLAYER_TOKEN_KEY, legacyToken);
    window.localStorage.removeItem(LEGACY_PLAYER_TOKEN_KEY);
    return legacyToken;
  }

  const token =
    window.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(PLAYER_TOKEN_KEY, token);
  return token;
}

function getRoomCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
}

function useRoomNavigation() {
  const [roomCode, setRoomCode] = useState(getRoomCodeFromUrl);

  useEffect(() => {
    const handlePopState = () => setRoomCode(getRoomCodeFromUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateToRoom = (code) => {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("room", code);
    else url.searchParams.delete("room");
    window.history.pushState({}, "", url);
    setRoomCode(code);
  };

  return [roomCode, navigateToRoom];
}

function getErrorMessage(error) {
  if (typeof error?.data === "string") return error.data;
  if (typeof error?.message === "string") {
    return error.message.replace(/^.*Uncaught ConvexError:\s*/, "").split("\n")[0];
  }
  return "Something went wrong. Please try again.";
}

function SetupForm({ onCreate }) {
  const [hostName, setHostName] = useState("");
  const [language, setLanguage] = useState("Russian");
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const updateCategory = (index, value) => {
    setCategories((current) =>
      current.map((category, categoryIndex) =>
        categoryIndex === index ? value : category,
      ),
    );
  };

  const addCategory = () => {
    if (categories.length < 8) setCategories((current) => [...current, ""]);
  };

  const removeCategory = (index) => {
    if (categories.length > 2) {
      setCategories((current) =>
        current.filter((_, categoryIndex) => categoryIndex !== index),
      );
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onCreate({
        hostName,
        language,
        categories,
        durationSeconds,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      setSubmitting(false);
    }
  };

  return (
    <form className="setup-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Your name</span>
        <input
          autoComplete="nickname"
          maxLength={24}
          onChange={(event) => setHostName(event.target.value)}
          placeholder="Dastan"
          required
          value={hostName}
        />
      </label>

      <label className="field">
        <span>Language</span>
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          {LANGUAGES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Categories</span>
        <div className="category-list">
          {categories.map((category, index) => (
            <div className="category-row" key={index}>
              <span className="category-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <input
                aria-label={`Category ${index + 1}`}
                onChange={(event) => updateCategory(index, event.target.value)}
                required
                value={category}
              />
              <button
                aria-label={`Remove category ${index + 1}`}
                className="icon-button"
                disabled={categories.length <= 2}
                onClick={() => removeCategory(index)}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          className="text-button"
          disabled={categories.length >= 8}
          onClick={addCategory}
          type="button"
        >
          + Add category
        </button>
      </div>

      <div className="field">
        <span>Round time</span>
        <div className="segmented">
          {[15, 60, 120].map((seconds) => (
            <button
              className={durationSeconds === seconds ? "active" : ""}
              key={seconds}
              onClick={() => setDurationSeconds(seconds)}
              type="button"
            >
              {seconds === 15 ? "15 sec demo" : `${seconds / 60} min`}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}
      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? "Creating room..." : "Create room"}
      </button>
    </form>
  );
}

function JoinRoom({ room, onJoin, onLeave }) {
  const [playerName, setPlayerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onJoin(playerName);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      setSubmitting(false);
    }
  };

  return (
    <form className="join-form" onSubmit={handleSubmit}>
      <span className="eyebrow">You were invited</span>
      <h1>Join room {room.code}</h1>
      <p>
        {room.language} · {room.categories.length} categories ·{" "}
        {room.durationSeconds < 60
          ? `${room.durationSeconds} seconds`
          : `${room.durationSeconds / 60} minute${room.durationSeconds === 60 ? "" : "s"}`}
      </p>
      <label className="field">
        <span>Your name</span>
        <input
          autoComplete="nickname"
          autoFocus
          maxLength={24}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Masha"
          required
          value={playerName}
        />
      </label>
      {error && <p className="error-message">{error}</p>}
      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? "Joining..." : "Join room"}
      </button>
      <button className="text-button centered" onClick={onLeave} type="button">
        Create a different room
      </button>
    </form>
  );
}

function Lobby({
  room,
  copied,
  onCopyLink,
  onSetReady,
  onStartRound,
  startError,
  starting,
}) {
  const connectedPlayers = room.players.filter((player) => player.online);
  const readyCount = connectedPlayers.filter((player) => player.ready).length;
  const allReady =
    connectedPlayers.length > 1 && readyCount === connectedPlayers.length;

  return (
    <div className="lobby-content">
      <div className="invite-block">
        <span className="eyebrow">Private room</span>
        <strong>{room.code}</strong>
        <button className="secondary-button" onClick={onCopyLink}>
          {copied ? "Copied" : "Copy invite link"}
        </button>
      </div>

      <div className="room-summary">
        <span>{room.language}</span>
        <span>{room.categories.length} categories</span>
        <span>
          {room.durationSeconds < 60
            ? `${room.durationSeconds} sec`
            : `${room.durationSeconds / 60} min`}
        </span>
      </div>

      <div className="players-list">
        <div className="section-heading">
          <span>Players</span>
          <span>
            {readyCount}/{connectedPlayers.length} connected ready
          </span>
        </div>
        {room.players.map((player) => {
          const isViewer = player.id === room.viewer.id;
          return (
            <div
              className={`player-row ${player.online ? "" : "is-offline"}`}
              key={player.id}
            >
              <div className="avatar">{player.name.slice(0, 1).toUpperCase()}</div>
              <div className="player-name">
                <strong>
                  {player.name}
                  {isViewer ? " (you)" : ""}
                </strong>
                <span>
                  {player.isHost ? "Host" : "Player"} ·{" "}
                  {player.online ? "Online" : "Offline"} · {player.points}{" "}
                  {player.points === 1 ? "pt" : "pts"}
                </span>
              </div>
              {isViewer ? (
                <button
                  className={`ready-button ${player.ready ? "is-ready" : ""}`}
                  onClick={() => onSetReady(!player.ready)}
                >
                  {player.ready ? "Ready" : "Not ready"}
                </button>
              ) : (
                <span className={`ready-button status-only ${player.ready ? "is-ready" : ""}`}>
                  {player.online
                    ? player.ready
                      ? "Ready"
                      : "Not ready"
                    : "Offline"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {room.viewer.isHost && (
        <button
          className="primary-button"
          disabled={!allReady || starting}
          onClick={onStartRound}
        >
          {starting ? "Starting..." : "Start round"}
        </button>
      )}

      {startError && <p className="error-message">{startError}</p>}
      <p className="microcopy">
        {allReady
          ? room.viewer.isHost
            ? "Everyone is ready. Start when you are."
            : "Everyone is ready. Waiting for the host."
          : room.players.some((player) => !player.online)
            ? "Offline players can return with the same invite link."
            : "This lobby updates live. Everyone marks themselves ready."}
      </p>
    </div>
  );
}

function useSecondsLeft(roundEndsAt) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  return Math.max(0, Math.ceil((roundEndsAt - now) / 1000));
}

function PlayingRound({ room, onSaveAnswer }) {
  const [answers, setAnswers] = useState(room.viewerAnswers);
  const [saveError, setSaveError] = useState("");
  const secondsLeft = useSecondsLeft(room.roundEndsAt);
  const answerCount = answers.filter((answer) => answer.trim()).length;

  useEffect(() => {
    setAnswers(room.viewerAnswers);
  }, [room.roundNumber]);

  const updateAnswer = (categoryIndex, value) => {
    setAnswers((current) =>
      current.map((answer, index) => (index === categoryIndex ? value : answer)),
    );
    setSaveError("");
    onSaveAnswer(categoryIndex, value).catch((error) => {
      setSaveError(getErrorMessage(error));
    });
  };

  return (
    <div className="playing-content">
      <div className="round-focus">
        <span className="eyebrow">
          Round {room.roundNumber} · {room.language}
        </span>
        <div className="letter-display">{room.letter}</div>
        <span className={`timer ${secondsLeft <= 10 ? "urgent" : ""}`}>
          {Math.floor(secondsLeft / 60)}:
          {String(secondsLeft % 60).padStart(2, "0")}
        </span>
        <p>Every answer must begin with this letter.</p>
      </div>

      <div className="answer-sheet">
        <div className="section-heading">
          <span>Your answers</span>
          <span>
            {answerCount}/{room.categories.length}
          </span>
        </div>
        {room.categories.map((category, index) => (
          <label className="answer-row" key={`${room.roundNumber}-${index}`}>
            <span className="answer-index">{index + 1}</span>
            <span className="answer-category">{category}</span>
            <input
              autoFocus={index === 0}
              disabled={secondsLeft === 0}
              maxLength={120}
              onChange={(event) => updateAnswer(index, event.target.value)}
              placeholder={`${room.letter}…`}
              value={answers[index] ?? ""}
            />
          </label>
        ))}
        {saveError && <p className="error-message">{saveError}</p>}
        <p className="microcopy">
          Answers save automatically. The server locks them when time expires.
        </p>
      </div>
    </div>
  );
}

function RevealRound({ room, advancing, error, onAdvance }) {
  const isLastCategory =
    room.reveal.categoryIndex === room.categories.length - 1;

  return (
    <div className="reveal-content">
      <div className="reveal-progress">
        {room.categories.map((category, index) => (
          <span
            className={index <= room.reveal.categoryIndex ? "seen" : ""}
            key={category}
          />
        ))}
      </div>
      <span className="eyebrow">
        Category {room.reveal.categoryIndex + 1} of {room.categories.length}
      </span>
      <h2>{room.reveal.category}</h2>
      <div className="reveal-grid">
        {room.reveal.answers.map((answer, index) => (
          <article
            className="answer-card"
            key={answer.playerId}
            style={{ "--delay": `${index * 90}ms` }}
          >
            <div className="avatar">{answer.name.slice(0, 1).toUpperCase()}</div>
            <span>{answer.name}</span>
            <strong>{answer.value.trim() || "No answer"}</strong>
            <em>{answer.score ? "+1" : "0"}</em>
          </article>
        ))}
      </div>
      {room.viewer.isHost ? (
        <button
          className="primary-button"
          disabled={advancing}
          onClick={onAdvance}
        >
          {advancing
            ? "Updating..."
            : isLastCategory
              ? "See results"
              : "Next category"}
        </button>
      ) : (
        <p className="microcopy">Waiting for the host to continue.</p>
      )}
      {error && <p className="error-message">{error}</p>}
    </div>
  );
}

function Results({ room, error, onReturnToLobby, returning }) {
  const tied = room.results.winners.length > 1;
  const winnerNames = room.results.winners
    .map((winner) => winner.name)
    .join(" & ");

  return (
    <div className="results-content">
      <span className="eyebrow">Round {room.roundNumber} complete</span>
      <h2>{tied ? "It’s a tie" : `${winnerNames} wins`}</h2>
      <p>
        {winnerNames} {tied ? "each get a round point." : "gets the round point."}
      </p>
      <div className="scoreboard">
        {room.results.standings.map((standing, index) => (
          <div
            className={`score-row ${standing.isWinner ? "leader" : ""}`}
            key={standing.playerId}
          >
            <span className="rank">{String(index + 1).padStart(2, "0")}</span>
            <div className="avatar">
              {standing.name.slice(0, 1).toUpperCase()}
            </div>
            <strong>{standing.name}</strong>
            <span className="round-score">
              {standing.roundScore}{" "}
              {standing.roundScore === 1 ? "word" : "words"}
            </span>
            <span className="total-score">
              {standing.points} {standing.points === 1 ? "pt" : "pts"}
            </span>
          </div>
        ))}
      </div>
      {room.viewer.isHost ? (
        <button
          className="primary-button"
          disabled={returning}
          onClick={onReturnToLobby}
        >
          {returning ? "Opening lobby..." : "Play another round"}
        </button>
      ) : (
        <p className="microcopy">
          Waiting for the host to open the next round.
        </p>
      )}
      {error && <p className="error-message">{error}</p>}
    </div>
  );
}

function LoadingRoom() {
  return (
    <div className="state-message">
      <span className="eyebrow">Opening room</span>
      <h2>Connecting...</h2>
    </div>
  );
}

function LockedRoom({ onLeave }) {
  return (
    <div className="state-message">
      <span className="eyebrow">Round in progress</span>
      <h2>Joining is locked for this round.</h2>
      <button className="primary-button" onClick={onLeave}>
        Create a room
      </button>
    </div>
  );
}

function MissingRoom({ onLeave }) {
  return (
    <div className="state-message">
      <span className="eyebrow">Room not found</span>
      <h2>This invite has expired or is incorrect.</h2>
      <button className="primary-button" onClick={onLeave}>
        Create a room
      </button>
    </div>
  );
}

function GameShell({
  stageNumber,
  children,
  leaving = false,
  onLeaveRoom,
  showIntro = false,
}) {
  return (
    <main className="game-app">
      <header className="party-header">
        <a className="brand" href="/">
          WORDLORD<span>beta</span>
        </a>
        <div className="round-pill">One letter · Loads of words</div>
        {onLeaveRoom ? (
          <button
            className="header-link"
            disabled={leaving}
            onClick={onLeaveRoom}
          >
            {leaving ? "Leaving..." : "Leave room"}
          </button>
        ) : (
          <button className="header-link">How to play</button>
        )}
      </header>

      <div className="party-shell">
        <aside className="stage-rail" aria-label="Game progress">
          {["Room", "Lobby", "Play", "Reveal", "Results"].map((label, index) => (
            <div
              className={
                stageNumber === index + 1
                  ? "active"
                  : stageNumber > index + 1
                    ? "done"
                    : ""
              }
              key={label}
            >
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </aside>
        <section className="party-panel">
          {showIntro && (
            <div className="panel-intro">
              <span className="eyebrow">Host a game</span>
              <h1>
                Pick a letter.
                <br />
                Empty your brain.
              </h1>
              <p>
                Make a room, invent the categories, and see which friend thinks
                fastest.
              </p>
            </div>
          )}
          {children}
        </section>
      </div>
      <div className="sticker sticker-one">A–Я</div>
      <div className="sticker sticker-two">GO!</div>
    </main>
  );
}

function RoomApp() {
  const playerToken = useMemo(getPlayerToken, []);
  const [roomCode, navigateToRoom] = useRoomNavigation();
  const [copied, setCopied] = useState(false);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const [revealError, setRevealError] = useState("");
  const [advancingReveal, setAdvancingReveal] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [returning, setReturning] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const createRoom = useMutation(api.rooms.create);
  const joinRoom = useMutation(api.rooms.join);
  const heartbeat = useMutation(api.rooms.heartbeat);
  const leaveRoom = useMutation(api.rooms.leave);
  const setReady = useMutation(api.rooms.setReady);
  const startRound = useMutation(api.rooms.startRound);
  const saveAnswer = useMutation(api.rooms.saveAnswer);
  const advanceReveal = useMutation(api.rooms.advanceReveal);
  const returnToLobby = useMutation(api.rooms.returnToLobby);
  const room = useQuery(
    api.rooms.get,
    roomCode ? { code: roomCode, playerToken } : "skip",
  );

  useEffect(() => {
    if (!room) return;
    setAdvancingReveal(false);
    if (room.status !== "lobby") setStarting(false);
    if (room.status === "lobby") setReturning(false);
  }, [room?.status, room?.revealIndex]);

  useEffect(() => {
    if (!roomCode || !room?.viewer) return undefined;

    const sendHeartbeat = () => {
      heartbeat({ code: roomCode, playerToken }).catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") sendHeartbeat();
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 10_000);
    window.addEventListener("focus", sendHeartbeat);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", sendHeartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [heartbeat, playerToken, room?.viewer?.id, roomCode]);

  const handleCreate = async (settings) => {
    const result = await createRoom({
      ...settings,
      hostToken: playerToken,
    });
    navigateToRoom(result.code);
  };

  const handleJoin = async (playerName) => {
    await joinRoom({
      code: roomCode,
      playerToken,
      playerName,
    });
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const handleStartRound = async () => {
    setStarting(true);
    setStartError("");
    try {
      await startRound({ code: roomCode, hostToken: playerToken });
    } catch (error) {
      setStartError(getErrorMessage(error));
      setStarting(false);
    }
  };

  const handleAdvanceReveal = async () => {
    setAdvancingReveal(true);
    setRevealError("");
    try {
      await advanceReveal({ code: roomCode, hostToken: playerToken });
    } catch (error) {
      setRevealError(getErrorMessage(error));
      setAdvancingReveal(false);
    }
  };

  const handleReturnToLobby = async () => {
    setReturning(true);
    setReturnError("");
    try {
      await returnToLobby({ code: roomCode, hostToken: playerToken });
    } catch (error) {
      setReturnError(getErrorMessage(error));
      setReturning(false);
    }
  };

  const handleLeaveRoom = async () => {
    setLeaving(true);
    try {
      await leaveRoom({ code: roomCode, playerToken });
      navigateToRoom("");
    } catch {
      setLeaving(false);
    }
  };

  if (!roomCode) {
    return (
      <GameShell showIntro stageNumber={1}>
        <SetupForm onCreate={handleCreate} />
      </GameShell>
    );
  }

  if (room === undefined) {
    return (
      <GameShell stageNumber={2}>
        <LoadingRoom />
      </GameShell>
    );
  }

  if (room === null) {
    return (
      <GameShell stageNumber={2}>
        <MissingRoom onLeave={() => navigateToRoom("")} />
      </GameShell>
    );
  }

  if (!room.viewer) {
    if (room.status !== "lobby") {
      return (
        <GameShell stageNumber={room.status === "playing" ? 3 : 4}>
          <LockedRoom onLeave={() => navigateToRoom("")} />
        </GameShell>
      );
    }

    return (
      <GameShell stageNumber={2}>
        <JoinRoom
          onJoin={handleJoin}
          onLeave={() => navigateToRoom("")}
          room={room}
        />
      </GameShell>
    );
  }

  if (room.status === "playing") {
    return (
      <GameShell
        leaving={leaving}
        onLeaveRoom={handleLeaveRoom}
        stageNumber={3}
      >
        <PlayingRound
          onSaveAnswer={(categoryIndex, value) =>
            saveAnswer({
              code: room.code,
              playerToken,
              categoryIndex,
              value,
            })
          }
          room={room}
        />
      </GameShell>
    );
  }

  if (room.status === "reveal") {
    return (
      <GameShell
        leaving={leaving}
        onLeaveRoom={handleLeaveRoom}
        stageNumber={4}
      >
        <RevealRound
          advancing={advancingReveal}
          error={revealError}
          onAdvance={handleAdvanceReveal}
          room={room}
        />
      </GameShell>
    );
  }

  if (room.status === "results") {
    return (
      <GameShell
        leaving={leaving}
        onLeaveRoom={handleLeaveRoom}
        stageNumber={5}
      >
        <Results
          error={returnError}
          onReturnToLobby={handleReturnToLobby}
          returning={returning}
          room={room}
        />
      </GameShell>
    );
  }

  return (
    <GameShell
      leaving={leaving}
      onLeaveRoom={handleLeaveRoom}
      stageNumber={2}
    >
      <Lobby
        copied={copied}
        onCopyLink={handleCopyLink}
        onStartRound={handleStartRound}
        onSetReady={(ready) =>
          setReady({ code: room.code, playerToken, ready })
        }
        room={room}
        startError={startError}
        starting={starting}
      />
    </GameShell>
  );
}

function Root() {
  if (!convex) {
    return (
      <div className="configuration-error">
        Missing <code>VITE_CONVEX_URL</code>. Start Convex before the frontend.
      </div>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <RoomApp />
    </ConvexProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
