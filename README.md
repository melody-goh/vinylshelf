# Vinyl Shelf (working title)

A web app for vinyl collectors: browse your Discogs collection in a polished, tactile UI,
identify what's playing and add the pressing to your shelf, and discover music you're
likely to love but wouldn't have found yourself.

> **Status:** design phase. The API contract and architecture decisions come first;
> implementation follows in thin vertical slices.

## Goals

This project is also a demonstration of engineering practice:

- Contract-first API design
- Clear module boundaries around every external service
- Documented decisions (see `docs/adr/`)
- Tests that never call live third-party APIs
- Free to build and host

## Architecture

```mermaid
flowchart LR
    subgraph Client
      W[Web app<br/>React + TypeScript]
    end
    subgraph API["API (modular monolith)"]
      C[Collection module]
      R[Recognition module]
      T[Taste module]
      Q[(Job queue<br/>in Postgres)]
    end
    DB[(Postgres + pgvector)]
    D[Discogs gateway<br/>rate limit + TTL cache]
    A[Recognizer interface<br/>AudD / fake]
    M[MusicBrainz gateway]

    W -- REST + SSE --> API
    C --> D
    C --> Q
    R --> A
    R --> D
    T --> M
    API --> DB
    D --> Ext1([Discogs API])
    A --> Ext2([Recognition vendor])
    M --> Ext3([MusicBrainz])
```

Key ideas:

- **Modular monolith**: separate modules with explicit interfaces; extract a service only
  when there is a concrete reason (for example a Python worker for audio features).
- **Gateways for every vendor**: Discogs, the recognition vendor and MusicBrainz sit behind
  our own interfaces, so a vendor change touches one module.
- **Results by event stream**: recognition outcomes arrive over SSE so that a future
  phone-pairing feature needs no redesign.

## Repository layout (planned)

```
apps/web            Frontend
apps/api            Backend
packages/contract   OpenAPI spec and generated types
docs/adr            Architecture decision records
docs/domain-model.md
```

## Documentation

| Doc | Purpose |
|---|---|
| [`packages/contract/openapi.yaml`](packages/contract/openapi.yaml) | API source of truth |
| [`docs/domain-model.md`](docs/domain-model.md) | Entities and recognition state machine |
| [ADR 0001](docs/adr/0001-contract-first-api.md) | Contract-first API |
| [ADR 0002](docs/adr/0002-recognition-results-via-event-stream.md) | Recognition over an event stream |
| [ADR 0003](docs/adr/0003-postgres-as-job-queue.md) | Postgres as the job queue |
| [ADR 0004](docs/adr/0004-discogs-data-lifecycle.md) | Discogs data lifecycle |
| [ADR 0005](docs/adr/0005-free-tier-constraints-as-design-inputs.md) | Free-tier constraints |

## Roadmap

1. Discogs login, collection import, shelf view (first vertical slice)
2. Backend hardening: TTL cache, rate limiting, resumable imports
3. UI polish: shared-element transitions, metallic design system
4. Recognition: laptop mic, file drop, manual search fallback
5. Taste engine
6. Later: phone pairing via QR code

## Attribution

This application uses Discogs' API but is not affiliated with, sponsored or endorsed by
Discogs. "Discogs" is a trademark of Zink Media, LLC. Data provided by
[Discogs](https://www.discogs.com).
