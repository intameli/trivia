import { questions } from "./questions.js";

export function createGame(teamNames = ["Team Chai", "Team Samosa"]) {
  return {
    version: 1,
    questionIndex: 0,
    teams: teamNames.map((name, index) => ({
      name: name.trim().slice(0, 30) || `Team ${index + 1}`,
      score: 0,
    })),
    boards: Object.fromEntries(
      questions.map(({ id }) => [
        String(id),
        { revealed: [], strikes: 0, awardedTo: null, awardedPoints: 0 },
      ]),
    ),
    finished: false,
  };
}

export function currentBoard(game) {
  return game.boards[String(questions[game.questionIndex].id)];
}

export function boardPoints(game) {
  const question = questions[game.questionIndex];
  return currentBoard(game).revealed.reduce(
    (sum, index) => sum + question.answers[index].points,
    0,
  );
}

// Run against the latest server state in a transaction, so retries and double
// taps cannot award the same bank twice or lose another controller's reveal.
export function applyAction(game, action) {
  const next = structuredClone(game);
  const board = currentBoard(next);
  if (
    action.questionIndex !== undefined &&
    action.questionIndex !== game.questionIndex
  )
    return game;
  switch (action.type) {
    case "reveal":
      if (
        board.awardedTo !== null ||
        game.finished ||
        !Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index >= 5 ||
        board.revealed.includes(action.index)
      )
        return game;
      board.revealed.push(action.index);
      board.revealed.sort();
      break;
    case "revealAll":
      if (board.awardedTo !== null || game.finished) return game;
      board.revealed = [0, 1, 2, 3, 4];
      break;
    case "strike":
      if (board.awardedTo !== null || game.finished) return game;
      board.strikes = Math.min(3, board.strikes + 1);
      break;
    case "undoStrike":
      if (board.awardedTo !== null || game.finished) return game;
      board.strikes = Math.max(0, board.strikes - 1);
      break;
    case "award":
      if (
        board.awardedTo !== null ||
        game.finished ||
        ![0, 1].includes(action.team) ||
        boardPoints(game) === 0
      )
        return game;
      board.awardedTo = action.team;
      board.awardedPoints = boardPoints(game);
      next.teams[action.team].score += board.awardedPoints;
      break;
    case "undoAward":
      if (board.awardedTo === null || game.finished) return game;
      next.teams[board.awardedTo].score -= board.awardedPoints;
      board.awardedTo = null;
      board.awardedPoints = 0;
      break;
    case "question":
      if (
        !Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index >= questions.length
      )
        return game;
      next.questionIndex = action.index;
      next.finished = false;
      break;
    case "finish":
      next.finished = true;
      break;
    case "resume":
      next.finished = false;
      break;
    default:
      return game;
  }
  return next;
}
