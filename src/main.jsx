import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
} from "convex/react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import { getArenaLayout } from "./arenaLayout";
import { PlayerArena } from "./PlayerArena";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

const LANGUAGES = ["Russian", "Kazakh", "English", "Japanese"];
const INITIAL_CATEGORIES = [
  "Болезнь",
  "Фильм",
  "Песня",
  "Станция в Токио",
];
const MIN_ROUND_SECONDS = 5;
const MAX_ROUND_SECONDS = 60 * 60;
const MAX_SECONDS_FIELD = 59;
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

function formatDuration(seconds, style = "long") {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return style === "short"
      ? `${seconds} sec`
      : `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  if (remainingSeconds === 0) {
    return style === "short"
      ? `${minutes} min`
      : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  return style === "short"
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes} min ${remainingSeconds} sec`;
}

function getDurationSeconds(minutesValue, secondsValue) {
  const minutes = minutesValue === "" ? 0 : Number(minutesValue);
  const seconds = secondsValue === "" ? 0 : Number(secondsValue);
  const durationSeconds = minutes * 60 + seconds;

  if (
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds > MAX_SECONDS_FIELD ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds < MIN_ROUND_SECONDS ||
    durationSeconds > MAX_ROUND_SECONDS
  ) {
    return null;
  }
  return durationSeconds;
}

