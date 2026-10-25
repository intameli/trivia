# Game Night — Trivia & Desi Feud

React/Vite party games. The home screen offers the original Trivia game and a separate Desi Feud mode with all 30 supplied questions across five rounds.

## Play Desi Feud

1. Open the site on your TV or laptop, select **Desi Feud**, enter two team names, and start with **TV / laptop** selected.
2. Scan the QR code with your phone, or copy the private controller link to your phone. The phone shows the answer grid; tapping an answer reveals it on the TV immediately.
3. Add or undo strikes, reveal answers, and award the current points bank to a team. An award can only happen once per question; **Undo award** lets the host correct it.
4. Use **Next**, **Previous**, or the question selector to move around the five rounds. Reveals, strikes, awards, and scores survive navigation and refresh. Finish after question 30 to show the winner.

You can also start on a phone with **Phone controller** selected, then enter its six-character room code on the TV. Room codes open a read-only board. The private controller link grants control; keep it with the host. **Connect phone / Connect TV** reopens pairing instructions.

The original Trivia game remains available at `?mode=trivia`, including saved local games and CSV imports. Its gameplay and existing `triviaGames` storage are unchanged.

## Firebase

The app uses the supplied `family-1225b` project with **Cloud Firestore Standard** in **Sydney (`australia-southeast1`)** and **Anonymous Authentication**. Firebase Analytics is not required for gameplay and is not initialized.

- `src/feud/config.js`: public Firebase web configuration. This is a project identifier, not an administrator credential.
- `feudRooms/{code}`: shared game state, owner UID, creation time, and seven-day expiration.
- `feudKeys/{code}`: private pairing key, readable only by the creator.
- `feudRooms/{code}/controllers/{uid}`: controller membership, created only with the matching private key.
- `firestore.rules`: denies room enumeration and signed-out access, keeps room-code viewers read-only, protects pairing keys, and restricts writes to the owner and paired controllers. Other database paths are denied.

Game updates use Firestore transactions and snapshot listeners. Concurrent reveals are preserved; repeated awards cannot duplicate scores. Controls pause while offline or awaiting sync. Rooms become inaccessible after seven days; expiration does not automatically delete documents (configure Firestore TTL separately if desired).

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
```

`pnpm test` checks question data, scoring, duplicate awards, stale actions, navigation, strikes, and finishing. It does not contact Firebase.

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
