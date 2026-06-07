import React, { useEffect, useMemo, useState } from "react";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

const LANGUAGE_OPTIONS = {
  Russian: {
    letters: ["С", "М", "К", "П", "Т"],
    suggestions: {
      С: ["Сердечная недостаточность", "Сталкер", "Смуглянка", "Синдзюку"],
      М: ["Мигрень", "Матрица", "Моя любовь", "Мэгуро"],
      К: ["Корь", "Кин-дза-дза!", "Катюша", "Канда"],
      П: ["Простуда", "Паразиты", "Пачка сигарет", "Порто"],
      Т: ["Туберкулёз", "Титаник", "Трава у дома", "Токио"],
    },
  },
  English: {
    letters: ["S", "M", "B", "C", "T"],
    suggestions: {
      S: ["Sunstroke", "Spirited Away", "Sunday Morning", "Shinjuku"],
      M: ["Migraine", "Matrix", "My Way", "Meguro"],
      B: ["Bronchitis", "Barbie", "Bad Guy", "Bakurocho"],
      C: ["Chickenpox", "Casablanca", "Creep", "Chiyoda"],
      T: ["Tetanus", "The Matrix", "Take On Me", "Tokyo"],
    },
  },
  Japanese: {
    letters: ["あ", "か", "さ", "た", "ま"],
    suggestions: {
      あ: ["あくび", "アナと雪の女王", "ありがとう", "秋葉原"],
      か: ["かぜ", "カサブランカ", "かわいい", "神田"],
      さ: ["さかむけ", "サマーウォーズ", "さくら", "桜田門"],
      た: ["たんこぶ", "タイタニック", "旅立ちの日に", "田町"],
      ま: ["まひ", "マトリックス", "まつり", "町田"],
    },
  },
};

const INITIAL_CATEGORIES = [
  "Болезнь",
  "Фильм",
  "Песня",
  "Станция в Токио",
];

const INITIAL_PLAYERS = [
  { id: "host", name: "Dastan", isHost: true, ready: false },
  { id: "masha", name: "Masha", isHost: false, ready: false },
  { id: "kenji", name: "Kenji", isHost: false, ready: false },
];

const stageNumber = {
  setup: 1,
  lobby: 2,
  playing: 3,
  reveal: 4,
  results: 5,
};

