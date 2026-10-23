# ADR 0002: Recognition results delivered over a per-attempt event stream

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

Audio recognition is asynchronous: a clip is uploaded, a third-party vendor is called, and
a result arrives seconds later (or never). For the MVP the capture device and the viewing
device are the same browser tab, so a plain request/response would work.

A planned later feature, phone pairing, splits them: a phone records, the desktop
displays the result. The result must reach a client that did not make the upload request.

## Decision

Model recognition as a **RecognitionAttempt** with an explicit state machine and deliver
results through a **server-sent events (SSE)** stream, even when the capturing client is
also the viewer.

- Flow: create attempt, upload audio (returns 202), subscribe to
  `GET /recognition-attempts/{id}/events`.
- Capture origin is data (`source`: `laptop_mic`, `file_upload`, later `paired_phone`),
  not a separate code path.
- Attempts belong to a **ListenSession**. Today it is 1:1 with a browser tab; pairing later
  means a second device attaches to an existing session with a short-lived single-use token.
- Audio is processed and discarded, never persisted.
- A polling endpoint (`GET /recognition-attempts/{id}`) remains as a fallback.

State machine: see `docs/domain-model.md`.

## Consequences

**Good:** phone pairing becomes an addition (a new client and a token endpoint), not a
rewrite; reconnects are handled through `Last-Event-ID`; the same path serves the file-drop
flow and test fixtures.

**Costs:** more moving parts than a synchronous call for the MVP; long-lived connections
interact badly with sleeping free-tier hosts (see ADR 0005), so the client must fall back
to polling.

## Alternatives considered

- **Synchronous request/response:** simplest, but the pairing case would force a redesign.
- **WebSockets:** bidirectional capability we do not need; SSE is simpler, works over plain
  HTTP and reconnects natively.
