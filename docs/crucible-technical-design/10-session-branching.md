# §10 — Session Model + Branching

**Status:** FINAL (Phase 2). Authoritative; do not re-litigate locked decisions.
**Owner:** Roger. **Secondary:** Alexander (L0 bootstrap handshake), Graham
(branching architecture), **Rosella** (R2-6 lockfile-format ↔
`SessionMetadata.pluginVersions` snapshot-field handshake).
**Cross-refs:** §2 (L0/L1 Boundary — `BootstrapPayload`), §3 (WAL — bootstrap-
batch, monotonic-timestamp floor, fork hash-chain inheritance), §6 (Primitive
Taxonomy — `Timestamp` vs `TimestampNs` split per Phase 2 finding 2a), §7
(Generator-side Plugin Registry contract — R2-6), §11 (Hermetic Replay),
§15 (Shared Types — `SessionMetadata`, `PluginVersionLock`).
**Depth budget:** ≤3 pages.

A Crucible **session** is a per-process unit of conversational + agentic
work whose entire history is materialized as a single L1 WAL session
directory (§3.2). A **fork** is a child session whose hash chain inherits
from a parent's prefix at a chosen offset; forks are L1-native (Aaron lock
2a), not application-layer copies. This section pins the `sessions` table
schema, the fork protocol, the bootstrap protocol, the transitive-dep
lifecycle (R2-6), and the forked-timestamp monotonicity rule.

## 10.1 `sessions` Table Schema

The `sessions` table lives in `~/.crucible/crucible.db` (the derived-
projection SQLite from §3.2) and is **rebuildable** from the per-session
WAL bootstrap row plus the optional `fork_origin` synthetic Observation
(§3.2 "Forks"). It is the L2 index, not the source of truth.

```sql
CREATE TABLE sessions (
  session_id              TEXT PRIMARY KEY,           -- SessionId brand (@akubly/types)
  parent_session_id       TEXT NULL,                  -- NULL on root sessions
  fork_point_event_id     TEXT NULL,                  -- EventId in parent at which this session forks; NULL on root
  fork_point_offset       INTEGER NULL,               -- parent CommitOffset; NULL on root (denormalised from event_id for index efficiency)
  schema_version          INTEGER NOT NULL,           -- pinned at bootstrap (§2.2 BootstrapPayload.schemaVersion)
  created_at_ns           INTEGER NOT NULL,           -- TimestampNs (bigint stored as INTEGER) at session creation
  bootstrap_manifest      TEXT NOT NULL,              -- JSON; R2-2 LOCK shape (see §10.2)
  plugin_versions         TEXT NOT NULL,              -- JSON; R2-6 LOCK lockfile verbatim (see §10.5)
  status                  TEXT NOT NULL               -- 'active' | 'closed' | 'aborted'
);

CREATE INDEX sessions_by_parent ON sessions(parent_session_id);
CREATE INDEX sessions_by_fork_origin ON sessions(parent_session_id, fork_point_offset);
```

The `bootstrap_manifest` and `plugin_versions` columns are **inlined JSON
copies** of values that also live in L1 — `bootstrap_manifest` projects
the offset-0 `manifestRoot`-flagged Observation (§3.8), and `plugin_versions`
projects the R2-6 lockfile that was either resolved at install (root
sessions) or inherited verbatim at fork (forked sessions). The L2 row is
the cached lookup; if it diverges from L1, L1 wins and the projection is
rebuilt.

## 10.2 `bootstrap_manifest` Shape (R2-2 LOCK)

The JSON shape mirrors the §2.2 `BootstrapPayload`. It is **not** the
literal context (that lives as offset-0 Observation rows by sub-kind); it
is the **named-source manifest** that lets later `cross_session_memory`
Observations link back to their declared source.

