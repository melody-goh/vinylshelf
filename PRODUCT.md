# Product

<!-- impeccable:product-schema 1 -->

Durable product truth for Vinyl Shelf (working title): who it is for, what it must do and
how it should feel. Visual decisions live in `DESIGN.md`, chosen per surface;
architecture lives in `docs/adr/`.

## Platform

web

## Users

Two audiences, weighted equally.

- **Collectors**, starting with the author: people with a Discogs collection who want to
  *enjoy* it, not manage it. Discogs stays their system of record; this is where they
  look at, revisit and dig through their records.
- **Reviewers** (recruiters, interviewers, engineers): people judging the craft. They
  arrive cold, have a few minutes, and may not have a Discogs account.

When the two conflict:

- Never fake functionality to impress a reviewer. Everything shown works for a real
  collector.
- A reviewer's first two minutes must work without friction. That is a product
  requirement, not polish (see Open decisions: demo access).
- Prefer the choice that is honest about a constraint over one that hides it.

## Product Purpose

A web app for vinyl collectors, built on their Discogs collection. Its jobs:

1. **See my collection the way it deserves.** Browse, sort and revisit records, more
   pleasantly than on Discogs.
2. **"What is this?"** Identify what's playing, land on the right pressing and add it to
   the shelf, with manual search when recognition fails.
3. **"What next?"** Discover records that fit my taste, with a reason I can check.

Success means:

- a collector opens it to look at their records, not only to test it;
- a reviewer understands what it does and why it's well built within two minutes,
  without help;
- no screen ever shows Discogs data past its deadline, or an empty state that is really a
  loading state.

## Positioning

- **A listening room, not a database.** Built to enjoy a collection, where Discogs is
  built to catalogue and trade it.
- **Private taste discovery.** Recommendations with a reason you can check, without the
  collection ever leaving the app (ADR 0008).
- **The experience itself.** The interface is a deliberate part of the product's value,
  not a skin over Discogs data.

## Operating Context

- **Desktop first.** Large collections are browsed on a laptop, and recognition starts
  with the laptop microphone. Phone works, but is secondary until phone pairing (ADR
  0002) makes the phone the capture device.
- Collectors arrive by signing in with Discogs and importing their collection. The first
  import pages through Discogs under a shared rate limit and can take a while.
- Reviewers arrive from a link (a portfolio or the GitHub README), usually on a laptop,
  with no time investment.
- The API runs on free hosting that sleeps when idle (ADR 0005). The first request after
  idle can take about a minute.

## Capabilities and Constraints

**Built today (first vertical slice):** Discogs sign-in; a resumable collection import
with live progress; a shelf with five sort orders and pagination; refresh states
(refreshing, backoff, empty); sign-out.

**Planned (roadmap):** recognition (laptop microphone, file drop, manual search), then
the taste engine (ADR 0008), then phone pairing.

**Constraints the experience must show honestly:**

- **Discogs data is borrowed, and it expires** (ADR 0004). Nothing from Discogs is shown
  more than 6 hours after it was fetched. An expired shelf reads as "refreshing", with
  placeholders, never as empty.
- **Attribution is always visible.** "Data provided by Discogs" sits next to every block
  of Discogs data, and the non-affiliation notice is in the footer.
- **Covers are hotlinked, never stored.** They can be missing or slow; every design must
  work without them.
- **The collection stays private.** It is never sent to a third party, including AI
  providers (ADR 0008).
- **Waiting is designed.** Imports, refreshes and a waking server show calm, specific
  progress, never a blank screen or an unexplained spinner.
- **Recognition has a small quota** (ADR 0005): rate-capped per user, a fixture-backed
  demo mode, and manual search as the fallback.
- **Motion** (CLAUDE.md): only `transform` and `opacity`, springs over eased durations,
  and `prefers-reduced-motion` always respected.

**Terminology:** a *record* is an item on the user's shelf; a *release* or *pressing* is
the specific Discogs edition; *import* brings the Discogs collection in; *refresh*
re-fetches expired data.

**Non-goals:** buying, selling or marketplace features; social features; editing
collection data (ratings, notes) in place of Discogs; native apps.

**Open decisions:**

- **Demo access for reviewers without a Discogs account.** Today they cannot get past
  sign-in. A read-only demo shelf built from CC0 catalogue data is one option. Any demo
  must respect ADR 0004 (no real user's collection, no stale Discogs data) and needs an
  ADR before it is built.
- **Name.** "Vinyl Shelf" is a working title, to be decided before any public launch.

## Brand Commitments

- **Name:** Vinyl Shelf, as a working title.
- **Personality: hi-fi gear.** Using it should feel like handling good audio equipment:
  precise, tactile and weighty, with quiet confidence. Deliberate interactions, nothing
  cute: no exclamation marks, mascots or confetti.
- **Voice:** plain and specific. Say what happened and what happens next, in second
  person and short sentences, as the shipped copy does ("Couldn't refresh 3 records from
  Discogs. We'll try again automatically after 14:30."). No engineering jargon in the UI.
- **Discogs attribution** is a fixed element of every surface that shows Discogs data,
  never hidden or minimised.

## Evidence on Hand

- **The author's own Discogs shelf** may appear in the author's portfolio material
  (README screenshots, demo videos), with the Discogs attribution visible. No other
  user's collection may.
- The first slice was verified end to end against the author's real Discogs account on
  2026-10-23.
- The test fixtures (`apps/api/src/test/fixtures/discogs/`) are invented data, fine for
  tests and mock-ups but not evidence of real use.
- **There are no users, testimonials, usage numbers or press.** Future work must not
  imply any.

## Product Principles

1. **Enjoyment over administration.** If a feature exists mainly to manage data, it
   belongs on Discogs.
2. **Privacy is part of the product.** Personalisation happens on our side; the
   collection never leaves it.
3. **Constraints are shown, not hidden.** Expiry, attribution, quotas and waiting are
   designed states with honest copy.
4. **Real for collectors, effortless for reviewers.** Nothing is faked for a demo, and
   the first two minutes always work.
5. **Craft is the differentiator.** Precision and tactility in every interaction are part
   of what the product offers.

## Accessibility & Inclusion

- **WCAG 2.2 AA** for every surface.
- Reduced motion is honoured everywhere (see Motion above).
- Progress and status changes are announced to assistive technology (live regions), and
  every action works from the keyboard.
- Information never depends on a cover image alone; covers can be missing.
