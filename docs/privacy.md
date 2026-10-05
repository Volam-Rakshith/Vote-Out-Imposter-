# Privacy Notes & Disclosures

Honest, plain-language notes on what the game stores and what it protects.

## One Mobile mode (pass-and-play)

**What it protects against:** casual shoulder-surfing. Only one role card is
ever on screen; every private step requires an explicit tap; the previous
card disappears before the next player takes the device; voting is a private
handoff with no totals until the reveal.

**What it does NOT protect against:**

- The saved game in the browser's localStorage necessarily contains the roles
  and the word (that's how refresh recovery works). Anyone with unlocked
  access to the device — or its browser dev tools — could read them.
- The game cannot stop someone from simply watching the screen when a player
  reveals their card.

**Local data** (per browser profile, per device):

| Data | Purpose | Cleared by |
| --- | --- | --- |
| Recent player names | quick re-adds in setup | Settings → clear, or remove entries |
| Audio preferences | music/SFX toggles + volumes | clearing site data |
| Last setup (players + settings) | faster next game | clearing site data |
| Saved game (One Mobile) | refresh recovery | game end / Settings → clear |
| Local statistics | your session scores | Settings → clear |
| Online session tokens | restoring your seat after refresh | Settings → clear, or room expiry |

## Multiple Devices mode (online)

- **No accounts, no emails.** Membership is a random 256-bit token created
  when you join a room; it is stored on the server only as a SHA-256 hash.
- Invite links contain **only** the room code — no secrets, no roles, no
  player data.
- The server never broadcasts: the current round's word, any role, any
  individual vote, or guesses. Each player receives exactly their own private
  view. This is enforced by design (`engine/privacy.js`) and covered by
  security tests.
- **Imposter hints follow the same rule as the word itself:** the imposter's
  related-word hint is private to the imposters during play (it is information
  *about* the word, so it must never be public). It is revealed to everyone
  only in the completed round's summary — same moment the word itself is
  revealed. Innocents never receive a hint. A hint-leak scan in
  `tests/hints.test.js` asserts the public state never contains it while the
  round is being played.
- Room records live until the room closes or expires (24h max, 4h idle).
- The game code does not log IPs or personal data. Standard Supabase platform
  logs (request metadata) exist as with any hosted service.

## Honest limitations (repeated from the maintenance guide)

- The room code is the only gate to joining; a second browser profile means a
  second identity. Hosts can remove players in the lobby.
- Communications over voice chat are outside the game's control.

## Children

The game has no accounts, no ads, no tracking and no external network calls
in One Mobile mode. Word content is curated to be family-friendly.
