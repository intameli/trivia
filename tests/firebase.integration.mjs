// Run with emulators by default. --live explicitly exercises the configured
// Firebase project using disposable rooms/accounts and removes them afterward.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  deleteUser,
  getAuth,
  signInAnonymously,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { firebaseConfig } from "../src/feud/config.js";
import { applyAction, createGame } from "../src/feud/game.js";

const live = process.argv.includes("--live");
const config = live
  ? firebaseConfig
  : { ...firebaseConfig, projectId: "demo-feud" };
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = Array.from(randomBytes(6), (value) => alphabet[value % 32]).join(
  "",
);
const key = Array.from(randomBytes(32), (value) => alphabet[value % 32]).join(
  "",
);
const clients = ["owner", "phone", "viewer", "signed-out"].map((name) => {
  const app = initializeApp(config, `${name}-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (!live) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  return { app, auth, db, room: doc(db, "feudRooms", code) };
});
const [owner, phone, viewer, signedOut] = clients;
const denied = (promise) =>
  assert.rejects(promise, (error) => error.code === "permission-denied");
async function act(client, action) {
  return runTransaction(client.db, async (tx) => {
    const snapshot = await tx.get(client.room);
    tx.update(client.room, { game: applyAction(snapshot.data().game, action) });
  });
}

await test(
  `Firebase ${live ? "LIVE" : "emulator"} pairing, sync, and access boundaries`,
  { timeout: 60000 },
  async (t) => {
    let created = false;
    try {
      await Promise.all(
        [owner, phone, viewer].map((client) => signInAnonymously(client.auth)),
      );
      await t.test(
        "owner can atomically create a room and private key",
        async () => {
          await runTransaction(owner.db, async (tx) => {
            assert.equal((await tx.get(owner.room)).exists(), false);
            tx.set(owner.room, {
              ownerUid: owner.auth.currentUser.uid,
              createdAt: Timestamp.now(),
              expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
              game: createGame(),
            });
            tx.set(doc(owner.db, "feudKeys", code), { key });
          });
          created = true;
        },
      );
      await t.test(
        "room code permits signed-in viewing but not listing or signed-out reads",
        async () => {
          assert.equal((await getDocFromServer(viewer.room)).exists(), true);
          await denied(getDocs(collection(viewer.db, "feudRooms")));
          await denied(getDocFromServer(signedOut.room));
        },
      );
      await t.test(
        "viewer cannot write, read the host key, or claim control without the key",
        async () => {
          await denied(updateDoc(viewer.room, { game: createGame() }));
          await denied(getDocFromServer(doc(viewer.db, "feudKeys", code)));
          await denied(
            setDoc(
              doc(viewer.room, "controllers", viewer.auth.currentUser.uid),
              { key: "WRONG" },
            ),
          );
        },
      );
      await t.test(
        "private link pairs a different anonymous phone account",
        async () => {
          await setDoc(
            doc(phone.room, "controllers", phone.auth.currentUser.uid),
            { key },
          );
          await act(phone, { type: "reveal", index: 0 });
          assert.deepEqual(
            (await getDocFromServer(viewer.room)).data().game.boards["1"]
              .revealed,
            [0],
          );
        },
      );
      await t.test(
        "TV receives a phone reveal through a real snapshot listener",
        async () => {
          let stop;
          const received = new Promise((resolve, reject) => {
            stop = onSnapshot(
              viewer.room,
              (snapshot) => {
                if (snapshot.data()?.game.boards["1"].revealed.includes(1))
                  resolve();
              },
              reject,
            );
          });
          try {
            await act(phone, { type: "reveal", index: 1 });
            await received;
          } finally {
            stop?.();
          }
        },
      );
      await t.test(
        "concurrent reveals preserve both answers and awards cannot duplicate",
        async () => {
          await Promise.all([
            act(owner, { type: "reveal", index: 2 }),
            act(phone, { type: "reveal", index: 3 }),
          ]);
          assert.deepEqual(
            (await getDocFromServer(owner.room)).data().game.boards["1"]
              .revealed,
            [0, 1, 2, 3],
          );
          await Promise.all([
            act(owner, { type: "award", team: 0 }),
            act(phone, { type: "award", team: 0 }),
          ]);
          assert.equal(
            (await getDocFromServer(owner.room)).data().game.teams[0].score,
            90,
          );
        },
      );
      await t.test(
        "controller cannot change room ownership or expiration",
        async () => {
          await denied(
            updateDoc(phone.room, { ownerUid: phone.auth.currentUser.uid }),
          );
          await denied(
            updateDoc(phone.room, {
              expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
            }),
          );
          await denied(getDocFromServer(doc(phone.db, "feudKeys", code)));
        },
      );
      await t.test(
        "navigation and a fresh server read preserve prior board state",
        async () => {
          await act(phone, { type: "question", index: 21 });
          await act(phone, { type: "reveal", index: 1 });
          await act(phone, { type: "question", index: 0 });
          const game = (await getDocFromServer(viewer.room)).data().game;
          assert.equal(game.teams[0].score, 90);
          assert.equal(game.boards["22"].revealed[0], 1);
          assert.equal(game.boards["1"].awardedPoints, 90);
        },
      );
    } finally {
      if (created) {
        const cleanup = writeBatch(owner.db);
        cleanup.delete(
          doc(owner.room, "controllers", phone.auth.currentUser.uid),
        );
        cleanup.delete(doc(owner.db, "feudKeys", code));
        cleanup.delete(owner.room);
        await cleanup.commit();
      }
      await Promise.all(
        clients.map(async ({ auth, app }) => {
          if (auth.currentUser) await deleteUser(auth.currentUser);
          await deleteApp(app);
        }),
      );
    }
  },
);
