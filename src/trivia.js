function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let rowLine = 1;

  const finishField = () => {
    row.push(field.trim());
    field = "";
    closedQuote = false;
  };

  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
        if (
          character === "\n" ||
          (character === "\r" && input[index + 1] !== "\n")
        )
          line += 1;
      }
    } else if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      finishField();
      rows.push({ values: row, line: rowLine });
      row = [];
      line += 1;
      rowLine = line;
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else if (character === '"' && !field.trim() && !closedQuote) {
      field = "";
      quoted = true;
    } else if (character === '"' || (closedQuote && character.trim())) {
      throw new Error(
        "Invalid CSV quoting. Export the sheet as CSV and try again.",
      );
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  finishField();
  rows.push({ values: row, line: rowLine });
  return rows.filter(({ values }) => values.some(Boolean));
}

export function parseCsv(text) {
  const rows = csvRows(text);
  const header = rows[0]?.values.map((value) => value.toLowerCase());
  if (
    header?.[0] === "category" &&
    header[1] === "question" &&
    header[2] === "answer" &&
    [undefined, "", "player", "players", "player name", "name"].includes(
      header[3],
    )
  )
    rows.shift();

  const trivia = [];
  const players = [];
  for (const { values, line } of rows) {
    const [category = "", question = "", answer = "", name = ""] = values;
    if (values.slice(4).some(Boolean))
      throw new Error(
        `CSV line ${line} has extra columns. Use category, question, answer, and player name.`,
      );
    if (category || question || answer) {
      if (!category || !question || !answer)
        throw new Error(
          `CSV line ${line} needs a category, question, and answer.`,
        );
      trivia.push({ category, question, answer });
    }
    if (name) players.push({ name, score: 0 });
  }
  if (!trivia.length || !players.length)
    throw new Error(
      "Add at least one complete question and one player to the CSV.",
    );
  return { trivia, players };
}

function validGame(game) {
  return (
    game &&
    Array.isArray(game.trivia) &&
    game.trivia.length > 0 &&
    game.trivia.every(
      (question) =>
        question &&
        ["category", "question", "answer"].every(
          (key) => typeof question[key] === "string" && question[key].trim(),
        ),
    ) &&
    Array.isArray(game.players) &&
    game.players.length > 0 &&
    game.players.every(
      (player) =>
        player &&
        typeof player.name === "string" &&
        player.name.trim() &&
        Number.isInteger(player.score) &&
        player.score >= 0,
    )
  );
}

export function loadGames(storage) {
  try {
    const games = JSON.parse(
      (storage ?? globalThis.localStorage).getItem("triviaGames"),
    );
    return Array.isArray(games) ? games.filter(validGame) : [];
  } catch {
    return [];
  }
}

export function saveGames(games, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      "triviaGames",
      JSON.stringify(games),
    );
    return true;
  } catch {
    return false;
  }
}
