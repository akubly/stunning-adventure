# ADR-0001: SQLite as Persistence Engine

**Status:** Proposed  
**Author:** Graham  
**Date:** 2026-05-27  
**Deciders:** Aaron, Graham, Crispin  
**PRD Reference:** FR-7.1, FR-7.2

---

## Context

Eureka needs a persistence layer for facts, relations, and operational metadata (bridge ledger). The choice of database engine affects deployment complexity, performance characteristics, and future evolution (sync, replication).

## Decision Drivers

1. **Local-first sovereignty** — v1 is single-user, no remote calls (NFR-5)
2. **Cairn precedent** — existing stack uses `better-sqlite3`
3. **Operational simplicity** — no daemon, no connection pooling, embedded
4. **FTS capability** — BM25 recall via FTS5 is a v1 requirement
5. **Future sync** — v2 CRDT sync must be feasible

## Considered Options

### Option A: SQLite via better-sqlite3 (Recommended)

**Pros:**
- Synchronous API (simpler code flow in Node.js)
- Zero deployment complexity (embedded)
- FTS5 built-in (no additional dependency for BM25)
- Proven at scale (billions of rows)
- WAL mode for crash safety
- Matches Cairn architecture

**Cons:**
- Single-writer (no concurrent writes from multiple processes)
- No built-in replication
- CRDT sync (v2) will require custom implementation

### Option B: PostgreSQL

**Pros:**
- Mature, battle-tested at enterprise scale
- Built-in replication
- pg_trgm/tsvector for full-text search

**Cons:**
- Daemon process required
- Network latency for local operations
- Deployment complexity (Docker, config, auth)
- Overkill for single-user local-first v1

### Option C: Turso (libSQL)

**Pros:**
- SQLite-compatible with built-in sync
- Embedded edge replicas

**Cons:**
- External service dependency (violates local-first in v1)
- Less proven than vanilla SQLite
- Would require migration from better-sqlite3

## Decision

**SQLite via better-sqlite3** (Option A).

## Rationale

The v1 success bar is single-user, local-first dogfooding. SQLite meets every v1 requirement with zero operational burden. The storage adapter abstraction allows revisiting this decision if v2 sync requirements outgrow SQLite + custom CRDT.

The cons (single-writer, no replication) are explicitly not v1 concerns. When they become concerns, the adapter layer enables migration without architectural rework.

## Trade-offs Named

| Gain | Cost |
|------|------|
| Zero deployment complexity | No concurrent multi-writer |
| Local-first sovereignty | CRDT sync must be custom (v2) |
| Matches Cairn precedent | Locked to Node.js (better-sqlite3) |
| FTS5 ships free | No semantic search without sqlite-vec |

## Consequences

- All tier DBs are SQLite files
- `better-sqlite3` added as dependency
- FTS5 virtual tables for `facts_fts`
- WAL mode enabled for all DBs
- Storage adapter interface designed for potential future migration

## Related Decisions

- ADR-0002 (BM25 for v1 Recall)
- FR-7.1, FR-7.2 in PRD
