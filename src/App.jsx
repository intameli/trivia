import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { triviaQuestions } from "./example";

const MotionButton = motion.button;
const MotionDiv = motion.div;
const MotionSection = motion.section;

const startPlayers = [
  { name: "Jacob", score: 0 },
  { name: "Bill", score: 0 },
  { name: "Nathan", score: 0 },
];

function saveGames(games) {
  localStorage.setItem("triviaGames", JSON.stringify(games));
}

function loadGames() {
  const savedGames = localStorage.getItem("triviaGames");
  return JSON.parse(savedGames);
}

function deleteGame(index) {
  const games = loadGames();
  if (!games || index < 0 || index >= games.length) return;
  games.splice(index, 1);
  saveGames(games);
  return games;
}

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

  const players = playing ? games[playing - 1].players : [];

  function handleScore(targetName, index) {
    setGames((previousGames) =>
      previousGames.map((game, gameIndex) =>
        gameIndex === playing - 1
          ? {
              ...game,
              players: game.players.map((player) =>
                player.name === targetName
                  ? { ...player, score: player.score + 1 }
                  : player
              ),
            }
          : game
      )
    );
    setWinners((previousWinners) => {
      const nextWinners = [...previousWinners];
      nextWinners[index] = targetName;
      return nextWinners;
    });
  }

  function resetScore() {
    setGames((previousGames) =>
      previousGames.map((game, gameIndex) =>
        gameIndex === playing - 1
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

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const parsedGame = parseCsv(loadEvent.target.result);
      const nextGames = [...games, parsedGame];
      setGames(nextGames);
      saveGames(nextGames);
    };
    reader.readAsText(file);
  }

  function parseCsv(csvText) {
    const lines = csvText.trim().split("\n");
    const trivia = [];
    const playersList = [];

    lines.forEach((line) => {
      const values = line.split(",").map((value) => value.trim());
      if (values[0]) {
        trivia.push({
          category: values[0],
          question: values[1],
          answer: values[2],
        });
      }
      if (values[3]) {
        playersList.push({ name: values[3], score: 0 });
      }
    });

    return { trivia, players: playersList };
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
                {players.map((player) => (
                  <li key={player.name}>
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
              const nextGames = deleteGame(index);
              if (nextGames) setGames(nextGames);
            }}
            onPlay={(index) => {
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
  const [winner, setWinner] = useState("Pick a winner");
  const [done, setDone] = useState(false);
  const [showHover, setShowHover] = useState(false);
  const closeButtonRef = useRef(null);

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
                  <option disabled>Pick a winner</option>
                  <option>No winner</option>
                  {players.map((player) => (
                    <option key={player.name}>{player.name}</option>
                  ))}
                </select>
                <button
                  disabled={winner === "Pick a winner"}
                  onClick={() => {
                    setIsExpanded(false);
                    setDone(true);
                    if (winner !== "No winner") handleScore(winner, index);
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
        aria-label={`${trivia.category}${done ? `, answered by ${winner}` : ""}`}
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