```ts
interface BootstrapManifest {
  literalContext: {
    systemPromptDigest:   Blake3Hash;     // BLAKE3 of CBOR-canonical body
    toolDefinitionsDigest: Blake3Hash;    // BLAKE3 of CBOR-canonical array
    injectedMemoryDigests: Array<{ sourceManifestId: string; bodyDigest: Blake3Hash }>;
  };
  memoryManifest: Array<{
    id: string;                           // matches Observation.envelope.sourceManifestId
    kind: 'episodic' | 'semantic' | 'procedural' | string;
    versionHash: string;                  // pinned at bootstrap; survives later upstream edits
    accessSurface: string;                // tool name / API id used to query at runtime
  }>;
}
```

The digests are pointers into CAS (§3.2); the rendered body is **never**
inlined into `bootstrap_manifest` (would duplicate L1 storage and break
R2-2's "extra-ledger context lives only on offset-0 Observation rows"
contract). Forks inherit `bootstrap_manifest` **by reference** — child
sessions copy the JSON verbatim; no re-bootstrap.

## 10.3 Bootstrap Protocol — `ledger.bootstrap(bootstrapContext)`

```pseudo
SessionLedger.bootstrap(ctx: BootstrapContext) -> SessionId:
  sid := newSessionId()
  segment := createSegment(sid, segment0=true)
  # Atomic offset-0 append per named source (§3.8 AppendProtocol.bootstrap):
  payload := buildBootstrapPayload(ctx)         # §2.2 shape
  AppendProtocol.bootstrap(payload)              # single fdatasync; all-or-nothing
  manifest := projectManifest(payload)           # §10.2 shape; digests via CAS
  sessions.insert({session_id: sid,
                   parent_session_id: NULL,
                   fork_point_event_id: NULL,
                   fork_point_offset: NULL,
                   schema_version: payload.schemaVersion,
                   created_at_ns: now_ns(),
                   bootstrap_manifest: cbor_to_json(manifest),
                   plugin_versions:    cbor_to_json(loadLockfile()),
                   status: 'active'})
  return sid
```

