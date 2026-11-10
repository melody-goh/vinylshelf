# ADR 0014: Demo mode

- **Status:** Accepted
- **Date:** 2026-11-11
- **Related:** ADR 0004 (Discogs data), ADR 0006 (sessions and tokens), ADR 0007
  (invite-only deployment), ADR 0011 (wantlist), ADR 0013 (taste events)

## Context

Signing in needs a Discogs account with a collection, and the deployment admits only
listed users (ADR 0007), because there is no way yet for users to erase their data. Most
people who look at this project, such as reviewers and recruiters, have neither. They
should still be able to use every feature: the shelf, the library, the wantlist,
Discover, search, previews and the Listening Room.

## Decision

1. **A "Try the demo" sign-in, separate from Discogs.** `POST /auth/demo` creates a
   **demo user for this visitor alone** and signs them in. Each visitor gets their own
   user, so their verdicts, wants and additions never mix with anyone else's, and the
   taste events (ADR 0013) stay per person. The invite list does not apply. Starting a
   demo is rate-limited per client.
2. **Demo users expire after 24 hours.** An hourly job deletes them, and every row they
   own goes with them, since every user-owned table cascades on delete. Their session
   cookie lasts no longer than the user does.
3. **The same app, through the same gateway interface.** Demo users run through the
   real services: import, shelf, wantlist, release pages, search. Only the Discogs
   gateway behind them differs:
   - A demo user's access token is a demo marker, never a Discogs credential. The gateway
     routes any call carrying it to a **demo gateway**.
   - **The visitor's own lists live in our database**, not on Discogs:
     - their collection is the sample shelf plus anything they add;
     - their wantlist is three sample wants plus anything they want.

     Sync re-reads these lists, so it works as it does for everyone else.
   - **Release data is read from Discogs with the app's own key** (Discogs' key/secret
     authentication, for the database endpoints that allow it): releases and search.
   - **Nothing a demo visitor does ever writes to Discogs.**
4. **The sample shelf is curated, not anyone's collection.** It holds 31 well-known
   records across seven styles, so Discover has distinct rooms to work with. It is
   committed as a list of public Discogs release ids, with the catalogue master each
   belongs to.
5. **Discogs data stays under ADR 0004.**
   - Release details read with the app key are held in memory for at most the Discogs
     TTL, so many demo visitors cost one fetch per release every few hours, not one per
     visitor.
   - Everything stored goes through the existing caches with their deadlines.
   - Images are still only hotlinked.
   - Every screen still credits Discogs.
6. **Demo is on by default and can be turned off** (`DEMO_ENABLED=false`). When it is
   off, `POST /auth/demo` answers 404, and the web app hides the link.

## Consequences

- **What a visitor can try:** every feature, without an account, and without seeing anyone's
  real collection.
- **Rate limit:** the shared Discogs budget now serves demo visitors too. The app-key
  reads are cached, and the per-client limit on starting demos bounds how fast new
  demo users arrive.
- **Data:** demo users appear in the database like other users, flagged and short-lived.
  `taste:metrics` can tell them apart, so a reviewer's clicks are not read as a
  collector's.
- **What isn't real:** the demo wantlist and collection are a simulation: wanting a record in the
  demo does not put it on anyone's Discogs wantlist. The interface says "demo" where it
  shows the account.
