# ADR 0008: Taste engine with embeddings, offline evaluation and LLM-assisted search

- **Status:** Proposed (work starts after the first vertical slice; decisions marked
  *open* below must be settled first)
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

### 4. LLM features behind a `LanguageModel` gateway

The pattern is the same as the `Recognizer` (ADR 0005): an interface, a real
implementation using the Claude API through the official Anthropic SDK, and a
fixture-backed fake used in development, tests and CI.

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
2. **Model choice.** Pricing per million input/output tokens, as of October 2026:
   Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20. Compare candidates with
   the LLM eval on quality and **cost per completed task**, then decide. The project
   owner decides on cost. A rough estimate, before caching: a search call is about 4k
   input tokens (mostly the style allowlist) and about 150 output tokens; an
   explanation is about 300 in and 40 out. Thinking tokens may add to the output.
   At 500 searches and 5,000 explanations a month, that comes to about $0.50 on Haiku
   5.5, $10 on Sonnet 5.5 and $20 on Opus 5.5. Prompt caching of the allowlist and
   caching of explanations would lower all three.
3. **Derived taste signals.** Is an aggregate such as "this user leans towards
   ambient", derived from a Restricted collection, itself Restricted? Until answered,
   such signals are not sent to the LLM. Explanations stay phrased from the candidate's
   CC0 attributes and the matched style names.
4. **Provider-side spend limits:** check whether the provider account can enforce a
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
