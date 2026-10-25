import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { applyAction, createGame } from "./game.js";
import { firebaseConfig } from "./config.js";

const useEmulators = import.meta.env.VITE_FIREBASE_EMULATORS === "true";
const app = initializeApp(
  useEmulators ? { ...firebaseConfig, projectId: "demo-feud" } : firebaseConfig,
);
const auth = getAuth(app);
const db = getFirestore(app);
if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

let signingIn;
async function authenticate() {
  if (!signingIn) {
    signingIn = (async () => {
      await auth.authStateReady();
      return auth.currentUser ?? (await signInAnonymously(auth)).user;
    })().catch((error) => {
      signingIn = null;
      throw error;
    });
  }
  return signingIn;
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomString(length) {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(length)),
    (value) => alphabet[value % alphabet.length],
  ).join("");
}

export function normalizeCode(code) {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

function roomRef(code) {
  const normalized = normalizeCode(code);
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized))
    throw new Error(
      "Enter the six-character room code shown on the other screen.",
    );
  return doc(db, "feudRooms", normalized);
}

function assertRoom(snapshot) {
  if (!snapshot.exists())
    throw new Error("That room does not exist. Check the code and try again.");
  if (snapshot.data().expiresAt.toMillis() < Date.now())
    throw new Error("This room has expired. Start a new game.");
  return snapshot.data();
}

export async function createRoom(teamNames) {
  const user = await authenticate();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomString(6);
    const key = randomString(32);
    const reference = roomRef(code);
    const created = await runTransaction(db, async (transaction) => {
      if ((await transaction.get(reference)).exists()) return false;
      transaction.set(reference, {
        ownerUid: user.uid,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
        game: createGame(teamNames),
      });
      transaction.set(doc(db, "feudKeys", code), { key });
      return true;
    });
    if (created) return { code, key };
  }
  throw new Error("Could not create a unique room. Please try again.");
}

export async function joinRoom(code, { controller = false, key = "" } = {}) {
  const user = await authenticate();
  const reference = roomRef(code);
  const room = assertRoom(await getDocFromServer(reference));
  if (controller && room.ownerUid !== user.uid) {
    const memberRef = doc(reference, "controllers", user.uid);
    // Simultaneous mounts/tabs can pair the same user. A transaction retries
    // after the first claim rather than attempting a forbidden member update.
    await runTransaction(db, async (transaction) => {
      if ((await transaction.get(memberRef)).exists()) return;
      if (!key)
        throw new Error(
          "Scan the host’s QR code or use their private controller link to control this game.",
        );
      transaction.set(memberRef, { key });
    });
  }
  return room;
}

export async function subscribeRoom(code, onChange, onError) {
  await authenticate();
  return onSnapshot(
    roomRef(code),
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        if (!snapshot.exists() && snapshot.metadata.fromCache) return;
        const room = assertRoom(snapshot);
        onChange(
          room.game,
          !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites,
        );
      } catch (error) {
        onError(error);
      }
    },
    onError,
  );
}

export async function sendAction(code, action) {
  await authenticate();
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(code);
    const room = assertRoom(await transaction.get(reference));
    const nextGame = applyAction(room.game, action);
    if (nextGame !== room.game)
      transaction.update(reference, { game: nextGame });
  });
}

export function friendlyError(error) {
  const messages = {
    "auth/operation-not-allowed":
      "Anonymous sign-in needs to be enabled in Firebase Authentication.",
    "auth/configuration-not-found":
      "Firebase Authentication needs to be set up with Anonymous sign-in enabled.",
    "auth/network-request-failed":
      "Could not reach Firebase. Check your internet connection and try again.",
    "auth/unauthorized-domain":
      "This site’s domain needs to be added to Firebase Authentication’s authorised domains.",
    "permission-denied":
      "This room is unavailable or access was denied. Check the room code, controller link, and Firebase rules.",
    unavailable: "Connection lost. Reconnect to the internet, then try again.",
    "failed-precondition":
      "The Firebase database is not ready. Check the Firestore setup.",
  };
  return (
    messages[error.code] ??
    error.message ??
    "Something went wrong. Please try again."
  );
}