function useGame() {
  const [stage, setStage] = useState("setup");
  const [language, setLanguage] = useState("Russian");
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [duration, setDuration] = useState(60);
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [letter, setLetter] = useState("С");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [answers, setAnswers] = useState({});
  const [revealIndex, setRevealIndex] = useState(0);
  const [roomCode] = useState("BUKVA-24");
  const [copied, setCopied] = useState(false);
  const [round, setRound] = useState(1);
  const [roundWins, setRoundWins] = useState({});

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
      setCategories((current) => current.filter((_, categoryIndex) => categoryIndex !== index));
    }
  };

  const createRoom = () => {
    setCategories((current) =>
      current.map((category) => category.trim()).filter(Boolean),
    );
    setPlayers(INITIAL_PLAYERS);
    setStage("lobby");
  };

  const toggleReady = (id) => {
    setPlayers((current) =>
      current.map((player) =>
        player.id === id ? { ...player, ready: !player.ready } : player,
      ),
    );
  };

  const readyEveryone = () => {
    setPlayers((current) => current.map((player) => ({ ...player, ready: true })));
  };

  const addSimulatedFriend = () => {
    const nextNumber = players.length + 1;
    setPlayers((current) => [
      ...current,
      {
        id: `friend-${nextNumber}`,
        name: `Friend ${nextNumber}`,
        isHost: false,
        ready: false,
      },
    ]);
  };

  const allReady = players.length > 1 && players.every((player) => player.ready);

  const buildBotAnswers = (chosenLetter) => {
    const base =
      LANGUAGE_OPTIONS[language].suggestions[chosenLetter] ??
      categories.map((_, index) => `${chosenLetter}${index + 1}`);
    const result = { host: {} };

    players
      .filter((player) => !player.isHost)
      .forEach((player, playerIndex) => {
        result[player.id] = {};
        categories.forEach((category, categoryIndex) => {
          const shouldSkip =
            (playerIndex === 0 && categoryIndex === categories.length - 1) ||
            (playerIndex > 1 && categoryIndex % 3 === 2);
          result[player.id][category] = shouldSkip
            ? ""
            : base[(categoryIndex + playerIndex) % base.length];
        });
      });
    return result;
  };

  const startGame = () => {
    if (!allReady) return;
    const letters = LANGUAGE_OPTIONS[language].letters;
    const chosenLetter = letters[Math.floor(Math.random() * letters.length)];
    setLetter(chosenLetter);
    setAnswers(buildBotAnswers(chosenLetter));
    setSecondsLeft(duration);
    setRevealIndex(0);
    setStage("playing");
  };

  const submitRound = () => {
    setStage("reveal");
    setRevealIndex(0);
  };

  useEffect(() => {
    if (stage !== "playing") return undefined;
    if (secondsLeft <= 0) {
      submitRound();
      return undefined;
    }
    const timer = window.setTimeout(
      () => setSecondsLeft((current) => current - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [secondsLeft, stage]);

  const updateAnswer = (category, value) => {
    setAnswers((current) => ({
      ...current,
      host: { ...(current.host ?? {}), [category]: value },
    }));
  };

  const scores = useMemo(
    () =>
      players.reduce((result, player) => {
        result[player.id] = categories.reduce(
          (total, category) =>
            total + (answers[player.id]?.[category]?.trim() ? 1 : 0),
          0,
        );
        return result;
      }, {}),
    [answers, categories, players],
  );

  const maxScore = Math.max(0, ...Object.values(scores));
  const winners = players.filter((player) => scores[player.id] === maxScore);

  const finishReveal = () => {
    const winIds = winners.map((winner) => winner.id);
    setRoundWins((current) =>
      players.reduce(
        (result, player) => ({
          ...result,
          [player.id]: (current[player.id] ?? 0) + (winIds.includes(player.id) ? 1 : 0),
        }),
        {},
      ),
    );
    setStage("results");
  };

  const nextReveal = () => {
    if (revealIndex >= categories.length - 1) finishReveal();
    else setRevealIndex((current) => current + 1);
  };

  const playAgain = () => {
    setRound((current) => current + 1);
    setPlayers((current) => current.map((player) => ({ ...player, ready: false })));
    setAnswers({});
    setStage("lobby");
  };

  const copyLink = async () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return {
    stage,
    stageNumber: stageNumber[stage],
    language,
    setLanguage,
    categories,
    updateCategory,
    addCategory,
    removeCategory,
    duration,
    setDuration,
    players,
    roomCode,
    copied,
    copyLink,
    createRoom,
    toggleReady,
    readyEveryone,
    addSimulatedFriend,
    allReady,
    startGame,
    letter,
    secondsLeft,
    answers,
    updateAnswer,
    submitRound,
    revealIndex,
    nextReveal,
    scores,
    winners,
    maxScore,
    playAgain,
    round,
    roundWins,
  };
}

function SetupForm({ game }) {
  return (
    <div className="setup-form">
      <label className="field">
        <span>Language</span>
        <select value={game.language} onChange={(event) => game.setLanguage(event.target.value)}>
          {Object.keys(LANGUAGE_OPTIONS).map((language) => (
            <option key={language}>{language}</option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Categories</span>
        <div className="category-list">
          {game.categories.map((category, index) => (
            <div className="category-row" key={index}>
              <span className="category-number">{String(index + 1).padStart(2, "0")}</span>
              <input
                value={category}
                onChange={(event) => game.updateCategory(index, event.target.value)}
                aria-label={`Category ${index + 1}`}
              />
              <button
                className="icon-button"
                onClick={() => game.removeCategory(index)}
                aria-label={`Remove category ${index + 1}`}
                disabled={game.categories.length <= 2}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button className="text-button" onClick={game.addCategory} disabled={game.categories.length >= 8}>
          + Add category
        </button>
      </div>

      <div className="field">
        <span>Round time</span>
        <div className="segmented">
          {[15, 60, 120].map((seconds) => (
            <button
              className={game.duration === seconds ? "active" : ""}
              key={seconds}
              onClick={() => game.setDuration(seconds)}
            >
              {seconds === 15 ? "15 sec demo" : `${seconds / 60} min`}
            </button>
          ))}
        </div>
      </div>

      <button className="primary-button" onClick={game.createRoom}>
        Create room
      </button>
    </div>
  );
}

function Lobby({ game }) {
  return (
    <div className="lobby-content">
      <div className="invite-block">
        <span className="eyebrow">Private room</span>
        <strong>{game.roomCode}</strong>
        <button className="secondary-button" onClick={game.copyLink}>
          {game.copied ? "Copied" : "Copy invite link"}
        </button>
      </div>

      <div className="players-list">
        <div className="section-heading">
          <span>Players</span>
          <span>{game.players.filter((player) => player.ready).length}/{game.players.length} ready</span>
        </div>
        {game.players.map((player) => (
          <div className="player-row" key={player.id}>
            <div className="avatar">{player.name.slice(0, 1)}</div>
            <div className="player-name">
              <strong>{player.name}</strong>
              <span>{player.isHost ? "Host" : "Player"}</span>
            </div>
            <button
              className={`ready-button ${player.ready ? "is-ready" : ""}`}
              onClick={() => game.toggleReady(player.id)}
            >
              {player.ready ? "Ready" : "Not ready"}
            </button>
          </div>
        ))}
        <button className="text-button" onClick={game.addSimulatedFriend}>
          + Add simulated friend
        </button>
      </div>

      <div className="lobby-actions">
        <button className="secondary-button" onClick={game.readyEveryone}>
          Ready everyone
        </button>
        <button className="primary-button" onClick={game.startGame} disabled={!game.allReady}>
          Start round
        </button>
      </div>

      <p className="microcopy">
        Joining locks when the host starts. The letter is revealed to everyone at the same time.
      </p>
    </div>
  );
}

function Playing({ game }) {
  return (
    <div className="playing-content">
      <div className="round-focus">
        <span className="eyebrow">Round {game.round} · {game.language}</span>
        <div className="letter-display">{game.letter}</div>
        <span className={`timer ${game.secondsLeft <= 10 ? "urgent" : ""}`}>
          {Math.floor(game.secondsLeft / 60)}:{String(game.secondsLeft % 60).padStart(2, "0")}
        </span>
        <p>Every answer must begin with this letter.</p>
      </div>
      <div className="answer-sheet">
        <div className="section-heading">
          <span>Your answers</span>
          <span>{Object.values(game.answers.host ?? {}).filter((answer) => answer.trim()).length}/{game.categories.length}</span>
        </div>
        {game.categories.map((category, index) => (
          <label className="answer-row" key={category}>
            <span className="answer-index">{index + 1}</span>
            <span className="answer-category">{category}</span>
            <input
              autoFocus={index === 0}
              value={game.answers.host?.[category] ?? ""}
              onChange={(event) => game.updateAnswer(category, event.target.value)}
              placeholder={`${game.letter}…`}
            />
          </label>
        ))}
        <button className="primary-button" onClick={game.submitRound}>
          Submit answers
        </button>
        <p className="microcopy">Answers stay editable until you submit or time runs out.</p>
      </div>
    </div>
  );
}

function Reveal({ game }) {
  const category = game.categories[game.revealIndex];
  return (
    <div className="reveal-content">
      <div className="reveal-progress">
        {game.categories.map((item, index) => (
          <span
            key={item}
            className={index <= game.revealIndex ? "seen" : ""}
          />
        ))}
      </div>
      <span className="eyebrow">
        Category {game.revealIndex + 1} of {game.categories.length}
      </span>
      <h2>{category}</h2>
      <div className="reveal-grid">
        {game.players.map((player, index) => {
          const answer = game.answers[player.id]?.[category]?.trim();
          return (
            <article className="answer-card" key={player.id} style={{ "--delay": `${index * 90}ms` }}>
              <div className="avatar">{player.name.slice(0, 1)}</div>
              <span>{player.name}</span>
              <strong>{answer || "No answer"}</strong>
              <em>{answer ? "+1" : "0"}</em>
            </article>
          );
        })}
      </div>
      <button className="primary-button" onClick={game.nextReveal}>
        {game.revealIndex === game.categories.length - 1 ? "See results" : "Next category"}
      </button>
    </div>
  );
}

function Results({ game }) {
  const sortedPlayers = [...game.players].sort(
    (first, second) => game.scores[second.id] - game.scores[first.id],
  );
  const tied = game.winners.length > 1;
  return (
    <div className="results-content">
      <span className="eyebrow">Round {game.round} complete</span>
      <h2>{tied ? "It’s a tie" : `${game.winners[0]?.name} wins`}</h2>
      <p>
        {game.winners.map((winner) => winner.name).join(" & ")}{" "}
        {tied ? "each get a round point." : "gets the round point."}
      </p>
      <div className="scoreboard">
        {sortedPlayers.map((player, index) => (
          <div
            className={`score-row ${game.winners.some((winner) => winner.id === player.id) ? "leader" : ""}`}
            key={player.id}
          >
            <span className="rank">{String(index + 1).padStart(2, "0")}</span>
            <div className="avatar">{player.name.slice(0, 1)}</div>
            <strong>{player.name}</strong>
            <span className="round-score">{game.scores[player.id]} words</span>
            <span className="total-score">
              {game.roundWins[player.id] ?? 0} {(game.roundWins[player.id] ?? 0) === 1 ? "pt" : "pts"}
            </span>
          </div>
        ))}
      </div>
      <button className="primary-button" onClick={game.playAgain}>Play another round</button>
    </div>
  );
}

function CurrentStage({ game }) {
  if (game.stage === "setup") return <SetupForm game={game} />;
  if (game.stage === "lobby") return <Lobby game={game} />;
  if (game.stage === "playing") return <Playing game={game} />;
  if (game.stage === "reveal") return <Reveal game={game} />;
  return <Results game={game} />;
}

function App() {
  const game = useGame();

  return (
    <main className="game-app">
      <header className="party-header">
        <a className="brand" href="/">ОБДС<span>beta</span></a>
        <div className="round-pill">One letter · Loads of words</div>
        <button className="header-link">How to play</button>
      </header>

      <div className="party-shell">
        <aside className="stage-rail" aria-label="Game progress">
          {["Room", "Lobby", "Play", "Reveal", "Results"].map((label, index) => (
            <div className={game.stageNumber === index + 1 ? "active" : game.stageNumber > index + 1 ? "done" : ""} key={label}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </aside>
        <section className="party-panel">
          {game.stage === "setup" && (
            <div className="panel-intro">
              <span className="eyebrow">Host a game</span>
              <h1>Pick a letter.<br />Empty your brain.</h1>
              <p>Make a room, invent the categories, and see which friend thinks fastest.</p>
            </div>
          )}
          <CurrentStage game={game} />
        </section>
      </div>
      <div className="sticker sticker-one">A–Я</div>
      <div className="sticker sticker-two">GO!</div>
    </main>
  );
}

function BackendConnectionProbe() {
  useQuery(api.status.health);
  return null;
}

function Root() {
  if (!convex) return <App />;

  return (
    <ConvexProvider client={convex}>
      <BackendConnectionProbe />
      <App />
    </ConvexProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
