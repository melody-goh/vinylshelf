# Vinyl Shelf (working title)

Web app for vinyl collectors: Discogs collection browsing, audio recognition,
taste-based discovery. Also a portfolio project: clean code, documented decisions,
and sound system design matter as much as features.

## Source of truth
- API: `packages/contract/openapi.yaml`. Change the spec first, then the code.
- Decisions: `docs/adr/`. Do not contradict an ADR silently. If one needs to change,
  write a new ADR that supersedes it and say so.
- Domain model and recognition state machine: `docs/domain-model.md`.

## Stack
pnpm workspaces monorepo. `apps/web` (React, TypeScript, Vite, TanStack Query, Tailwind,
Motion), `apps/api` (TypeScript, Fastify, Zod, Drizzle, Postgres, pg-boss),
`packages/contract` (OpenAPI and generated types). Tests: Vitest, Playwright, MSW.

## Rules
- Every external service (Discogs, recognition vendor, MusicBrainz) is accessed only
  through its own gateway module behind an interface. Never call them from elsewhere.
- Discogs data follows ADR 0004: tag classification, enforce a TTL of at most 6 hours on
  read, never store images, render `DiscogsCredit` next to Discogs data.
- Tests must never hit live third-party APIs. Use recorded fixtures or fakes.
- Free to build and host: do not add paid services or new infrastructure without asking.
- Never commit secrets. Config comes from environment variables, validated at startup.
- Keep modules small and documented: public functions get doc comments explaining why,
  not what.
- Animations: only `transform` and `opacity`, springs over eased durations, respect
  `prefers-reduced-motion`.

## Workflow
- Plan before coding on any non-trivial task; show the plan and wait for approval.
- Small commits, Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Run lint, typecheck and tests before declaring a task done.
- When something is ambiguous or a decision is hard to reverse, ask instead of guessing.