function SetupForm({ onCreate }) {
  const [hostName, setHostName] = useState("");
  const [language, setLanguage] = useState("Russian");
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [durationMinutes, setDurationMinutes] = useState("1");
  const [durationSeconds, setDurationSeconds] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const categoryListRef = useRef(null);
  const [hasHiddenCategories, setHasHiddenCategories] = useState(false);

  const updateCategoryScrollCue = () => {
    const list = categoryListRef.current;
    if (!list) return;

    const overflows = list.scrollHeight > list.clientHeight + 1;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
    setHasHiddenCategories(overflows && !atBottom);
  };

  useEffect(() => {
    updateCategoryScrollCue();
    window.addEventListener("resize", updateCategoryScrollCue);
    return () => window.removeEventListener("resize", updateCategoryScrollCue);
  }, [categories.length]);

  const updateCategory = (index, value) => {
    setCategories((current) =>
      current.map((category, categoryIndex) =>
        categoryIndex === index ? value : category,
      ),
    );
  };

  const addCategory = () => {
    setCategories((current) => [...current, ""]);
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

    const roundDurationSeconds = getDurationSeconds(
      durationMinutes,
      durationSeconds,
    );
    if (!roundDurationSeconds) {
      setError("Choose a round time from 5 seconds up to 60 minutes.");
      setSubmitting(false);
      return;
    }

    try {
      await onCreate({
        hostName,
        language,
        categories,
        durationSeconds: roundDurationSeconds,
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
        <div className={`category-list-frame ${hasHiddenCategories ? "has-more" : ""}`}>
          <div
            className="category-list"
            onScroll={updateCategoryScrollCue}
            ref={categoryListRef}
          >
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
        </div>
        <button
          className="text-button"
          onClick={addCategory}
          type="button"
        >
          + Add category
        </button>
      </div>

      <div className="field">
        <span>Round time</span>
        <div className="duration-inputs">
          <label className="duration-part">
            <span>Minutes</span>
            <input
              aria-label="Round time minutes"
              inputMode="numeric"
              max={Math.floor(MAX_ROUND_SECONDS / 60)}
              min={0}
              onChange={(event) => setDurationMinutes(event.target.value)}
              step={1}
              type="number"
              value={durationMinutes}
            />
          </label>
          <label className="duration-part">
            <span>Seconds</span>
            <input
              aria-label="Round time seconds"
              inputMode="numeric"
              max={MAX_SECONDS_FIELD}
              min={0}
              onChange={(event) => setDurationSeconds(event.target.value)}
              step={5}
              type="number"
              value={durationSeconds}
            />
          </label>
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
        {formatDuration(room.durationSeconds)}
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
        <span>{formatDuration(room.durationSeconds, "short")}</span>
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
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [saveError, setSaveError] = useState("");
  const secondsLeft = useSecondsLeft(room.roundEndsAt);
  const answerCount = answers.filter((answer) => answer.trim()).length;
  const activeAnswer = answers[activeCategoryIndex] ?? "";
  const activeCategory = room.categories[activeCategoryIndex];
  const isLastCategory = activeCategoryIndex === room.categories.length - 1;

  useEffect(() => {
    setAnswers(room.viewerAnswers);
    setActiveCategoryIndex(0);
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

  const clearActiveAnswer = () => {
    updateAnswer(activeCategoryIndex, "");
  };

  const advanceCategory = () => {
    if (isLastCategory) {
      const firstEmptyCategory = answers.findIndex((answer) => !answer.trim());
      setActiveCategoryIndex(firstEmptyCategory === -1 ? 0 : firstEmptyCategory);
      return;
    }
    setActiveCategoryIndex((current) => current + 1);
  };

  return (
    <div className="playing-content arena-round">
      <div className="arena-stage">
        <PlayerArena
          letter={room.letter}
          players={room.players}
          viewerId={room.viewer.id}
        />

        <div className="arena-hud">
          <div>
            <span className="eyebrow">Round {room.roundNumber}</span>
            <strong>{room.language}</strong>
          </div>
          <div className="arena-progress-count">
            <span>Words locked in</span>
            <strong>
              {answerCount}/{room.categories.length}
            </strong>
          </div>
          <div className={`arena-clock ${secondsLeft <= 10 ? "urgent" : ""}`}>
            <span>Time left</span>
            <strong>
              {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </strong>
          </div>
        </div>

        <section
          aria-labelledby="active-category"
          className="answer-command-board"
        >
          <div className="answer-board-heading">
            <span>
              Category {activeCategoryIndex + 1} / {room.categories.length}
            </span>
            <strong id="active-category">{activeCategory}</strong>
          </div>
          <div className="answer-board-control">
            <span className="answer-letter-cue">{room.letter}</span>
            <input
              autoFocus
              disabled={secondsLeft === 0}
              key={`${room.roundNumber}-${activeCategoryIndex}`}
              maxLength={120}
              onChange={(event) =>
                updateAnswer(activeCategoryIndex, event.target.value)
              }
              placeholder={`Type a word beginning with ${room.letter}…`}
              value={activeAnswer}
            />
            <button
              aria-label={`Clear answer for ${activeCategory}`}
              className="answer-reject"
              disabled={secondsLeft === 0 || !activeAnswer}
              onClick={clearActiveAnswer}
              type="button"
            >
              ×
            </button>
            <button
              aria-label={
                isLastCategory
                  ? "Review unanswered categories"
                  : "Go to next category"
              }
              className="answer-confirm"
              disabled={secondsLeft === 0}
              onClick={advanceCategory}
              type="button"
            >
              ✓
            </button>
          </div>
          <div className="answer-category-tabs" aria-label="Answer categories">
            {room.categories.map((category, index) => (
              <button
                aria-label={`${category}: ${
                  answers[index]?.trim() ? "answered" : "unanswered"
                }`}
                className={[
                  index === activeCategoryIndex ? "active" : "",
                  answers[index]?.trim() ? "answered" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={`${category}-${index}`}
                onClick={() => setActiveCategoryIndex(index)}
                type="button"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{category}</strong>
              </button>
            ))}
          </div>
          {saveError && <p className="error-message">{saveError}</p>}
        </section>

        <div className="arena-help">
          <span className="arena-live-dot" />
          Answers save live · Every word starts with {room.letter}
        </div>
      </div>
    </div>
  );
}

function RevealRound({
  room,
  advancing,
  error,
  onAdvance,
  onVote,
  votingAnswerId,
}) {
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [advancingPlayer, setAdvancingPlayer] = useState(false);
  const [reviewComplete, setReviewComplete] = useState(false);
  const isLastCategory =
    room.reveal.categoryIndex === room.categories.length - 1;
  const clockwisePlayers = getArenaLayout(room.players, room.viewer.id);
  const activePlayer = clockwisePlayers[activePlayerIndex] ?? clockwisePlayers[0];
  const activeAnswer = room.reveal.answers.find(
    (answer) => answer.playerId === activePlayer?.id,
  );
  const hasAnswer = Boolean(activeAnswer?.value.trim());
  const isOwnAnswer = activePlayer?.id === room.viewer.id;

  useEffect(() => {
    setActivePlayerIndex(0);
    setAdvancingPlayer(false);
    setReviewComplete(false);
  }, [room.reveal.categoryIndex]);

  const moveClockwise = () => {
    if (activePlayerIndex >= clockwisePlayers.length - 1) {
      setReviewComplete(true);
      return;
    }
    setActivePlayerIndex((current) => current + 1);
  };

  const handleVoteAndContinue = async (approved) => {
    if (!activePlayer) return;
    setAdvancingPlayer(true);
    try {
      await onVote(activePlayer.id, approved);
      moveClockwise();
    } catch {
      // The shared reveal error is rendered on the voting board.
    } finally {
      setAdvancingPlayer(false);
    }
  };

  return (
    <div className="reveal-content arena-round">
      <div className="arena-stage arena-reveal-stage">
        <PlayerArena
          focusedPlayerId={reviewComplete ? null : activePlayer?.id}
          letter={room.letter}
          mode="reveal"
          players={room.players}
          viewerId={room.viewer.id}
        />

        <div className="arena-hud">
          <div>
            <span className="eyebrow">Voting round</span>
            <strong>{room.reveal.category}</strong>
          </div>
          <div className="arena-progress-count">
            <span>Category</span>
            <strong>
              {room.reveal.categoryIndex + 1}/{room.categories.length}
            </strong>
          </div>
          <div className="arena-clock">
            <span>Clockwise seat</span>
            <strong>
              {reviewComplete
                ? clockwisePlayers.length
                : activePlayerIndex + 1}
              /{clockwisePlayers.length}
            </strong>
          </div>
        </div>

        <section
          aria-live="polite"
          className="answer-command-board voting-command-board"
        >
          <div className="clockwise-progress" aria-label="Clockwise vote progress">
            {clockwisePlayers.map((player, index) => (
              <span
                className={
                  reviewComplete || index < activePlayerIndex
                    ? "visited"
                    : index === activePlayerIndex
                      ? "active"
                      : ""
                }
                key={player.id}
                title={player.name}
              />
            ))}
          </div>

          {reviewComplete ? (
            <div className="vote-finished">
              <span className="eyebrow">Your circuit is complete</span>
              <strong>Your votes are in.</strong>
              <p>
                {room.reveal.votingComplete
                  ? "Everyone has finished this category."
                  : "Waiting for the other players to finish their circuit."}
              </p>
              {room.viewer.isHost ? (
                <button
                  className="arena-primary-action"
                  disabled={advancing || !room.reveal.votingComplete}
                  onClick={onAdvance}
                >
                  {!room.reveal.votingComplete
                    ? "Waiting for votes..."
                    : advancing
                      ? "Updating..."
                      : isLastCategory
                        ? "Reveal results"
                        : "Next category"}
                </button>
              ) : (
                <span className="vote-waiting-note">
                  {room.reveal.votingComplete
                    ? "Waiting for the host to continue."
                    : "The arena updates as votes arrive."}
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="vote-player-heading">
                <span>
                  Seat {activePlayerIndex + 1} · {room.reveal.category}
                </span>
                <strong>{activePlayer?.name}</strong>
              </div>
              <div
                className={`arena-answer-reveal ${
                  hasAnswer ? "" : "is-empty"
                }`}
              >
                <span>{room.letter}</span>
                <strong>{activeAnswer?.value.trim() || "No answer"}</strong>
              </div>
              {isOwnAnswer || !hasAnswer ? (
                <div className="vote-skip-row">
                  <span>
                    {isOwnAnswer
                      ? "Your approval is automatic."
                      : "No vote is needed for an empty answer."}
                  </span>
                  <button
                    className="arena-primary-action"
                    onClick={moveClockwise}
                  >
                    Continue clockwise
                  </button>
                </div>
              ) : (
                <div className="arena-vote-actions">
                  <button
                    className={
                      activeAnswer?.viewerVote === false ? "active reject" : ""
                    }
                    disabled={
                      advancingPlayer ||
                      votingAnswerId === activePlayer?.id
                    }
                    onClick={() => handleVoteAndContinue(false)}
                  >
                    <span>×</span>
                    Reject
                  </button>
                  <button
                    className={
                      activeAnswer?.viewerVote === true ? "active approve" : ""
                    }
                    disabled={
                      advancingPlayer ||
                      votingAnswerId === activePlayer?.id
                    }
                    onClick={() => handleVoteAndContinue(true)}
                  >
                    <span>✓</span>
                    Approve
                  </button>
                </div>
              )}
            </>
          )}
          {error && <p className="error-message">{error}</p>}
        </section>

        <div className="arena-help">
          <span className="arena-live-dot" />
          Voting moves clockwise around the arena
        </div>
      </div>
    </div>
  );
}

function Results({ room, error, onReturnToLobby, returning }) {
  const noWinner = room.results.winners.length === 0;
  const tied = room.results.winners.length > 1;
  const winnerStandings = room.results.standings.filter(
    (standing) => standing.isWinner,
  );
  const winnerNames = room.results.winners
    .map((winner) => winner.name)
    .join(" & ");

  return (
    <div className="results-content arena-round">
      <div className="arena-stage arena-results-stage">
        <PlayerArena
          letter={room.letter}
          mode="results"
          players={room.players}
          standings={room.results.standings}
          viewerId={room.viewer.id}
        />

        <section className="arena-results-banner">
          <span className="eyebrow">Round {room.roundNumber} complete</span>
          <h2>
            {noWinner
              ? "No winner this round"
              : tied
                ? "A royal tie"
                : `${winnerNames} wins`}
          </h2>
          <p>
            {noWinner
              ? "No answers earned majority approval."
              : `${winnerNames} ${
                  tied ? "each receive a crown." : "takes the crown."
                }`}
          </p>
          {!noWinner && (
            <div className="arena-winner-stats">
              {winnerStandings.map((standing) => (
                <span key={standing.playerId}>
                  <strong>{standing.roundScore}</strong>{" "}
                  {standing.roundScore === 1 ? "approved word" : "approved words"}
                  <em>·</em>
                  <strong>{standing.points}</strong> total{" "}
                  {standing.points === 1 ? "point" : "points"}
                </span>
              ))}
            </div>
          )}
          {room.viewer.isHost ? (
            <button
              className="arena-primary-action"
              disabled={returning}
              onClick={onReturnToLobby}
            >
              {returning ? "Opening lobby..." : "Play another round"}
            </button>
          ) : (
            <span className="vote-waiting-note">
              Waiting for the host to open the next round.
            </span>
          )}
          {error && <p className="error-message">{error}</p>}
        </section>

        <div className="arena-help">
          <span className="arena-live-dot" />
          Round score and total points are shown above every player
        </div>
      </div>
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

function HowToPlay({ onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="how-to-play-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="how-to-play-title"
        aria-modal="true"
        className="how-to-play-panel"
        role="dialog"
      >
        <div className="how-to-play-heading">
          <div>
            <span className="eyebrow">The rules</span>
            <h2 id="how-to-play-title">How to play Wordlord</h2>
          </div>
          <button
            aria-label="Close how to play"
            className="how-to-play-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="how-to-play-intro">
          Think fast, defend your answers, and let the room decide what counts.
        </p>

        <ol className="how-to-play-steps">
          <li>
            <span>01</span>
            <div>
              <strong>Make the room</strong>
              <p>The host picks the language, categories, and round time.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Race the clock</strong>
              <p>Fill each category with an answer beginning with the letter.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Judge the words</strong>
              <p>Approve or reject other players’ answers during the reveal.</p>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <strong>Claim the round</strong>
              <p>Only majority-approved answers score. Most valid words win.</p>
            </div>
          </li>
        </ol>

        <div className="how-to-play-note">
          <strong>Majority rules</strong>
          <span>Your own answer starts with your approval.</span>
        </div>
      </section>
    </div>
  );
}

function GameShell({
  stageNumber,
  children,
  immersive = false,
  leaving = false,
  onLeaveRoom,
  showIntro = false,
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  return (
    <main className={`game-app ${immersive ? "is-immersive-app" : ""}`}>
      <header className="party-header">
        <a className="brand" href="/">WORDLORD</a>
        <div className="round-pill">One letter · Loads of words</div>
        <div className="header-actions">
          <button
            className="header-link how-to-play-trigger"
            onClick={() => setShowHowToPlay(true)}
          >
            How to play
          </button>
          {onLeaveRoom && (
            <button
              className="header-link leave-room-link"
              disabled={leaving}
              onClick={onLeaveRoom}
            >
              {leaving ? "Leaving..." : "Leave room"}
            </button>
          )}
        </div>
      </header>

      {showHowToPlay && (
        <HowToPlay onClose={() => setShowHowToPlay(false)} />
      )}

      <div className={`party-shell ${immersive ? "is-immersive" : ""}`}>
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
  const [votingAnswerId, setVotingAnswerId] = useState("");
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
  const voteAnswer = useMutation(api.rooms.voteAnswer);
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

  const handleVote = async (answerPlayerId, approved) => {
    setVotingAnswerId(answerPlayerId);
    setRevealError("");
    try {
      await voteAnswer({
        code: roomCode,
        playerToken,
        answerPlayerId,
        approved,
      });
    } catch (error) {
      setRevealError(getErrorMessage(error));
      throw error;
    } finally {
      setVotingAnswerId("");
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
        immersive
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
        immersive
        leaving={leaving}
        onLeaveRoom={handleLeaveRoom}
        stageNumber={4}
      >
        <RevealRound
          advancing={advancingReveal}
          error={revealError}
          onAdvance={handleAdvanceReveal}
          onVote={handleVote}
          room={room}
          votingAnswerId={votingAnswerId}
        />
      </GameShell>
    );
  }

  if (room.status === "results") {
    return (
      <GameShell
        immersive
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
