# ADR 0013: Taste events and online metrics

- **Status:** Accepted
- **Date:** 2026-11-02
- **Related:** ADR 0008 (taste engine and its evaluation), ADR 0004 (Discogs data),
  ADR 0006 (accounts)

## Context

The taste engine is judged offline (ADR 0008 §3): held-out shelf records, and labelled
descriptions for search. That says whether the engine finds records it should. It cannot
say whether people want what it finds. Real shelves are too sparse for the offline
discovery metric to separate versions of the engine (ADR 0008, note of 2026-10-28).

Before this ADR, the app could not tell either:
- `taste_feedback` keeps only the latest verdict on each record;
- "Want" goes straight to Discogs;
- nothing records what was shown.

## Decision

1. **Every served list is kept.** Each Discover answer and each search answer with picks
   is stored as a row in `taste_lists`, and its `listId` is returned with the picks. The
   row holds:
   - the surface;
   - the reach, or the query for search;
   - the page;
   - the picks in served order, as catalogue master ids and their rooms.
2. **The client reports what the listener does**, in batches to `POST /taste/events`:

   | Kind | Meaning |
   |---|---|
   | `viewed` | at the front for a second or more |
   | `previewed` | started its track by pressing play |
   | `opened` | took it into the Listening Room |
   | `wanted` | added it to the wantlist |
   | `more`, `less`, `withdrawn` | gave a verdict, or took one back |

   Autoplay listens are not `previewed`: they measure the switch, not the record.
3. **The server, not the client, fixes the record's position and the time.** The
   position comes from the list as served: the client's row shifts as records are
   turned down. Events naming a list the user was not served, or a record not in it, are
   dropped without error, so a stale tab cannot fail and nobody can write into another
   user's record.
4. **Reception is read, not dashboarded.** `taste:metrics` prints, per surface and reach,
   and per row's worth of places:
   - the picks people reached;
   - the share of those viewed, previewed, opened, wanted, given "more" and given "less".

   It prints only, and shows no user or record names.
5. **First-party only.** No analytics service, no third-party scripts. Events and lists
   reference catalogue ids (CC0) and the user's id. They are deleted with the account
   (`on delete cascade`), and the erase-my-data flow (issue #8) covers them. Search
   descriptions are kept with their lists, because judging search needs them. They are
   the user's own words and stay with the account, like everything else here.

## Consequences

- **What the engine is judged on:** with use, it can be judged on what people do, not only
  on held-out records. The first comparisons will be between surfaces (Discover and
  search), reaches (near and far), and places in the row.
- **Bias in the numbers:** position bias is visible but not corrected, since front places
  are seen more. Rates by place make it visible before anything is concluded from it.
- **What isn't measured:** events that fail to send are dropped, not retried. Rates are
  computed from what arrives, so they are approximate, which is enough for comparing
  versions.
- **Cost:** one `taste_lists` row per served answer, and small event rows, within the free
  database (ADR 0005).
- **Not in scope:** A/B assignment. When two engine versions need comparing live, lists
  will carry the version that served them.
