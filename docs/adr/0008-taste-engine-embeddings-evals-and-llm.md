# ADR 0008: Taste engine with embeddings, offline evaluation and LLM-assisted search

- **Status:** Accepted 2026-10-26 (proposed 2026-10-23). Open questions 1 and 2 are
  settled by the investigation recorded under Notes; 3 to 5 stay open until the phase
  that needs them.
- **Date:** 2026-10-23
- **Related:** ADR 0003 (queue), ADR 0004 (Discogs data lifecycle), ADR 0005 (free-tier
  constraints)

## Context

The roadmap's taste engine ("music you're likely to love but wouldn't have found
yourself") is where the project shows AI engineering: representation learning,
retrieval, measurable quality, and careful use of an LLM. Three capabilities are in
scope:

1. **Embeddings and vector retrieval** over a release catalogue, in pgvector.
2. **Offline evaluation** that measures recommendation quality and gates changes.
3. **LLM features**: natural-language shelf search ("moody 70s jazz with strings") and
   a one-line "why you might like this".

Constraints from earlier decisions shape all three:

- **Data we may keep.** ADR 0004 assumes the 6-hour limit applies even to CC0 Discogs
  data. Embeddings computed from API responses would therefore have to expire too,
  which rules out a persistent vector index built from the API.
- **Data we may share.** A user's collection is Restricted Data and may not be
  transferred to third parties (ADR 0004). An LLM provider is a third party.
- **Free to run** (ADR 0005, CLAUDE.md). No always-on Python host. Small free
  Postgres (0.5 GB). Paid services only with explicit approval.
- **Gateways** (CLAUDE.md). Every vendor sits behind our own interface, and tests
  never call it live.

## Decision (proposed)

### 1. Catalogue: from data we are allowed to keep

The catalogue comes from Discogs' monthly CC0 data dumps, **subject to the
investigation that ADR 0004 left open, which is the first task of this phase**:

- read the dump terms
- confirm we may store and derive from them
- measure a filtered subset (vinyl releases only, the fields we embed) against the
  0.5 GB budget

If the dumps are unsuitable, MusicBrainz (CC0, already planned as a gateway) is the
fallback. Live Discogs API data is never embedded.

### 2. Embeddings and retrieval

- **Release vectors** come from an open-weight text-embedding model run as an
  **offline batch job** (ADR 0005: no always-on Python host). The input is a compact
  text built from CC0 fields: genres, styles, era, label, credits and format. Vectors
  are stored in pgvector at a small dimension (half precision, a few hundred
  dimensions), so the catalogue fits the free tier.
- **Taste vectors** are computed **inside our system** from the releases on a user's
  shelf, for example a weighted centroid plus a few cluster centres for varied
  collections. The shelf never leaves our infrastructure.
- **Retrieval** is hybrid: nearest-neighbour search plus SQL filters (not already
  owned, vinyl only, optional era or genre), then a re-ranking step for diversity, so
  results are not ten copies of the same style.
- **Semantic search is the core, and it needs no LLM.** A natural-language query is
  embedded with the same model at request time and searched against the catalogue. A
  small embedding model (tens of MB) runs inside the API process through an ONNX
  runtime, so search costs nothing and depends on no vendor. Its memory use on the free
  host must be measured.
