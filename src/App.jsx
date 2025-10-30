import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { triviaQuestions } from "./example";

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

function App() {
  const [games, setGames] = useState(() => {
    const init = [{ trivia: triviaQuestions, players: startPlayers }];
    const load = loadGames();
    return load && load.length ? load : init;
  });
  const [playing, setPlaying] = useState(0);
  const [winners, setWinners] = useState([]);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const players = playing ? games[playing - 1].players : [];

  function handleScore(targetName, index) {
    setGames((prevGames) =>
      prevGames.map((game, i) =>
        i === playing - 1
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
    setWinners(() => {
      const newWinners = [...winners];
      newWinners[index] = targetName;
      return newWinners;
    });
  }

  function resetScore() {
    setGames((prevGames) =>
      prevGames.map((game, i) =>
        i === playing - 1
          ? {
              ...game,
              players: game.players.map((player) => {
                return { ...player, score: 0 };
              }),
            }
          : game
      )
    );
  }

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = parseCsv(text);
      setGames([...games, parsed]);
      saveGames([...games, parsed]);
    };
    reader.readAsText(file);
  }

  function parseCsv(csvText) {
    const lines = csvText.trim().split("\n");
    let trivia = [];
    let playersList = [];
    lines.map((line) => {
      const values = line.split(",").map((v) => v.trim());
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
    return { trivia: trivia, players: playersList };
  }

  return (
    <div>
      <div className="bg-blue-900 text-white p-4 rounded mb-4 flex justify-end items-center gap-2">
        <div className="text-6xl mr-auto">Trivia</div>
        <div className="dropdown dropdown-hover">
          <div
            disabled={!playing}
            tabIndex={0}
            role="button"
            className="btn m-1"
          >
            Scores
          </div>
          <ul
            tabIndex={0}
            className={
              playing
                ? "menu dropdown-content z-[1] p-2 shadow bg-base-100 rounded-box w-52"
                : "invisible"
            }
          >
            {players.map((player, i) => {
              return (
                <li>
                  <p className="cursor-default">
                    {player.name}
                    <span style={{ marginLeft: "auto" }}>{player.score}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
        <button
          disabled={!playing}
          onClick={() => {
            setPlaying(0);
            resetScore();
          }}
          className="btn"
        >
          Back to select
        </button>
      </div>
      {playing ? (
        <>
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 m-4"
            onMouseMove={(e) => {
              setPos({ x: e.clientX, y: e.clientY });
            }}
          >
            {games[playing - 1].trivia.map((obj, i) => {
              return (
                <div key={obj.category}>
                  <Card
                    handleScore={handleScore}
                    trivia={obj}
                    players={games[playing - 1].players}
                    index={i}
                    setHovered={setHovered}
                  />
                </div>
              );
            })}
            {hovered && (
              <div
                className="absolute z-50 p-2 rounded-lg shadow-lg bg-base-100 border border-base-300"
                style={{
                  left: pos.x - 60,
                  top: pos.y - 40,
                  pointerEvents: "none", // prevents flickering
                }}
              >
                <p className="text-sm">Won by {winners[hovered - 1]}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4 m-4">
            {games.map((obj, i) => {
              const displayNone = i === 0 ? "invisible" : "";
              return (
                <button
                  key={i}
                  className="btn btn-xl block h-auto btn-primary p-1"
                  onClick={() => {
                    setWinners(games[i].trivia.map(() => "No Winner"));
                    setPlaying(i + 1);
                  }}
                >
                  <div className="w-full flex items-end justify-end">
                    <button
                      className={
                        "btn btn-sm border-accent-content " + displayNone
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        const newGames = deleteGame(i);
                        setGames(newGames);
                      }}
                    >
                      x
                    </button>
                  </div>
                  <p className="underline">Game {i + 1}</p>
                  <p>No. of players: {obj.players.length}</p>
                  <p>No. of cards: {obj.trivia.length}</p>
                </button>
              );
            })}
          </div>
          <div className="flex gap-8 justify-center mt-12">
            <div className="w-95">
              <input
                onChange={handleFileChange}
                type="file"
                accept=".csv"
                className="file-input file-input-xl mb-4"
              />
              <img
                src="/download.png"
                alt="download example"
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center text-3xl h-14 mb-4">
                <span className="mr-4">{"\u2B05"}</span>
                Upload a .csv from Google Sheets in the structure shown below
              </div>
              <img src="/csv.png" alt="csv example" className="w-240" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ handleScore, trivia, players, index, setHovered }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [winner, setWinner] = useState("Pick a winner");
  const [done, setDone] = useState(false);
  const [showHover, setShowHover] = useState(false);
  const divRef = useRef(null);
  const prevHeight = useRef(0);

  useEffect(() => {
    if (!divRef.current) return;

    const observer = new ResizeObserver(() => {
      const currentHeight = divRef.current.getBoundingClientRect().height;

      // Compare with previous height
      if (prevHeight.current !== 0 && prevHeight.current !== currentHeight) {
        if (!isExpanded && done) {
          // Height has finished changing to collapsed size
          setShowHover(true);
          console.log("Animation ended, hover enabled!");
        }
      }

      prevHeight.current = currentHeight;
    });

    observer.observe(divRef.current);

    return () => observer.disconnect();
  }, [isExpanded, done]);

  const disableContinue = winner === "Pick a winner" ? true : false;

  const bg = done ? "bg-blue-900" : "bg-primary";

  const isInvisible = reveal ? "" : " invisible";

  return (
    <motion.div
      layout
      ref={divRef}
      onClick={isExpanded || done ? null : () => setIsExpanded(!isExpanded)}
      onMouseEnter={() => {
        if (showHover) setHovered(index + 1);
      }}
      onMouseLeave={() => {
        if (showHover) setHovered(false);
      }}
      className={"border-2 rounded-2xl p-2 " + bg}
      style={{
        position: isExpanded ? "absolute" : "static",
        fontSize: isExpanded ? "5rem" : "2rem",
        cursor: isExpanded || done ? "default" : "pointer",
        top: "100px",
        left: "100px",
        right: "90px",
        height: isExpanded ? "700px" : "auto",
      }}
      transition={{ duration: isExpanded ? 0.7 : 0.2 }}
    >
      <div className="flex flex-wrap justify-center text-center h-full">
        {isExpanded && (
          <div className="w-full flex justify-end">
            <div
              onClick={() => {
                setIsExpanded(!isExpanded);
                setReveal(false);
              }}
              className="btn"
            >
              Close
            </div>
          </div>
        )}
        <div className="w-full">{trivia.category}</div>
        {isExpanded && (
          <>
            <p className="text-6xl mt-10 mb-12 w-full">{trivia.question}</p>
            <div className="flex flex-col h-auto w-full">
              <button onClick={() => setReveal(!reveal)} className="btn m-4">
                {reveal ? "Hide answer" : "Show answer"}
              </button>
              <p className={"text-2xl m-4" + isInvisible}>{trivia.answer}</p>
              <div className="w-full flex gap-3 justify-center">
                <select
                  value={winner}
                  onChange={(e) => {
                    setWinner(e.target.value);
                  }}
                  className="select"
                >
                  <option disabled={true}>Pick a winner</option>
                  <option>No winner</option>
                  {players.map((player) => (
                    <option>{player.name}</option>
                  ))}
                </select>
                <button
                  disabled={disableContinue}
                  onClick={() => {
                    setIsExpanded(!isExpanded);
                    setDone(true);
                    if (winner !== "No winner") {
                      handleScore(winner, index);
                    }
                  }}
                  className="btn"
                >
                  continue
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default App;
