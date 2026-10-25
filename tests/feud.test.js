import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  boardPoints,
  createGame,
  currentBoard,
} from "../src/feud/game.js";
import { questions, rounds } from "../src/feud/questions.js";

test("all 30 supplied questions have five answers, 100 points and the correct rounds", () => {
  assert.equal(questions.length, 30);
  assert.deepEqual(
    rounds.map(
      (_, index) => questions.filter((q) => q.round === index + 1).length,
    ),
    [6, 8, 7, 4, 5],
  );
  for (const question of questions) {
    assert.equal(question.answers.length, 5);
    assert.equal(
      question.answers.reduce((sum, a) => sum + a.points, 0),
      100,
    );
  }
  assert.deepEqual(
    questions[21].answers.map((a) => a.points),
    [30, 20, 20, 15, 15],
  );
  assert.equal(questions[29].answers[0].text, "Slippers/chappal");
});

test("reveals are idempotent and do not mutate previous state", () => {
  const original = createGame();
  const revealed = applyAction(original, { type: "reveal", index: 0 });
  assert.equal(boardPoints(revealed), 30);
  assert.deepEqual(currentBoard(original).revealed, []);
  assert.equal(applyAction(revealed, { type: "reveal", index: 0 }), revealed);
});

test("bank is awarded once, locked, and can be corrected", () => {
  let game = applyAction(createGame(), { type: "reveal", index: 0 });
  game = applyAction(game, { type: "reveal", index: 2 });
  game = applyAction(game, { type: "award", team: 1 });
  assert.deepEqual(
    game.teams.map((t) => t.score),
    [0, 50],
  );
  assert.equal(applyAction(game, { type: "award", team: 1 }), game);
  assert.equal(applyAction(game, { type: "award", team: 0 }), game);
  assert.equal(applyAction(game, { type: "reveal", index: 4 }), game);
  game = applyAction(game, { type: "undoAward" });
  assert.equal(game.teams[1].score, 0);
  game = applyAction(game, { type: "award", team: 0 });
  assert.deepEqual(
    game.teams.map((t) => t.score),
    [50, 0],
  );
});

test("question navigation preserves banks, awards, and strikes", () => {
  let game = applyAction(createGame(), { type: "revealAll" });
  game = applyAction(game, { type: "strike" });
  game = applyAction(game, { type: "award", team: 0 });
  game = applyAction(game, { type: "question", index: 21 });
  assert.equal(boardPoints(game), 0);
  game = applyAction(game, { type: "reveal", index: 1 });
  assert.equal(boardPoints(game), 20);
  game = applyAction(game, { type: "question", index: 0 });
  assert.equal(boardPoints(game), 100);
  assert.equal(currentBoard(game).strikes, 1);
  assert.equal(currentBoard(game).awardedTo, 0);
  assert.equal(game.teams[0].score, 100);
});

test("strike count stays within zero and three", () => {
  let game = createGame();
  for (let i = 0; i < 5; i++) game = applyAction(game, { type: "strike" });
  assert.equal(currentBoard(game).strikes, 3);
  for (let i = 0; i < 5; i++) game = applyAction(game, { type: "undoStrike" });
  assert.equal(currentBoard(game).strikes, 0);
});

test("stale actions from a previous question are discarded", () => {
  const game = applyAction(createGame(), { type: "question", index: 1 });
  assert.equal(
    applyAction(game, { type: "reveal", index: 0, questionIndex: 0 }),
    game,
  );
  assert.equal(
    applyAction(game, { type: "award", team: 0, questionIndex: 0 }),
    game,
  );
});

test("invalid actions cannot navigate out of range or create invalid scores", () => {
  const game = createGame();
  for (const action of [
    { type: "reveal", index: -1 },
    { type: "reveal", index: 5 },
    { type: "reveal", index: 1.5 },
    { type: "question", index: 30 },
    { type: "question", index: -1 },
    { type: "award", team: 2 },
    { type: "award", team: 0 },
    { type: "undoAward" },
  ])
    assert.equal(applyAction(game, action), game);
});

test("finish freezes gameplay and resume restores the same board", () => {
  let game = applyAction(createGame(), { type: "reveal", index: 0 });
  game = applyAction(game, { type: "finish" });
  assert.equal(game.finished, true);
  assert.equal(applyAction(game, { type: "strike" }), game);
  assert.equal(applyAction(game, { type: "revealAll" }), game);
  assert.equal(applyAction(game, { type: "award", team: 0 }), game);
  game = applyAction(game, { type: "resume" });
  assert.equal(game.finished, false);
  assert.equal(boardPoints(game), 30);
});
