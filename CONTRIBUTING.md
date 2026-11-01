# Contributing

How this codebase is kept. The reasons behind each rule are in `docs/adr/`.

## Sources of truth

- **API:** `packages/contract/openapi.yaml`. Change the spec first, then the code (ADR 0001).
- **Decisions:** `docs/adr/`. Don't contradict an ADR silently. If one needs to change,
  write a new ADR that supersedes it, or add a dated note.
- **Domain model and recognition state machine:** `docs/domain-model.md`.

## Rules

- **Gateways.** Every external service (Discogs, iTunes, the recognition vendor,
  MusicBrainz) is reached only through its own gateway module behind an interface. A
  lint rule enforces this for Discogs and iTunes.
- **Discogs data** follows ADR 0004:
  - tag its classification;
  - enforce a TTL of at most 6 hours on read;
  - never store images;
  - credit Discogs on every screen that shows its data. The footer does this, and a
    surface that covers the footer carries its own `DiscogsCredit`.
- **No live third-party APIs in tests.** Use recorded fixtures or fakes. MSW fails any
  request a test hasn't mocked.
- **Free to build and host.** Don't add paid services or new infrastructure (ADR 0005).
- **No secrets in the repo.** Configuration comes from environment variables and is
  validated at startup.
- **Small, documented modules.** Public functions get doc comments that explain why, not
  what.
- **Animations.** Use only `transform` and `opacity`, prefer springs to eased durations,
  and respect `prefers-reduced-motion`.

## Workflow

- Small commits in Conventional Commits style: `feat:`, `fix:`, `docs:`, `test:`,
  `chore:`.
- Before a change is done, `pnpm check` must pass. It runs the contract check, lint,
  typecheck and tests.
