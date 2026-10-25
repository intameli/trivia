import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { boardPoints, currentBoard } from "./game.js";
import {
  createRoom,
  friendlyError,
  joinRoom,
  normalizeCode,
  sendAction,
  subscribeRoom,
} from "./firebase.js";
import { questions, rounds } from "./questions.js";

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

export default function Feud() {
  const [route, setRoute] = useState(initialRoute);
  const [game, setGame] = useState(null);
  const [synced, setSynced] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pairing, setPairing] = useState(false);
  const [copied, setCopied] = useState("");
  const [confirmNext, setConfirmNext] = useState(null);

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
    if (!route.code) return undefined;
    let cancelled = false;
    let unsubscribe;
    setGame(null);
    setSynced(false);
    setError("");
    (async () => {
      await joinRoom(route.code, {
        controller: route.view === "controller",
        key: route.key,
      });
      if (cancelled) return;
      unsubscribe = await subscribeRoom(
        route.code,
        (nextGame, connected) => {
          if (!cancelled) {
            setGame(nextGame);
            setSynced(connected);
          }
        },
        (failure) => {
          if (!cancelled) {
            setError(friendlyError(failure));
            setSynced(false);
          }
        },
      );
      if (cancelled) unsubscribe();
    })().catch((failure) => {
      if (!cancelled) setError(friendlyError(failure));
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [route.code, route.key, route.view, retry]);

  async function start(teamNames, view) {
    setPending(true);
    setError("");
    try {
      const room = await createRoom(teamNames);
      try {
        localStorage.setItem(`feud-key-${room.code}`, room.key);
      } catch {
        /* The URL still supports refresh without storage. */
      }
      window.history.replaceState(null, "", gameUrl(room.code, view, room.key));
      setRoute({ ...room, view });
      setPairing(view === "board");
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setPending(false);
    }
  }

  function connect(code) {
    const normalized = normalizeCode(code);
    window.history.replaceState(null, "", gameUrl(normalized, "board"));
    setRoute({ code: normalized, view: "board", key: readKey(normalized) });
  }

  async function act(action) {
    if (pending || !synced || !online) return;
    setPending(true);
    setError("");
    try {
      await sendAction(route.code, {
        questionIndex: game.questionIndex,
        ...action,
      });
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setPending(false);
    }
  }

  async function copyLink(url, label) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(`${label} copied`);
    } catch {
      setCopied("Select and copy the link below.");
    }
  }

  const isController = route.view === "controller";
  const connected = online && synced;
  const locked = pending || !connected;
  const controllerUrl = gameUrl(route.code, "controller", route.key);
  const boardUrl = gameUrl(route.code, "board");

  return (
    <div className={`feud-shell${isController ? " is-controller" : ""}`}>
      <header className="feud-header">
        <a className="feud-wordmark" href="?mode=feud">
          DESI <span>✦</span> FEUD
        </a>
        <div className="feud-header-actions">
          {game ? (
            <span
              role="status"
              className={`feud-connection${connected ? " is-live" : ""}`}
            >
              {connected
                ? "Live"
                : online
                  ? "Connecting…"
                  : "Offline · controls paused"}
            </span>
          ) : null}
          {game ? (
            <button
              className="feud-button subtle"
              onClick={() => {
                setPairing(true);
                setCopied("");
              }}
            >
              Connect {isController ? "TV" : "phone"}
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
                      .catch(() =>
                        setError("Fullscreen is unavailable in this browser."),
                      )
              }
            >
              Fullscreen
            </button>
          ) : null}
          <a className="feud-button subtle" href={window.location.pathname}>
            Game modes
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
          <h1>{error ? "Let’s reconnect." : "Setting the stage…"}</h1>
          <p role={error ? "alert" : "status"}>
            {error || "Connecting your screen to the game."}
          </p>
          {error ? (
            <div className="feud-button-row">
              <button
                className="feud-button primary"
                onClick={() => setRetry(retry + 1)}
              >
                Try again
              </button>
              <a className="feud-button" href="?mode=feud">
                Back to Feud
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
              {online
                ? "Reconnecting to the game. Controls will resume when synced."
                : "You’re offline. The last synced board is shown; controls are paused."}
            </p>
          ) : null}
          <div className="feud-game-meta">
            <p className="feud-eyebrow">
              {isController ? "HOST CONTROLLER" : "FRIENDS & FAMILY EDITION"}
            </p>
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
                  ROUND {questions[game.questionIndex].round} <span>/</span>{" "}
                  {questions[game.questionIndex].category}
                </p>
                <h1 id="feud-question">
                  {questions[game.questionIndex].question}
                </h1>
                <p className="feud-question-count">
                  QUESTION {game.questionIndex + 1} OF 30 <span>·</span> 5
                  ANSWERS ON THE BOARD
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
                      const revealed =
                        currentBoard(game).revealed.includes(index);
                      return isController ? (
                        <button
                          className={`feud-answer controller-answer${revealed ? " is-revealed" : ""}`}
                          key={index}
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
                            {revealed ? "✓ REVEALED" : "TAP TO REVEAL"}
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
                              >
                                DESI FEUD
                              </span>
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
                  <p className="feud-eyebrow">POINTS BANK</p>
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
                  <p>
                    {currentBoard(game).awardedTo !== null
                      ? `Banked by ${game.teams[currentBoard(game).awardedTo].name}`
                      : currentBoard(game).strikes === 3
                        ? "Three strikes. Time for a steal!"
                        : isController
                          ? "Reveal answers, then award the bank."
                          : "Think you know your family?"}
                  </p>
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
                      setConfirmNext(index);
                    else act({ type: "question", index });
                  }}
                />
              ) : (
                <p className="feud-tv-hint">
                  Your host has the answers. You bring the guesses.{" "}
                  <span>✦</span>
                </p>
              )}
            </>
          )}
          <p className="feud-ranking-note">
            Points are suggested rankings for gameplay, not actual survey
            results.
          </p>
        </main>
      )}

      {pairing && game ? (
        <Dialog
          title={
            isController
              ? "Bring it to the big screen."
              : "Your phone. The host’s seat."
          }
          close={() => setPairing(false)}
        >
          {isController ? (
            <>
              <p>
                Open this site on your TV or laptop, choose Desi Feud, and enter
                this room code.
              </p>
              <div className="feud-room-code">{route.code}</div>
              <a
                className="feud-button primary"
                href={boardUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open TV board ↗
              </a>
              <button
                className="feud-button"
                onClick={() => copyLink(boardUrl, "TV link")}
              >
                Copy TV link
              </button>
              <input
                className="feud-link"
                aria-label="TV board link"
                readOnly
                value={boardUrl}
                onFocus={(event) => event.target.select()}
              />
            </>
          ) : route.key ? (
            <>
              <p>
                Scan with your phone’s camera. Tap answers on your phone to
                reveal them here.
              </p>
              <div className="feud-qr">
                <QRCodeSVG
                  value={controllerUrl}
                  size={176}
                  marginSize={2}
                  level="M"
                />
              </div>
              <a className="feud-button primary" href={controllerUrl}>
                Use this screen as controller
              </a>
              <button
                className="feud-button"
                onClick={() => copyLink(controllerUrl, "Controller link")}
              >
                Copy private controller link
              </button>
              <input
                className="feud-link"
                aria-label="Private controller link"
                readOnly
                value={controllerUrl}
                onFocus={(event) => event.target.select()}
              />
              <p className="feud-small">
                Keep this link with your host. Anyone with it can control the
                game.
              </p>
            </>
          ) : (
            <>
              <p>
                This screen is a viewer. Open “Connect TV” on the host’s phone
                to find your room code and share the board.
              </p>
              <div className="feud-room-code">{route.code}</div>
            </>
          )}
          {copied ? (
            <p role="status" className="feud-small">
              {copied}
            </p>
          ) : null}
        </Dialog>
      ) : null}
      {confirmNext !== null && game ? (
        <Dialog
          title="Leave this bank unawarded?"
          close={() => setConfirmNext(null)}
        >
          <p>
            The {boardPoints(game)} points will stay with this question. You can
            come back and award them later.
          </p>
          <button
            className="feud-button primary"
            disabled={locked}
            onClick={() => {
              act({ type: "question", index: confirmNext });
              setConfirmNext(null);
            }}
          >
            Move to question {confirmNext + 1}
          </button>
          <button className="feud-button" onClick={() => setConfirmNext(null)}>
            Stay and award points
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
        <p className="feud-eyebrow">FAMILY FEUD, WITH A DESI TWIST.</p>
        <h1>
          Our families.
          <br />
          <em>The top answers.</em>
        </h1>
        <p>
          From family WhatsApp to the Bollywood dance floor. Split into two
          teams and see who knows us best.
        </p>
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
        <div className="feud-how">
          <p>
            <span>01</span> Start a game on your TV or phone.
          </p>
          <p>
            <span>02</span> Connect your other screen.
          </p>
          <p>
            <span>03</span> Guess out loud. Reveal from your phone.
          </p>
        </div>
      </div>
      <div className="feud-setup">
        <form
          className="feud-panel"
          onSubmit={(event) => {
            event.preventDefault();
            start(names, view);
          }}
        >
          <p className="feud-eyebrow">LET THE RIVALRY BEGIN</p>
          <h2>Start a new game</h2>
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
          <fieldset>
            <legend>This screen is my…</legend>
            <div className="feud-view-choice">
              <label>
                <input
                  type="radio"
                  name="view"
                  value="board"
                  checked={view === "board"}
                  onChange={() => setView("board")}
                />
                <span>▣ TV / laptop</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="view"
                  value="controller"
                  checked={view === "controller"}
                  onChange={() => setView("controller")}
                />
                <span>▯ Phone controller</span>
              </label>
            </div>
          </fieldset>
          <button className="feud-button primary" disabled={pending}>
            {pending ? "Creating your room…" : "Start the feud →"}
          </button>
          <p className="feud-small">
            No account needed. Your game saves automatically for 7 days.
          </p>
        </form>
        <form
          className="feud-panel join-panel"
          onSubmit={(event) => {
            event.preventDefault();
            connect(code);
          }}
        >
          <div>
            <h2>Already have a host?</h2>
            <p>Connect this screen to their TV board.</p>
          </div>
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
          <button className="feud-button" disabled={pending}>
            Join TV board ↗
          </button>
        </form>
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
            <span className="feud-eyebrow">TEAM {index + 1}</span>
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
          × Add strike
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
            ? `${board.awardedPoints} POINTS AWARDED`
            : `AWARD ${boardPoints(game)} POINTS TO…`}
        </p>
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
          ← Previous
        </button>
        <label>
          Go to question
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
            Finish game ✦
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
      <p className="feud-eyebrow">THE FAMILY HAS SPOKEN</p>
      <h1>{tied ? "It’s a tie!" : `${winner.name} wins!`}</h1>
      <p>
        {tied
          ? "Shared bragging rights. Until next time."
          : `${winner.score} points. Unlimited bragging rights.`}
      </p>
      {isController ? (
        <button
          className="feud-button"
          disabled={locked}
          onClick={() => act({ type: "resume" })}
        >
          Return to game
        </button>
      ) : null}
      <a className="feud-button primary" href="?mode=feud">
        Start another feud ↗
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
      <p className="feud-eyebrow">A FAMILY AFFAIR</p>
      <h2 id="feud-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
