# Game Night — Trivia & Desi Feud

React/Vite party games. The home screen offers the original Trivia game and a separate Desi Feud mode with all 30 supplied questions across five rounds.

## Play Desi Feud

1. Open **Desi Feud** on your phone, select **Controller**, enter two team names, and choose **Create game**. The controller opens immediately, with a six-character room code at the top.
2. Open **Desi Feud** on your TV or laptop. **Display** is selected by default; enter the phone’s code and choose **Join display**. Keep the phone open as the host: tapping an answer reveals it on the TV immediately.
3. Add or undo strikes, reveal answers, and award the earned bank to a team. Awarding reveals every remaining answer on both devices without adding their points to the bank. **Undo award** restores the original reveals and lets the host correct the winner.
4. Use **Next**, **Prev**, or the question selector to move around the five rounds. Reveals, strikes, awards, and scores survive navigation and refresh. Finish after question 30 to show the winner.

The phone always creates and controls the game. **Connect TV** on the phone reopens the room code and offers a display link. Room codes and display links open a read-only board. The phone’s own URL preserves host access on refresh; keep it with the host.

Confirmed answer reveals play a ding and added strikes play a buzzer on each device. Sound unlocks after a local click or keypress; on a TV opened directly from a link, choose **Enable sound** first. **Sound on** mutes that device. Reloading, navigating questions, undoing strikes, and awarding the bank do not play sounds.

The original Trivia game remains available at `?mode=trivia`, including saved local games and CSV imports. Its gameplay and existing `triviaGames` storage are unchanged.

Trivia CSVs use category, question, answer, and player name columns, with an optional header row. Quoted commas, quotation marks, multiline cells, and extra player-only rows are supported. Invalid imports show an error without adding a game. If browser storage is blocked or full, games remain playable for the current page session and a warning explains that changes cannot be saved. Selecting a game starts a fresh scorecard.

## Firebase

The app uses the supplied `family-1225b` project with **Cloud Firestore Standard** in **Sydney (`australia-southeast1`)** and **Anonymous Authentication**. Firebase Analytics is not required for gameplay and is not initialized.

- `src/feud/config.js`: public Firebase web configuration. This is a project identifier, not an administrator credential.
- `feudRooms/{code}`: shared game state, owner UID, creation time, and seven-day expiration.
- `feudKeys/{code}`: private pairing key, readable only by the creator.
- `feudRooms/{code}/controllers/{uid}`: controller membership, created only with the matching private key.
- `firestore.rules`: denies room enumeration and signed-out access, keeps room-code viewers read-only, protects pairing keys, and restricts writes to the owner and paired controllers. Other database paths are denied.

Game updates use Firestore transactions and snapshot listeners. Phone answer taps highlight immediately, roll back if a write fails, and reconcile with confirmed server state. A stalled listener restarts after a completed action; returning to the app or reconnecting the network also reopens the listener. Concurrent reveals are preserved; repeated awards cannot duplicate scores. Controls pause while offline or awaiting sync. Rooms become inaccessible after seven days; expiration does not automatically delete documents (configure Firestore TTL separately if desired).

For another Firebase project, update the config and `.firebaserc`, create Firestore, enable **Authentication → Sign-in method → Anonymous**, and deploy the rules with an authenticated Firebase CLI:

```sh
firebase deploy --only firestore:rules
```

See [Firebase anonymous authentication](https://firebase.google.com/docs/auth/web/anonymous-auth) and [Firestore security rules](https://firebase.google.com/docs/firestore/security/get-started).

## Development and checks

```sh
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm test` checks question data, scoring, award reveals and undo, duplicate awards, stale actions, navigation, strikes, finishing, CSV parsing, and saved-game validation. It does not contact Firebase. `pnpm test:browser` checks the real phone and TV screens with a shared test transport, including delayed and failed writes, stalled listeners, offline recovery, multiple controllers, pairing, and all 30 questions at phone and TV sizes. To use an installed Chrome instead of Playwright’s Chromium, run `PLAYWRIGHT_CHANNEL=chrome pnpm test:browser`.

Integration checks use separate anonymous owner, phone, and viewer accounts to test pairing, live updates, concurrent writes, and denied operations. They delete the disposable test room and accounts afterward. Run with Firebase's Auth and Firestore emulators (requires Firebase CLI and a supported Java runtime):

```sh
firebase emulators:exec --project demo-feud --only auth,firestore "pnpm test:firebase"
```

To explicitly check the configured live project instead:

```sh
pnpm test:firebase --live
```

For browser testing against emulators, start Vite with `VITE_FIREBASE_EMULATORS=true pnpm dev`.

## Hosting

Build command: `pnpm build`. Publish directory: `dist`. Navigation uses URL query parameters, so static hosts such as Netlify do not need SPA rewrites. Both devices must use the same deployed site and have an internet connection. Phone pairing links use the current origin automatically.
