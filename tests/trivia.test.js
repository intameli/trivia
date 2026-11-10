import assert from "node:assert/strict";
import test from "node:test";
import { loadGames, parseCsv, saveGames } from "../src/trivia.js";

const example = "Space,How many moons does Earth have?,One,Jacob\n,,,Bill";

test("imports headerless sheets with player-only rows", () => {
  assert.deepEqual(parseCsv(example), {
    trivia: [
      {
        category: "Space",
        question: "How many moons does Earth have?",
        answer: "One",
      },
    ],
    players: [
      { name: "Jacob", score: 0 },
      { name: "Bill", score: 0 },
    ],
  });
});

test("quoted commas, escaped quotes and multiline cells stay in their columns", () => {
  const game = parseCsv(
    'Music,"Who sang ""Hello, Goodbye""?","The Beatles\n(1967)","Smith, Alex"',
  );
  assert.deepEqual(game, {
    trivia: [
      {
        category: "Music",
        question: 'Who sang "Hello, Goodbye"?',
        answer: "The Beatles\n(1967)",
      },
    ],
    players: [{ name: "Smith, Alex", score: 0 }],
  });
});

test("imports BOM, CRLF, optional headers, blank rows and trailing empty columns", () => {
  assert.deepEqual(
    parseCsv(
      "\uFEFFCategory,Question,Answer,Player Name\r\n\r\nSpace,How many moons does Earth have?,One,Jacob,,\r\n,,,Bill\r\n",
    ),
    parseCsv(example),
  );
});

test("rejects malformed or unplayable imports before they enter the game list", () => {
  for (const csv of [
    "",
    "Category,Question,Answer,Player Name",
    ",,,Jacob",
    "Space,Question,Answer",
    "Space,Question,,Jacob",
    ",Question,Answer,Jacob",
    "Space,,Answer,Jacob",
    'Space,"Unclosed,Answer,Jacob',
    'Space,"Question"oops,Answer,Jacob',
    'Space,Que"stion,Answer,Jacob',
    "Space,Question,Answer,Jacob,unexpected",
  ])
    assert.throws(() => parseCsv(csv), Error, csv);
  assert.throws(
    () =>
      parseCsv(
        'Category,Question,Answer,Player Name\r\n\r\nSpace,"First\r\nquestion",Answer,Alex\r\nSpace,Missing answer,,Alex',
      ),
    /CSV line 5 needs a category, question, and answer/,
  );
});

test("invalid saved JSON or game shapes cannot crash startup", () => {
  for (const value of [
    null,
    "broken",
    "null",
    "{}",
    "42",
    '[null, {}, {"trivia": [], "players": []}]',
  ]) {
    assert.deepEqual(loadGames({ getItem: () => value }), []);
  }
});

test("keeps valid saved games while ignoring broken records", () => {
  const game = parseCsv(example);
  const invalid = [
    { ...game, players: [{ name: "Jacob", score: "1" }] },
    { ...game, players: [{ name: "Jacob", score: -1 }] },
    { ...game, trivia: [{ category: "Space" }] },
    { ...game, trivia: [null] },
    { ...game, players: [null] },
  ];
  assert.deepEqual(
    loadGames({ getItem: () => JSON.stringify([...invalid, game]) }),
    [game],
  );
});

test("saved games round-trip through the existing storage key", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const games = [parseCsv(example)];
  assert.equal(saveGames(games, storage), true);
  assert.equal(values.has("triviaGames"), true);
  assert.deepEqual(loadGames(storage), games);
});

test("blocked reads and full browser storage fail safely", () => {
  const storage = {
    getItem: () => {
      throw new Error("Access denied");
    },
    setItem: () => {
      throw new Error("Quota exceeded");
    },
  };
  assert.deepEqual(loadGames(storage), []);
  assert.equal(saveGames([parseCsv(example)], storage), false);
});
