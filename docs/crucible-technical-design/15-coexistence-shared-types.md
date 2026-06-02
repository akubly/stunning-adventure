# §15 — Coexistence & Shared Types

**Status:** FINAL (Phase 2). Authoritative; do not re-litigate locked decisions.
**Owner:** Roger. **Secondary:** Alexander (Crucible runtime package), Rosella
(plugin discovery + transitive resolution — co-owner of
`@akubly/crucible-plugin-registry`).
**Cross-refs:** §2 (boundary types), §3 (WAL storage), §7 (generator contract +
trust-tier enum), §8 (DecisionGate / Applier), §9 (Aperture badge surface),
§10 (`SessionMetadata`, lockfile inhabitant), §14 (Eureka — coexistence sibling).
**Depth budget:** ≤3 pages.

This section pins the **product-line boundary** between Crucible and the
existing Cairn/Forge product line, enumerates the additions to
`@akubly/types` Phase 2 introduces, draws the monorepo layout that hosts
both, names the accepted-tax overlaps that v1 will *not* fold together,
and owns the transitive-dep-resolution lifecycle (R2-6) on the algorithm
+ lockfile side.

## 15.1 Two-Product Coexistence Boundary Table

Crucible and Cairn/Forge are **architectural siblings** living in the
same monorepo and sharing the brand types in `@akubly/types`; their
storage, lifecycles, query patterns, and CLI surfaces are fully
independent (matches the Eureka analysis pattern in Roger's history
2026-05-26 — "FORK storage entirely, share identifiers only").

| Concern                  | Crucible product line                             | Cairn / Forge product line                  | Coexistence rule                                |
|--------------------------|---------------------------------------------------|---------------------------------------------|-------------------------------------------------|
| **Storage root**         | `~/.crucible/` (custom WAL + CAS + `crucible.db`) | `~/.cairn/knowledge.db` (SQLite)            | Forked directories; no shared file handles      |
| **Write pattern**        | Append-only + group-commit + pre-commit hook bus  | CRUD + lifecycle UPDATE under `withShadowEvent` discipline | Forked; no shared writer                        |
| **Identity brand**       | `SessionId` from `@akubly/types`                  | `SessionId` from `@akubly/types`            | Shared brand only; no runtime FK (type-level)   |
| **Event log**            | L1 WAL (§3)                                       | `event_log` table + shadow events           | Forked; bridge via `cairn reconcile` offline    |
| **Plugin registry**      | `@akubly/crucible-plugin-registry` (R2-6 lockfile)| Cairn `agents/discovery.ts` (live discovery)| Forked algorithm; Cairn host is reused inside §7.2 generator lifecycle (no new plugin-host package — per §7.2 lock) |
| **CLI surface**          | `crucible <verb>`                                 | `cairn <verb>` / `forge-prescribe`          | Disjoint verb namespaces                        |
| **Migration numbering**  | Crucible-only sequence (v1+)                      | Cairn v14+ existing sequence                | Forked; no shared migration step                |
| **Investigation surface**| Aperture (§9)                                     | Cairn `decisions` / Forge prescription UI   | Forked UX; Aperture does not project Cairn rows |
| **Type sharing**         | `@akubly/types` brand types + shared envelopes    | `@akubly/types` brand types + shared envelopes | One shared package; additions reviewed by both lines |

The rule is **share identifiers, fork everything else.** Premature
convergence on a substrate primitive that only one side needs in its
pure form is the failure mode (see history 2026-05-26 anti-anchoring
note); v1 explicitly accepts the tax of two implementations of
overlapping-but-not-identical concepts (§15.4).

## 15.2 `@akubly/types` Evolution Plan

Phase 2 introduces the following new shared types into
`packages/types/src/index.ts`. All are CBOR-canonicalisable, schema-
versioned, and reviewed by both product lines before merge.

