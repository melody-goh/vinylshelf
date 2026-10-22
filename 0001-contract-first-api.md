# ADR 0001: Contract-first API

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

The project has a web client and an API server developed by one person, with the UI
experience as the main product differentiator. Without a shared definition, the two sides
drift, and the API ends up shaped by whatever the backend found easiest to build.

## Decision

The OpenAPI 3.1 document at `packages/contract/openapi.yaml` is the source of truth.

- Server request/response validation and client types are **generated** from it
  (openapi-typescript for types, Zod schemas kept in sync via a contract test).
- The UI develops against mocks generated from the spec while the backend catches up.
- Changes to the API start with a change to the spec, reviewed before implementation.
- Errors use RFC 9457 problem details with a stable `code` field.

## Consequences

**Good:** one reviewable artifact describes the whole system boundary; drift becomes a CI
failure instead of a runtime bug; the UI is unblocked early.

**Costs:** spec upkeep and a code-generation step in the build. Server-sent events are
only loosely describable in OpenAPI, so the event payload is documented in prose and
covered by a contract test.

## Alternatives considered

- **Code-first (generate the spec from server code):** faster to start, but the spec then
  describes what was built, not what was intended.
- **tRPC / shared types only:** excellent ergonomics, but ties the contract to TypeScript
  and produces no standalone, reviewable artifact.
