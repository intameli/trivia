import { useEffect, useRef, useState } from "react";
import {
  applyAction,
  boardPoints,
  currentBoard,
  revealedAnswers,
} from "./game.js";
import {
  createRoom,
  friendlyError,
  joinRoom,
  normalizeCode,
  sendAction,
  subscribeRoom,
} from "./firebase.js";
import { questions, rounds } from "./questions.js";
import FeudLogo from "./FeudLogo.jsx";
import useFeudSounds from "./useFeudSounds.js";

function readKey(code) {
  try {
    return localStorage.getItem(`feud-key-${code}`) ?? "";
  } catch {
    return "";
  }
}
function initialRoute() {
  const url = new URL(window.location.href);
  const code = normalizeCode(url.searchParams.get("room") ?? "");
  return {
    code,
    view:
      url.searchParams.get("view") === "controller" ? "controller" : "board",
    key: new URLSearchParams(url.hash.slice(1)).get("key") || readKey(code),
  };
}
function gameUrl(code, view, key = "") {
  const url = new URL(window.location.pathname, window.location.origin);
  url.search = new URLSearchParams({ mode: "feud", room: code, view });
  if (key) url.hash = new URLSearchParams({ key });
  return url.href;
}

// Firestore can return map fields in a different order than the transaction.
// Compare their contents so an acknowledged write doesn't restart the listener.
function snapshotKey(game) {
  return JSON.stringify(game, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

export default function Feud() {
  const [route, setRoute] = useState(initialRoute);
  const [serverGame, setGame] = useState(null);
  const [revealing, setRevealing] = useState(null);
  const [synced, setSynced] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pairing, setPairing] = useState(false);
  const [copied, setCopied] = useState("");
  const [confirmNext, setConfirmNext] = useState(null);
  const actionPending = useRef(false);
  const syncTimer = useRef(null);
  const latestSnapshot = useRef("");
  const expectedSnapshot = useRef("");
  const listenerHealthy = useRef(false);
  const { soundLabel, toggleSound } = useFeudSounds(serverGame, route.code);

  const game =
    revealing && revealing.questionIndex === serverGame?.questionIndex
      ? revealing.indices.reduce(
          (next, index) => applyAction(next, { type: "reveal", index }),
          serverGame,
        )
      : serverGame;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const reconnect = (event) => {
      if (event.type === "focus" && listenerHealthy.current) return;
      if (event.type === "pageshow" && !event.persisted) return;
      if (navigator.onLine && document.visibilityState === "visible")
        setRetry((value) => value + 1);
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    window.addEventListener("pageshow", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      window.removeEventListener("pageshow", reconnect);
      document.removeEventListener("visibilitychange", reconnect);
      clearTimeout(syncTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!route.code) return undefined;
    let cancelled = false;
    let unsubscribe;
    setError("");
    (async () => {
      await joinRoom(route.code, {
        controller: route.view === "controller",
        key: route.key,
      });
      if (cancelled) return;
      unsubscribe = await subscribeRoom(
        route.code,
        (nextGame, connected, confirmed = true) => {
          if (!cancelled) {
            listenerHealthy.current = connected;
            // Cached snapshots can trail a committed action after reconnecting.
            // Keep the last board until the server catches up.
            if (!connected) {
              setSynced(false);
              return;
            }
            // Pending local writes still have a live connection. Keep controls
            // and layout steady while waiting for their server confirmation.
            setSynced(true);
            if (!confirmed) return;
            latestSnapshot.current = snapshotKey(nextGame);
            if (latestSnapshot.current === expectedSnapshot.current)
              clearTimeout(syncTimer.current);
            setGame(nextGame);
            setError("");
            setRevealing((previous) => {
              if (
                previous?.questionIndex !== nextGame.questionIndex ||
                nextGame.finished ||
                currentBoard(nextGame).awardedTo !== null
              )
                return null;
              const indices = previous.indices.filter(
                (index) => !currentBoard(nextGame).revealed.includes(index),
              );
              return indices.length ? { ...previous, indices } : null;
            });
            setConfirmNext((confirmation) =>
              confirmation?.questionIndex === nextGame.questionIndex &&
              !nextGame.finished &&
              currentBoard(nextGame).awardedTo === null
                ? confirmation
                : null,
            );
          }
        },
        (failure) => {
          if (!cancelled) {
            setError(friendlyError(failure));
            setSynced(false);
            listenerHealthy.current = false;
          }
        },
      );
      if (cancelled) unsubscribe();
    })().catch((failure) => {
      if (!cancelled) {
        setError(friendlyError(failure));
        setSynced(false);
        listenerHealthy.current = false;
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [route.code, route.key, route.view, retry]);

  async function start(teamNames) {
    setPending(true);
    setError("");
    try {
      const room = await createRoom(teamNames);
      try {
        localStorage.setItem(`feud-key-${room.code}`, room.key);
      } catch {
        /* The URL still supports refresh without storage. */
      }
      window.history.replaceState(
        null,
        "",
        gameUrl(room.code, "controller", room.key),
      );
      setRoute({ ...room, view: "controller" });
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setPending(false);
    }
  }

  function connect(code) {
    const normalized = normalizeCode(code);
    window.history.replaceState(null, "", gameUrl(normalized, "board"));
    setGame(null);
    setSynced(false);
    listenerHealthy.current = false;
    setRevealing(null);
    setConfirmNext(null);
    setRoute({ code: normalized, view: "board", key: "" });
  }

  async function act(action) {
    if (actionPending.current || pending || !synced || !online) return;
    actionPending.current = true;
    setPending(true);
    setError("");
    const questionIndex = game.questionIndex;
    if (action.type === "reveal") {
      setRevealing((previous) => ({
        questionIndex,
        indices: [
          ...(previous?.questionIndex === questionIndex
            ? previous.indices
            : []),
          action.index,
        ],
      }));
    }
    try {
      const committedGame = await sendAction(route.code, {
        questionIndex,
        ...action,
      });
      // A completed transaction must also reach the live listener. Restart a
      // stalled listener instead of requiring a manual page refresh.
      expectedSnapshot.current = snapshotKey(committedGame);
      clearTimeout(syncTimer.current);
      if (latestSnapshot.current !== expectedSnapshot.current) {
        syncTimer.current = setTimeout(
          () => setRetry((value) => value + 1),
          1500,
        );
      }
    } catch (failure) {
      if (action.type === "reveal") {
        setRevealing((previous) => {
          if (previous?.questionIndex !== questionIndex) return previous;
          const indices = previous.indices.filter(
            (index) => index !== action.index,
          );
          return indices.length ? { ...previous, indices } : null;
        });
      }
      setError(friendlyError(failure));
    } finally {
      actionPending.current = false;
      setPending(false);
    }
  }

  async function copyLink(url, label) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(`${label} copied`);
    } catch {
      setCopied("Copy the link below.");
    }
  }

  const isController = route.view === "controller";
  const connected = online && synced;
  const locked = pending || !connected;
  const boardUrl = gameUrl(route.code, "board");

  return (
    <div className={`feud-shell${isController ? " is-controller" : ""}`}>
      <header className="feud-header">
        <a className="feud-wordmark" href="?mode=feud">
          DESI <span>✦</span> FEUD
        </a>
        <div className="feud-header-actions">
          <button
            className="feud-button subtle"
            data-feud-sound-toggle
            onClick={toggleSound}
          >
            {soundLabel}
          </button>
          {game ? (
            <span
              role="status"
              className={`feud-connection${connected ? " is-live" : ""}`}
            >
              {connected ? "Live" : online ? "Connecting…" : "Offline"}
            </span>
          ) : null}
          {isController && game ? (
            <button
              className="feud-button subtle"
              onClick={() => {
                setPairing(true);
                setCopied("");
              }}
            >
              Connect TV
            </button>
          ) : null}
          {!isController && game ? (
            <button
              className="feud-button subtle fullscreen-button"
              onClick={() =>
                document.fullscreenElement
                  ? document.exitFullscreen?.()
                  : document.documentElement
                      .requestFullscreen?.()
                      .catch(() => setError("Fullscreen unavailable."))
              }
            >
              Fullscreen
            </button>
          ) : null}
          <a className="feud-button subtle" href={window.location.pathname}>
            Games
          </a>
        </div>
      </header>

      {!route.code ? (
        <Lobby
          start={start}
          connect={connect}
          pending={pending}
          error={error}
        />
      ) : !game ? (
        <main className="feud-waiting">
          <p className="feud-eyebrow">ROOM {route.code}</p>
          <h1>{error ? "Can’t connect" : "Connecting…"}</h1>
          {error ? <p role="alert">{error}</p> : null}
          {error ? (
            <div className="feud-button-row">
              <button
                className="feud-button primary"
                onClick={() => setRetry(retry + 1)}
              >
                Retry
              </button>
              <a className="feud-button" href="?mode=feud">
                Back
              </a>
            </div>
          ) : null}
        </main>
      ) : (
        <main className={`feud-play${isController ? " controller-play" : ""}`}>
          {error ? (
            <div role="alert" className="feud-error">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          ) : null}
          {!connected ? (
            <p className="feud-offline" role="status">
              {online ? "Reconnecting…" : "Offline · controls paused"}
              {online ? (
                <button
                  className="feud-button subtle"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry
                </button>
              ) : null}
            </p>
          ) : null}
          <div className="feud-game-meta">
            <span>
              ROOM <strong>{route.code}</strong>
            </span>
          </div>
          <Scoreboard game={game} />
          {game.finished ? (
            <Finale
              game={game}
              isController={isController}
              locked={locked}
              act={act}
            />
          ) : (
            <>
              <section
                className="feud-question"
                aria-labelledby="feud-question"
              >
                <p className="feud-eyebrow">
                  R{questions[game.questionIndex].round} <span>·</span>{" "}
                  {questions[game.questionIndex].category}
                </p>
                <h1 id="feud-question">
                  {questions[game.questionIndex].question}
                </h1>
                <p className="feud-question-count">
                  {game.questionIndex + 1} / {questions.length}
                </p>
              </section>
              <div className="feud-board-layout">
                <section
                  className={`feud-answers${isController ? " controller-grid" : ""}`}
                  aria-label={
                    isController
                      ? "Tap an answer to reveal it on the TV"
                      : "Answer board"
                  }
                  aria-live="polite"
                >
                  {questions[game.questionIndex].answers.map(
                    (answer, index) => {
                      const revealed = revealedAnswers(game).includes(index);
                      return isController ? (
                        <button
                          className={`feud-answer controller-answer${revealed ? " is-revealed" : ""}`}
                          key={index}
                          aria-pressed={revealed}
                          aria-label={`${answer.text}, ${answer.points} points${revealed ? ", revealed" : ", reveal"}`}
                          disabled={
                            locked ||
                            revealed ||
                            currentBoard(game).awardedTo !== null
                          }
                          onClick={() => act({ type: "reveal", index })}
                        >
                          <span className="feud-answer-rank">{index + 1}</span>
                          <span className="feud-answer-text">
                            {answer.text}
                          </span>
                          <span className="feud-answer-points">
                            {answer.points}
                          </span>
                          <span className="feud-answer-state">
                            {revealed ? "✓" : "+"}
                          </span>
                        </button>
                      ) : (
                        <div
                          className={`feud-answer tv-answer${revealed ? " is-revealed" : ""}`}
                          key={`${game.questionIndex}-${index}`}
                        >
                          <span className="feud-answer-rank">{index + 1}</span>
                          <span className="feud-answer-text">
                            {revealed ? (
                              answer.text
                            ) : (
                              <span
                                className="feud-hidden-answer"
                                aria-label={`Answer ${index + 1} hidden`}
                              />
                            )}
                          </span>
                          <span className="feud-answer-points">
                            {revealed ? answer.points : ""}
                          </span>
                        </div>
                      );
                    },
                  )}
                </section>
                <aside className="feud-bank">
                  <p className="feud-eyebrow">
                    {currentBoard(game).awardedTo !== null ? "AWARDED" : "BANK"}
                  </p>
                  <strong aria-label={`${boardPoints(game)} points in bank`}>
                    {boardPoints(game)}
                  </strong>
                  <div
                    className="feud-strikes"
                    aria-label={`${currentBoard(game).strikes} of 3 strikes`}
                  >
                    {[0, 1, 2].map((strike) => (
                      <span
                        key={strike}
                        className={
                          strike < currentBoard(game).strikes ? "is-strike" : ""
                        }
                      >
                        ×
                      </span>
                    ))}
                  </div>
                  {currentBoard(game).awardedTo !== null ||
                  currentBoard(game).strikes === 3 ? (
                    <p>
                      {currentBoard(game).awardedTo !== null
                        ? game.teams[currentBoard(game).awardedTo].name
                        : "Steal!"}
                    </p>
                  ) : null}
                </aside>
              </div>
              {isController ? (
                <HostControls
                  game={game}
                  act={act}
                  locked={locked}
                  requestQuestion={(index) => {
                    if (
                      currentBoard(game).awardedTo === null &&
                      boardPoints(game) > 0
                    )
                      setConfirmNext({
                        index,
                        questionIndex: game.questionIndex,
                      });
                    else act({ type: "question", index });
                  }}
                />
              ) : null}
            </>
          )}
        </main>
      )}

      {pairing && isController && game ? (
        <Dialog title="Connect TV" close={() => setPairing(false)}>
          <p>On your TV, open Desi Feud and select Display. Enter this code:</p>
          <div className="feud-room-code">{route.code}</div>
          <p className="feud-small">Keep this phone open to host the game.</p>
          <button
            className="feud-button primary"
            onClick={() => setPairing(false)}
          >
            Ready to host
          </button>
          <button
            className="feud-button"
            onClick={() => copyLink(boardUrl, "TV link")}
          >
            Copy TV link
          </button>
          {copied ? (
            <p role="status" className="feud-small">
              {copied}
            </p>
          ) : null}
        </Dialog>
      ) : null}
      {confirmNext !== null && game ? (
        <Dialog title="Skip awarding?" close={() => setConfirmNext(null)}>
          <p>{boardPoints(game)} points saved for later.</p>
          <button
            className="feud-button primary"
            disabled={locked}
            onClick={() => {
              act({ type: "question", ...confirmNext });
              setConfirmNext(null);
            }}
          >
            Go to {confirmNext.index + 1}
          </button>
          <button className="feud-button" onClick={() => setConfirmNext(null)}>
            Stay
          </button>
        </Dialog>
      ) : null}
    </div>
  );
}

function Lobby({ start, connect, pending, error }) {
  const [names, setNames] = useState(["Team Chai", "Team Samosa"]);
  const [view, setView] = useState("board");
  const [code, setCode] = useState("");
  return (
    <main className="feud-lobby">
      <div className="feud-lobby-intro">
        <FeudLogo />
        <p className="feud-eyebrow">Your living room. Centre stage.</p>
        <h1>
          Guess the
          <br />
          <em>top answers.</em>
        </h1>
        <p>Host on your phone. Play together on the TV.</p>
        <div className="feud-facts">
          <span>
            <strong>30</strong> questions
          </span>
          <span>
            <strong>5</strong> rounds
          </span>
          <span>
            <strong>2</strong> teams
          </span>
        </div>
      </div>
      <div className="feud-setup">
        <div className="feud-panel">
          <fieldset disabled={pending}>
            <legend>Choose this screen’s role</legend>
            <div className="feud-view-choice">
              <label>
                <input
                  type="radio"
                  name="view"
                  value="board"
                  checked={view === "board"}
                  onChange={() => setView("board")}
                />
                <span>Display</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="view"
                  value="controller"
                  checked={view === "controller"}
                  onChange={() => setView("controller")}
                />
                <span>Controller</span>
              </label>
            </div>
          </fieldset>
          {view === "board" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                connect(code);
              }}
            >
              <h2>Join the display</h2>
              <p className="feud-setup-hint">
                Start a game on your phone as Controller, then enter its code here.
              </p>
              <label className="feud-code-field">
                Room code
                <input
                  aria-label="Room code"
                  placeholder="ABC234"
                  value={code}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}"
                  required
                  onChange={(event) => setCode(normalizeCode(event.target.value))}
                />
              </label>
              <button className="feud-button primary" disabled={pending}>
                Join display →
              </button>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                start(names);
              }}
            >
              <h2>Host from your phone</h2>
              <p className="feud-setup-hint">
                Create a game, then use the code to connect your TV.
              </p>
              <div className="feud-team-fields">
                {names.map((name, index) => (
                  <label key={index}>
                    Team {index + 1}
                    <input
                      maxLength={30}
                      required
                      value={name}
                      onChange={(event) =>
                        setNames(
                          names.map((old, item) =>
                            item === index ? event.target.value : old,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="feud-button primary" disabled={pending}>
                {pending ? "Creating…" : "Create game →"}
              </button>
              <p className="feud-small">Saved for 7 days · suggested points.</p>
            </form>
          )}
        </div>
        {error ? (
          <p role="alert" className="feud-error">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function Scoreboard({ game }) {
  return (
    <section className="feud-scoreboard" aria-label="Team scores">
      {game.teams.map((team, index) => (
        <div className={`feud-team team-${index}`} key={index}>
          <div>
            <p className="feud-eyebrow">Team {index + 1}</p>
            <h2>{team.name}</h2>
          </div>
          <strong aria-label={`${team.name}: ${team.score} points`}>
            {team.score}
          </strong>
        </div>
      ))}
    </section>
  );
}

function HostControls({ game, act, locked, requestQuestion }) {
  const board = currentBoard(game);
  return (
    <section className="feud-host-controls" aria-label="Host controls">
      <div className="feud-button-row">
        <button
          className="feud-button danger"
          disabled={locked || board.strikes === 3 || board.awardedTo !== null}
          onClick={() => act({ type: "strike" })}
        >
          × Strike
        </button>
        <button
          className="feud-button"
          disabled={locked || board.strikes === 0 || board.awardedTo !== null}
          onClick={() => act({ type: "undoStrike" })}
        >
          Undo strike
        </button>
        <button
          className="feud-button"
          disabled={
            locked || board.revealed.length === 5 || board.awardedTo !== null
          }
          onClick={() => act({ type: "revealAll" })}
        >
          Reveal all
        </button>
      </div>
      <div className="feud-award-controls">
        <p className="feud-eyebrow">
          {board.awardedTo !== null
            ? `${board.awardedPoints} PTS AWARDED`
            : `AWARD ${boardPoints(game)} PTS`}
        </p>
        {board.awardedTo === null ? (
          <p className="feud-small feud-award-hint">Awarding reveals all.</p>
        ) : null}
        <div className="feud-button-row">
          {game.teams.map((team, index) => (
            <button
              className={`feud-button ${index === 0 ? "primary" : "secondary"}`}
              disabled={
                locked || board.awardedTo !== null || boardPoints(game) === 0
              }
              key={index}
              onClick={() => act({ type: "award", team: index })}
            >
              {team.name}
            </button>
          ))}
          {board.awardedTo !== null ? (
            <button
              className="feud-button"
              disabled={locked}
              onClick={() => act({ type: "undoAward" })}
            >
              Undo award
            </button>
          ) : null}
        </div>
      </div>
      <div className="feud-question-navigation">
        <button
          className="feud-button"
          disabled={locked || game.questionIndex === 0}
          onClick={() => requestQuestion(game.questionIndex - 1)}
        >
          ← Prev
        </button>
        <label>
          Question
          <select
            value={game.questionIndex}
            disabled={locked}
            onChange={(event) => requestQuestion(Number(event.target.value))}
          >
            {rounds.map((round, index) => (
              <optgroup label={`Round ${index + 1} · ${round}`} key={round}>
                {questions
                  .filter((question) => question.round === index + 1)
                  .map((question) => (
                    <option key={question.id} value={question.id - 1}>
                      {question.id}. {question.question}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        {game.questionIndex < 29 ? (
          <button
            className="feud-button primary"
            disabled={locked}
            onClick={() => requestQuestion(game.questionIndex + 1)}
          >
            Next →
          </button>
        ) : (
          <button
            className="feud-button primary"
            disabled={
              locked || (boardPoints(game) > 0 && board.awardedTo === null)
            }
            onClick={() => act({ type: "finish" })}
          >
            Finish ✦
          </button>
        )}
      </div>
    </section>
  );
}

function Finale({ game, isController, locked, act }) {
  const tied = game.teams[0].score === game.teams[1].score;
  const winner =
    game.teams[0].score > game.teams[1].score ? game.teams[0] : game.teams[1];
  return (
    <section className="feud-finale">
      <span>✦</span>
      <h1>{tied ? "It’s a tie!" : `${winner.name} wins!`}</h1>
      {isController ? (
        <button
          className="feud-button"
          disabled={locked}
          onClick={() => act({ type: "resume" })}
        >
          Back to game
        </button>
      ) : null}
      <a className="feud-button primary" href="?mode=feud">
        New game ↗
      </a>
    </section>
  );
}

function Dialog({ title, close, children }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="feud-dialog"
      aria-labelledby="feud-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <button
        className="feud-dialog-close feud-button subtle"
        aria-label="Close dialog"
        autoFocus
        onClick={close}
      >
        ×
      </button>
      <h2 id="feud-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
