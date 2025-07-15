import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { triviaQuestions } from "./example";

const startPlayers = [
  { name: "Jacob", score: 0 },
  { name: "Bill", score: 0 },
  { name: "Nathan", score: 0 },
];

function App() {
  const [games, setGames] = useState([
    { trivia: triviaQuestions, players: startPlayers },
  ]);
  const [playing, setPlaying] = useState(0);
  const players = playing ? games[playing - 1].players : [];

  function handleScore(targetName) {
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
  }

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = parseCsv(text);
      setGames([...games, parsed]);
      console.log(parsed);
    };
    reader.readAsText(file);
  }

  // A simple CSV parser: assumes first line is headers, commas as separators
  function parseCsv(csvText) {
    const lines = csvText.trim().split("\n");
    // const headers = headerLine.split(",").map((h) => h.trim());
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
      <div className="bg-blue-400 text-white p-4 rounded mb-4 flex justify-end items-center gap-2">
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
          onClick={() => setPlaying(0)}
          className="btn"
        >
          Back to select
        </button>
      </div>
      {playing ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 m-4">
          {games[playing - 1].trivia.map((obj) => {
            return (
              <div key={obj.category}>
                <Card
                  handleScore={handleScore}
                  trivia={obj}
                  players={games[playing - 1].players}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 m-4">
            {games.map((obj, i) => {
              return (
                <button
                  key={i}
                  className="btn btn-xl block h-32 btn-primary"
                  onClick={() => setPlaying(i + 1)}
                >
                  <p className="underline">Game {i + 1}</p>
                  <p>No. of players: {obj.players.length}</p>
                  <p>No. of cards: {obj.trivia.length}</p>
                </button>
              );
            })}
          </div>
          <input
            onChange={handleFileChange}
            type="file"
            accept=".csv"
            className="file-input file-input-xl"
          />
        </>
      )}
    </div>
  );
}

function Card({ handleScore, trivia, players }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [winner, setWinner] = useState("Pick a winner");

  const disableContinue = winner === "Pick a winner" ? true : false;

  return (
    <motion.div
      layout
      onClick={isExpanded ? null : () => setIsExpanded(!isExpanded)}
      style={{
        position: isExpanded ? "absolute" : "static",
        fontSize: isExpanded ? "5rem" : "2rem",
        cursor: isExpanded ? "default" : "pointer",
        top: "90px",
        left: "90px",
        right: "90px",
        bottom: "200px",
      }}
      transition={{ duration: isExpanded ? 1 : 0.3 }}
      className="bg-primary  border-2 rounded-2xl p-2"
    >
      <div className="flex flex-wrap justify-center text-center">
        {isExpanded && (
          <div className="w-full flex justify-end">
            <div onClick={() => setIsExpanded(!isExpanded)} className="btn">
              Close
            </div>
          </div>
        )}
        <div className="w-full">{trivia.category}</div>
        {isExpanded && (
          <>
            <p className="text-6xl mt-10 mb-12 w-full">{trivia.question}</p>
            <button onClick={() => setReveal(!reveal)} className="btn m-4">
              {reveal ? "Hide answer" : "Show answer"}
            </button>
            {reveal && <p className="text-2xl m-4">{trivia.answer}</p>}
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
                  if (winner !== "No winner") {
                    handleScore(winner);
                  }
                }}
                className="btn"
              >
                continue
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default App;
