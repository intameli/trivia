import { expect, test } from "@playwright/test";
import { applyAction, createGame } from "../src/feud/game.js";
import { questions } from "../src/feud/questions.js";

// Exercise the real React screens against one shared, controllable transport.
// Firebase's actual pairing, transactions, and listeners are checked separately
// by firebase.integration.mjs. Here we can also reproduce stalled/failed writes.
async function screens(browser, teamNames) {
  let game = createGame(teamNames);
  let heldWrite;
  let failWrite = false;
  const clients = [];
  const errors = [];
  const connections = [];
  const creations = [];

  async function deliver(client, next = game, connected = true) {
    if (
      client.listening &&
      !client.paused &&
      (await client.page.evaluate(() => navigator.onLine))
    )
      await client.page.evaluate(
        ({ next, connected }) => window.__feudReceive?.(next, connected),
        { next, connected },
      );
  }

  const server = {
    connections,
    creations,
    get game() {
      return game;
    },
    holdWrite() {
      heldWrite = Promise.withResolvers();
      return () => heldWrite.resolve();
    },
    failWrite() {
      failWrite = true;
    },
    async act(action) {
      game = applyAction(game, action);
      await Promise.all(clients.map((client) => deliver(client)));
    },
    async snapshot(client, next, connected) {
      await deliver(client, next, connected);
    },
    async disconnect(client) {
      client.listening = false;
      await client.page.evaluate(() =>
        window.__feudError(new Error("Connection lost.")),
      );
    },
    async open(view, viewport) {
      const context = await browser.newContext({
        viewport,
        baseURL: "http://127.0.0.1:4174",
      });
      const page = await context.newPage();
      const client = {
        context,
        page,
        paused: false,
        listening: false,
        subscriptions: 0,
      };
      clients.push(client);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.exposeFunction("__feudCreate", (names) => {
        creations.push(names);
        game = createGame(names);
        return { code: "ABC234", key: "test" };
      });
      await page.exposeFunction("__feudJoin", (code, options) => {
        connections.push({ code, ...options });
      });
      await page.exposeFunction("__feudSubscribe", () => {
        client.subscriptions += 1;
        client.listening = true;
        return game;
      });
      await page.exposeFunction("__feudUnsubscribe", () => {
        client.listening = false;
      });
      await page.exposeFunction("__feudSend", async (action) => {
        if (heldWrite) {
          await heldWrite.promise;
          heldWrite = null;
        }
        if (failWrite) {
          failWrite = false;
          throw new Error("Couldn’t save. Try again.");
        }
        await server.act(action);
        return game;
      });
      await page.route("**/src/feud/firebase.js*", (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: `
          export const normalizeCode = code => code.trim().toUpperCase().replace(/[\\s-]/g, '');
          export const friendlyError = error => error.message;
          export const createRoom = names => window.__feudCreate(names);
          export const joinRoom = (code, options) => window.__feudJoin(code, options);
          export async function subscribeRoom(code, onChange, onError) {
            window.__feudReceive = onChange;
            window.__feudError = onError;
            onChange(await window.__feudSubscribe(), true);
            return () => { window.__feudUnsubscribe(); };
          }
          export const sendAction = (code, action) => window.__feudSend(action);
        `,
        }),
      );
      await page.goto(
        view ? `/?mode=feud&room=ABC234&view=${view}#key=test` : "/?mode=feud",
      );
      if (view)
        await expect(page.locator(".feud-connection")).toHaveText("Live");
      return client;
    },
    async close() {
      await Promise.all(clients.map(({ context }) => context.close()));
      expect(errors).toEqual([]);
    },
  };
  return server;
}

const phoneSize = { width: 390, height: 844 };
const tvSize = { width: 1280, height: 720 };