Atomicity: `AppendProtocol.bootstrap` is the only batch that may write at
`commitOffset = 0` (§3.8 LOCK); either the entire bootstrap row set is
durable + broadcast or none is. The `sessions` row insert happens after
the L1 bootstrap commit; if the runtime crashes between the L1 commit
and the SQLite insert, the next boot's projection rebuild reads the L1
bootstrap row and re-inserts the `sessions` row idempotently (keyed on
`session_id` derived from the bootstrap row's `selfRoot`).

## 10.4 Fork Protocol

A fork is created at `(parentSessionId, forkPointOffset)`. The protocol
**copies no L1 bytes** — the parent's prefix is reachable through the
hash chain via the child's `prevRoot[1]` linkage (§3.2 "Forks") and the
`fork_origin` synthetic Observation at child offset 0.

```pseudo
SessionLedger.fork(parentSid: SessionId, forkPointOffset: CommitOffset) -> SessionId:
  parentRow := readByOffset(parentSid, forkPointOffset - 1)   # row at fork-point - 1
  childSid := blake3('crucible:session:' || parentSid || ':' || forkPointOffset)
  segment := createSegment(childSid, segment0=true)

  # Child offset 0 = synthetic fork-origin Observation (§3.2):
  origin := Observation{
    subKind: 'fork_origin',
    body:    { parentSessionId: parentSid,
               forkPointOffset: forkPointOffset,
               forkPointEventId: parentRow.selfRoot,
               parentForkPointTimestampNs: parentRow.timestampNs },
    flags:   { bootstrap: true, manifestRoot: false, ... },
  }
  AppendProtocol.append([origin])                              # routes through §3.4

  # COW snapshot: inherit bootstrap manifest BY REFERENCE; copy lockfile VERBATIM.
  parent := sessions.get(parentSid)
  sessions.insert({session_id: childSid,
                   parent_session_id: parentSid,
                   fork_point_event_id: parentRow.selfRoot,
                   fork_point_offset: forkPointOffset,
                   schema_version: parent.schema_version,
                   created_at_ns: max(now_ns(), parent.timestampNs_at(forkPointOffset - 1) + 1),
                   bootstrap_manifest: parent.bootstrap_manifest,   # by-reference COW (R2-2)
                   plugin_versions:    parent.plugin_versions,      # verbatim copy (R2-6)
                   status: 'active'})
  return childSid
```

**COW snapshot mechanics.** Forks share parent state by *reference* on
two dimensions: (a) bootstrap manifest JSON (§10.2; identical digests
across parent and child means CAS deduplication makes the shared body
free); (b) the lockfile JSON (§10.5; same `pluginVersionLockId` content
hash). Mutation in the child is structural append-only — the parent's
WAL prefix is immutable by construction (§3.13), so "copy-on-write" here
means "never write; reference and append-only-extend."

**Cross-session reads.** `LedgerWindowReader.readPrefix(childSid, 0, n)`
for `n > 0` returns the child's own rows; consumers that need the
parent's pre-fork prefix call `readAncestry(childSid, includeParents=true)`
which walks the `parent_session_id` chain and stitches the contiguous
view. Replay (§11) uses the stitched view; live runtime reads do not
unless explicitly requested.

## 10.5 Transitive-Dep Lifecycle (R2-6 LOCK)

Three phases, three owners, one shape.

| Phase           | Trigger                | Owner / package                                | Output                                                  |
|-----------------|------------------------|------------------------------------------------|---------------------------------------------------------|
| **install**     | `crucible plugin install <id>` | Rosella — `@akubly/crucible-plugin-registry` | Lockfile written to `~/.crucible/lockfiles/<id>.lock.json` |
| **fork-snapshot** | `crucible fork --at <offset>` | Roger — §10.4 fork protocol               | Lockfile verbatim → child `sessions.plugin_versions`    |
| **session-start** | session bootstrap or fork-bootstrap | Roger — §10.3 / §10.4                | Pure load: read `sessions.plugin_versions`, hand to L3 host (§7.2) — **no resolution** |

**Lockfile format** (R2-6 sync-pair agreement with Rosella). The lockfile
is a flat dictionary of pinned package versions plus an integrity stamp.
Rosella's install-time resolver writes it; Roger's fork-snapshot reads it
byte-verbatim and inlines it into `sessions.plugin_versions`. The shape
lives in `@akubly/types` as `PluginVersionLock` (§15.2):

```ts
interface PluginVersionLock {
  lockfileVersion: 1;                                      // bumped on shape change
  resolvedAt:      TimestampNs;                            // when the resolver ran (bigint ns)
  resolverVersion: string;                                 // @akubly/crucible-plugin-registry semver
  packages: Record<
    string,                                                // package name (e.g. '@akubly/skill-x')
    {
      version:      string;                                // exact semver (e.g. '1.2.3')
      integrity:    string;                                // sha512-... npm-style subresource integrity
      resolvedFrom: string;                                // registry url or 'workspace:'
      manifestSha256: string;                              // SHA-256 of the plugin manifest (§7.2)
    }
  >;
  lockId: Blake3Hash;                                      // BLAKE3 over CBOR-canonical {packages, resolverVersion, lockfileVersion}; content-addresses the lockfile for CAS dedup
}
```

`lockId` is the CAS-friendly content address: identical lockfiles across
parent + child + sibling forks produce identical `lockId` values, so
`sessions.plugin_versions` rows that JSON-equal each other always hash
to the same `lockId` (verifiable via `cairn fsck --plugin-versions`).

**Mid-session installs** are explicitly **out of scope** for v1
(matches Plan §10 spec). A v1.5+ ceremony would emit a structural
proposal through §7.D's `StructuralProposalGenerator` path with the
proposal's `schemaChange` carrying the lockfile diff; the Applier
re-stamps `sessions.plugin_versions` on acceptance. v1 sessions hold
their installed-at-fork lockfile for life.

## 10.6 Sub-Task Model (TaskStart / TaskEnd)

Per §6 sub-task tagging, tasks are bracketed by paired Observation rows:

| Sub-kind         | Body                              | Effect                                                  |
|------------------|-----------------------------------|---------------------------------------------------------|
| `task_start`     | `{ taskId, parentTaskId, label }` | Opens a sub-task scope; subsequent rows carry `envelope.taskId = taskId` and `flags.taskBoundary = true` (§3.3). |
| `task_end`       | `{ taskId, outcome }`             | Closes the scope; later rows revert to outer `parentTaskId` (or `null` at top level). |

Nesting is unbounded but stack-disciplined: `task_end` rows MUST close
the innermost open `taskId`. The L2 projector validates the bracket
discipline on every commit; a mis-nested `task_end` is surfaced as an
Aperture attention-tier event (the row still commits — append-only — but
the violation is durable for investigation).

Forks may begin mid-task: the child's `fork_origin` Observation captures
the parent's open task stack in `body.openTaskStack: TaskId[]` so the
child can either resume the stack or explicitly close it via a synthetic
`task_end` at offset 1.

## 10.7 Forked-Timestamp Monotonicity (TDD §6.9, R2 Q6 LOCK)

The fork inherits a **per-session floor** equal to the parent's
`timestampNs` at `forkPointOffset - 1` (§3.10 rule 4). The fork's first
non-bootstrap row's `timestampNs` is `max(now_ns(), floor + 1)`. The
floor is propagated through the synthetic `fork_origin` Observation's
`body.parentForkPointTimestampNs` field so it survives WAL fsck.

Multi-generation chain: if C forks from B at offset `bF` and B forks
from A at offset `aF`, then C's floor is B's `timestampNs[bF - 1]`,
which is `≥` A's `timestampNs[aF - 1]` by induction. Therefore C's
first-row timestamp `≥` A's `timestampNs[aF - 1]`. This is the
structural carrier of the TDD §6.4 Fork Lineage Transitivity invariant
on the time axis; the lineage axis itself is carried by the
`parent_session_id` chain in §10.1.

## 10.8 Multi-Path Comparison Sketch

Aperture (§9) and the CLI (§13) render multi-fork comparisons against
the `sessions` table joined with per-session L1 prefixes:

```
crucible fork compare <sidA> <sidB>
  ├── common ancestor:  walk parent_session_id chains, find MRCA
  ├── shared prefix:    LedgerWindowReader.readPrefix(MRCA, 0, divergencePoint)
  └── divergent tails:  per-side rows from (divergencePoint .. head]
                        rendered side-by-side with row-level diff
```

Two sibling forks of the same parent share the parent's prefix +
`bootstrap_manifest` + `plugin_versions` (so divergence is purely the
post-fork tail). Two forks across different parents diverge at the
`fork_origin` rows themselves and share only what their MRCA shares.

## 10.9 Acceptance Signals

This section is sufficient for:

- **Laura A1 (Session Fork from Arbitrary Ledger Position):** §10.4
  pseudocode + §10.1 schema cover the `parent_session_id` /
  `fork_point_event_id` invariants; replay-with-altered-verdict composes
  via §8 `Applier.resume` against the child session.
- **Laura A6 (Plugin Pinning at Session Fork):** §10.4 verbatim-copy
  rule + §10.5 lockfile format (`PluginVersionLock`) give the metadata
  Laura's test asserts byte-equal between parent's lockfile at fork
  time and child's `sessions.plugin_versions`.
- **TDD §6.4 Fork Lineage Transitivity:** §10.4 `parent_session_id`
  chain + §10.7 transitive timestamp floor jointly carry the invariant.
- **TDD §6.8 Bootstrap-Capture-Completeness in fork:** §10.4 inherits
  `bootstrap_manifest` by reference, so the child's offset-0 view = the
  parent's pre-fork bootstrap rows + the synthetic `fork_origin`.
  Replay's bootstrap-set comparison against the manifest is unchanged
  by forking.
- **TDD §6.9 Monotonic-Timestamps across fork:** §10.7 floor rule.
