# ADR 0012: The taste catalogue is a versioned build artifact

- **Status:** Accepted
- **Date:** 2026-10-26
- **Related:** ADR 0005 (free-tier constraints), ADR 0008 (taste engine), ADR 0004
  (Discogs data lifecycle)

## Context

ADR 0008 decides what the taste catalogue is: up to 150,000 vinyl masters from
Discogs' monthly CC0 dumps, each with a text embedding. Building it means reading the
releases dump (10.5 GB gzipped, about 15 million releases) and the masters dump
(600 MB), then embedding the chosen masters. Three questions follow:

1. **Where does the build run?** On a developer's machine it costs 10.5 GB of
   bandwidth and half an hour on every rebuild, and nobody else can reproduce it
   without doing the same.
2. **How does the result reach a database?** Development, CI and (later) production
   each need the same catalogue.
3. **How do we know which catalogue a database holds**, and that it matches the model
   the API embeds queries with?

## Decision

1. **The build runs on GitHub Actions**, in a `workflow_dispatch` workflow (run by
   hand, with the dump month and the cap as inputs). The repository is public, so
   standard runners are free with no minutes cap; a runner has 4 vCPUs, 16 GB of
   memory and 14 GB of disk, enough for the build below. This is infrastructure the
   project already uses for CI, so nothing new is added (CLAUDE.md).
2. **The dumps are streamed, never stored.** The build reads each dump over HTTPS
   through a gunzip stream and a streaming XML parser (`saxes`), keeping only what it
   needs:
   - **Pass 1, releases:** per master, a version count and a vinyl version count (two
     integers in a map, about 2.6 million entries), and, for each master's *main*
     release only, its labels, country and credits, appended to a newline-delimited
     JSON spill file on the runner's disk. Keeping every release's details in memory
     would not fit; one row per master on disk does.
   - **Select:** masters with at least one vinyl version, ranked by version count
     (ties by id, so the build is deterministic), cut at the cap.
   - **Pass 2, masters:** title, artists, year, genres and styles for the selected
     masters only.
   - **Join and embed:** each selected master's text (see ADR 0008) is embedded in
     batches with the same model the API uses.
3. **The output is one file on a GitHub Release.** A gzipped JSON Lines file, one
   master per line with its fields and its vector (384 half-precision floats, base64),
   plus a `manifest.json` stating the schema version, dump month, model id and
   revision, dimensions, row count and the file's SHA-256. Releases are tagged
   `catalogue-YYYYMM`. A Release is free, public, versioned and downloadable without
   a token; a workflow artifact would expire after 90 days and need authentication.
4. **Loading is one command.** `pnpm --filter @vinylshelf/api catalogue:load` downloads
   a Release (the newest by default) or reads a local file, checks the SHA-256 and the
   manifest, then replaces the whole catalogue inside one transaction (delete, insert,
   commit). Postgres keeps serving the old catalogue to readers until the commit, and a
   failed load leaves it in place; a separate staging table would add nothing. The `catalogue_meta` row records the
   manifest, so the API can refuse a catalogue embedded with a different model than
   the one it queries with.
5. **The pipeline is tested without the real dumps.** Every stage is a small module
   with unit tests, and an end-to-end test builds a catalogue from fixture dumps of a
   few releases with a deterministic fake embedder, then loads it into the test
   database and queries it. CI never downloads a dump or a model (CLAUDE.md).
6. **Model weights come from Hugging Face once per build**, cached by the workflow, and
   once per developer machine through `models:fetch`. The API loads them from disk and
   never downloads at runtime. Hugging Face is a source of files, like npm, not a
   service the running app talks to, so it needs no gateway.

## Consequences

- A rebuild is a button in the Actions tab, and the result is a file anyone can
  inspect. The catalogue a database holds is identified by its Release tag and
  manifest.
- The catalogue is public, as the CC0 dumps are. It contains no user data: taste
  profiles are computed from a user's shelf inside our system and never published
  (ADR 0008).
- CC0 requires no attribution, but each Release's notes credit Discogs as the source,
  as a courtesy and so readers can find the original data.
- The build depends on data.discogs.com's download URLs. If they change, the workflow
  fails loudly; the last good Release keeps working.
- Rebuilding monthly is a manual choice for now. A scheduled run can be added once the
  build has proved stable.

## Notes

### 2026-10-26: rehearsal on real dump data

Before the first cloud build, the pipeline ran locally against real data: the first
30 MB of the October 2026 releases dump (44,950 releases, trimmed to whole records) and
the full masters dump, with the real model and a cap of 3,000.

- **Parsing holds on real XML.** The full masters dump (2.6 million masters) streams in
  about 30 seconds; peak resident memory was about 570 MB.
- **Found and fixed: packed roles.** Discogs packs several roles into one credit
  ("Producer, Written-By"), while a single role's detail may itself contain commas
  ("Engineer [Recording, Mixing]"). Roles are now split on commas outside brackets
  before ranking, so paperwork roles no longer ride along with a producer credit.
- **Found and fixed: padding.** Real descriptions run to 60-80 tokens and a batch is
  padded to its longest text, so embedding managed 64 masters a second, not the 500 the
  short-text probe suggested. Embedding each window of 1,024 masters in length order
  (rows still written in rank order) raised it to about 215 a second: about 12 minutes
  for 150,000 on the development machine, an estimated 20 to 30 minutes on a runner.

### 2026-10-27: built locally while the dump host refuses GitHub's runners

The first run of the Catalogue workflow failed within a second: data.discogs.com,
behind Cloudflare, answered **403** to the GitHub-hosted runner, while the same plain
request from a home connection streams normally. Cloudflare evidently refuses datacenter
addresses. We do not try to get past that (another user agent, a mirror, a proxy). The
dumps are offered to people, and a refusal is an answer.

So the build runs on the maintainer's machine, and everything after it is unchanged:

- `catalogue:build` streams both dumps as before (about 11 GB of bandwidth, a few GB of
  temporary disk, roughly 1–2 hours). It runs under `caffeinate` so the machine does not
  sleep. It cannot resume, so an interrupted build starts again; nothing is published
  until it has finished and its manifest is written.
- `catalogue:publish` uploads `manifest.json` and `catalogue.jsonl.gz` to the same
  `catalogue-YYYYMM` Release, with the same notes and Discogs attribution, using the
  same script the workflow runs. A catalogue is therefore identical however it was
  built, and `catalogue:load` does not know the difference.

The workflow stays, now calling that script, so it works again if Discogs serves
GitHub's runners. The decision itself (a versioned artifact, built once and published,
never built by the app) is unchanged.