test("phone highlights immediately, confirms on TV, and rolls back failed taps", async ({
  browser,
}) => {
  const server = await screens(browser);
  try {
    const { page: phone } = await server.open("controller", phoneSize);
    const { page: tv } = await server.open("board", tvSize);
    const release = server.holdWrite();
    await phone.locator(".controller-answer").nth(0).click();
    await expect(phone.locator(".controller-answer").nth(0)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(phone.locator(".controller-answer").nth(0)).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(tv.locator(".tv-answer.is-revealed")).toHaveCount(0);
    release();
    await expect(tv.locator(".tv-answer.is-revealed")).toHaveCount(1);
    await expect(phone.locator(".feud-bank > strong")).toHaveText("30");
    await expect(tv.locator(".feud-bank > strong")).toHaveText("30");

    server.failWrite();
    await phone.locator(".controller-answer").nth(1).click();
    await expect(phone.getByRole("alert")).toContainText("Couldn’t save");
    await expect(phone.locator(".controller-answer").nth(1)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(phone.locator(".feud-bank > strong")).toHaveText("30");
    await expect(tv.locator(".tv-answer.is-revealed")).toHaveCount(1);
    await phone.locator(".controller-answer").nth(1).click();
    await expect(tv.locator(".tv-answer.is-revealed")).toHaveCount(2);
    await expect(phone.getByRole("alert")).toHaveCount(0);
  } finally {
    await server.close();
  }
});

test("awards reveal everything on every device; undo and reassignment preserve the earned bank", async ({
  browser,
}) => {
  const server = await screens(browser);
  try {
    const { page: phone } = await server.open("controller", phoneSize);
    const { page: other } = await server.open("controller", phoneSize);
    const { page: tv } = await server.open("board", tvSize);
    await expect(phone.getByText("Awarding reveals all.")).toBeVisible();
    await phone.locator(".controller-answer").nth(0).click();
    await phone
      .locator(".feud-award-controls")
      .getByRole("button", { name: "Team Chai", exact: true })
      .click();
    for (const page of [phone, other, tv]) {
      await expect(page.locator(".feud-answer.is-revealed")).toHaveCount(5);
      await expect(page.locator(".feud-team strong").nth(0)).toHaveText("30");
      await expect(page.locator(".feud-bank > strong")).toHaveText("30");
    }
    await other.reload();
    await expect(other.locator(".controller-answer.is-revealed")).toHaveCount(
      5,
    );
    await phone.getByRole("button", { name: "Next →", exact: true }).click();
    await expect(tv.locator(".feud-question-count")).toHaveText("2 / 30");
    await other.getByRole("button", { name: "← Prev", exact: true }).click();
    await expect(tv.locator(".feud-answer.is-revealed")).toHaveCount(5);
    await other
      .getByRole("button", { name: "Undo award", exact: true })
      .click();
    for (const page of [phone, other, tv]) {
      await expect(page.locator(".feud-answer.is-revealed")).toHaveCount(1);
      await expect(page.locator(".feud-team strong").nth(0)).toHaveText("0");
    }
    await phone
      .locator(".feud-award-controls")
      .getByRole("button", { name: "Team Samosa", exact: true })
      .click();
    await expect(tv.locator(".feud-team strong").nth(1)).toHaveText("30");
    await expect(tv.locator(".feud-answer.is-revealed")).toHaveCount(5);
  } finally {
    await server.close();
  }
});

test("stalled listeners, cached snapshots, failed listeners, and offline devices recover without refresh", async ({
  browser,
}) => {
  const server = await screens(browser);
  try {
    const client = await server.open("controller", phoneSize);
    const { page: phone, context } = client;
    const { page: tv } = await server.open("board", tvSize);
    const oldGame = structuredClone(server.game);
    const subscriptions = client.subscriptions;
    const release = server.holdWrite();
    await phone.locator(".controller-answer").nth(0).click();
    // An unrelated update before the write commits must not count as its ack.
    await server.act({ type: "strike" });
    client.paused = true;
    release();
    await expect(tv.locator(".tv-answer.is-revealed")).toHaveCount(1);
    await expect
      .poll(() => client.subscriptions)
      .toBeGreaterThan(subscriptions);
    client.paused = false;
    await expect(phone.locator(".feud-connection")).toHaveText("Live");
    await server.snapshot(client, oldGame, false);
    await expect(phone.locator(".controller-answer.is-revealed")).toHaveCount(
      1,
    );
    await server.snapshot(client, server.game, true);
    await server.disconnect(client);
    await expect(
      phone.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
    await phone.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(phone.locator(".feud-connection")).toHaveText("Live");
    await expect(phone.getByRole("alert")).toHaveCount(0);
    await server.act({ type: "undoStrike" });

    await context.setOffline(true);
    await expect(phone.locator(".feud-connection")).toHaveText("Offline");
    await expect(phone.locator(".controller-answer").nth(1)).toBeDisabled();
    await server.act({ type: "reveal", index: 1 });
    await server.act({ type: "strike" });
    await context.setOffline(false);
    await expect(phone.locator(".feud-connection")).toHaveText("Live");
    await expect(phone.locator(".controller-answer.is-revealed")).toHaveCount(
      2,
    );
    await expect(phone.locator(".is-strike")).toHaveCount(1);
    await expect(tv.locator(".is-strike")).toHaveCount(1);

    client.paused = true;
    await server.act({ type: "question", index: 5 });
    await phone.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await expect(phone.locator(".feud-question-count")).toHaveText("6 / 30");
  } finally {
    await server.close();
  }
});

test("remote changes dismiss stale navigation dialogs and keep strikes and finale in sync", async ({
  browser,
}) => {
  const server = await screens(browser);
  try {
    const { page: phone } = await server.open("controller", phoneSize);
    const { page: tv } = await server.open("board", tvSize);
    await phone.locator(".controller-answer").nth(0).click();
    await phone.getByRole("button", { name: "Next →", exact: true }).click();
    await expect(phone.getByRole("dialog")).toBeVisible();
    await server.act({ type: "question", index: 5 });
    await expect(phone.getByRole("dialog")).toHaveCount(0);
    await expect(phone.locator(".feud-question-count")).toHaveText("6 / 30");
    await phone.getByRole("button", { name: "× Strike", exact: true }).click();
    await expect(tv.locator(".is-strike")).toHaveCount(1);
    await phone
      .getByRole("button", { name: "Undo strike", exact: true })
      .click();
    await expect(tv.locator(".is-strike")).toHaveCount(0);
    await phone
      .getByRole("combobox", { name: "Question", exact: true })
      .selectOption("29");
    await phone
      .getByRole("button", { name: "Reveal all", exact: true })
      .click();
    await expect(tv.locator(".tv-answer.is-revealed")).toHaveCount(5);
    await expect(
      phone.getByRole("button", { name: "Finish ✦", exact: true }),
    ).toBeDisabled();
    await phone
      .locator(".feud-award-controls")
      .getByRole("button", { name: "Team Chai", exact: true })
      .click();
    await phone.getByRole("button", { name: "Finish ✦", exact: true }).click();
    await expect(
      tv.getByRole("heading", { name: "Team Chai wins!", exact: true }),
    ).toBeVisible();
    await phone
      .getByRole("button", { name: "Back to game", exact: true })
      .click();
    await expect(tv.locator(".feud-question-count")).toHaveText("30 / 30");
  } finally {
    await server.close();
  }
});

test("all questions fit phone and TV widths; full TV boards fit a 720p screen", async ({
  browser,
}) => {
  const server = await screens(browser, [
    "W".repeat(30),
    "A Very Long Family Team Name",
  ]);
  try {
    const { page: phone } = await server.open("controller", {
      width: 320,
      height: 740,
    });
    const { page: tv } = await server.open("board", tvSize);
    for (let index = 0; index < questions.length; index += 1) {
      await server.act({ type: "question", index });
      await server.act({ type: "revealAll" });
      await expect(tv.locator(".feud-question-count")).toHaveText(
        `${index + 1} / 30`,
      );
      for (const page of [phone, tv]) {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          await page
            .locator(".feud-answer-text")
            .evaluateAll((answers) =>
              answers.every(
                (answer) => answer.scrollWidth <= answer.clientWidth,
              ),
            ),
        ).toBe(true);
      }
      const bottom = await tv
        .locator(".feud-board-layout")
        .evaluate((board) => board.getBoundingClientRect().bottom);
      expect(bottom).toBeLessThanOrEqual(tvSize.height);
    }
    await server.act({ type: "award", team: 0 });
    for (const page of [phone, tv])
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await expect(tv.locator(".tv-answer.is-revealed")).toHaveCount(5);
    expect(
      await tv
        .locator(".feud-board-layout")
        .evaluate((board) => board.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(1080);
  } finally {
    await server.close();
  }
});

test("phone creates the game and the default display joins by code", async ({
  browser,
}) => {
  const server = await screens(browser);
  try {
    const { page: phone } = await server.open(null, phoneSize);
    await expect(phone.getByRole("radio")).toHaveCount(2);
    await expect(
      phone.getByRole("radio", { name: "Display", exact: true }),
    ).toBeChecked();
    await expect(phone.getByRole("textbox", { name: "Room code" })).toBeVisible();
    await expect(
      phone.getByRole("button", { name: "Create game →" }),
    ).toHaveCount(0);
    await phone.getByRole("radio", { name: "Controller", exact: true }).check();
    await expect(phone.getByRole("textbox", { name: "Room code" })).toHaveCount(0);
    await phone
      .getByRole("textbox", { name: "Team 1", exact: true })
      .fill("Team Mango");
    await phone
      .getByRole("button", { name: "Create game →", exact: true })
      .click();
    await expect(
      phone.getByRole("dialog", { name: "Connect TV" }),
    ).toBeVisible();
    await expect(phone.locator(".feud-room-code")).toHaveText("ABC234");
    await expect(phone).toHaveURL(/view=controller#key=test$/);
    expect(server.creations).toEqual([["Team Mango", "Team Samosa"]]);
    await phone
      .getByRole("button", { name: "Ready to host", exact: true })
      .click();
    await expect(phone.locator(".controller-answer")).toHaveCount(5);
    await phone.getByRole("button", { name: "Connect TV", exact: true }).click();
    await expect(phone.locator(".feud-room-code")).toHaveText("ABC234");
    await phone.getByRole("button", { name: "Close dialog" }).click();

    const { page: tv } = await server.open(null, tvSize);
    await expect(
      tv.getByRole("radio", { name: "Display", exact: true }),
    ).toBeChecked();
    await tv.getByRole("textbox", { name: "Room code" }).fill("abc234");
    await tv.getByRole("button", { name: "Join display →", exact: true }).click();
    await expect(tv.locator(".feud-connection")).toHaveText("Live");
    await expect(tv).toHaveURL(/room=ABC234&view=board$/);
    await expect(
      tv.getByRole("button", { name: "Connect phone", exact: true }),
    ).toHaveCount(0);
    await expect(
      tv.getByRole("link", { name: "Host here", exact: true }),
    ).toHaveCount(0);
    await expect(tv.locator(".controller-answer")).toHaveCount(0);
    expect(server.creations).toHaveLength(1);
    expect(server.connections).toContainEqual({
      code: "ABC234",
      controller: false,
      key: "",
    });
    await phone.locator(".controller-answer").nth(0).click();
    await expect(tv.locator(".feud-answer.is-revealed")).toHaveCount(1);
    await expect(tv.locator(".feud-team h2").nth(0)).toHaveText("Team Mango");
    await phone.reload();
    await expect(phone.locator(".feud-connection")).toHaveText("Live");
    await expect(phone.locator(".controller-answer.is-revealed")).toHaveCount(1);
  } finally {
    await server.close();
  }
});
