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
const PLAYER_TOKEN_KEY = "obds-player-token";

function getPlayerToken() {
  const storedToken = window.localStorage.getItem(PLAYER_TOKEN_KEY);
  if (storedToken) return storedToken;

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

function Lobby({ room, copied, onCopyLink, onSetReady }) {
  const readyCount = room.players.filter((player) => player.ready).length;
  const allReady = room.players.length > 1 && readyCount === room.players.length;

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
            {readyCount}/{room.players.length} ready
          </span>
        </div>
        {room.players.map((player) => {
          const isViewer = player.id === room.viewer.id;
          return (
            <div className="player-row" key={player.id}>
              <div className="avatar">{player.name.slice(0, 1).toUpperCase()}</div>
              <div className="player-name">
                <strong>
                  {player.name}
                  {isViewer ? " (you)" : ""}
                </strong>
                <span>{player.isHost ? "Host" : "Player"}</span>
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
                  {player.ready ? "Ready" : "Not ready"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {room.viewer.isHost && (
        <button className="primary-button" disabled>
          Start round
        </button>
      )}

      <p className="microcopy">
        {allReady
          ? "Everyone is ready. Shared round start and timer are the next slice."
          : "This lobby updates live. Everyone marks themselves ready."}
      </p>
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

function GameShell({ stageNumber, children, showIntro = false }) {
  return (
    <main className="game-app">
      <header className="party-header">
        <a className="brand" href="/">
          ОБДС<span>beta</span>
        </a>
        <div className="round-pill">One letter · Loads of words</div>
        <button className="header-link">How to play</button>
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
  const createRoom = useMutation(api.rooms.create);
  const joinRoom = useMutation(api.rooms.join);
  const setReady = useMutation(api.rooms.setReady);
  const room = useQuery(
    api.rooms.get,
    roomCode ? { code: roomCode, playerToken } : "skip",
  );

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

  return (
    <GameShell stageNumber={2}>
      <Lobby
        copied={copied}
        onCopyLink={handleCopyLink}
        onSetReady={(ready) =>
          setReady({ code: room.code, playerToken, ready })
        }
        room={room}
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
