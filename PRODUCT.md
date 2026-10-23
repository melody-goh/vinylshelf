# Product: Vinyl Shelf (working title)

Durable product truth: who this is for, what it must do, and how it should feel. Visual
decisions (palette, type, components, motion specifics) live in `DESIGN.md`, chosen per
surface. Architecture lives in `docs/adr/`.

## What it is

A web app for vinyl collectors: browse your Discogs collection in a tactile UI, identify
what's playing and find the exact pressing, and discover records you're likely to love
but wouldn't have found yourself.

## Who it's for

Two audiences, weighted equally:

- **Collectors** (starting with the author): people with a Discogs collection who want
  to *enjoy* it, not manage it. Discogs is the system of record; this is the listening
  room.
- **Reviewers** (recruiters, interviewers, engineers): people judging the craft. They
  arrive cold, have a few minutes, and may not have a Discogs account.

When the two conflict:

- Never fake functionality to impress a reviewer. Everything shown works for a real
  collector.
- A reviewer's first two minutes must work without friction. That is a product
  requirement, not polish (see Open questions: demo access).
- Prefer the choice that is honest about constraints over the one that hides them. The
  constraints are part of the story.

## Jobs to be done

1. **See my collection the way it deserves.** Browse, sort and revisit records, faster
   and more pleasantly than on Discogs.
2. **"What is this?"** Identify what's playing and land on the right pressing, then add
   it to the shelf. Manual search when recognition fails.
3. **"What next?"** Discover records that fit my taste, with a reason I can check.

## Personality: hi-fi gear

Using it should feel like handling good audio equipment.

- **Precise.** Every element has a reason. Exact numbers, exact states. Never "something
  went wrong" when we know what went wrong.
- **Tactile and weighty.** Interactions feel deliberate and physical, with real response
  to touch and click. Motion follows CLAUDE.md: only `transform` and `opacity`, springs
  over eased durations, and `prefers-reduced-motion` always respected.
- **Quiet confidence.** No exclamation marks, no mascots, no confetti, nothing cute. The
  records are the colour; the interface is the well-made cabinet around them.
- **Calm under load.** Waiting (imports, refreshes, a waking server) is shown as calm,
  specific progress, never as an empty screen or a spinner with no explanation.

### Voice

Plain and specific. Say what happened and what happens next ("Couldn't refresh 3 records
from Discogs. We'll try again after 14:30."). Second person and short sentences. No
jargon in the UI: the engineering terms stay in the docs.

## Platform

- **Desktop first.** Large collections are browsed on a laptop, and recognition starts
  with the laptop microphone. Layouts are designed for desktop, then adapted down.
- **Phone works, but is secondary** until phone pairing (roadmap, ADR 0002), when the
  phone becomes the capture device.
- Web only. No native apps.

## Product truths that shape the experience

These come from constraints, and the experience must show them honestly:

- **Discogs data is borrowed, and it expires** (ADR 0004). Nothing from Discogs is shown
  more than 6 hours after it was fetched. An expired shelf reads as "refreshing", with
  placeholders, never as empty.
- **Attribution is always visible.** "Data provided by Discogs" sits next to every block
  of Discogs data, and the non-affiliation notice is in the footer. It is part of the
  design, not small print to hide.
- **Images are hotlinked, never stored.** Covers can be missing or slow; designs must
  work without them.
- **The collection stays private.** A user's collection is never sent to a third party,
  including AI providers (ADR 0008). Personalisation happens on our side.
- **Free hosting sleeps** (ADR 0005). The first request after idle can take about a
  minute; that wait gets a designed "waking up" state.
- **Recognition has a small quota** (ADR 0005). It is rate-capped per user, has a
  fixture-backed demo mode, and degrades to manual search.

## Non-goals

- Buying, selling or marketplace features.
- Social features (following, feeds, sharing collections).
- Replacing Discogs for cataloguing (editing collection data, ratings, notes).
- Storing audio, images or anyone's collection beyond what ADR 0006 allows.

## Success signals

- A collector opens it to look at their records, not only to test it.
- A reviewer understands what it does and why it's well built within two minutes,
  without help.
- No screen ever shows Discogs data past its deadline, or an empty state that is really
  a loading state.

## Open questions

- **Demo access for reviewers without a Discogs account.** Today they cannot get past
  the login screen. Options include a read-only demo shelf built from CC0 catalogue data
  and fixture recognition. Any demo must respect ADR 0004 (no real user's collection, no
  stale Discogs data). This needs an ADR before it is built.
- **Name.** "Vinyl Shelf" is a working title; decide before any public launch.
