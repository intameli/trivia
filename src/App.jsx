import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { triviaQuestions } from "./example";
import { loadGames, parseCsv, saveGames } from "./trivia.js";

const MotionButton = motion.button;
const MotionDiv = motion.div;
const MotionSection = motion.section;

const startPlayers = [
  { name: "Jacob", score: 0 },
  { name: "Bill", score: 0 },
  { name: "Nathan", score: 0 },
];

function App({ onChangeMode }) {
  const [games, setGames] = useState(() => {
    const initialGames = [{ trivia: triviaQuestions, players: startPlayers }];
    const savedGames = loadGames();
    return savedGames?.length ? savedGames : initialGames;
  });
  const [playing, setPlaying] = useState(0);
  const [winners, setWinners] = useState([]);
  const [hovered, setHovered] = useState(false);
  const [pointerPosition, setPointerPosition] = useState({ x: 0, y: 0 });
  const [importError, setImportError] = useState("");
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    setStorageError(
      saveGames(games)
        ? ""
        : "Browser storage is unavailable. You can play, but changes won’t be saved when this page closes or reloads."
    );
  }, [games]);

  const players = playing ? games[playing - 1].players : [];

  function handleScore(targetPlayer, index) {
    setGames((previousGames) =>
      previousGames.map((game, gameIndex) =>
        gameIndex === playing - 1
          ? {
              ...game,
              players: game.players.map((player, playerIndex) =>
                playerIndex === targetPlayer
                  ? { ...player, score: player.score + 1 }
                  : player
              ),
            }
          : game
      )
    );
    setWinners((previousWinners) => {
      const nextWinners = [...previousWinners];
      nextWinners[index] =
        targetPlayer === null ? "No winner" : players[targetPlayer].name;
      return nextWinners;
    });
  }

  function resetScore(index = playing - 1) {
    setGames((previousGames) =>
      previousGames.map((game, gameIndex) =>
        gameIndex === index
          ? {
              ...game,
              players: game.players.map((player) => ({
                ...player,
                score: 0,
              })),
            }
          : game
      )
    );
  }

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = "";
    setImportError("");

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const parsedGame = parseCsv(loadEvent.target.result);
        setGames((previousGames) => [...previousGames, parsedGame]);
      } catch (error) {
        setImportError(error.message);
      }
    };
    reader.onerror = () =>
      setImportError("Could not read this CSV. Try selecting the file again.");
    reader.readAsText(file);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <h1>Trivia</h1>
        <div className="header-actions">
          <button type="button" className="btn" onClick={onChangeMode}>Game modes</button>
          <div className="dropdown dropdown-end">
            <button
              disabled={!playing}
              tabIndex={0}
              type="button"
              className="btn"
            >
              Scores
            </button>
            {playing ? (
              <ul
                tabIndex={0}
                className="menu dropdown-content score-menu rounded-box bg-base-100 p-2 shadow"
              >
                {players.map((player, index) => (
                  <li key={index}>
                    <p className="score-row">
                      <span>{player.name}</span>
                      <span>{player.score}</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            disabled={!playing}
            onClick={() => {
              resetScore();
              setHovered(false);
              setPlaying(0);
            }}
            type="button"
            className="btn"
          >
            Back to select
          </button>
        </div>
      </header>

      <main className="page-content">
        {storageError ? (
          <p role="alert" className="alert alert-warning">
            {storageError}
          </p>
        ) : null}
        {importError ? (
          <p role="alert" className="alert alert-error">
            {importError}
          </p>
        ) : null}
        {playing ? (
          <section
            aria-label="Trivia categories"
            className="question-grid"
            onMouseMove={(event) => {
              setPointerPosition({ x: event.clientX, y: event.clientY });
            }}
          >
            {games[playing - 1].trivia.map((trivia, index) => (
              <Card
                key={`${trivia.category}-${index}`}
                handleScore={handleScore}
                trivia={trivia}
                players={games[playing - 1].players}
                index={index}
                setHovered={setHovered}
              />
            ))}
            {hovered ? (
              <div
                className="winner-tooltip rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg"
                style={{
                  left: pointerPosition.x,
                  top: pointerPosition.y,
                }}
              >
                <p className="text-sm">Won by {winners[hovered - 1]}</p>
              </div>
            ) : null}
          </section>
        ) : (
          <GameSelect
            games={games}
            handleFileChange={handleFileChange}
            onDelete={(index) => {
              setGames((previousGames) =>
                previousGames.filter((_, gameIndex) => gameIndex !== index)
              );
            }}
            onPlay={(index) => {
              // Answered cards reset on selection, so scores must reset with them.
              resetScore(index);
              setHovered(false);
              setWinners(games[index].trivia.map(() => "No Winner"));
              setPlaying(index + 1);
            }}
          />
        )}
      </main>
    </div>
  );
}

function GameSelect({ games, handleFileChange, onDelete, onPlay }) {
  return (
    <>
      <section aria-label="Saved games" className="game-grid">
        {games.map((game, index) => (
          <article className="game-card" key={index}>
            {index > 0 ? (
              <button
                aria-label={`Delete game ${index + 1}`}
                className="btn btn-sm game-delete"
                onClick={() => onDelete(index)}
                type="button"
              >
                ×
              </button>
            ) : null}
            <button
              className="game-card-main"
              onClick={() => onPlay(index)}
              type="button"
            >
              <span className="game-title">Game {index + 1}</span>
              <span>No. of players: {game.players.length}</span>
              <span>No. of cards: {game.trivia.length}</span>
            </button>
          </article>
        ))}
      </section>

      <section className="upload-guide" aria-labelledby="upload-heading">
        <div className="upload-control">
          <h2 id="upload-heading">Add another game</h2>
          <p>Upload a .csv exported from Google Sheets.</p>
          <input
            aria-label="Upload trivia CSV"
            onChange={handleFileChange}
            type="file"
            accept=".csv,text/csv"
            className="file-input file-input-lg"
          />
          <img
            src="/download.png"
            alt="Google Sheets download menu with comma-separated values selected"
          />
        </div>
        <div className="csv-example">
          <h2>Use this column structure</h2>
          <p>Category, question, answer, and player name.</p>
          <img src="/csv.png" alt="Example trivia CSV column structure" />
        </div>
      </section>
    </>
  );
}

function Card({ handleScore, trivia, players, index, setHovered }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [winner, setWinner] = useState("");
  const [done, setDone] = useState(false);
  const [showHover, setShowHover] = useState(false);
  const closeButtonRef = useRef(null);
  const winnerName =
    winner === "no-winner" ? "No winner" : players[Number(winner)]?.name;

  function closeQuestion() {
    setIsExpanded(false);
    setReveal(false);
  }

  useEffect(() => {
    if (done) setShowHover(true);
  }, [done]);

  useEffect(() => {
    if (!isExpanded) return undefined;

    const scrollPosition = window.scrollY;
    const bodyStyle = document.body.style;
    const originalBodyStyles = {
      position: bodyStyle.position,
      top: bodyStyle.top,
      left: bodyStyle.left,
      right: bodyStyle.right,
      width: bodyStyle.width,
      overflow: bodyStyle.overflow,
    };

    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollPosition}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeQuestion();
    };

    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      Object.assign(bodyStyle, originalBodyStyles);
      window.scrollTo(0, scrollPosition);
    };
  }, [isExpanded]);

  const dialog = (
    <AnimatePresence>
      {isExpanded ? (
        <MotionDiv
          animate={{ opacity: 1 }}
          className="question-overlay"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeQuestion();
          }}
        >
          <MotionSection
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-labelledby={`question-category-${index}`}
            aria-modal="true"
            className="question-modal"
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            role="dialog"
            transition={{ duration: 0.2 }}
          >
            <div className="question-modal-header">
              <p id={`question-category-${index}`} className="question-category">
                {trivia.category}
              </p>
              <button
                ref={closeButtonRef}
                onClick={closeQuestion}
                type="button"
                className="btn btn-sm"
              >
                Close
              </button>
            </div>

            <div className="question-modal-body">
              <p className="question-copy">{trivia.question}</p>
              <button
                aria-expanded={reveal}
                onClick={() => setReveal((isRevealed) => !isRevealed)}
                type="button"
                className="btn answer-toggle"
              >
                {reveal ? "Hide answer" : "Show answer"}
              </button>
              <p
                aria-hidden={!reveal}
                className={`answer-copy${reveal ? " is-visible" : ""}`}
              >
                {trivia.answer}
              </p>

              <div className="winner-controls">
                <select
                  aria-label="Question winner"
                  value={winner}
                  onChange={(event) => setWinner(event.target.value)}
                  className="select"
                >
                  <option value="" disabled>
                    Pick a winner
                  </option>
                  <option value="no-winner">No winner</option>
                  {players.map((player, playerIndex) => (
                    <option key={playerIndex} value={playerIndex}>
                      {player.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={winner === "" || done}
                  onClick={() => {
                    setIsExpanded(false);
                    setDone(true);
                    handleScore(
                      winner === "no-winner" ? null : Number(winner),
                      index
                    );
                  }}
                  type="button"
                  className="btn"
                >
                  Continue
                </button>
              </div>
            </div>
          </MotionSection>
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <MotionButton
        aria-disabled={done}
        aria-label={`${trivia.category}${done ? `, answered by ${winnerName}` : ""}`}
        className={`question-card${done ? " is-done" : ""}`}
        layout
        onClick={() => {
          if (!done) setIsExpanded(true);
        }}
        onMouseEnter={() => {
          if (showHover) setHovered(index + 1);
        }}
        onMouseLeave={() => setHovered(false)}
        type="button"
      >
        <span>{trivia.category}</span>
        {done ? <span className="answered-label">Answered</span> : null}
      </MotionButton>
      {typeof document !== "undefined" ? createPortal(dialog, document.body) : null}
    </>
  );
}

export default App;