| New type                  | Owner    | Source-of-truth section | Shape summary |
|---------------------------|----------|-------------------------|---------------|
| `SessionMetadata`         | Roger    | §10.1                   | `{ sessionId, parentSessionId?, forkPointEventId?, forkPointOffset?, schemaVersion, createdAtNs: TimestampNs, bootstrapManifest: BootstrapManifest, pluginVersions: PluginVersionLock, status }` |
| `BootstrapPayload`        | Graham   | §2.2 (R2-2 LOCK)        | `{ sessionId, sdkVersion, schemaVersion, literalContext, memoryManifest, causalContextWindow? }` |
| `BootstrapManifest`       | Roger    | §10.2 (R2-2 projection) | `{ literalContext: { systemPromptDigest, toolDefinitionsDigest, injectedMemoryDigests[] }, memoryManifest[] }` |
| `ContextWindowCommitment` | Roger    | §3.3.2 (R2-1 LOCK)      | `{ commitment: Blake3Hash, method: 'declared' \| 'fallback', slice: EventId[] \| null }` |
| `StructuralProposal`      | Rosella  | §7.1 / §7.D             | `{ ...ProposalGeneratorBase, kind: 'structural', schemaChange, dependentPaths: EventId[] }` (Phase 2 finding 5 reconciled) |
| `PluginVersionLock`       | Roger + Rosella | §10.5 + §15.5    | `{ lockfileVersion: 1, resolvedAt: TimestampNs, resolverVersion, packages: Record<...>, lockId: Blake3Hash }` |
| `PrescriptionResult`      | Rosella  | §7.5 (R2-5 LOCK)        | `{ prescriptionId, proposal, fitness, nonDominatedReason: 'optimal' \| 'incomparable', incomparableWith? }` |
| `TimestampNs`             | Graham   | §6 (Phase 2 finding 2a) | `bigint` alias; u64 nanoseconds; structural twin of envelope-side `Timestamp = number` (ms). |

Governance: any addition to `@akubly/types` follows the existing dual-
reviewer rule (one Crucible-line reviewer + one Cairn-line reviewer per
PR). Brand types and shared envelopes flow through the package as
re-exports only; product-line-specific types stay in their owning
package and never enter `@akubly/types`.

## 15.3 Monorepo Layout Diagram

```
D:\git\harness\
├── packages/
│   ├── types/                              # @akubly/types — shared brands + envelopes
│   │
│   ├── crucible-boundary/                  # §2 boundary contract types
│   ├── crucible-l0-provider/               # SDK adapter (Alexander §12)
│   ├── crucible-l1-wal/                    # §3 WAL substrate (Roger)
│   ├── crucible-runtime/                   # §12.9 composition root (Alexander)
│   ├── crucible-applier/                   # §8 Applier + DecisionGate (Alexander)
│   ├── crucible-router/                    # §5 Router (Gabriel)
│   ├── crucible-aperture/                  # §9 Aperture projection + queue (Valanice)
│   ├── crucible-cli-shell/                 # §13 CLI shell (Valanice)
│   ├── crucible-plugin-registry/           # R2-6 lockfile resolver (Rosella + Roger)
│   ├── crucible-replay/                    # §11 hermetic replay (Laura/Roger)
│   │
│   ├── cairn/                              # existing — untouched by Crucible Phase 2
│   ├── forge/                              # existing — Forge prescribers (Rosella §7.B)
│   ├── skillsmith-runtime/                 # existing — STAYS AS-IS (coexistence lock)
│   ├── runtime-cli/                        # existing — Wave 2 forge-prescribe CLI
│   │
│   └── crucible-eureka-adapter/            # v1.5 deliverable (§14 + Appendix 7-E)
│
├── docs/crucible-technical-design/         # CTD authoritative
├── docs/crucible-tdd-strategy.md           # Laura's TDD strategy
└── .squad/                                  # squad coordination
```

`@akubly/skillsmith-runtime` stays as-is per the coexistence lock —
Crucible does not absorb the Wave 3 composition root (it is the
Cairn/Forge composition root, not a Crucible one). Crucible's
composition root is `@akubly/crucible-runtime` (§12.9), reached through
the `crucible` CLI shell, never through `runtime-cli`.

## 15.4 Accepted-Tax Enumeration

The following overlaps exist in v1; collapsing them would prematurely
converge on a primitive neither side needs in its pure form. Each tax
entry names the overlap, the reason it is bounded, and the v2+ exit
criterion (if any).

