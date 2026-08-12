import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
} from "convex/react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import {
  getRandomCategoryCount,
  pickRandomCategories,
} from "./categories";
import {
  formatRoomCodeInput,
  isCompleteRoomCode,
} from "./roomCode";
import { getViewerVoteProgress } from "./voting";
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
const MAX_ROUND_SECONDS = 2 * 60;
const FINAL_COUNTDOWN_SECONDS = 5;
const PLAYER_TOKEN_KEY = "aripter-player-token";
const LEGACY_PLAYER_TOKEN_KEYS = [
  "wordlord-player-token",
  "obds-player-token",
];

function getPlayerToken() {
  const storedToken = window.localStorage.getItem(PLAYER_TOKEN_KEY);
  if (storedToken) return storedToken;

  for (const legacyKey of LEGACY_PLAYER_TOKEN_KEYS) {
    const legacyToken = window.localStorage.getItem(legacyKey);
    if (legacyToken) {
      window.localStorage.setItem(PLAYER_TOKEN_KEY, legacyToken);
      window.localStorage.removeItem(legacyKey);
      return legacyToken;
    }
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

function SetupForm({ onCreate }) {
  const [hostName, setHostName] = useState("");
  const [language, setLanguage] = useState("Russian");
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [durationSeconds, setDurationSeconds] = useState(60);
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

  const randomizeCategories = () => {
    setCategories(pickRandomCategories(language, durationSeconds));
    requestAnimationFrame(() => {
      categoryListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
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

    if (
      !Number.isInteger(durationSeconds) ||
      durationSeconds < MIN_ROUND_SECONDS ||
      durationSeconds > MAX_ROUND_SECONDS
    ) {
      setError("Choose a round time from 5 seconds up to 2 minutes.");
      setSubmitting(false);
      return;
    }

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
        <div className="category-heading">
          <span>Categories</span>
          <button
            className="randomize-button"
            onClick={randomizeCategories}
            type="button"
          >
            <span aria-hidden="true">↻</span>
            Randomize {getRandomCategoryCount(durationSeconds)}
          </button>
        </div>
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
        <div className="duration-heading">
          <span>Round time</span>
          <strong>{formatDuration(durationSeconds)}</strong>
        </div>
        <div className="duration-control">
          <input
            aria-label="Round time"
            max={MAX_ROUND_SECONDS}
            min={MIN_ROUND_SECONDS}
            onChange={(event) => setDurationSeconds(Number(event.target.value))}
            step={5}
            type="range"
            value={durationSeconds}
          />
          <div className="duration-scale" aria-hidden="true">
            <span>0:05</span>
            <span>1:00</span>
            <span>1:30</span>
            <span>2:00 max</span>
          </div>
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

function LetterHistory({ letters }) {
  if (letters.length === 0) return null;

  return (
    <div className="letter-history">
      <span className="eyebrow">Letters played</span>
      <div>
        {letters.map((letter, index) => (
          <span key={`${letter}-${index}`}>{letter}</span>
        ))}
      </div>
    </div>
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
        <span>
          {room.remainingLetters}/{room.totalLetters} letters left
        </span>
      </div>
      <LetterHistory letters={room.letterHistory} />

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
          disabled={!allReady || starting || room.remainingLetters === 0}
          onClick={onStartRound}
        >
          {room.remainingLetters === 0
            ? "All letters played"
            : starting
              ? "Starting..."
              : "Start round"}
        </button>
      )}

      {startError && <p className="error-message">{startError}</p>}
      <p className="microcopy">
        {room.remainingLetters === 0
          ? "This room has played every letter in its alphabet."
          : allReady
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

function SkipVoteDialog({ error, onVote, room, voting }) {
  const hasVoted = room.skipVote.viewerVote !== null;

  return (
    <div className="skip-vote-backdrop">
      <section
        aria-labelledby="skip-vote-title"
        aria-modal="true"
        className="skip-vote-panel"
        role="dialog"
      >
        <span className="eyebrow">Room vote</span>
        <h2 id="skip-vote-title">Skip the letter {room.letter}?</h2>
        <p>
          A majority vote will discard this round and immediately start a new
          timer with an unused letter.
        </p>
        <div className="skip-vote-count">
          <strong>
            {room.skipVote.yesVotes}/{room.skipVote.requiredYesVotes}
          </strong>
          <span>skip votes needed</span>
        </div>
        {hasVoted ? (
          <p className="skip-vote-waiting">
            Vote cast: {room.skipVote.viewerVote ? "skip it" : "keep it"}. Waiting
            for the room ({room.skipVote.votesCast}/{room.skipVote.playerCount}).
          </p>
        ) : (
          <div className="skip-vote-actions">
            <button
              className="secondary-button"
              disabled={voting}
              onClick={() => onVote(false)}
            >
              Keep this letter
            </button>
            <button
              className="primary-button"
              disabled={voting}
              onClick={() => onVote(true)}
            >
              {voting ? "Casting vote..." : "Skip this round"}
            </button>
          </div>
        )}
        {error && <p className="error-message">{error}</p>}
      </section>
    </div>
  );
}

function PlayingRound({
  finishing,
  finishError,
  initiatingSkip,
  onFinish,
  onInitiateSkip,
  onSaveAnswer,
  onSkipVote,
  room,
  skipError,
  votingToSkip,
}) {
  const [answers, setAnswers] = useState(room.viewerAnswers);
  const [saveError, setSaveError] = useState("");
  const secondsLeft = useSecondsLeft(room.roundEndsAt);
  const answerCount = answers.filter((answer) => answer.trim()).length;
  const allAnswersComplete = answerCount === room.categories.length;

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
        {room.finalCountdown && (
          <div className="final-countdown-banner" role="status">
            <strong>{room.finalCountdown.playerName} finished!</strong>
            <span>Five seconds left for everyone.</span>
          </div>
        )}
        <p>Every answer must begin with this letter.</p>
        <span className="letters-remaining">
          {room.remainingLetters} unused {room.remainingLetters === 1 ? "letter" : "letters"}
          {" "}remain
        </span>
        {room.viewer.isHost && (
          <button
            className="secondary-button request-skip-button"
            disabled={
              initiatingSkip ||
              Boolean(room.skipVote) ||
              Boolean(room.finalCountdown) ||
              room.remainingLetters === 0
            }
            onClick={onInitiateSkip}
          >
            {room.remainingLetters === 0
              ? "No replacement letters left"
              : initiatingSkip
                ? "Opening vote..."
                : "Ask to skip this letter"}
          </button>
        )}
        {!room.skipVote && skipError && (
          <p className="error-message round-error">{skipError}</p>
        )}
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
        <button
          className="primary-button done-button"
          disabled={
            !allAnswersComplete ||
            secondsLeft <= FINAL_COUNTDOWN_SECONDS ||
            finishing ||
            Boolean(room.finalCountdown)
          }
          onClick={onFinish}
          type="button"
        >
          {room.finalCountdown
            ? "Final countdown started"
            : secondsLeft <= FINAL_COUNTDOWN_SECONDS
              ? "Final seconds underway"
              : finishing
                ? "Starting countdown..."
                : "Done · Start final 5 seconds"}
        </button>
        {finishError && <p className="error-message">{finishError}</p>}
        <p className="microcopy">
          {secondsLeft <= FINAL_COUNTDOWN_SECONDS
            ? "Final seconds underway. Answers lock when the timer reaches zero."
            : allAnswersComplete
              ? "Ready? Press Done to give everyone five final seconds."
              : "Fill every category to unlock Done. Answers save automatically."}
        </p>
      </div>
      {room.skipVote && (
        <SkipVoteDialog
          error={skipError}
          onVote={onSkipVote}
          room={room}
          voting={votingToSkip}
        />
      )}
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
  const isLastCategory =
    room.reveal.categoryIndex === room.categories.length - 1;
  const answerCardRefs = useRef(new Map());
  const previousVoteStateRef = useRef({
    categoryIndex: room.reveal.categoryIndex,
    remaining: null,
  });
  const voteProgress = getViewerVoteProgress(
    room.reveal.answers,
    room.viewer.id,
  );
  const firstPendingAnswer = room.reveal.answers.find(
    (answer) =>
      answer.playerId !== room.viewer.id &&
      Boolean(answer.value.trim()) &&
      answer.viewerVote === null,
  );

  useEffect(() => {
    const previous = previousVoteStateRef.current;
    const categoryChanged =
      previous.categoryIndex !== room.reveal.categoryIndex;
    const voteWasAdded =
      !categoryChanged &&
      previous.remaining !== null &&
      voteProgress.remaining < previous.remaining;

    previousVoteStateRef.current = {
      categoryIndex: room.reveal.categoryIndex,
      remaining: voteProgress.remaining,
    };

    if (!voteWasAdded || !firstPendingAnswer) return;

    const nextCard = answerCardRefs.current.get(firstPendingAnswer.playerId);
    nextCard?.scrollIntoView({ behavior: "smooth", block: "center" });
    nextCard?.querySelector("button")?.focus({ preventScroll: true });
  }, [
    firstPendingAnswer,
    room.reveal.categoryIndex,
    voteProgress.remaining,
  ]);

  return (
    <div className="reveal-content">
      <div className="reveal-progress">
        {room.categories.map((category, index) => (
          <span
            className={index <= room.reveal.categoryIndex ? "seen" : ""}
            key={`${category}-${index}`}
          />
        ))}
      </div>
      <span className="eyebrow">
        Category {room.reveal.categoryIndex + 1} of {room.categories.length}
      </span>
      <h2>{room.reveal.category}</h2>
      <div
        aria-live="polite"
        className={`personal-vote-progress ${
          voteProgress.isComplete ? "is-complete" : ""
        }`}
      >
        <strong>
          {voteProgress.isComplete
            ? "All your votes are in"
            : `${voteProgress.remaining} vote${
                voteProgress.remaining === 1 ? "" : "s"
              } left`}
        </strong>
        <span>
          {voteProgress.completed} of {voteProgress.total} complete
        </span>
      </div>
      <div className="reveal-grid">
        {room.reveal.answers.map((answer, index) => {
          const needsViewerVote =
            answer.playerId !== room.viewer.id &&
            Boolean(answer.value.trim()) &&
            answer.viewerVote === null;

          return (
            <article
              className={`answer-card ${
                answer.approved
                  ? "is-approved"
                  : answer.votingComplete && answer.value.trim()
                    ? "is-rejected"
                    : ""
              } ${needsViewerVote ? "needs-viewer-vote" : ""}`}
              key={answer.playerId}
              ref={(node) => {
                if (node) answerCardRefs.current.set(answer.playerId, node);
                else answerCardRefs.current.delete(answer.playerId);
              }}
              style={{ "--delay": `${index * 90}ms` }}
            >
              <div className="avatar">
                {answer.name.slice(0, 1).toUpperCase()}
              </div>
              <span>{answer.name}</span>
              <strong>{answer.value.trim() || "No answer"}</strong>
              {answer.value.trim() ? (
                <>
                  <em className="vote-summary">
                    {answer.approved
                      ? `Approved · +1`
                      : answer.votingComplete
                        ? "Rejected · 0"
                        : `${answer.approvals} approval${
                            answer.approvals === 1 ? "" : "s"
                          } · ${answer.requiredApprovals} needed`}
                  </em>
                  {answer.playerId === room.viewer.id ? (
                    <span className="own-vote">
                      Your approval is automatic.
                    </span>
                  ) : (
                    <>
                      {needsViewerVote && (
                        <span className="vote-needed">Your vote needed</span>
                      )}
                      <div className="vote-actions">
                        <button
                          aria-label={`Approve ${answer.name}'s answer`}
                          className={
                            answer.viewerVote === true ? "active approve" : ""
                          }
                          disabled={votingAnswerId === answer.playerId}
                          onClick={() => onVote(answer.playerId, true)}
                        >
                          Approve
                        </button>
                        <button
                          aria-label={`Reject ${answer.name}'s answer`}
                          className={
                            answer.viewerVote === false ? "active reject" : ""
                          }
                          disabled={votingAnswerId === answer.playerId}
                          onClick={() => onVote(answer.playerId, false)}
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <em className="vote-summary">No vote needed · 0</em>
              )}
            </article>
          );
        })}
      </div>
      {room.viewer.isHost ? (
        <button
          className="primary-button"
          disabled={advancing || !room.reveal.votingComplete}
          onClick={onAdvance}
        >
          {!room.reveal.votingComplete
            ? voteProgress.isComplete
              ? "Waiting for other players..."
              : `${voteProgress.remaining} of your votes left`
            : advancing
            ? "Updating..."
            : isLastCategory
              ? "See results"
              : "Next category"}
        </button>
      ) : (
        <p className="microcopy">
          {room.reveal.votingComplete
            ? "Voting complete. Waiting for the host."
            : voteProgress.isComplete
              ? "All your votes are in. Waiting for the rest of the room."
              : `You still have ${voteProgress.remaining} vote${
                  voteProgress.remaining === 1 ? "" : "s"
                } left.`}
        </p>
      )}
      {error && <p className="error-message">{error}</p>}
    </div>
  );
}

function Results({ room, error, onReturnToLobby, returning }) {
  const noWinner = room.results.winners.length === 0;
  const tied = room.results.winners.length > 1;
  const winnerNames = room.results.winners
    .map((winner) => winner.name)
    .join(" & ");

  return (
    <div className="results-content">
      <span className="eyebrow">Round {room.roundNumber} complete</span>
      <h2>
        {noWinner
          ? "No winner this round"
          : tied
            ? "It’s a tie"
            : `${winnerNames} wins`}
      </h2>
      <p>
        {noWinner
          ? "No answers earned majority approval."
          : `${winnerNames} ${
              tied ? "each get a round point." : "gets the round point."
            }`}
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
      <LetterHistory letters={room.letterHistory} />
      {room.viewer.isHost ? (
        <button
          className="primary-button"
          disabled={returning || room.remainingLetters === 0}
          onClick={onReturnToLobby}
        >
          {room.remainingLetters === 0
            ? "Room complete · all letters played"
            : returning
              ? "Opening lobby..."
              : "Play another round"}
        </button>
      ) : (
        <p className="microcopy">
          {room.remainingLetters === 0
            ? "This room has played every letter in its alphabet."
            : "Waiting for the host to open the next round."}
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
            <h2 id="how-to-play-title">How to play Aripter</h2>
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
              <p>
                Fill each category with an answer beginning with the letter. The
                first player to finish can start the final five seconds.
              </p>
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

function JoinUsingCode({ onClose, onJoin }) {
  const [code, setCode] = useState("");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isCompleteRoomCode(code)) onJoin(code);
  };

  return (
    <div
      className="join-code-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="join-code-title"
        aria-modal="true"
        className="join-code-panel"
        role="dialog"
      >
        <div className="join-code-heading">
          <div>
            <span className="eyebrow">Have an invite code?</span>
            <h2 id="join-code-title">Join a room</h2>
          </div>
          <button
            aria-label="Close room code entry"
            className="how-to-play-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form className="join-code-form" onSubmit={handleSubmit}>
          <label htmlFor="room-code">Room code</label>
          <input
            aria-describedby="room-code-hint"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            id="room-code"
            inputMode="text"
            maxLength={6}
            onChange={(event) => setCode(formatRoomCodeInput(event.target.value))}
            placeholder="PGFSKK"
            spellCheck="false"
            value={code}
          />
          <p id="room-code-hint">Enter the six-letter code from the host.</p>
          <button
            className="primary-button"
            disabled={!isCompleteRoomCode(code)}
            type="submit"
          >
            Continue to room
          </button>
        </form>
      </section>
    </div>
  );
}

function GameShell({
  stageNumber,
  children,
  leaving = false,
  onJoinUsingCode,
  onLeaveRoom,
  showIntro = false,
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showJoinUsingCode, setShowJoinUsingCode] = useState(false);

  return (
    <main className="game-app">
      <header className="party-header">
        <a className="brand" href="/" aria-label="Aripter home">
          <img src="/aripter-mark.svg" alt="" />
          <span>ARIPTER</span>
        </a>
        <div className="round-pill">One letter · Loads of words</div>
        <div className="header-actions">
          {onJoinUsingCode && (
            <button
              className="header-link join-code-trigger"
              onClick={() => setShowJoinUsingCode(true)}
            >
              Join using code
            </button>
          )}
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
      {showJoinUsingCode && (
        <JoinUsingCode
          onClose={() => setShowJoinUsingCode(false)}
          onJoin={(code) => {
            setShowJoinUsingCode(false);
            onJoinUsingCode(code);
          }}
        />
      )}

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
  const [votingAnswerId, setVotingAnswerId] = useState("");
  const [returnError, setReturnError] = useState("");
  const [returning, setReturning] = useState(false);
  const [skipError, setSkipError] = useState("");
  const [initiatingSkip, setInitiatingSkip] = useState(false);
  const [votingToSkip, setVotingToSkip] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const createRoom = useMutation(api.rooms.create);
  const joinRoom = useMutation(api.rooms.join);
  const heartbeat = useMutation(api.rooms.heartbeat);
  const leaveRoom = useMutation(api.rooms.leave);
  const setReady = useMutation(api.rooms.setReady);
  const startRound = useMutation(api.rooms.startRound);
  const initiateSkipVote = useMutation(api.rooms.initiateSkipVote);
  const voteToSkip = useMutation(api.rooms.voteToSkip);
  const startFinalCountdown = useMutation(api.rooms.startFinalCountdown);
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
    setInitiatingSkip(false);
    setVotingToSkip(false);
    if (room.finalCountdown || room.status !== "playing") setFinishing(false);
    if (!room.skipVote) setSkipError("");
    if (room.status !== "lobby") setStarting(false);
    if (room.status === "lobby") setReturning(false);
  }, [
    room?.status,
    room?.roundNumber,
    room?.revealIndex,
    room?.skipVote,
    room?.finalCountdown,
  ]);

  useEffect(() => {
    setFinishError("");
  }, [room?.roundNumber]);

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

  const handleInitiateSkip = async () => {
    setInitiatingSkip(true);
    setSkipError("");
    try {
      await initiateSkipVote({ code: roomCode, hostToken: playerToken });
    } catch (error) {
      setSkipError(getErrorMessage(error));
      setInitiatingSkip(false);
    }
  };

  const handleSkipVote = async (skip) => {
    setVotingToSkip(true);
    setSkipError("");
    try {
      await voteToSkip({ code: roomCode, playerToken, skip });
    } catch (error) {
      setSkipError(getErrorMessage(error));
      setVotingToSkip(false);
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    setFinishError("");
    try {
      await startFinalCountdown({ code: roomCode, playerToken });
    } catch (error) {
      setFinishError(getErrorMessage(error));
      setFinishing(false);
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
      <GameShell
        onJoinUsingCode={navigateToRoom}
        showIntro
        stageNumber={1}
      >
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
          finishing={finishing}
          finishError={finishError}
          initiatingSkip={initiatingSkip}
          onFinish={handleFinish}
          onInitiateSkip={handleInitiateSkip}
          onSaveAnswer={(categoryIndex, value) =>
            saveAnswer({
              code: room.code,
              playerToken,
              categoryIndex,
              value,
            })
          }
          onSkipVote={handleSkipVote}
          room={room}
          skipError={skipError}
          votingToSkip={votingToSkip}
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