- **Explanations without an LLM:** the template form ("shares *modal jazz* and
  *strings* with 12 records on your shelf") is always available, built from the
  attributes a candidate shares with the user's taste profile.

### 3. Offline evaluation, treated as a test suite

- **Protocol:** hold out a fraction of each test shelf and ask whether the
  recommender finds the held-out releases (recall@k, nDCG@k). Also report coverage and
  intra-list diversity, so the metric cannot be gamed by recommending only popular
  records.
- **Baselines:** every change is compared with a popularity baseline and a
  genre-overlap baseline. The embedding approach has to beat both to ship.
- **Data:** synthetic and anonymised test shelves built from catalogue data only.
  Never real users' collections.
- **CI:** the deterministic part (fixed fixture catalogue, precomputed vectors) runs
  in `pnpm check` with a minimum score, so a quality regression fails the build like a
  broken test. Results are recorded per commit so the trend is visible.

### 4. LLM features behind a `LanguageModel` gateway, free by default

The LLM is an enhancement on top of semantic search, never a dependency of it. The
pattern is the same as the `Recognizer` (ADR 0005): one interface with several
implementations.

- **Cloudflare Workers AI**: an open-weight model on a free daily allowance. This is
  the deployed default, so the public demo costs nothing and works on any device. It
  fits the planned Cloudflare hosting (ADR 0005, ADR 0007).
- **Claude**, through the official Anthropic SDK: an optional upgrade, off unless
  configured, under the cost controls below.
- **A fixture-backed fake**, used in development, tests and CI.

If the free allowance runs out, the provider fails, or the kill switch is on, the app
falls back to semantic search and template explanations. Users see slightly plainer
results, not an error.

- **Natural-language search:** the model turns the user's query into **structured
  filters** (genres, styles, era, mood terms mapped to styles, free-text keywords)
  using structured outputs. The result is validated with Zod against an allowlist of
  fields and values, then executed by our own hybrid retrieval. The model never writes
  SQL and never sees the catalogue beyond what the prompt contains.
- **Explanations:** our code picks the reason (for example the shared styles and era
  between a candidate and the user's taste profile). The model only phrases it, from
  CC0 attributes. Explanations are cached in our database, keyed by their inputs.
- **What the model may receive:** the user's query text and CC0 catalogue fields.
  **Never** the user's collection, owned release ids, ratings or any other Restricted
  Data (ADR 0004).
- **Security:** user queries are untrusted input (prompt injection). The defence is
  structural: output is schema-validated and allowlisted, filters are parameters
  rather than generated code, and the model has no tools.
- **Cost controls:**
  - the model id is configuration
  - a hard monthly budget enforced in the app, from a token ledger built from each
    response's `usage`
  - a per-user daily cap
  - a global kill switch that falls back to plain keyword search
  - response caching
  - no LLM calls in CI
  - LLM-quality evals run by hand, against a budget approved in advance
- **LLM evaluation:** a labelled set of queries with expected filters, scored for
  exact and partial filter match. A sample of explanations is checked for faithfulness
  (every claim must come from the provided attributes).

## Open questions

1. **CC0 dumps:** terms, size and refresh process (decision 1). This blocks the phase.
2. **Free tier check.** Before relying on Cloudflare Workers AI, confirm its current
   free allowance and its terms on how submitted data is used, and disclose that use to
   users. If either is unacceptable, the free LLM layer becomes an on-device model in
   the browser (see Alternatives).
3. **Model choice.** Run the same LLM eval against the free open model and Claude
   models, comparing quality and **cost per completed task**. Claude pricing per
   million input/output tokens, as of October 2026: Haiku 5.5 $0.10/$0.50, Sonnet 5.5
   $2/$10, Opus 5.5 $4/$20. The project owner decides on cost. A rough estimate, before caching: a search call is about 4k
   input tokens (mostly the style allowlist) and about 150 output tokens; an
   explanation is about 300 in and 40 out. Thinking tokens may add to the output.
   At 500 searches and 5,000 explanations a month, that comes to about $0.50 on Haiku
   5.5, $10 on Sonnet 5.5 and $20 on Opus 5.5. Prompt caching of the allowlist and
   caching of explanations would lower all three.
4. **Derived taste signals.** Is an aggregate such as "this user leans towards
   ambient", derived from a Restricted collection, itself Restricted? Until answered,
   such signals are not sent to the LLM. Explanations stay phrased from the candidate's
   CC0 attributes and the matched style names.
5. **Provider-side spend limits (Claude):** check whether the provider account can enforce a
   hard cap, in addition to the app-level budget.

## Consequences

**Good:** each AI capability is measurable, testable without network access and
replaceable behind an interface. The design shows legal constraints turned into
architecture, again: personalisation stays local and only public data reaches the
model. Quality changes are justified by numbers, not demos.

**Costs:** an offline pipeline to build and refresh. A labelled evaluation set to
maintain. A small recurring API cost, bounded by the budget. More moving parts than
calling an LLM with the whole collection.

## Alternatives considered

- **Ask an LLM directly for recommendations from the user's collection:** simple and
  impressive in a demo, but it sends Restricted Data to a third party, costs scale with
  collection size, and quality cannot be measured or regression-tested. Rejected.
- **A hosted embedding API:** no batch job to run, but a recurring cost and another
  vendor for something an open model does offline for free.
- **Collaborative filtering across users:** the standard approach at scale, but there
  are too few users, and cross-user use of collection data raises the same Restricted
  Data questions.
- **An on-device LLM in the browser (WebLLM, transformers.js with WebGPU):** free and
  the most private, because nothing leaves the device. But the first visit downloads
  hundreds of MB and it needs WebGPU, which is a poor first impression for a public
  demo. Kept as a later experiment and as the fallback if the free hosted tier is
  unsuitable.
- **Running an LLM on the API host:** the free host has about 512 MB of memory, too
  little for a useful language model.

## Notes

### 2026-10-26: investigation (open questions 1 and 2), and what the engine is for

**Dump terms.** data.discogs.com publishes the monthly dumps "under the CC0 No Rights
Reserved license". We may store them and derive from them without the 6-hour limit that
applies to API data (ADR 0004). Images are not in the dumps, and none are kept.

**Sizes (October 2026 dump).** Masters 600 MB gzipped, 2,598,586 masters. Releases
10.5 GB gzipped, about 15 million releases (extrapolated from a streamed 30 MB sample of
44,950). A master carries its main release, artists, genres, styles, year, title and
videos, but **no formats, labels or credits**; only releases do.

**Catalogue decision.** The catalogue unit is the **master** (an album across its
pressings), restricted to masters with at least one vinyl release, ranked by their
number of versions in any format and capped by configuration (default 150,000). How
often a record has been pressed and reissued is the best notability signal the dumps
offer; they carry no have/want counts. A build pipeline makes one streaming pass over
the releases dump (bandwidth only; nothing large is written to disk) to collect, per
master: vinyl availability, version count, labels, countries and release credits
(producers, engineers, players), then joins the masters dump.

**Embedding model.** `bge-small-en-v1.5`, quantised (q8, 34 MB), 384 dimensions, run
with transformers.js (ONNX) both in the batch job and in the API. Measured on the
development machine: 2.3 s to load, about 170 MB of resident memory once loaded (about
250 MB for the whole process, within the free host's 512 MB as long as live queries are
embedded one at a time), 3 ms per query, about 500 texts a second in batches (about five
minutes for 150,000 masters). Sanity check: "moody 1970s jazz with lush strings" scores
0.74 against an Alice Coltrane description and 0.53 against a thrash metal one. Weights
are fetched once by a setup script and loaded from disk at runtime; the API never
downloads models.

**Storage estimate.** 150,000 vectors as `halfvec(384)` (768 bytes) plus an HNSW index
and compact metadata: roughly 250 MB, inside the 0.5 GB free database.

**Cloudflare Workers AI (open question 2).** The free plan includes 10,000 neurons a day;
past that, calls fail until 00:00 UTC, so the fallback to semantic search and template
explanations is part of normal operation, not an edge case. Cloudflare "does not use
Customer Content processed by Workers AI to train AI models" and "does not retain inputs
or outputs after they are no longer needed to process the request". Acceptable; the
privacy notice will say queries are processed by Cloudflare.

**What the engine is for.** Accuracy is necessary, not sufficient; a collector should
want to open it. So, beyond ranked nearest neighbours:

- **Rooms, not a blur.** A collection has sides (the jazz side, the ambient side). A
  single centroid averages them into something the user does not own. The taste profile
  is a few clusters, and recommendations come per room ("For your ambient side").
- **Reasons you can check.** Every pick names what it shares with records on the shelf:
  styles, era, label, and above all people (the same producer, engineer or players),
  which is how collectors actually dig.
- **Near and far.** A choice between picks close to home and picks further afield
  (diversity re-ranking with a stronger or weaker pull to the rooms).
- **Steering.** "More like this" and "not for me" on any pick, kept in our database as
  catalogue ids (CC0), and folded into the next ranking.
- **Act on it.** A pick can be previewed (ADR 0010), wanted (ADR 0011) or searched for
  pressings (ADR 0009) without leaving it.

### 2026-10-27: the engine core and its evaluation

**Shape of the engine.** The shelf's catalogue-matched records are clustered into up to
five rooms (deterministic spherical k-means; rooms under four records are folded into
their neighbour). Each room retrieves its nearest catalogue masters (pgvector in the app,
an exact scan in the evaluation; the ranking code is the same), and ranks them by
closeness to the room's centre, closeness to the nearest owned record and shared people
(producers, engineers, players), then picks by maximal marginal relevance with one pick
per artist and no record in two rooms. "Far" skips the closest candidates, trusts shared
people more, diversifies harder and only suggests artists not on the shelf. Reasons are
chosen in code, strongest first: shared people, label and era, styles, closeness.

**Evaluation design, and one correction to it.** The first synthetic world had scenes
(shared styles, labels, era, people) and held out a random quarter of each shelf's
scenes. A style-overlap baseline then reached the ceiling in one of two worlds (recall
0.436 against the engine's 0.434): every unowned record in the scene was an equally
right answer, and styles alone identify a scene. That measured a genre filter, not taste.
The world now has **circles** inside scenes (a label's roster, a producer's sessions:
their own label and core people), shelves follow circles, and the held-out answers come
from the same circles, so the rest of the scene is a set of distractors with the right
styles. This is how collections grow, and it is what the engine's people and label
signals exist for.

**Results (two seeded worlds, 40 shelves each, k = 20).**

| | Recall@20 | nDCG@20 |
|---|---|---|
| Taste engine, near | 0.67 / 0.74 | 0.46 / 0.54 |
| Style overlap | 0.20 / 0.21 | 0.13 / 0.12 |
| Popularity | 0.00 / 0.00 | 0.00 / 0.00 |

Far: recall 0.16 / 0.09, diversity 0.74 against near's 0.62, wider catalogue coverage.
The build fails if near falls below twice the stronger baseline on recall or nDCG, or if
far stops being more varied and wider-ranging than near.

**Tuning.** Weights were chosen by sweeping centre, nearest-record, people and
popularity weights and the diversity trade-off on both worlds; results were stable
(recall 0.68 to 0.71) and the chosen near setting is centre 0.4, nearest 0.3, people
0.3, λ 0.85. An explicit style-affinity feature (the share of the room carrying each of a
candidate's styles) was tried in both worlds and measured no benefit, so it is not in
the engine. Popularity is weighted 0 because the synthetic world makes popular records
noise by construction and cannot judge a popularity prior fairly; the real-shelf
evaluation must revisit it.

**Caveat.** The CI evaluation embeds with a deterministic bag-of-words fake, which sees
names and labels as plain words. It therefore tests the ranking logic, not the real
model's sense of sound. The real model is judged by `taste:eval` against the loaded
catalogue and the developer's own shelf, run by hand and printed, never committed.

### 2026-10-27: serving recommendations

`GET /taste/recommendations` and `/taste/feedback` (contract 0.8.0) serve the engine.

- **Shelf to catalogue.** Shelf records join the catalogue by master id, kept on the shelf
  reference (ADR 0006, note of 2026-10-27). Records the catalogue does not know still
  count as owned. "Far" also keeps their artists out of its picks, reading them from the
  release cache only while it is fresh (ADR 0004).
- **When there is nothing to say.** The response states why: no catalogue loaded, or
  fewer than three shelf records in it. Clients do not have to guess from an empty list.
- **Retrieval.** pgvector's HNSW index returns at most `hnsw.ef_search` rows (40 by
  default) and filters after searching. Excluding a 200-record shelf could therefore
  return far fewer candidates than asked for, or none: measured, 0 of 50. Each query
  raises `ef_search` to its limit and turns on pgvector 0.8's strict-order iterative
  scan, inside its own transaction. A test runs on a connection that forbids sequential
  scans, so the index path is what it checks.
- **Steering.** "More like this" adds the record to the rooms as if owned. "Not for me"
  removes it and pushes down near-duplicates (ADR 0008, Notes 2026-10-27). Verdicts are
  catalogue ids, kept with the account, and replaced by a newer verdict.
- **Real shelves.** `taste:eval` scores the engine against the signed-in user's own
  shelf, holding out one fold at a time and comparing against the same baselines as CI.
  It prints to the terminal and writes nothing. A collection is the user's data, so
  real-shelf numbers are never committed; only the synthetic evaluation gates CI.

### 2026-10-28: picks shaped like the shelf, and reasons that invite exploring

The first picks on a real shelf (243 records, 165 in the catalogue) were sound but
included the wrong shapes and the wrong reasons:

- **Singles and compilations.** The catalogue now records each master's kind (album, EP,
  single, compilation, other) from its main release's format descriptions; "Various"
  records count as compilations (catalogue schema 2, migration 0008). A room is
  recommended albums, plus any kind that makes up at least a fifth of it, filtered in
  the vector search itself so other kinds cannot crowd out candidates. A side of 12-inch
  disco singles still gets them.
- **Room names** use only styles at least 30% of the room shares, so one record cannot
  name a small room.
- **Exploration over repetition.** Reasons such as "Queen is on 2 of your records" read as
  "more of what you have", and the ranking agreed: shared people counted the pick's own
  artist, so "more by an owned artist" scored highest. Discover's purpose is new music,
  so:
  - shared-people credit counts only producers, engineers and players, never the artist;
  - "near" takes 0.12 off a pick by an artist already on the shelf and allows one such
    pick per room; "far" still leaves them out. Requiring new artists everywhere was
    considered and rejected: one more album by a loved artist is a fair suggestion,
    just not the main one.
- **Reasons describe the music** (contract 0.9.0): a sound line (styles and era, "Soul and
  Funk, early '80s"), up to two shelf artists whose records sound closest ("for fans of
  Earth, Wind & Fire and Commodores"), and a link only when there is a real one (a
  producer or player behind shelf records, the artist themselves, or the same label and
  decade), worded as a person would ("Produced by Maurice White, who's on 4 of your
  records"). The catalogue has no words for feel (warm, moody); styles carry some of it,
  and the language-model layer (§4) may later rephrase these facts, never add to them.

**Measuring it.** The evaluation now also reports **discovery**: recall of held-out
records by artists found nowhere else on the shelf. The synthetic gate is unchanged and
passes. On the real shelf the old recall (0.012) fell to 0, as intended, since its hits
were records by owned artists; discovery is 0 for the engine and both baselines alike.
With about 33 held-out records among 150,000 and 20 guesses, one shelf cannot measure
finding new artists. The judge for this change is the picks themselves, and in time the
best measure will be the users' own verdicts: the rate of "more like this" to "not for
me" on picks, which the feedback table already records.

### 2026-10-28: the wantlist as a taste signal

Where a collection says where a collector's taste has been, the wantlist says where it is
going. Wanted records now join the rooms like "more like this" and are excluded from the
picks (ADR 0011, note of 2026-10-28; contract 0.10.0, `basedOn.wanted`).