| Overlap                     | Why bounded                                            | v2+ exit (if any)                                        |
|-----------------------------|--------------------------------------------------------|----------------------------------------------------------|
| Two event-logs              | Cairn's CRUD `event_log` and Crucible's append-only L1 WAL serve different audiences (lifecycle-of-record vs. replay-of-record). | None planned; the bridge is `cairn reconcile` (offline). |
| Two plugin discovery paths  | Cairn `agents/discovery.ts` walks the filesystem for live skills; `@akubly/crucible-plugin-registry` resolves a pinned transitive graph at install. | None planned; Cairn host is reused *inside* §7.2 generator lifecycle, so the discovery code is shared even though the lockfile path is Crucible-only. |
| Two session models          | Cairn `sessions` tracks Cairn-lifecycle facts; Crucible `sessions` (§10.1) tracks fork lineage + plugin pins. | None planned; `SessionId` brand bridges them at the type level only (no runtime FK). |
| Two notification surfaces   | Cairn / Forge use ad-hoc CLI output; Crucible uses Aperture (§9) with attention-tier discipline. | v2 may unify if Cairn lifecycle events project into Aperture; out of scope for v1. |
| Two trust-tier vocabularies | Forge prescribers already use a `source` field (`builtin / external`); Crucible adds the 4-tier enum (`builtin / adopted / community / external`). | Forge adapter (§7.B) maps `source` → `trustTier` at emission; Forge keeps its existing field. No vocabulary unification planned. |

Audiences are different (per the coexistence lock); the tax is the
price of not breaking either audience.

## 15.5 Transitive-Dep-Resolution Lifecycle (R2-6 LOCK — Algorithm Side)

§10.5 owns the *consumer* (`sessions.plugin_versions` snapshot field).
§15.5 owns the *algorithm* package (`@akubly/crucible-plugin-registry`)
and the *format* (`PluginVersionLock`).

**⚠️ Artifact Availability Invariant:** Plugin-version pinning (via `PluginVersionLock` and `lockId`) is version-deterministic but not artifact-availability-deterministic. The lockfile captures `(name, version)` pairs and CAS digests, but cannot prevent upstream artifact unpublishes, registry outages, or local cache eviction. Determinism guarantees degrade if referenced plugins become unavailable in their original locations. See §11.10 for the replay impact; operators requiring long-term artifact stability should archive plugin tarballs indexed by `lockId` and verify integrity via CAS digest.

### 15.5.1 Algorithm Package: `@akubly/crucible-plugin-registry`

Co-owned by Rosella (algorithm) and Roger (lockfile format). Lives at
`packages/crucible-plugin-registry/`. The package exports a single
public surface plus the `PluginVersionLock` re-export:

```ts
import type { PluginVersionLock, TimestampNs } from '@akubly/types';

export interface PluginRegistry {
  /** Install phase: resolve the full transitive graph and write the lockfile. */
  install(rootPluginId: string, opts?: InstallOpts): Promise<PluginVersionLock>;

  /** Session-start phase: PURE LOAD against a previously resolved lockfile. */
  load(lock: PluginVersionLock): Promise<LoadedPluginGraph>;

  /** Fork phase: NO-OP from the registry's perspective — the consumer
   *  (§10.4) copies the lockfile JSON verbatim into the child's
   *  sessions.plugin_versions. */
}

export interface InstallOpts {
  registry?:        string;          // npm registry URL; defaults to public
  lockfilePath?:    string;          // defaults to `~/.crucible/lockfiles/<id>.lock.json`
  resolverHints?:   Record<string, string>;  // peer-dep overrides etc.
}
```

The algorithm itself (graph walk, peer-dep resolution, conflict
detection) is Rosella's domain — Roger does not specify it here; this
section pins only the contract surface and the lockfile output shape.

### 15.5.2 Three-Phase Lifecycle Recap (R2-6 LOCK)

| Phase           | Who calls          | What happens                                                                                    | Where state lives |
|-----------------|--------------------|-------------------------------------------------------------------------------------------------|-------------------|
| **install**     | `crucible plugin install <id>` | `PluginRegistry.install()` resolves graph + writes lockfile to `~/.crucible/lockfiles/`. | Lockfile file on disk |
| **fork-snapshot** | `crucible fork --at <off>` (§10.4) | Lockfile JSON copied **verbatim** into child's `sessions.plugin_versions`.            | `sessions` SQLite row |
| **session-start** | session bootstrap or fork-bootstrap | `PluginRegistry.load(sessions.plugin_versions)` — **pure load**, no resolution.       | In-memory `LoadedPluginGraph` |

The handshake Rosella and Roger settled on (R2-6 cross-section sync
pair, recorded in the decision drop accompanying this section): a flat
`Record<packageName, lockedEntry>` keyed by package name, with the
`lockId: Blake3Hash` computed over the CBOR-canonicalised
`{lockfileVersion, resolverVersion, packages}` tuple. Forks share
`lockId` byte-for-byte with their parent unless an explicit
`crucible plugin reinstall` reruns `install` on the child branch (a
v1.5+ ceremony — out of scope for v1).

