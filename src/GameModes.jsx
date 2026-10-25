import { lazy, Suspense } from "react";
import App from "./App.jsx";
import "./feud/feud.css";

const Feud = lazy(() => import("./feud/Feud.jsx"));

export default function GameModes() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "trivia")
    return (
      <App
        onChangeMode={() => window.location.assign(window.location.pathname)}
      />
    );
  if (mode === "feud")
    return (
      <Suspense
        fallback={<div className="feud-loading">Getting the board ready…</div>}
      >
        <Feud />
      </Suspense>
    );
  return (
    <main className="mode-page">
      <a href={window.location.pathname} className="feud-wordmark">
        GAME NIGHT <span>✦</span>
      </a>
      <div className="mode-intro">
        <p className="feud-eyebrow">GOOD COMPANY. A LITTLE COMPETITION.</p>
        <h1>
          Make it a<br />
          <em>game night.</em>
        </h1>
        <p>
          Pick your game. Gather your people. Let the friendly rivalry begin.
        </p>
      </div>
      <div className="mode-cards">
        <a className="mode-card trivia-mode" href="?mode=trivia">
          <span className="mode-number">01 / THE CLASSIC</span>
          <span className="mode-symbol">?</span>
          <h2>Trivia</h2>
          <p>
            Big questions. Bragging rights.
            <br />
            Your classic trivia games, ready to play.
          </p>
          <span className="mode-cta">
            Let’s play <span>↗</span>
          </span>
        </a>
        <a className="mode-card feud-mode" href="?mode=feud">
          <span className="mode-number">02 / FRIENDS & FAMILY EDITION</span>
          <span className="mode-symbol">✦</span>
          <h2>Desi Feud</h2>
          <p>
            30 questions. Two teams.
            <br />
            One very opinionated family.
          </p>
          <span className="mode-cta">
            Survey says… <span>↗</span>
          </span>
        </a>
      </div>
      <p className="mode-footer">A little chai. A lot of competition.</p>
    </main>
  );
}
