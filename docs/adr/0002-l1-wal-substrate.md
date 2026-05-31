# ADR-0002: L1 WAL Substrate Selection

**Status:** Accepted — 2026-05-29 by Aaron
**Author:** Roger (L1 WAL owner, §3)
**Date:** 2026-05-29 (shell authored by Graham; Roger fills full body)
**CTD Anchor:** §3 — L1 WAL Substrate

---

## Context

Crucible's L1 substrate is the load-bearing storage primitive for every upper
layer — replay integrity, hermetic tests, investigation, and projection all
reduce to "what is in the WAL, in what order, with which content-addressed
hash." The substrate must support:

1. Atomic append of typed primitive rows (§6) with per-row BLAKE3 hash-chain
   linking (`prevRoot` → `selfRoot`).
2. Content-addressed body storage (CAS) with segment-boundary-aligned digests.
3. Byte-exact segment reconstruction for hermetic replay (§11, A2 conformance).
4. Group-commit batching with seal-and-split for hook bus pause verdicts (§4).
5. Bootstrap-batch at offset 0 (§2.2, R2-2 LOCK).

The stack already uses `better-sqlite3` for derived tables (Cairn's
`knowledge.db`, Crucible's `crucible.db` for L2 projections). The question:
should L1 use SQLite WAL-mode as its substrate, or a custom append-only WAL?

---

## Options Considered

### Option A.1 — Rust Append-Only WAL

Custom Rust binary with Node.js FFI bridge. Maximum performance; highest
implementation cost and build-toolchain complexity. Reserved as a swap target
behind the abstract L1 boundary (v1 commitment #10).

### Option A.2 — SQLite WAL-Mode as L1 Substrate

Use SQLite's built-in WAL mode as the append log. Rows stored as SQLite table
rows; WAL pages managed by SQLite's pager.

### Option A.3 — Hybrid: Custom Pure-TS WAL + SQLite for Derived Tables

Custom pure-TypeScript append-only WAL (64 MiB segments, per-row BLAKE3 chain,
CBOR-canonicalized payloads, CAS sharded by first byte) for L1 substrate.
SQLite (via `better-sqlite3`) used only for L2 derived/projection tables
(`crucible.db`). Abstract boundary allows A.1 Rust port as future swap.

---

## Decision

**Adopt A.3 hybrid** — custom pure-TS append-only WAL for L1, SQLite for
derived tables only.

One-line: Adopt Roger's A.3 hybrid — custom pure-TypeScript append-only WAL
for L1, with SQLite reserved for derived tables only.

---

## Rationale

### Why A.3 over A.2 (SQLite WAL-mode)

The rejection of SQLite WAL-mode as L1 substrate is architectural, not
performance-driven (Aaron ruling: no benchmark required). Three load-bearing
architectural couplings rule it out:

1. **Hash-chain integrity.** Crucible's L1 requires a per-row chained BLAKE3
   root (`prevRoot` → `selfRoot`) that forms a Merkle chain over the entire
   session. SQLite WAL-mode operates at the page level — its WAL records are
   database pages, not application-level rows. There is no stable hook to
   inject per-row hash chaining into SQLite's page-level WAL without wrapping
   every write in application-level chain maintenance *on top of* SQLite's own
   WAL, which eliminates the benefit of using SQLite as the substrate.

2. **Segment-level CAS alignment.** The custom WAL's 64 MiB segment files
   (§3.2) are content-addressed units whose boundaries align with the CAS
   sharding scheme. CAS digests reference byte ranges within segments; segment
   rotation is coordinated with group-commit boundaries. SQLite's WAL segments
   are B-tree pages managed by SQLite's pager — their boundaries are opaque to
   the application and do not align with CAS content addressing. Forcing
   alignment would require a CAS layer *above* SQLite that duplicates the
   storage, negating the "use SQLite instead" simplification.

3. **Replay-oracle coupling.** Hermetic replay (§11) requires byte-exact
   reconstruction of the WAL segment stream to verify hash-chain integrity (A2
   conformance). The replay oracle reads segments sequentially and re-derives
   `selfRoot` from the binary record layout. SQLite WAL-mode checkpoints
   compact the WAL back into the main database file — the WAL is transient by
   design. Preserving the full WAL history for replay would require disabling
   checkpointing entirely (unbounded WAL growth) or maintaining a separate
   append-only copy (again duplicating storage).

**Summary:** SQLite WAL-mode solves ACID page-level crash recovery; Crucible
needs application-level append-only hash-chained event storage with content-
addressed segment boundaries. The A.3 hybrid uses SQLite for **derived tables
only** (`crucible.db`, §3.2) — the right tool for L2 projections, the wrong
tool for L1 substrate.

### Why A.3 over A.1 (Rust)

A.1 is reserved as a swap target, not rejected. The pure-TS implementation is
chosen for v1 because: (a) the team's primary language is TypeScript, reducing
onboarding cost; (b) Node.js FFI adds build-toolchain complexity (napi-rs,
cross-platform native builds) that v1 doesn't need; (c) the abstract L1
boundary (v1 commitment #10) allows A.1 as a future swap without changing any
consumer code. If p99 append latency under production load exceeds the ≤1ms
envelope (§3), A.1 Rust port is the designated escalation path.

---

## What Changes

- `~/.crucible/wal/` directory structure with 64 MiB rolling segments (§3.2)
- `~/.crucible/wal/cas/` content-addressed store sharded by first byte
- `~/.crucible/crucible.db` — SQLite for L2 projections only
- `@akubly/crucible-l1-wal` package owns the substrate
- Abstract `L1Substrate` boundary allows future A.1 swap

---

## Consequences

- **Positive:** Full control over hash-chain integrity, segment boundaries, and
  replay-oracle coupling. No SQLite pager opacity.  Group-commit and seal-and-
  split are first-class operations, not bolted onto SQLite transactions.
- **Negative:** Custom binary format requires bespoke tooling (fsck, segment
  inspector, recovery). No SQLite ecosystem tooling for direct L1 inspection.
- **Risk:** TS performance ceiling may require A.1 Rust port sooner than v1.5.
  Mitigated by the abstract boundary.

---

## Security Implications

- WAL segments contain verbatim Observation payloads including LLM responses
  and tool outputs. Local-disk exposure risk per §18.1 threat model (single-
  user, self-audit). `crucible session delete --purge` is the retention-control
  primitive.
- Hash-chain integrity provides tamper-evidence for the single-user case (self-
  audit, not adversarial). Chain-break detection via `cairn fsck` walk.
- CAS content is not encrypted at rest in v1. Encryption-at-rest is a v1.5+
  concern (§18.4).

---

## Resolved Questions

- **Q: Should we benchmark SQLite WAL-mode first?** No — Aaron ruling. The
  rejection is architectural (hash-chain, CAS alignment, replay coupling), not
  performance-driven. No benchmark changes the architectural incompatibility.
- **Q: When does A.1 Rust port happen?** When p99 exceeds ≤1ms under production
  load. Reserved, not scheduled. v1 commitment #10 guarantees the boundary
  exists for the swap.