## 15.6 Acceptance Signals

This section is sufficient for:

- **Laura A6 (Plugin Pinning at Session Fork):** §15.2
  `PluginVersionLock` shape + §15.5 lifecycle contract jointly cover
  the metadata A6 asserts; the verbatim-copy invariant is the L1
  observable Laura writes the property test against.
- **Laura A2 / A1 / A11 / A12** continue to consume the
  `@akubly/types` evolution table (§15.2) — adding new types does not
  break the existing acceptance suite because all additions are
  net-new symbols, not edits to existing ones (matches the §6.5
  evolution rule).
- **Replay (§11)** consumes `ContextWindowCommitment` from §15.2,
  which is the single shared type for the `{commitment, method, slice}`
  triple that §3.3.2 / §8.4 / §11.6 all reference.

## 15.7 `@akubly/types` Governance Protocol

Three independently-roadmapped product lines (Cairn, Forge, Crucible) share
`@akubly/types` as their sole coordination surface. Without explicit governance,
breaking changes become a coordination tax that scales with the product count.
This subsection pins the protocol.

### 15.7.1 SemVer Policy

| Change class | SemVer bump | Example |
|---|---|---|
| **Additive** — new exported type, new optional field on existing type, new union member | **Minor** | Adding `TimestampNs` (Phase 2 finding 2a) |
| **Breaking** — removed export, renamed type, changed required field shape, narrowed union | **Major** | Changing `SessionId` from `string` brand to `bigint` brand |
| **Patch** — JSDoc edits, internal refactors with no public-surface change | **Patch** | Fixing a typo in a type-level comment |

The monorepo uses `"*"` internal dependency specifiers (W3-Impl-1), so
SemVer bumps are informational for external consumers and changelog
discipline — the monorepo itself always resolves to the workspace copy.

### 15.7.2 Breaking-Change Process

1. **Proposal PR** with the `types-breaking` label. PR description MUST
   include: (a) what breaks, (b) which downstream packages are affected,
   (c) migration path for each affected package.
2. **48-hour cross-package review window.** At least one reviewer from each
   affected product line (Cairn, Forge, Crucible) must approve or request
   changes. Silence after 48 hours is not consent — the proposer must
   obtain explicit approval.
3. **Compatibility matrix update** (§15.7.3) in the same PR.
4. **Coordinated merge.** The `types-breaking` PR merges together with the
   downstream adaptation PRs (stacked PRs or merge queue) so `main` never
   has a broken consumer.

### 15.7.3 Compatibility Matrix

Maintained as a living table in this section. Updated on every minor or
major bump to `@akubly/types`.

| `@akubly/types` version | `@akubly/cairn` | `@akubly/forge` | `@akubly/crucible-*` | Notes |
|---|---|---|---|---|
| current (pre-Crucible) | ✅ | ✅ | n/a | Baseline — Cairn + Forge only |
| +Phase 2 additions (§15.2) | ✅ (no change) | ✅ (no change) | ✅ (new consumer) | All additions are net-new symbols; no existing exports modified |

**Invariant:** every row in this matrix is tested by CI. The `ci:contracts`
gate (§16.5) runs cross-package type-checking; a red cell in this matrix
means a failing CI gate, not an editorial oversight.

## 15.8 Cross-Section Sync-Pair Status

| Pair                                                    | Status                                              |
|---------------------------------------------------------|-----------------------------------------------------|
| Roger ↔ Rosella (R2-6 lockfile format ↔ snapshot field) | **CLOSED** — `PluginVersionLock` shape (§15.5.1) + §10.5 verbatim-copy rule + §10.4 fork pseudocode jointly close the handshake. Algorithm side owned by Rosella; format + consumer-side owned by Roger. |
| Roger ↔ Alexander (§3.4 `appendFenced` for §8.3)        | **CLOSED** — §3.4.1 publishes the entrypoint (Phase 2 finding 12b). |
| Roger ↔ Graham (§6 `TimestampNs` split for §3.10)       | **CLOSED** — §6 adds `type TimestampNs = bigint` additive (Phase 2 finding 2a option (c)); §3 imports it. |
| Rosella ↔ Gabriel (§7 `dependentPaths` ↔ §5.3)          | **CLOSED** — §7.1 + §7.D switched to `EventId[]` (Phase 2 finding 5); §5.3 was already on `EventId[]`. |
