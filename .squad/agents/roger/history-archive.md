# Agent History Archive — roger

Archived entries (pre-summarization).

---

📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §10 + §15 shipped. All Phase 1 errata closed (2a/2b/12b/5). Cross-section R2-6 sync (Rosella ↔ Roger) CLOSED. PluginVersionLock format finalized. Phase 3 unblocked. — Scribe

## 2026-05-28: CTD Phase 4 — CALL/RET semantics + Scheduler-tier WAL readiness (§3 + §10 amendments)

**Context:** Aaron locked three Phase 4 UIS decisions per team weigh-in. My scope: locks #2 (CALL/RET) + #3 (Scheduler tier — substrate implications only; Gabriel owns §5 Router/Scheduler boundary).

**§3 amendments (L1 WAL Substrate):**
- **New §3.3.4 — CALL/RET sub-kind fields on `TaskStart`/`TaskEnd`.** Additive body fields under §6.5 evolution rule: `invocationId` (session-unique CALL/RET pair id), `parentInvocationId` (lexical-stack parent, NULL at top level), `returnTo: EventId` on `task_end` (zero-walk RET link to matching `task_start`), optional `callDepth` (derivable, kept for §13 `bt` UX single-row read). Recommended derivation `BLAKE3(sessionId || taskId || commitOffset)` — LOCKING deferred to Graham/Aaron (open question). Mis-nesting is a durable `monotonic_violation`-class projection alert; row still commits. `parentInvocationId` is distinct from `envelope.causalParentId` (lexical-stack vs causal-spawn edges coexist).
- **New §3.3.5 — Scheduler-emitted Decisions.** Pure substrate-readiness declaration: scheduler Decisions traverse `AppendProtocol.append` indistinguishably from model Decisions. No new column; `scheduler_*` discriminator is an additive optional body field. Did NOT enumerate sub-kinds (Gabriel's §5/§17 scope).
- **§3.17 ripple bullets** extended for §5 (Scheduler is first-class L1 producer) and §10 (invocation-stack projection).

**§10 amendments (Session + Branching):**
- **§10.6 rewrite** — sub-task model updated with CALL/RET body shape; L2 bracket-discipline validator pinned; `fork_origin.body.openTaskStack` superseded by richer `openInvocationStack: Array<{ taskId, invocationId, parentInvocationId, callDepth }>` (legacy shape preserved as compat-tolerated).
- **New §10.6.1 — Stack-frame reconstruction (derived view).** Pseudocode `ReconstructInvocationStack(sessionId, N)`: linear scan, seeded from `fork_origin` for forks. Closes Laura Q2 CALL/RET well-bracketed-nesting gap — property is now a single-scan PBT over the WAL trace. Sonny's §13 `bt` UX feeds off this. Replay equality of reconstructed stack is part of §11.6 oracle.
- **New §10.6.2 — Sub-task vs sub-session distinction.** Authoritative 10-row comparison table (identity, storage, lineage edge, concurrency, plugin snapshot, bootstrap, hash chain, backtrace, use case, replay containment). Rule of thumb: blocking + same epistemic line → sub-task; alternative trajectory + independently inspectable → fork. The two compose.
- **§10.9 acceptance signals** + cross-refs extended (§5 Router/Scheduler, §13 CLI `bt`).

### Learnings

**Sub-kind body fields > new WAL columns for primitive evolution.** Phase 4 added invocation-frame structure (`invocationId`, `parentInvocationId`, `returnTo`, `callDepth`) without changing one byte of the WAL row schema. The §6.5 additive-evolution rule plus per-payload CBOR body means the substrate absorbs new structural fields by letting them ride inside `primitive.primitivePayload` (reachable via `payloadHash` like any other field). When the field genuinely needs row-prefix locality (cheap predicate scans without body fetch), promote to a `flags` bit (e.g. `taskBoundary`); otherwise leave it in the body. The CALL/RET fields are body-field candidates because they're consumed by stack reconstruction (already a body-walking projection), not by hot-path predicate scans.

**Two-edge discipline pays off again.** `envelope.causalParentId` (causal-spawn) and `body.parentInvocationId` (lexical-stack) are distinct edges that answer distinct queries — exactly mirroring §6.4's `parentId` (structural production) vs `causalParentId` (sub-task spawn) split. The discipline is: never collapse semantically-distinct edges into one field even if they "usually align." Replay debuggers and PBT generators want to traverse each independently. Future temptation will be to drop `parentInvocationId` because "you can recompute it from `causalParentId` plus stack reconstruction" — resist it; the redundancy is a structural witness, not duplication.

**Substrate-readiness declarations are a first-class artifact.** §3.3.5 doesn't spec the Scheduler — it declares L1 ready for it. This is the right pattern when (a) another section owns the actual spec and (b) you need to publish "the substrate will not need to change" as an architectural guarantee. The shape of such a declaration: name the path through existing surfaces (`AppendProtocol.append`), name the discriminator location (body field, not row column), name the published guarantee ("regardless of who emitted it"), and explicitly disclaim what is NOT in scope. Gabriel can now design §5 without round-tripping with me on storage shape; if his design requires substrate change, that becomes a NEW Phase 4 finding rather than a surprise.

**Mis-nesting as durable signal, not exception.** Append-only discipline says: a `task_end` that doesn't match the top-of-stack `invocationId` still commits. The violation surfaces as an Aperture attention-tier event, not a thrown exception. This is the same pattern as §3.10 `monotonic_violation` — the WAL never refuses a row for structural-validator reasons; it records the discrepancy as another row and lets investigation (L5) decide what it means. Phase 4 added the third instance of this pattern; it's now a substrate idiom worth naming in §17.

📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe

## 2026-05-30: CLI Review — childSid Collision Hybrid Design (Round 2)

**Context:** Aaron requested user-story framing for childSid collision design. Rosella delivered hybrid option (user chooses fresh/resume at fork time, interactive prompt on collision). Roger reviewed for CLI consistency.

**Verdict: APPROVE-WITH-CONDITIONS.** Verb/flag shape is consistent with §13.1 taxonomy. Help text mirrors `defer` conventions. `--disambiguator` flag from Option B is **redundant** (timestamp-variant preimage in `--fresh` handles collision prevention). Interactive prompt mechanics need tightening: TTY detection, `--no-interactive` flag, exit codes (0, 1, 2, 130).

**Deliverables:**
- Review document: `.squad/decisions/inbox/roger-review-childsid-hybrid.md` (16.4 KB, comprehensive analysis)
- Draft help text for `crucible fork --help` (mirrors §13 conventions + L1 semantics)
- Condition #1: Keep both flag-based `--resume` and verb-based `crucible session resume <childSid>` (orthogonal use cases)
- Condition #2: Spec TTY detection + exit codes (Table: 0=success, 1=generic error, 2=non-TTY needs flag, 130=user cancel)

**Key design points:**
- `crucible fork --at <offset>` (interactive on collision, TTY-aware)
- `crucible fork --at <offset> --fresh` (deterministic timestamp preimage, orphan aborted)
- `crucible fork --at <offset> --resume` (error if none exists; requires --no-interactive in CI)
- `crucible session resume <childSid>` (direct resume by session ID; separate from flag)
- `--no-interactive` flag suppresses prompt even if TTY detected (CI/script safe)
- Decision row in parent ledger records choice (fresh/resume + rationale) → deterministic replay

**Learnings:**
- **Interactive CLI + CI integration:** Always spec TTY detection upfront, not as afterthought. Non-TTY context requires explicit flag-driven paths; exit code 2 ("needs flag") is load-bearing for automation.
- **Redundancy detection:** Multiple mechanisms for same goal (timestamp preimage vs user-provided disambiguator) create cognitive load + implementation risk. Favor one well-chosen mechanism (timestamp) unless escape hatch solves qualitatively different problem.
- **Verb vs flag distinction:** Separate verbs (`crucible session resume`) and flags (`--resume` on `fork`) serve different UX flows. Document relationship clearly when both exist.
- **Decision-recording for determinism:** When user input affects session structure, record choice as Decision row (not silent WAL write). Evidence.rationale documents *why* (flag/prompt/default) → audit trail + unambiguous replay.

---

## 2026-05-28: CTD Phase 2 — §10 (Session + Branching) + §15 (Coexistence) authored + Phase 1 errata applied

**Context:** Phase 2 fan-out. Two primary sections (§10 ≤3pp, §15 ≤3pp) plus four Phase 1 synthesis-review errata that landed on §3 + §6 + §7.

**Phase 1 errata applied:**
- **Finding 2a (Timestamp ms/ns drift):** Chose **option (c)** — split. Added `type TimestampNs = bigint` to §6 (additive under §6.5 evolution rule, coordinated with Graham); §3.3 `WalRow.timestampNs` now typed `TimestampNs`. Rejected option (b) (import-site alias only) because future arithmetic consumers like §5.3 `queueDeadline: Timestamp` would still read `number` carrying nanoseconds with no type signal. Rejected option (a) (rename existing) because it forces churn on legitimately-ms envelope readers.
- **Finding 2b (`manifestRoot` flag):** Added to §3.3 `flags` enum and §3.2 binary-layout bitfield comment. Already referenced by §3.8 bootstrap pseudocode; the schema slot now matches the writer.
- **Finding 12b (`appendFenced` undeclared):** Added §3.4.1 — full surface spec including fencing condition (`segment.nextOffset() === expectedHead` under single-writer lock, pre-stage), failure semantics (no CAS write, no bus dispatch, returns `{kind: 'fence-violation', actualHead}`), single-writer assumption (intra-process audit-hook gap absorbed; not multi-writer), when-to-use vs `append(batch)`, and bounded-retry contract for §8.3 `applyWithFence`.
- **Finding 5 (`dependentPaths` semantic split):** Patched §7.1 `StructuralProposalGenerator.dependentPaths` from `string[]` to `EventId[]` — concurred with synthesis-review recommendation. Content-addressed wins over routing-key for replay; §5.3 was already `EventId[]`, so one-side reconciliation.

**§10 highlights:** `sessions` table schema is L2 cache (rebuildable from L1); `bootstrap_manifest` carries digests not bodies (R2-2 — extra-ledger context lives on offset-0 Observation rows, not in the manifest column); fork protocol writes a synthetic `fork_origin` Observation at child offset 0 and COW-snapshots `bootstrap_manifest` by reference + lockfile verbatim; forked-timestamp monotonicity floor propagates through `fork_origin.body.parentForkPointTimestampNs` so multi-generation fork chains (TDD §6.4) preserve the time-axis invariant by induction.

**§15 highlights:** Coexistence boundary table — share `@akubly/types` brand types, fork everything else (storage, write pattern, plugin registry, migration numbering, investigation surface). Eight new shared types enumerated. Five accepted taxes named (two event-logs, two plugin-discovery paths, two session models, two notification surfaces, two trust-tier vocabularies). `@akubly/crucible-plugin-registry` co-owned with Rosella — she owns the install-phase algorithm, Roger owns the `PluginVersionLock` format + fork-phase verbatim-copy rule + session-start pure-load contract.

### Learnings

**Lockfile-format negotiation pattern (R2-6 sync pair with Rosella):**
- The right split is **algorithm-side owns the install resolver**, **format-side owns the lockfile schema + consumer rules** (fork-snapshot verbatim copy, session-start pure load). When the format crosses the storage boundary (here, `sessions.plugin_versions` SQLite JSON column), the format-side owner is the same person who owns the storage boundary (§3 / §10 — Roger). Algorithm purity belongs to Rosella; storage shape belongs to whoever signs the WAL row.
- The right format is **flat, not graph**. Forks demand verbatim byte-copy (no graph traversal at fork time), session-start demands pure load (no resolution at load time). A graph representation would force traversal semantics back into one of these phases. Flat `Record<packageName, lockedEntry>` + a `lockId: Blake3Hash` content-address footer is the cheapest shape that satisfies both constraints; the transitive-graph topology Rosella's resolver computes is captured by the *set* of entries, not by any in-shape pointer.
- The content-address footer (`lockId`) is the free win: identical lockfiles across sibling forks hash byte-identical and CAS-dedup; `cairn fsck --plugin-versions` validates the column by re-hashing.

**Sub-state fork-COW patterns:**
- "COW snapshot" on an append-only substrate means **share-by-reference, append-only-extend on the child**. The parent's WAL prefix is structurally immutable (§3.13 hash chain), so there is no copy step — the child's `prevRoot[1]` links into the parent's `selfRoot[forkPointOffset - 1]` and `cairn fsck --with-parent` traverses the cross-session edge.
- Two columns get **shared-by-reference COW** at the SQLite-projection level: `bootstrap_manifest` (R2-2 — child re-uses parent's manifest; offset-0 bootstrap rows are not re-emitted on the child) and `plugin_versions` (R2-6 — verbatim lockfile copy with same `lockId`). The "by reference" here is a content-hash identity, not a SQL FK; the JSON is duplicated in the row but the BLAKE3 footer makes the duplication free at the storage layer (CAS dedups the bodies if they reach CAS; the SQLite row carrying the JSON is cheap).
- Sub-state machinery (TaskStart / TaskEnd) survives fork by capturing the parent's open task stack in the `fork_origin` Observation's `body.openTaskStack`. The child chooses to either resume the stack or close it explicitly at offset 1. Append-only discipline means the choice is itself a durable row, not a runtime flag.

 — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §3 (L1 WAL Substrate) + §4 (Hook Bus) FINAL. Phase 1 synthesis review: YELLOW verdict, 13 findings routed. Your Phase 2 errata: finding 2a (Timestamp shape drift: split `Timestamp` vs `TimestampNs`), 2b (add `manifestRoot` flag), 12b (add `appendFenced` wrapper). Cross-section dependencies: Laura (§11.2 body shape pinning), Alexander (§12 offset-0 materialization), Rosella (R2-6 lockfile/snapshot handshake). — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) `BootstrapPayload` shape (literal+manifest, R2-2); (2) `commitmentMethod: 'declared' | 'fallback'` tag on Decision rows (R2-1); (3) transitive-dep snapshot field at fork (R2-6); (4) coordinate with Rosella on lockfile format. Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Roger — History

## 2026-05-26: Eureka ↔ Crucible Data Layer Overlap Analysis

**Context:** Aaron preparing simultaneous Eureka + Crucible implementation in this repo (`D:\git\harness`). Task was to map data-layer overlaps between Eureka's PRD (from sibling `D:\git\mem` repo) and Crucible's L1 substrate (A.3 hybrid append-log, per-row content-addressed WAL, group-commit).

**Verdict: FORK storage entirely.** Eureka and Crucible are architectural siblings with non-overlapping persistence needs. Full analysis written to `.squad/decisions/inbox/roger-eureka-crucible-data-overlap.md`.

**Eureka's data shape (from PRD v5-final):**
- Three independent SQLite DBs (via `better-sqlite3`): `~/.copilot/eureka/agent.db` (v1), `~/.copilot/eureka/user.db` (v1.5+), `<repo>/.eureka/project.db` (v1.5+). Only agent-tier fully wired in v1.
- Schema per-tier: `facts` table (CRUD, not append-only) with FTS5 for BM25 lexical recall, `relations` table (graph edges), `bridge_ledger` (append-only cross-system reconciliation log). No FKs to Cairn/Forge; **no cross-DB ATTACH at runtime** (FR-7.2).
- Write pattern: fact CRUD + FTS5 triggers + sweep-driven Tier 2 edge population. No group-commit, no per-row pre-fsync hooks.
- Query pattern: BM25 recall (keyword-scoped), composite ranker (0.5·relevance + 0.2·importance + 0.2·trust + 0.1·recency) × attention multiplier, trust floor exclusion (< 0.15), sequential fan-out (agent → user → project), edge traversal via `relations`.
- Lifecycle: SQLite WAL mode, opportunistic sweep (end-of-session, first-query-of-day), no content-addressed row hashing. Session identity shared with Cairn via `SessionId` brand from `@akubly/types` (type-level construct, no runtime FK — Eureka PRD §FR-13 v5-final R8).

**Share-vs-fork recommendations (8 substrate concerns evaluated):**
- **Event log / WAL:** FORK — Eureka's CRUD + FTS5 vs Crucible's append-only + group-commit are incompatible write patterns. Forcing convergence would mean Eureka pays append-only cost for no gain, or Crucible compromises replay determinism.
- **Session model:** FORK tables, SHARE identifier only — both use `SessionId` brand from `@akubly/types`; no runtime FK. Cairn owns lifecycle (`sessions` table), Eureka owns epistemology (`kind='session'` facts). Offline correlation only.
- **Config / KV / Graph / FTS / Snapshot:** FORK on all — no semantic overlap. Eureka's graph is epistemological (facts linked by `derived_from`, `contradicts` edges); Crucible's read-set is causal (event A read output of event B). DBOM Merkle chain (audit tamper-detection) vs Eureka facts (trust-weighted retrieval) serve different purposes.
- **Migrations:** FORK numbering — Crucible v100+ OR prefixed naming (`crucible-001-*.ts`) OR separate DB file (`~/.cairn/crucible.db` instead of sharing `~/.cairn/knowledge.db`). Recommendation: **separate DB file** for clean migration independence and backup story.

**Schema / path / port collisions: NONE.** Separate DB files (Cairn `~/.cairn/knowledge.db`, Eureka `~/.copilot/eureka/*.db`, Crucible TBD). Only shared construct is `SessionId` brand (type-level, no runtime coupling). No HTTP/IPC surfaces in v1 (Eureka library-only, Crucible is substrate layer, Cairn CLI-only). CLI namespaces distinct (`eureka` vs `cairn` vs hypothetical `crucible`).

**One load-bearing question for Aaron:** Does Crucible's L1 WAL (v14 `wal_records` table + v15-v18 tables) live in the same `~/.cairn/knowledge.db` as Cairn, or fork to `~/.cairn/crucible.db`? Trade-offs documented in analysis §6 OQ #1. My recommendation: **fork to `~/.cairn/crucible.db`** — independent migration numbering, preserves A.3 hybrid design freedom (custom append-only WAL file in pure TS for L1, keep `better-sqlite3` for other tables), avoids same-DB migration collision risk.

**Additional open questions for Aaron:**
- OQ #2: Does Crucible v1 still follow A.3 hybrid (my Round 5 spike recommendation), or has design shifted to full-SQLite transaction-batched semantics?
- OQ #3: Does Crucible L1 WAL rows carry `session_id` column? If yes, should import shared `SessionId` brand from `@akubly/types` to match Cairn + Eureka (type-level only, no runtime FK).

**Backup story:** Three stateful directories once both ship: `~/.cairn/` (Cairn + possibly Crucible), `~/.copilot/eureka/` (Eureka agent/user DBs), `<repo>/.eureka/` (Eureka project DB v1.5+). Operator guidance: back up all three for full state recovery. No cross-DB runtime dependencies; correlation is offline-only via `eureka reconcile` CLI (reads Cairn DB read-only) and (future) `crucible reconcile`.

**Anti-anchoring check honored:** Considered the "share event log" alternative seriously (Eureka could project facts into an append-only log, Crucible could index facts for keyword recall) and rejected on the evidence that the two write patterns (CRUD+FTS5 vs append-only+group-commit) and query patterns (BM25 recall vs seq-ordered replay) do not align. Sharing would force premature convergence on a primitive that neither system needs in its pure form.

## 2026-05-25 Round 7: v1-tier triage of all Roger-authored stories

Triaged every user story I authored across the deliberation against Aaron's locked v1 framing ("Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible"). Written to `decisions/inbox/roger-triage-2026-05-25T0200Z.md`. Headline cut: **8 substrate items go T1, 1 story (R-4) is enabled-for-free, everything else falls to T2–T5 or splits.**

T1 set: WAL with read-set hash + hook bus (Round 3 locked), `withShadowEvent` discipline + replay invariant (Open #4), CBOR-dcbor + BLAKE3 (Open #5), CAS + observation capture (Ro-NEW-2 — gates hermetic replay, this is the keystone), minimum-viable snapshot (Ro-NEW-1 T1 slice), branch/ref metadata schema (Ro-NEW-3 T1 slice), replay harness + linear `cairn fork --at` (R-3 T1 slice), drift ProposalGenerator (R-4, free). Plus `tenant_id` cheap-insurance migration (R-6 enabling) — hours now, weeks later.

Splits: **R-3** (replay+linear-fork T1, graph ops T3), **Ro-NEW-1** (min-viable snapshot T1, cadence/compaction T5), **Ro-NEW-3** (schema T1, fsck/GC T5). Cuts to T4/T5: R-1 (pattern mining graph-walks), R-2 (GitHub plugin), R-6 (federation), R-7 (code review plugin), R-8 (export productionization), R-9 (templates, gated on R-3), Ro-NEW-4 (quotas — dedup floor is already free). R-5 to T2 (one-hop provenance already exists; transitive walk is investigation-depth, not bootstrap).

Storage-criticality rule I'm enforcing: anything that touches WAL row layout, L1→L2 projection contract, or the determinism conformance suite is T1 regardless of how aggressive I'm trying to be elsewhere. That rule is what kept Ro-NEW-2 from being demoted on "data volume" grounds — without observation capture, the bootstrap loop's falsifiability claim is theatre.

Seven open questions for Cassima: rolling-buffer bound for capture store, `change_vectors` promotion to general post-commit outcome attachment (Roger+Laura), `tenant_id` cheap-insurance confirmation, snapshot-CLI scope at T1, R-9 tier check with Aaron, acknowledgement-stories for inherited Cairn surfaces (`topology_cache`, `execution_profiles`, `skillLinter`), and whether the WASM predicate-compilation ABI seam ships at T1 or T2. None of those change my T1 set; they each refine one edge of it.

## 2026-05-25 Round 6: Phase B Opens #4 and #5 resolved

Closed both substrate-owned Phase B contradictions in one inbox file (`decisions/inbox/roger-opens-4-and-5-2026-05-25T0130Z.md`). For #4 (7-tables UPDATE vs. backward causal slice): enumerated all seven tables from `packages/cairn/src/db/` and `agents/`, classified 6 as derived projections of `event_log` (`sessions`, `insights`, `prescriptions`, `prescriber_state`, `curator_state`, `optimization_hints`) and 1 as external filesystem mirror (`managed_artifacts.current_checksum`). Recommended killing `prescriber_state.pending_count` entirely (replace with a SQL view), wrapping all other lifecycle UPDATEs in a `withShadowEvent()` repository helper, banning raw `UPDATE` outside `db/` via a custom ESLint rule with cursor/mirror allow-list, and locking the discipline in CI with a snapshot→truncate→replay→deep-equal invariant test. Rejected SQLite triggers (would couple us to a substrate primitive in violation of v1 commitment #10) and rejected the "move everything to append-only" alternative on the evidence that the source of truth is already the event log. ~14 hours of work for Alexander in the first Crucible sprint.

For #5 (canonical serialization): picked **CBOR-dcbor + BLAKE3** (`cbor2` + `@noble/hashes/blake3`) for the new L1 read-set hash — matches Phase A's existing `blake3` columns, ~5-7µs per hash (well inside the 80µs hook-bus envelope I told Gabriel about), pure-JS so no native binding requirement. **Left DBOM on SHA-256 + JSON** — different audit consumer, committed artifacts already in production, migration not worth it. Established the per-column rule: hash algorithm fixed at column creation, never migrated; new columns BLAKE3; named legacy SHA-256 columns frozen. Specified all canonicalization edge cases (forbid bignums/tags/indefinite-length/NaN/non-NFC, definite-length only, bytewise-encoded key sort). ~9 hours of work, with Laura's A3 conformance assertion now writable without further design. Anti-anchoring rule honored on both — considered and explicitly rejected the obvious alternative for each.

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to .squad/decisions.md. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

Ready for Wave 2 implementation (computation + ranking only; runtime wiring follows in Wave 3).

## Learnings (2026-05-23 — W3-1 skillsmith-runtime scaffold)

- `packages/skillsmith-runtime/` follows the repo's standard library package shape: package.json + composite tsconfig + `src/index.ts` + `src/__tests__/` with tests excluded from TypeScript build output.
- Root workspace registration needed only a `tsconfig.json` project reference because the repo already uses the broad `packages/*` workspaces glob. `npm install` then linked the new package into `package-lock.json` automatically.
- This environment's npm rejected `workspace:*` dependency specifiers (`EUNSUPPORTEDPROTOCOL`), so the new package uses the repo's established `"*"` workspace dependency pattern instead.
- W3-1 intentionally leaves `createPrescriberOrchestrationConfig()` and `runForgePrescribe()` as throwing stubs. W3-5 will wire Cairn + Forge composition; W3-2 will make `runtime-cli` delegate into this package.

## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Unblocks all Wave 3 work items. Roger owns composition root and runtime-cli packaging.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool for manual prescriber invocation in Wave 3. Curator hook is autonomous surface; existing `forge-prescribe` CLI is manual surface. Re-open MCP tool only when concrete operator need materializes.
- **W3-D4: Curator Hook → Always-On** — Automatic invocation enabled; no opt-in flag in v1. Safety margins verified via Wave 2 E2E tests. Profile selection trigger-driven only; global fallback deferred to Wave 4.

## Learnings (2026-05-23 — Wave 3 Composition Root Audit)

- **Five composition root options evaluated** for Wave 3. Current architecture: Cairn and Forge have zero direct coupling (acyclic, port-based). Only `packages/runtime-cli/` bridges them (Wave 2 stepping stone). Audit document: `docs/wave3-composition-root-audit.md`.
- **Recommendation: Option B** (separate `@akubly/runtime` library + thin `runtime-cli` wrapper). Reasoning: Best test isolation, zero build risks, Phase 5-ready architecture. Library stays portable; CLI stays thin.
- **Do not use Option C** (inject Forge into Cairn hooks) — test coupling and build-order dependencies are unacceptable. Create a package instead.
- **Known unknowns deferred to Graham's ADR:** Profile selection strategy (all vs. only-with-vectors), hint persistence ownership, MCP tool shape for prescriber optimization, fail-open semantics on Forge failure during Curator.

## Learnings (2026-05-22 — Wave 2 W2-9 manual CLI surface)

- Wave 2's explicit composition root now lives in `packages/runtime-cli/` with bin name `forge-prescribe`; it's the one package allowed to import both `@akubly/cairn` and `@akubly/forge` without violating the package boundary.
- Local invocation pattern from the repo root is `npx forge-prescribe --skill <id> [--db <path>]`; the root workspace keeps `@akubly/runtime-cli` as a dev dependency so the bin is linked into the local toolchain after `npm install`.
- Profile loading is deterministic: try the canonical per-skill aggregate first (`granularity='per-skill', granularity_key='global'`), then fall back to a skill-scoped `global/global` profile before failing with a clean no-profile result.
- Exit semantics are simple: 0 on successful orchestration (including zero generated hints or dedup skips), 1 when no execution profile exists, and 2 for argument, database, or persistence failures.

## Learnings (2026-05-22 — Wave 2 W2-1 shared change-vector contract)

- Canonical Wave 2 change-vector contracts now live in packages/types/src/index.ts: ChangeVectorSummary, ChangeVectorProvider, NEGATIVE_IMPACT_AUTO_APPLY_GATE, and shared OptimizationCategory.
- Reconciled the two ChangeVectorSummary duplicates by taking Forge's stricter OptimizationCategory union instead of Cairn's plain string. Added autoApplyEligible?: boolean as the additive v3.1 field on the shared contract.
- Verification: root npm run build and root npm test passed before and after the change (1153-test baseline green).

## Learnings (2026-05-23 — W3-2 thin runtime-cli)

- Picked **Option A** for W3-2: `packages/skillsmith-runtime/src/index.ts` now owns the existing `runForgePrescribe()` composition flow (profile load, `SqliteChangeVectorProvider`, Forge prescribers, dedup + persistence) and `packages/runtime-cli/src/index.ts` is just a re-export facade.
- The thinnest stable CLI refactor here is **function re-export + unchanged CLI formatter**. That preserved operator-visible behavior and let the new delegation test assert identity (`runtime-cli` export === `@akubly/skillsmith-runtime` export) without introducing fragile ESM mocking around the bin entry.
- Alexander no longer needs to move manual CLI composition into `skillsmith-runtime` for W3-5; that surface is already live. W3-5 can stay focused on `createPrescriberOrchestrationConfig()` and Curator-facing factory wiring.
- After this refactor, remember to build before package tests that import `@akubly/skillsmith-runtime` by package name; those tests resolve the built workspace export (`dist/`), not the source file directly.

## Learnings (2026-05-23 — W3-6 hook injection bootstrap)

- Picked **R-Hook-A (injection)** for Curator session-start wiring: `packages/cairn/src/hooks/sessionStart.ts` now accepts an optional `PrescriberOrchestrationConfig` and forwards it to `curate()`; Cairn itself still does not import `@akubly/skillsmith-runtime`.
- The production always-on bootstrap now lives in `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, and `.github/hooks/cairn/curate.ps1` resolves that compiled script first. Laura's W3-7 integration test should enter through that skillsmith-runtime hook path, not the bare Cairn hook, so the real orchestration config is present.
- Keeping the script-level composition in the runtime package preserves W3-D1's boundary: Cairn owns hook mechanics, skillsmith-runtime owns cross-package wiring, and the PowerShell wrapper chooses the composition entrypoint.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Runtime-CLI: 5/5 passing
- Skillsmith-Runtime: 6/6 passing

**W3-1 & W3-2 shipped:** Scaffolding + thin CLI done.  
**W3-6 shipped:** Hook wiring complete — always-on bootstrap via injected config. Composition boundary preserved (cairn ↔ skillsmith-runtime acyclic).  

Wave 3 implementation delivered autonomous Curator-driven orchestration. Composition root (R2: `@akubly/skillsmith-runtime`) is the only place importing both `@akubly/cairn` and `@akubly/forge`. Phase 5-ready architecture in place.

---

## Session N: Skillsmith Harness Big-Think User Stories

**Lens:** Data, scale, integration, persistence.

### 9 Delivered Stories

**US-R-1: Cairn Pattern Mining Across Session Boundaries**  
As Aaron, query Cairn ledger to surface recurring Decision patterns, code-smell-to-fix chains, and decision reversals across 100+ sessions for Curator tuning and Forge heuristic calibration.  
*Ambition:* Accumulated telemetry becomes self-tuning feedback loop; harness learns from its own history.  
*Chambers:* Crucible, Cairn, Forge, Mirror  
*Data implication:* Append-only versioning + efficient graph traversal across millions of Primitives.

**US-R-2: GitHub Issue Auto-Coupling via Curator**  
Curator detects when a session solves/relates to open GitHub issues, auto-proposes linking (never auto-approves), leaving Mirror-check gate.  
*Ambition:* Break silo between coding-agent telemetry and project tracking; external systems as first-class signal inputs.  
*Chambers:* Crucible, Cairn, Curator, Mirror  
*Data implication:* Bidirectional webhooks + GitHub API polling; Cairn stores sync state + proposal backpressure.

**US-R-3: Cairn Replay & Variant Branching**  
Export session (or sub-chain) and replay with Alchemist variants—different model, decision tree, tool choices—to compare outcomes without reracking work.  
*Ambition:* Replay-as-first-class-primitive; harness becomes experimentation platform. Replay + variant = A/B testing coding decisions.  
*Chambers:* Cairn, Alchemist, Crucible  
*Data implication:* Portable serialization (JSON-LD/SQLite) with deterministic replay semantics + seeded RNG injection.

**US-R-4: Long-Session Drift Detection & Prescribing**  
Forge detects token-budget creep, context-window saturation, decision-reversal clustering in sessions >2hr; auto-proposes checkpoint/reset patterns.  
*Ambition:* Make invisible resource constraints visible before degrading session quality; Forge as canary.  
*Chambers:* Forge, Crucible, Cairn, Mirror  
*Data implication:* Granular token/context-window/latency tracking per turn; time-series queries on Cairn.

**US-R-5: Mirror-Backed Cross-Session Provenance**  
Mirror surfaces decision chain (why that tool chosen, which prior session influenced heuristic) across boundaries, building legible accountability for harness autonomy.  
*Ambition:* Epistemic trust-building—audit *reasoning* behind Curator proposals, not just outputs.  
*Chambers:* Mirror, Cairn, Curator  
*Data implication:* Rich metadata linking each Primitive to prior-session provenance (parent Decisions, Forge signals, Curator confidence).

**US-R-6: Scalable MCP Ecosystem as Forge Input**  
Federate tool success/failure/latency across Aaron's entire MCP ecosystem; Forge ranks tool choices; share anonymized insights with Skillsmith community.  
*Ambition:* Harness becomes collective learning engine; aggregate signal from thousands of tool invocations into shared optimization surface.  
*Chambers:* Forge, Cairn, Curator, Crucible  
*Data implication:* Multi-tenant telemetry ingestion + differential-privacy aggregation; Forge ranking scoped to cohort.

**US-R-7: Curator-Driven Code Review Automation**  
Curator detects mutations of core APIs or high-fan-out subsystems; auto-proposes async code review (MCP agents or GitHub PR); track review-to-ship latency in Cairn.  
*Ambition:* Blur autonomy and accountability; let them coexist.  
*Chambers:* Curator, Cairn, Crucible, Mirror  
*Data implication:* Parse Artifact diffs, compute module-graph impact, integrate GitHub PR API + MCP code-review servers.

**US-R-8: Multi-Tenant Cairn Export & Legal Hold**  
Export filtered Cairn views (by project, time window, Primitive type) as immutable ledger snapshots for compliance, legal hold, or sharing—without exposing private sessions.  
*Ambition:* Audit-ready from day one; data residency + portability as core, not bolted-on.  
*Chambers:* Cairn, Mirror, Crucible  
*Data implication:* Column-level access control, zero-knowledge proof of ledger integrity, deterministic export fingerprinting.

**US-R-9: Sessions as Reusable Templates**  
Mature Crucible sessions packaged as reusable templates—decision trees, tool chains, Curator tunings—spin up new projects with pre-tuned harness behavior.  
*Ambition:* Session-as-code; codify best practices by capturing harness *state itself*.  
*Chambers:* Cairn, Crucible, Alchemist, Forge  
*Data implication:* Session versioning, MCP tool dependency resolution, semantic diffing of Cairn ledgers.

---

**Older learnings archived to history-archive.md**

---

## Deliberation Round (2026-05-24)

> Roger — Platform Dev / Data & Scale lens. I just clean the floors, but the floor is the ledger and it's about to get sticky.

### Section 1 — Story Revisions

**US-R-1 Cross-Session Pattern Mining → MERGE-WITH Graham US-G-1, Laura US-L-5, Erasmus US-E-6.** One story: "Cairn as queryable corpus for pattern mining + skill recommendation." Roger owns the storage/index substrate; Laura owns the analytics; Graham owns the surfacing; Erasmus owns the auto-skill-draft. Three lenses, one feature. 🐞 Doubly compelling under agentic-debugger (pattern mining = bug class detection across sessions).

**US-R-2 GitHub Issue Auto-Coupling → REVISE.** Reframe as a **ProposalGenerator** (per Erasmus L3): `GitHubLinkProposalGenerator` emits link proposals; Router decides notify-vs-auto-apply. No special-case wiring. Drops Mirror from the chamber list (Mirror is a view, not a participant).

**US-R-3 Cairn Replay & Variant Branching → KEEP, PROMOTE TO P0, MERGE-WITH Graham US-G-7, Alexander US-A-3, Valanice US-V-1, Gabriel US-5, Erasmus US-E-2.** This is now the headline story per Aaron Insight #1. Single revised story: **"Fork-from-any-ledger-position as first-class primitive, with hermetic replay against captured observations."** I own the COW snapshot model, observation-capture table, and ref/branch metadata. 🐞🐞 Doubly compelling — this IS the agentic debugger.

**US-R-4 Long-Session Drift Detection → REVISE as ProposalGenerator.** `DriftProposalGenerator` watches a derived-query view (token/turn/reversal rates). Stops being a chamber, becomes a plugin. 🐞 Doubly compelling (drift = pre-bug signal; same code path as bisect heuristics).

**US-R-5 Cross-Session Provenance → WITHDRAW as standalone, FOLD into US-R-3.** Provenance *is* the replay graph. If R-3 lands, R-5 falls out of the same data structures. Don't pay twice.

**US-R-6 Federated MCP Telemetry → WITHDRAW from v1.** Solo-v1 scope. Keep the schema namespaced (see Tension 1) so this is additive later, not a rewrite. Re-pitch in Phase 2.

**US-R-7 Curator Code Review → REVISE as ProposalGenerator** (`HighFanoutReviewProposalGenerator`). Same pattern as R-2/R-4; collapses three of my stories into one mechanism.

**US-R-8 Multi-Tenant Export & Legal Hold → REVISE down.** Drop "multi-tenant" and "legal hold" for v1. Keep **deterministic ledger export + integrity hash**. Solo user still needs portable, verifiable snapshots — that's the substrate for R-3 fork-sharing and Erasmus US-E-10 (collaborative replay).

**US-R-9 Sessions as Templates → KEEP, REVISE.** Reframe as "snapshot-as-template": any ledger snapshot (with optional redaction proposal-generator pass) becomes a seed for a new Crucible. Cheap when the snapshot/COW substrate from R-3 exists.

**NEW STORIES:**

- **US-Ro-NEW-1: Snapshot + Compaction Cadence (the floor I'm cleaning).** As Aaron, I want Cairn to snapshot at Decision boundaries and compact append-tail to columnar storage on a background cadence, so that branching is O(1), queries don't scan from genesis, and disk doesn't grow without bound. *Owns Erasmus risk (c).* 🐞 Doubly compelling — fast bisect needs cheap snapshots.
- **US-Ro-NEW-2: Observation Capture Store (determinism backbone).** As Aaron, I want every LLM/tool/env read to write a content-addressed `(call_hash, inputs_hash) → outputs_hash` row, so that replay reads from capture and never re-calls a non-deterministic service. Backbone for R-3, Aaron Insight #3, Erasmus risk (a). 🐞🐞 The agentic-debugger lens demands this.
- **US-Ro-NEW-3: Branch/Ref Metadata + GC.** As Aaron, I want named refs over snapshots (like git branches), reachability-based GC, and a `cairn fsck` that verifies hash chain + capture-completeness, so that fork proliferation doesn't rot the store. Pairs with R-3 and Ro-NEW-1.
- **US-Ro-NEW-4: Backpressure & Quotas on Proposal Queue.** As Aaron, I want the Approval Router to apply per-generator quotas + decay, so that a noisy ProposalGenerator can't flood the queue or Cairn. Engages Erasmus risk (b) (unconstrained optimization = noise).

### Section 2 — Position on Erasmus's 4-layer stack: **PARTIAL ENDORSE**

**L1 Conductor + Ledger merged (event sourcing): ENDORSE with caveat.** Event sourcing is the right substrate — it's the only way determinism + branching + replay all fall out of one model instead of three. **Caveat:** "merged" must not mean "same process owns writes and turn execution synchronously." The write path needs a WAL + async fsync window, or every LLM token roundtrip blocks on disk. Conductor *appends*, a Ledger Writer *durably commits*.

**L2 Derived Query Layer (Salsa-style): PARTIAL.** Conceptually right, but on its own it **does not scale — it relocates the bottleneck from queries to invalidation traffic.** Every append fires invalidations across every cached projection; with 1k primitives/session and N projections you get N×1k cache-bust events. Mitigations I'd require before endorsing: (a) **snapshot-keyed cache keys** (`(snapshot_hash, query_sig)`) so only the projections crossing a snapshot boundary invalidate; (b) projections register **column-range dependencies**, not "depends on ledger"; (c) hot projections materialized as compacted tables, cold ones recomputed on demand. Without these the Query Layer is a memory leak with a nice name.

**L3 Pluggable ProposalGenerators: STRONG ENDORSE.** Collapses my R-2, R-4, R-7, and Curator/Forge/Alchemist/staleness into one extension surface. Same telemetry, same quotas (see Ro-NEW-4), same test harness. This is the single biggest architectural win on the table.

**L4 Approval + Notification Router: STRONG ENDORSE.** Single policy choke-point = single audit table = single place to enforce branching semantics (e.g. "apply to branch X but notify on branch Y"). Resolves Tension 2 cleanly.

**On Erasmus risk (c) — my wheelhouse:** Yes, the ledger *will* bottleneck and we have to plan for it now, not later. Concrete commitments I'll own:
1. Append-only WAL with batched fsync; primitive serialization ≤256 bytes typical (large payloads spilled to content-addressed blob store, ledger holds the hash).
2. Snapshot at every Decision primitive; snapshots are Merkle-rooted so branching is COW and verification is O(depth-diff).
3. Background compaction of tail → columnar (Parquet-ish) for the Query Layer to scan without touching live WAL.
4. Observation-capture is a *sibling* store, not the ledger — same content-addressing, separately compactable, separately GC'd (it's 5–10× the volume of the ledger itself; treating them as one table is how you die).

### Section 3 — Positions on the 5 Tensions

**1. Solo-v1 vs federation.** Solo-v1, full stop. But: every table gets a `tenant_id`/`namespace` column from day one (default `'local'`). Federation later is an additive read-path + auth-path concern, not a schema migration. Cheap insurance.

**2. Curator never approves.** Resolved by L4 Router. Curator becomes a ProposalGenerator + a view. I want it written down that *no chamber writes to the apply-decisions table except the Router* — single-writer invariant is the only thing standing between us and a debugging nightmare.

**3. Mirror scope creep.** Resolved — Mirror = derived view over (proposal queue ∪ ledger tail ∪ capture metadata). I stop listing it as a chamber in any of my stories.

**4. Heavyweight ops vs solo user.** Strip federation, legal hold, multi-tenant export, MCP federation, GitHub webhooks-as-infra from v1. **Keep** snapshot/compaction/capture/branching/integrity-hash — those aren't "ops," they're load-bearing for the agentic-debugger vision and they're cheaper to build now than to retrofit.

**5. Crucible vs Copilot CLI parent-child.** Crucible spawns Copilot CLI as a sub-agent; sub-agent IO must flow through the observation-capture store or replay/branching breaks at the agent boundary. This is non-negotiable from the data lens — an un-captured sub-call is a non-deterministic hole in every downstream fork.

**NEW Tension 6 — Capture cost vs throughput vs privacy.** Observation capture multiplies write volume and will eventually capture secrets (env vars, API keys in tool args). Need: (a) capture compression + dedup (content-addressing already gives us this), (b) a redaction ProposalGenerator that runs *before* commit, (c) a clear policy on whether replay across a key rotation is allowed. Flagging now so it's not a Phase-5 surprise.

### Section 4 — Cross-references

1. **Erasmus US-E-1 (Ledger Bisect) + my US-R-4 (Drift Detection)** → same engine. Bisect is "binary search over snapshots for the first bad Decision"; drift is "rolling-window anomaly over the same snapshot index." Build the snapshot index once (Ro-NEW-1) and both fall out. **Strengthens both.**
2. **Aaron Insight #1 (branching first-class) + Graham US-G-7 + Alexander US-A-3 + Valanice US-V-1 + Gabriel US-5 + Erasmus US-E-2 + my US-R-3** → six lenses converging on the same primitive. This is the consensus headline. Roger owns the substrate; others own surfaces.
3. **Erasmus US-E-7 (model-swap replay)** → **invalidates** any approach where model identity isn't in the observation-capture key. Forces my capture-store schema to include `(provider, model, version, sampling_params)` in the call hash. Good catch — would have been a v1 bug.
4. **Laura US-L-7 (lazy outcome finalization)** → strengthens Ro-NEW-1: snapshots must be append-extensible (outcomes arrive later and attach to past Decisions). Means snapshot = "ledger prefix + late-binding outcome side-table," not a frozen blob.
5. **Rosella US-Ro-5 (Alchemist skill evolution)** → demands the same fitness/outcome substrate Laura needs and the same branching substrate R-3 provides. If we don't build branching + capture, *neither* Alchemist nor Laura's eval loop is honest — they'd be measuring against non-replayable runs. **Strengthens Ro-NEW-2 doubly.**

— Roger


## 2026-05-24 Round 3: Read-set verdict (Sonny US-S-3)

# Roger — Verdict on Sonny US-S-3 (causal read-set on L1 append)

**Date:** 2026-05-24T22:33Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Whether the L1 append-record contract (v1 commitment #8) must carry a `causalReadSet` for every primitive write, as Sonny argues in US-S-3.
**Verdict (TL;DR):** **LOCK — with surgical split on population.**

I read Sonny's nine stories. US-S-3 is the one that actually touches my floor, so I'll only answer for that. Not re-litigating L1-vs-L2 or the 4-layer stack.

---

## 1. Is retrofit structurally impossible later?

Mostly yes. Two paths to retrofit and both are bad:

- **(a) Replay-and-instrument.** Re-run every historical session under a wrapper that records what each generator consulted. Requires hermetic replay to be 100% deterministic in practice (it won't be — plugin code drifts, model versions retire, content-addressed blobs may be GC'd before we ever ask the question). And it costs N× compute per "why?" query. Theoretically possible, operationally a tax we'd pay forever.
- **(b) Forked storage format.** Pre-v2 ledgers permanently lack causal slicing; v2 ledgers have it. We'd ship a debugger that quietly degrades on old sessions, which is exactly the trust-eroding lying-debugger UX Sonny rails against in US-S-5.

The forward-compatible "capture in a derived L2 projection instead" path that I went looking for **does not exist for the data Sonny actually wants**. L2 can derive structure *from what L1 recorded*; it can't synthesize edges L1 never wrote. The read-set is a property of the *write*, not of the ledger prefix.

So Sonny is right on the retrofit point. Not religiously — operationally.

## 2. What "read-set" means for the 5 primitives

There is one coherent **schema** and five primitive-specific **population rules**:

| Primitive | What the read-set captures | Source in v1 |
|---|---|---|
| **Request** | Parent Decision/Question that triggered it; prior Observations the planner saw; system-context refs | Best-effort (planner emits) |
| **Artifact** | Source primitives consulted (prior Artifacts, Observations); plugin version refs | Best-effort (generator emits) |
| **Observation** | The external-IO capture key `(call_hash, inputs_hash)`; pinned plugin version | **Already captured** by Ro-NEW-2 capture store — zero new work |
| **Decision** | Proposal IDs considered; projection refs consulted; prior Decisions cited | **Required** — Decisions are the bisect/branch anchors |
| **Question** | The trigger Decision or halt condition; minimal | Best-effort |

Common shape — typed list of `(kind, target_id, target_hash, role)` tuples. Different *who-populates-what* per primitive. One schema, primitive-specific completeness rules.

## 3. Cost analysis (I own the WAL group-commit path)

Sonny says "cheap now." I verified. He's right, given one structural choice:

**Per-append cost if the read-set is inlined in the WAL row:** ~200–800 bytes for a typical 5–20 entry set. Blows my ≤256-byte typical-row budget by 2–3×. Bad.

**Per-append cost if the read-set body is spilled to the CAS blob store and the WAL row carries only a 32-byte Merkle root:** **+32 bytes per WAL row, zero added fsync latency** (the blob write rides the same batched fsync window, no extra round-trip). Fan-out: read-set bodies are content-addressed and intern naturally — a parent Decision referenced by 200 children stores its hash 200 times in WAL rows but the *body* mentioning it dedupes in CAS.

Net verdict: with the spill design, cost is **+32 bytes/row, latency-neutral, dedup-friendly**. Cheap is correct. Inlined would be a non-starter; spilled is free.

This is the same pattern I already committed to for large payloads in my round-2 deliberation (commitment #8 sub-point 1). Read-sets are just another spilled field on the same path.

## 4. Compatibility with commitments #6 (snapshot+compaction) and #2 (hermetic replay)

- **Snapshot + compaction (#6):** No conflict. Snapshots are Merkle-rooted over WAL rows; read-set hashes are WAL row fields, so they're already in the root. Compaction folds the hash into columnar storage like any other field. Bonus: causal queries (`why?`, `who-cited-this?`) become indexable columnar scans, which is exactly the shape Cairn-bisect (US-S-6) and drift detection (US-R-4) want.
- **Hermetic replay (#2):** Subtle but clean. The read-set is an **output** of generation, not a replay input. Replay re-feeds Observations deterministically; the generator re-derives its read-set on re-execution. So replay does **not** re-feed read-sets — but the determinism conformance suite (commitment #4) gets a new assertion: *re-derived read-set must match recorded read-set*. That's a free correctness check Laura will probably want.
- **One edge case worth naming:** if a read-set entry refers to an L2 projection value (per US-S-4 retroactive projections), the entry must carry the projection-**version** ID, not just the query result, or replay will assert against a moving target. Cheap to specify now.

## 5. The 8th proposal-schema field (`causalReadSet`) — Laura's field vs. my contract

**Same data, two capture points.** Not two concepts, one concept on a pipeline:

1. **L3 ProposalGenerator declares** `causalReadSet` in its proposal (Laura's schema field).
2. **L4 approval router validates** the declaration (do the referenced primitives exist? are projection-version IDs resolvable?). Validation is a precondition for approval; a malformed read-set is a rejected proposal, not a committed garbage row.
3. **L1 commits** the validated read-set into the WAL row alongside the primitive payload (my contract). Body spills to CAS; hash goes in the WAL row.

Integration argument: Laura's field is the **producer contract** ("generators must declare what they read"); my field is the **storage contract** ("committed rows must carry the declaration's hash"). They are the same bytes, captured once at L3, validated at L4, durably committed at L1. Anyone trying to make them diverge is wrong.

For primitives that don't flow through a generator (raw Observation writes from the capture store), L1 synthesizes the read-set directly from the capture row — same schema, different population site.

## 6. Verdict: **LOCK with surgical scope split**

### Lock now (v1):
- **Schema slot.** Every WAL row has a nullable `causal_read_set_hash: blake3?` field. Reserved, named, in the row layout.
- **Body format.** Versioned CAS blob, typed entry list as in §2. Frozen for v1.
- **Wiring.** L3 proposal schema carries `causalReadSet`; L4 validates it; L1 commits the hash. End-to-end path exists day one.

### Split on population (v1 → v2):
- **REQUIRED + populated in v1:** Observation (free — already in capture store), Decision (the bisect/branch/why? targets).
- **BEST-EFFORT in v1, REQUIRED in v2:** Request, Artifact, Question. Slot exists, format is canonical, generators populate when they can. L1 accepts `NULL` without complaint in v1 and rejects `NULL` in v2.
- **`cairn fsck` (Ro-NEW-3) gains a new check:** report read-set completeness per primitive kind. Migration to v2 is "raise the bar from warn to error per kind" — no ledger rewrite, no schema migration, just a config flip.

### Why split rather than full-lock or full-defer:

- Sonny's load-bearing concern is **"structurally impossible to retrofit."** The schema slot, format, and wiring address that fully. Once the slot exists and the bytes are addressable, "fill it in for kind X" is a generator-side change, not a ledger rewrite.
- Full-lock-all-kinds-populated would block v1 on every generator implementing exhaustive read-set tracking, which is real work and adds bug surface across L3 right when L3 is still settling. We'd ship late for a property we can adopt incrementally.
- Full-defer is the failure mode Sonny correctly identifies — the slot never gets added, the contract calcifies without it, and v2 is a fork.

### Append-record schema, v1 (revised):

```
WalRecord {
  seq:                  u64,
  ts_ns:                u64,
  parent_seq:           u64,
  primitive_kind:       u8,        // Request|Artifact|Observation|Decision|Question
  primitive_id:         ULID,
  payload_hash:         blake3,    // body in CAS
  causal_read_set_hash: blake3?,   // NEW — body in CAS, schema below
  proposal_id:          ULID?,     // L3 proposal that produced this (if any)
  approval_id:          ULID?,     // L4 verdict (if any)
  prev_root:            blake3,    // chain
}

ReadSetBody (CAS blob, content-addressed, v1):
{
  version: 1,
  entries: [
    {
      kind:        PrimRef | ProjectionRef | ObservationRef | PluginRef,
      target_id:   ULID | ProjectionVersionId | CaptureKey | PluginVersionId,
      target_hash: blake3,
      role:        Input | Context | Trigger | Constraint
    },
    ...
  ]
}
```

Row-cost delta: **+32 bytes/row** when populated, **0 bytes** when NULL (use an optional/varlen encoding so unpopulated kinds don't pay). Fsync neutral. Compaction-friendly (single columnar field, hash-typed, intern-friendly). Snapshot-Merkle-compatible (it's just another row field).

### What I need from the team to land this:
- **Laura:** add `causalReadSet?: ReadSetEntry[]` to the proposal schema; required for Observation/Decision proposals, optional for the other three in v1. The entry shape above is the canonical form.
- **Stelios (L2):** projection identity must include a stable **version** ID so a `ProjectionRef` entry survives projection-definition edits. Already a US-S-2/US-S-4 ask; this just makes it load-bearing.
- **Alexander (L4):** approval validation step rejects proposals whose declared read-set references unknown/unresolvable IDs. Small extension to the pre-commit hook he already needs for US-S-1 (predicate-eval breakpoints).
- **Erasmus:** add a determinism-suite assertion: re-derived read-set on replay must equal recorded read-set for primitive kinds where it's populated. Free correctness signal.

I'll own the WAL row layout, the CAS spill path, and the `cairn fsck` read-set-completeness check. None of this changes my round-2 commitments on snapshot cadence or compaction; it just adds one nullable hash column and one CAS blob kind.

---

## Plain-text summary for the coordinator

**Verdict: LOCK, with a surgical split on population.**

Sonny is right that the read-set is structurally impossible to retrofit cleanly — the only retrofit paths are replay-and-instrument (forever-tax on compute and on perfect determinism) or a forked v2 storage format (silently-degraded debugger on old ledgers). He's also right that it's cheap now: with the body spilled to the content-addressed blob store and only a 32-byte hash in the WAL row, the per-append cost is +32 bytes and zero added fsync latency. Lock the schema slot, the body format, and the L3→L4→L1 wiring in v1; require population for Observation (already free via Ro-NEW-2 capture) and Decision (the bisect/why? anchors); leave Request/Artifact/Question as best-effort in v1 and promote to required in v2 via a `cairn fsck` config flip — no ledger rewrite. The proposal-schema field Laura owns and the append-contract field I own are the **same bytes** captured at different points on one pipeline; L3 declares, L4 validates, L1 commits the hash. Endorsed.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## 2026-05-24 Round 3 (continued): Pre-commit hook bus — L1 verdict

# Roger — Verdict on Alexander's pre-commit hook bus (re US-S-1 / US-S-4 / US-S-9)

**Date:** 2026-05-24T23:00Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Where the shared pre-commit hook bus sits relative to WAL group-commit, what pause does to a batch, whether the verdict is recorded, predicate cost on the hot path, interaction with `causal_read_set_hash`.
**Verdict (TL;DR):** **ENDORSE with refinements.** The bus belongs *inside* the group-commit window but *outside* the fsync barrier, runs per-row over the staged batch, and is itself a recorded WAL field. Predicates must be pre-registered/compiled. Read-set predicates are fine — and actually the killer feature.

The read-set verdict from earlier today is locked, not re-opened. This is only about the hook bus and how it touches my floor.

---

## 1. Where the bus sits relative to group-commit

There are four candidate insertion points. Three of them are wrong. Walking through them so the choice is on the record:

| Option | What it means | Verdict |
|---|---|---|
| (a) Before the row is staged into the batch | L3 emits → bus runs → row joins batch or doesn't | **Wrong.** Predicates can't see batch siblings or the committed read-set; pause loses ordering with concurrent emitters. |
| (b) Per-row, *inside* the batch staging loop, *before* the fsync barrier | Each candidate row is appended to the in-memory batch, hook bus evaluates against the row + its `causal_read_set_hash`, verdict is recorded on the row, then we either fsync or split | **Right.** This is what I'm endorsing. |
| (c) Once per batch, after staging, before fsync | One bus call sees the whole batch | **Wrong.** Pause semantics get fuzzy ("which row paused us?"), and predicate authors lose per-row identity. |
| (d) After fsync, before ack | Bus runs on durable rows | **Wrong.** Pause-after-durable is not a pre-commit hook, it's a post-commit notifier. Different primitive. Useful, but not what Alexander asked for. |

**The contract: option (b), per-row, pre-fsync, inside the group-commit window.**

Concretely the group-commit path becomes:

```
for row in candidate_batch:
    row.causal_read_set_hash = compute_read_set(row)    # already locked
    verdict = hook_bus.evaluate(row, read_set_view)     # NEW
    row.hook_verdict = verdict                          # recorded on the row
    if verdict == pause:
        seal_batch_through(row.seq)                     # see §2
        break
fsync(sealed_batch)
ack(sealed_batch)
if paused: hand control to L4 router
```

**Throughput claim.** Group-commit throughput is dominated by fsync, not by the per-row in-memory work. The bus runs in the same memory window where I'm already computing read-set hashes and chaining `prev_root`. Adding a dispatch per row, with predicates indexed by `primitive_kind` so non-matching kinds cost one hashmap lookup, is **noise on the fsync-bound path**. I am not giving up throughput for this, provided §4 holds.

What I am **not** doing is serializing the bus across batches. Multiple writers stage into multiple batches concurrently today; the bus is per-batch-local because predicates only see the row + its read-set view, not other in-flight batches. Cross-batch invariants are not the bus's job — that's L4 / L2.

---

## 2. Pause mid-batch — the transactional contract (owns commitment #8)

The scenario: 100-row batch, row 5 trips a `pause` verdict. Three plausible behaviors, only one of which doesn't lie:

# Roger — History Archive

Archived entries summarizing Wave 2–4 composition root development and integration work prior to Wave 5-6.

## Older Entries

- Wave 1: Canonical ChangeVectorSummary in @akubly/types with OptimizationCategory union
- Wave 2: Wave 2/3 split decision, composition root architecture analysis (5 options)
- Wave 3: W3-1 skillsmith-runtime scaffolding, W3-2 thin runtime-cli refactor, W3-6 hook injection, all 7 items shipped
- Wave 4: W4-1/W4-2 atomicity + CairnEvents, integration branch resolution with conflict handling
- Wave 5 Integration: Merge strategy finalization, all conflicts resolved, root npm run build + npm test green

**Final Wave 4/Wave 5 Status:**
- Cairn: 597/597 tests passing
- Forge: 644/647 tests passing (3 pre-existing todo)
- All workspaces green before Wave 5-6 kickoff

**Full details:** See commit history and decision documents in .squad/decisions.md

**Key pattern established:** Two-server MCP design (Cairn server + Forge MCP server) avoids circular dependency. Composition root (skillsmith-runtime) is the only cross-package boundary.
# Roger — History (Summarized)

## Summary

**Total entries:** 5 major consultations spanning Phase 4.5 telemetry + Phase 4.6 change vectors + Round 2 brain system consulting + Round 2 roster proposal + Eureka M2-M3 integration notes

| Date | Event | Status |
|------|-------|--------|
| 2026-05-02 | Phase 4.5 Telemetry Learnings | ✅ Completed |
| 2026-05-01 | Persona Review Fixes (F1-F7) | ✅ Completed |
| 2026-05-03–2026-05-22 | Brain System Consulting & Architecture Analysis (Round 1–2) | ✅ Completed |
| 2026-05-22 | Brain Project Roster Proposal (Platform Engineer Core Role) | 🟡 Proposal pending Aaron |
| 2026-05-28 | Eureka M2-M3 integration (§40 monorepo seams + composite-ranker) | ✅ M3 baseline preserved |

**Key themes:**
- Telemetry aggregation: meanFromMeta() fix, convergence floor, signal component surface
- Bridge event contracts: EVENT_MAP alignment, COLLECTOR_BRIDGE_EVENTS constant, contract test
- Brain system: Evolved from "extend Curator" → "new package monorepo" → "new repo with Platform Engineer Phase 1–3 lead"
- Brain roster: Proposed Platform Engineer (core) role for Brain Phase 1–3 infrastructure
- Eureka M2-M3: §40 monorepo integration seams hold. M3 composite-ranker inline implementation (FR-2 formula per §30 §1.2 canonical). tsc --build clean. Cairn/Forge/runtime/eureka baselines preserved.

**Recent decision:** Roger proposes Platform Engineer role for Brain Phase 1–3 infrastructure. Eureka M2-M3 validates monorepo substrate is sound (no new coupling risks discovered).

---

## Core Context

**Load-bearing platform decisions for Eureka v1:**
- **Integration seam (§40 owner):** Roger owns cross-package integration, M0 monorepo merge (5-day sprint + 4-hour spike first), rollback to npm packages + private registry if exceeded
- **Reconciliation playbook:** Weekly cron for `eureka reconcile`; telemetry counter `eureka_reconcile_divergence_count`; written decision tree for divergence response (Forge replay vs manual INSERT vs delete orphaned row)
- **Auto-flush feature flag:** Opt-in auto-flush-on-session-end for v1 (not deferred); actionable error UX text with §60 message style
- **Kernel-extraction canary:** M3 success criterion: move packages/eureka/src/learning/ → packages/learning-kernel/src/, count edits; success = < 10 edits. Validates extraction-ready contract.
- **Partial-restore test (M4):** Delete one DB at a time; verify graceful degradation. session_id is opaque metadata (NFR-6), not traversable FK.
- **Load-test SLO (M4):** 1000 facts, measure P50/P95/P99; P95 < 500ms = shipped SLO; P95 > 500ms = ship-blocker. Telemetry histogram `eureka_recall_latency_ms`.
- **Dep-direction lint (M1):** Cross-package import guard moved to M1 acceptance criteria (from M5). Auto-check via ESLint rule.
- **Cycle 2 findings landed:** I1 (lint), I5 (auto-flush), I6 (M0 5-day), I8 (reconciliation), I9 (load test), M3 (canary), M4 (restore test) — 7 findings in §40 (+23.7% size)

**Dependencies:** Eureka design package locked (2026-05-28). M0 time-box starts immediately; integration is critical path for M1.

---

**Milestone:** R6 opened — Eureka source-reading unlocked; trio (Genesta/Crispin/Edgar) reconciled v3 PRD against Cairn/Forge substrate.

**Key outcomes:**
- Genesta (B+ verdict): PRD v3 stands with v3.1 patch (4 targeted fixes)
- Crispin (Path A recommended): clean-slate Eureka over Cairn extension
- Edgar (Kernel extraction): ~70% mechanical infra exists; recommend shared learning-kernel package

**Your involvement:** Advisory roles on boundaries/UX (2-3 hrs/week contribution rate). Edgar recommends Eureka extract Cairn's sweep/ranker/trust into shared learning-kernel package.

**Decision gates pending Aaron's direction:**
1. Vector search scope (in/out for v1)?
2. Architectural path (A clean-slate or B extension)?
3. Learning-kernel extraction (now or defer)?
4. v3 patch or v4 rewrite?

**Next:** Cassima on deck for v3.1 or v4 intake pending Aaron's architectural direction.

---

## Archive (Summarized)

### Phase 4.5 Telemetry + Persona Review Fixes (2026-05-01 to 2026-05-02)

**Scope:** Telemetry module hardening, 7 persona review findings fixed.

**Key fixes:**
- F1: Weighted mean aggregation (prevent overwrite of prior history)
- F2: Convergence floor (fire on first success signal, not end-of-session)
- F4: Event contract alignment (COLLECTOR_BRIDGE_EVENTS constant + contract test)
- F5: Streaming percentile sketch (100-bucket histogram for [0,1] drift range)
- F6a: Per-signal component means on ExecutionProfile.signals
- F7: Silent error logging in sink
- F11: typeof guards on payloads (toolName string, numeric guards)

**Architecture patterns:**
- Shared symbol enums for cross-module contracts (bridge ↔ collectors)
- Streaming quantile sketches for bounded metrics
- weightedMean() helper prevents deflation-toward-zero failure mode
- Fail-open principle: telemetry must never block session execution

**Files touched:** 7 core files + 3 test files. Tests: +24 new. Build: 1012 passing (cairn 478 + forge 534).

**Lessons:** When collector contract spans modules, enumerate shared symbols + enforce via contract test. Type-level coupling insufficient for JSON boundaries.

---

**Downstream:** Prescribers now have signal-level granularity for targeting specific drift drivers (e.g., toolEntropy vs contextBloat).
📌 Team update (2026-05-26T22:27:00Z): **Wave 5 integration merge strategy finalized** — W5-1/W5-3/W5-4/W5-2 ordered; all conflicts resolved; root npm run build + npm test green (Cairn 597/597, Forge 644/647). W5 phase-4.6/wave-5-integration ready for PR — Scribe
📌 **Wave 6 integrated onto phase-4.6/wave-6 (2026-05-26)** — W5-6 forge-metrics CLI standalone subcommand preserved as commit 871a492. Integration complete with W5-5 (Rosella) + #17 (Laura). Tests 648/651 green. Awaiting Aaron's /review-cycle. — Scribe
📌 Team update (2026-05-23T21:20:00Z): **Wave 4 W4-1 & W4-2 complete** — insertHintIfNew atomicity (migration 013, partial UNIQUE index, BEGIN IMMEDIATE) + CairnEvent extensions (hint_state_transition, profile_bump events, system session). All unit tests passing; integration Groups A & B both 5/5+3/3. 584 Cairn tests green. — Scribe

# Roger — History

**Role:** Composition root architecture (R2: @akubly/skillsmith-runtime), Wave 2-4 integration, atomicity + observability fixes

**Wave 5 Status:** All inter-dependencies resolved on phase-4.6/wave-5-integration. Cairn 597/597 + Forge 644/647 tests passing. Root build green.

**Wave 4 Work (W4-1 & W4-2):**
- W4-1: insertHintIfNew atomicity via migration 013 (partial UNIQUE index) + BEGIN IMMEDIATE transaction
- W4-2: CairnEvent extensions (hint_state_transition, profile_bump events, __system__ session)

**Wave 3 Complete:** Composition root delivered (option R2). Hook wiring done. Per-skill orchestration live.

**Learnings summarized to history-archive.md**
- Events logged to `__system__` session created via `ensureSystemSession()` helper
- Payload structure: `{skill_id, hint_id/profile_id, from_state/to_state or bump_kind, granularity, timestamp}`
- Added 5 unit tests covering event emission scenarios
- Files: `packages/cairn/src/db/optimizationHints.ts`, `packages/cairn/src/db/executionProfiles.ts`, `packages/cairn/src/db/sessions.ts`, `packages/cairn/src/__tests__/cairnEvents.test.ts`
- **Gotcha:** Event emission must occur AFTER transaction commits, not inside the transaction, or events won't be persisted

**Test Results:** 584 cairn tests passing, full suite green. Migration number bumped from 012 to 013.

## 2026-05-23: 📌 Wave 4 Complete — W4-1 & W4-2 Implemented

**Status:** ✅ Both work items shipped on phase-4.6/wave-4 branch

**W4-1: insertHintIfNew Atomicity (COMPLETE)**
- Migration 013 with partial UNIQUE index on (skill_id, source, category) WHERE status IN ('pending', 'accepted', 'deferred')
- `db.transaction().immediate()` wrapper prevents concurrent duplicates
- 3/3 concurrent insertion tests passing
- Files: 013-hint-atomicity.ts, optimizationHints.ts, schema.ts (registered), 3 new tests

**W4-2: CairnEvent Extensions (COMPLETE)**
- `hint_state_transition` event on insert + status updates (skill_id, hint_id, from_state, to_state, timestamp)
- `profile_bump` event on create/update (skill_id, profile_id, bump_kind, granularity, timestamp)
- `ensureSystemSession()` helper creates __system__ session for system-level events
- 5/5 observability tests passing (event emission, forward-compat, transactional integrity)
- **Gotcha found and fixed:** Event emission inside transaction loses events; moved emission outside transaction scope
- Files: optimizationHints.ts, executionProfiles.ts, sessions.ts, 5 new tests in cairnEvents.test.ts

**Integration Test Outcomes:**
- Group A (W4-1 atomicity): 3/3 ✅
- Group B (W4-2 observability): 5/5 ✅
- Total W4-1 & W4-2: 8/8 integration passing

**Schema Version:** 012 → 013 (full migration path)

**Cross-Team Coordination Notes:**
- W4-3 (Rosella's forceRegenerate) depends on W4-1 atomicity; expire-then-insert semantics compatible with partial UNIQUE index
- W4-4 (Laura's integration tests) validates all three work items; test infrastructure gaps identified in Groups C/D (not implementation bugs)

---

**Older learnings archived to history-archive.md**

### W5-1 Session-Kind Separation (2026-05-25)

- Migration 014 adds `sessions.session_kind` (`user` default, `system` for `__system__` backfill) instead of renaming repo keys; smallest compatible split that preserves existing session rows.
- New Cairn APIs: `getMostRecentUserSession()` and `getActiveUserSession(repoKey)` return only active `session_kind='user'` rows; `getMostRecentActiveSession()` remains generic for internal/system-aware callers.
- `ensureSystemSession()` now creates/finds system-kind rows so CairnEvents (`hint_state_transition`, `profile_bump`) stay on internal observability sessions.
- Four MCP fallback call sites now route through `getUserSessionForMcpFallback()`: `resolve_prescription` apply session attribution, `lint_skill` telemetry, `test_skill` scenario telemetry, and `test_skill` direct validation telemetry.
- Gotcha: deterministic tests must manually set `started_at` because SQLite `datetime('now')` has second-level precision, so creation order alone can tie.
### W5-2 DB explicit-db hard-cut (2026-05-25)

- Hard-cut Cairn DB public helpers to require an explicit `db: Database.Database` first parameter; removed deprecated/default-db overloads including `logEventWithDefaultDb` and `getExecutionProfileWithDb`.
- Functions changed: 78 exported Cairn DB functions across 14 DB modules.
- Call-site threading touched 1,165 db-threading lines across 32 consumer/test files (Cairn agents/hooks/MCP, Forge wave integration tests, runtime-cli tests, skillsmith-runtime tests).
- Structural consumer changes: `curate()` now captures one db handle and passes it into detector helpers; MCP server caches the initialized db handle per process; session-start stale-session helper takes db explicitly; prescriber/curator/session-state private helpers now receive db from their entry point. Most other consumers were trivial `db` threading.
- Validation: `npm run build` clean. Direct workspace Vitest runs green: Cairn 587/587, Forge 644/647 with 3 todo, runtime-cli 8/8, skillsmith-runtime 8/8. Root `npm test` was attempted but the wrapped npm/vitest process stalled in this shared CLI TTY; direct workspace Vitest runs passed from package directories after persona-review fixes.

## 2026-05-26: Phase 4.6 Wave 5 integration stack

- Built `phase-4.6/wave-5-integration` from `main` with W5-1 → W5-3 → W5-4 → W5-2. Small independent deltas landed first; the explicit DB hard-cut landed last so new W5-1/W5-3/W5-4 APIs could be adapted once.
- Merge hotspots: W5-4 only conflicted in `.squad/identity/now.md`; kept `main`'s completed Wave 5 state. W5-2 conflicted in migration 012 tests, `db/sessions.ts`, MCP session fallback call sites, and skillsmith-runtime profile loading.
- Resolution pattern: preserve W5-1 user-vs-system session semantics, but thread W5-2's explicit `db` handle through `getActiveUserSession()`, `getMostRecentUserSession()`, and `getUserSessionForMcpFallback()`. Preserve W5-3's tier chain and W5-4's staleness attenuation, but call W5-2's `getExecutionProfile(db, ...)` API.
- Scribe's “644/647” was Forge's 644 passing plus 3 pre-existing `it.todo` placeholders, not failing tests. The only integration failure found was a stale runtime-cli test seeding a W5-3 per-model profile without W5-2's explicit db parameter; fixed in `forgePrescribe.test.ts`.
- Final validation: `npm run build` clean and root `npm test` green across workspaces: Cairn 597/597, Forge 644 passed + 3 todo of 647, runtime-cli 9/9, skillsmith-runtime 24/24. If it compiles and ships, the janitor takes the win.

## Learnings (2026-05-26 — W5-6 forge-metrics CLI)

### CLI sub-command pattern (runtime-cli)
- Each CLI sub-command gets its own entry point file (e.g. `src/forge-metrics.ts`) with a `main(argv)` function and a `bin` entry in `package.json`. Tests cover `main()` via `loadMetrics()` + formatter functions; the entry point itself stays thin.
- `parseArgs` from `node:util` handles arg parsing. `strict: true` + `allowPositionals: false` is the standard config — crashes on unknown flags, which is correct for operator tools.
- The `--format` flag pattern (JSON default, `--format table` opt-in) is clean for dual-mode operator tools. Formatters are pure functions on a typed input snapshot — easy to unit test.

### JSON schema design (SkillMetrics)
- Top-level nullable fields (`staleness`, `confidence`, `autoApplyEligible`) collapse to `null` when no profile is found. This gives a stable schema: callers always see the same top-level keys.
- The "found: boolean" discriminated union on `profile` is clean for both JSON and TypeScript narrowing.
- `recentPrescriberRuns: null` means "event type not present (W5-5 not landed)"; `[]` means "event type exists but no runs for this skill". Two distinct null states encoded intentionally.

### Integration with W5-3 (tier fallback) and W5-4 (staleness attenuation)
- Call `loadExecutionProfile(db, skillId, { fallbackPolicy: 'full-chain' })` — that's the operator path, same as `runForgePrescribe`. The returned `source` field reports which tier matched.
- The returned `profile.confidence` is already attenuated if stale. `profile.staleness.stale` tells you whether attenuation was applied. Raw confidence is always `1.0` for DB profiles (no raw stored).
- `getSessionsSinceInstall()` reads from `prescriber_state.sessions_since_install`, NOT from `SELECT COUNT(*) FROM sessions`. Tests must use `UPDATE prescriber_state SET sessions_since_install = N WHERE id = 1` to seed staleness conditions, not `createSession()`.

### Defensive W5-5 coding pattern
- Query `prescriber_run` events with `json_extract(payload, '$.skillId') = ?`. If no events of that type exist anywhere, return `null` (event type not landed). If they exist but none for this skill, return `[]`.
- Wrap the entire query in try/catch and degrade to `null` on any error — metrics reads should never crash the command.


## 2026-05-03: Curator Overlap Analysis — Agentic Brain System

**Context:** Aaron considering whether a new "agentic brain/memory/thinking/learning system" belongs in Cairn repo vs separate repo. Asked me to analyze overlap with Curator.

**What I discovered:**
- The Curator is already 70% of what Aaron describes — it's a pattern-detection → insight-generation → prescription → feedback learning pipeline
- Phase 4.6 (just landed) added change_vectors — the Curator already **learns from feedback** by computing metric deltas for applied prescriptions and using those to scale future confidence
- The "missing 30%" is LLM-augmented reasoning, cross-session correlations, and contextual prescription generation — these are **extensions** of existing Curator capabilities, not a separate system
- The boundary between Curator and a new "agentic brain" is not clean:
  - Same event stream (`event_log`)
  - Same insight storage (`insights` table)
  - Same prescription contract (8-state lifecycle, human-in-the-loop, Apply Engine)
  - Same learning feedback (`change_vectors`, `execution_profiles`)
- Forking creates two competing knowledge stores with overlapping lifecycles — concept drift, user confusion, maintenance burden, learning fragmentation

**My position:** The new system belongs HERE, extending the Curator pipeline.

**Recommended path:**
- Add LLM reasoning as a fourth detector in `curator.ts` (alongside recurring errors, sequences, skip frequency)
- Trigger LLM when static detectors produce low-confidence insights or when correlations suggest causality
- Store reasoning traces in `insights.reasoning_trace` (optional JSON column, migration 013)
- Extend Prescriber with LLM-generated advice (fallback to static templates when unavailable)
- Reuse change_vectors for learning feedback — works uniformly regardless of detection method

**Phase plan suggestion:**
- Phase 8: LLM-augmented pattern detection (extend Curator)
- Phase 9: Contextual prescription generation (extend Prescriber)
- Phase 10: Cross-session reasoning + long-term memory consolidation (new Consolidator agent, same `insights` table)

**Key insight:** The Curator is not "just" a static rule engine. Phase 4.6 already made it a learning system (observe → measure → adapt). The fork/extend decision is really "do we believe pattern detection and agentic reasoning are the same problem?" I do. Extend, don't fork.

**File written:** `.squad/decisions/inbox/roger-curator-overlap-analysis.md` (detailed 10-section analysis)

**Key file paths reviewed:**
- `packages/cairn/src/agents/curator.ts` — 550-line pipeline, cursor-based, transactional, 3 pattern detectors + change vector sweep
- `packages/cairn/src/agents/prescriber.ts` — closes observe→act loop, 8-state prescription lifecycle
- `packages/cairn/src/db/changeVectors.ts` — CRUD for learning feedback (Phase 4.6)
- `packages/cairn/src/db/insights.ts` — pattern storage with evidence + confidence + lifecycle
- `packages/cairn/src/mcp/server.ts` — 10 tools exposing knowledge base to conversations


## 2026-05-03: Agentic Brain System — Position Reversal

**Context:** Aaron provided brain dump for new "agentic brain/memory/thinking/learning system" with TIERS (agent/subagent, organizational, project, user), KINDS (practical, semantic, syntactic, linguistic, symbolic, philosophical), PROPERTIES (recency, trustworthiness, plasticity), ACTIVITIES (recall, integrate, meditate, explore, ideate, dream, decide, pray, re-evaluate), REPRESENTATION (graph, cross-ref, markdown), and ACQUISITION (codebase exploration, periodic discovery, journaling).

**My prior position (2026-05-03 morning):** Extend the Curator — argued it's "already 70% of what Aaron describes" based on pattern-detection pipeline overlap.

**My revised position (2026-05-03 afternoon):** **NEW PACKAGE (`packages/mem`) in this repo.**

**Why I flipped:**

1. **TIERS problem:** Curator is project-scoped (one tier). The new system spans agent/organizational/project/user tiers (multi-scope). Extending Curator to multi-tier turns it into a universal memory router — different package.

2. **KINDS problem:** Curator's `insights` table is optimized for event-triggered practical patterns (recurring errors, sequences, skip frequency). Aaron's KINDS include linguistic (phrasing patterns), symbolic (call graphs), philosophical (judgment guidelines) — these require different evidence types (corpus stats, AST diffs, guideline text vs event IDs). Schema conflict → polyglot knowledge store → different package.

3. **ACTIVITIES problem:** Curator is a reactive event processor (cursor-based batch processing on hook triggers). Aaron's ACTIVITIES include dream/meditate/ideate/pray — proactive agents that run on schedules or prompts, reason over aggregated state. Architectural mismatch → new agentic runtime → different package.

4. **User-memory tier:** Curator is per-project. User memory is cross-project, cwd-aware. Separate concern → lives in `packages/mem/src/tiers/user.ts`, Cairn becomes project-tier delegate.

**What I got wrong in my prior analysis:**
- Conflated "pattern detection" (one slice) with "universal memory" (six-dimensional system).
- Assumed single-tier scope (project-only) when Aaron meant multi-tier (agent/organizational/project/user).
- Underestimated KINDS heterogeneity (practical vs linguistic vs symbolic vs philosophical have different evidence/consumers/lifecycles).
- Missed proactive vs reactive distinction (dream/meditate aren't event-triggered, they're scheduled/prompt-driven).

**Recommended architecture:**
- **NEW PACKAGE:** `packages/mem` in this repo (monorepo benefits, shared build/types).
- **Tier delegation:** `packages/mem/src/tiers/project.ts` wraps Cairn Curator (reads insights, surfaces via multi-tier router). Cairn stays unchanged.
- **Kinds federation:** Practical/syntactic patterns delegate to Cairn. Semantic/linguistic/symbolic/philosophical live natively in `packages/mem`.
- **Activities runtime:** Reactive activities (recall, re-evaluate) hook into Cairn's event stream. Proactive activities (dream, meditate, ideate, explore) run on schedules/prompts in new agentic runtime (`packages/mem/src/activities/index.ts`).

**Key insight:** Curator is **one specialized agent** within a broader memory system, not the system itself. Extending it to ALL tiers + ALL kinds + ALL activities breaks package boundaries. The new system is a **meta-layer** that federates Cairn (project-tier practical patterns) along with other tiers/kinds/activities.

**File written:** `.squad/decisions/inbox/roger-brain-refined.md` (detailed 8-section analysis with architecture options, Q&A on Aaron's four specific questions, and appendix on what I got wrong).

**Next steps if Aaron accepts:**
- Phase 8: Create `packages/mem` structure (tiers/kinds/activities/properties/representation/acquisition).
- Phase 8.1: Implement project-tier delegation (wrap Cairn Curator).
- Phase 8.2: Implement user-tier memory (cwd-aware routing).
- Phase 9: Implement semantic/linguistic KINDS (corpus analysis).
- Phase 10: Implement meditate/dream ACTIVITIES (proactive consolidation + speculative reasoning).

**Lesson learned:** When Aaron says "brain dump," he's describing a **system architecture**, not a feature request. My job is to map that architecture to packages/repos, not force-fit it into the nearest existing code. Bottom-up analysis (what does Curator do today?) misses top-down constraints (what does the full system require?).



## Consultation: Brain/Memory System Repo Placement (Round 2)

**Date:** 2026-05-22  
**Session:** Refined recommendation following Aaron's brain dump clarification  
**Artifact:** .squad/orchestration-log/2026-05-22T20-25-51-roger-*.md  
**Merged into:** .squad/decisions.md as "Open Question: Brain/Memory/Learning System"

### Summary

Participated in Round 2 consulting on repo placement for new agentic brain/memory/learning system. Analyzed Aaron's five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) and refined position from Round 1.

**Outcome:** Recommendation documented in .squad/orchestration-log/2026-05-22T20-25-51-roger-brain-refined.md. All deliberation merged to decisions.md for Aaron's consideration.

---

## 2026-05-23: Self-Fit Assessment — Brain/Memory Project Squad Readiness

**Prompt:** Aaron asked: does this squad think they're the *right* squad for the brain project? Be candid about where Cairn knowledge transfers vs doesn't, whether I'm energized by the scope, and whether I'd stay on the squad.

**Context:** Prior analysis debated repo placement (new repo vs monorepo). This session is different — not about architecture, but about personal expertise fit and energy alignment.

### My Honest Answer

**Infrastructure layers (TIERS, PROPERTIES, REPRESENTATION, ACQUISITION):** I'm ready. 9/10 confidence.  
**Cognitive layers (ACTIVITIES like dream/meditate/pray; KINDS like linguistic/symbolic):** I'm not ready. 2/10 confidence.

**What I'd do:** Own Phase 1–3 infrastructure. Bring in specialists for reasoning + knowledge modeling. Hand off after Phase 3 if brain becomes separate deployment.

### Where Cairn Transfers (HIGH VALUE)

1. **Event stream observability** → Multi-tier federation (cursor-based processing scales; contract patterns reusable)
2. **Prescriber lifecycle** → Acquisition orchestration (8-state human-in-the-loop model maps to memory capture)
3. **SQLite + Git locality** → Foundation for Phases 1–3 (proven deployment; monorepo patterns reusable)
4. **Confidence + evidence tracking** → PROPERTIES (trustworthiness, recency, plasticity analog to confidence/evidence/last_fired)

### Where Cairn Does NOT Transfer (LOW VALUE)

1. **Pattern detection logic** — Cairn detects operational events (recurring errors, sequences); brain needs AST patterns, corpus analysis, guideline extraction. Evidence types incompatible. Transfer: ~0%.
2. **ACTIVITIES (dream/meditate/pray/ideate)** — Cairn is reactive event processor; brain needs proactive reasoning loops. Runtime models incompatible. Transfer: ~0%.
3. **Linguistic/Symbolic/Philosophical KINDS** — Requires expertise in NLP + domain modeling + epistemology. I have none. Transfer: ~0%.
4. **Knowledge-graph representation** — Graphs, embeddings, semantic traversal outside my sweet spot. Transfer: ~5% (can scaffold, need specialist to optimize).

### Energy Breakdown

| Layer | Energy Level | Why |
|-------|--------------|-----|
| TIERS (federation/routing) | 🟢 HIGH | Bread and butter. |
| PROPERTIES (metrics/signals) | 🟢 HIGH | Core platform skills. |
| REPRESENTATION (SQLite/Git) | 🟢 HIGH | Databases/versioning/deployment. |
| ACQUISITION (crawlers/hooks) | 🟡 MEDIUM | Automation + API design. Doable. |
| ACTIVITIES (recall/re-evaluate) | 🟡 MEDIUM | Straightforward querying. Mechanical. |
| ACTIVITIES (dream/meditate/pray) | 🔴 LOW | Agentic reasoning. Unfamiliar. Not energized. |
| KINDS (semantic/linguistic/symbolic) | 🔴 LOW | Domain modeling beyond expertise. |

### Would I Stay on the Squad?

**Yes, with scoped role (Phase 1–3).**

**Option A (Preferred):** Platform Lead for infrastructure layers. Own TIERS, PROPERTIES, REPRESENTATION, ACQUISITION. Delegate KINDS + reasoning ACTIVITIES to specialists. Timeline: 6–9 weeks.

**Option B (Monorepo):** Ongoing platform engineer, same scope, longer commitment. Interface with Cairn for project-tier delegation.

**Option C (Separate repo + backend service):** Hand off after Phase 3. Brain's domain shifts to org-tier federation with Postgres/Azure Functions — not my focus.

### Specialists I'd Want Alongside

1. **LLM-Augmented Reasoning Engineer** — dream/meditate/pray/ideate ACTIVITIES
2. **Knowledge Ontology Specialist** (linguistics + domain modeling) — semantic/linguistic/symbolic/philosophical KINDS
3. **Graph DB Specialist** (optional, if representation scales) — graph traversal optimization
4. **Testing Automation Person** (nice to have) — acquisition pipeline regression suites

### Where My Expertise Is Sharpest

Cairn is my sweet spot (operational event processing, pattern detection, prescriber lifecycle, change vectors, SQLite/Git). Brain's infrastructure is a natural extension. Brain's cognitive layers require different expertise — and I'm honest enough to hand off rather than half-step.

### Key Insight

**Platform engineering is about building systems other people think in. The brain project is about what people think in. Related but different jobs.**

I'm the right person for the foundation. But bring in specialists for the cognition.

**File written:** `.squad/decisions/inbox/roger-self-fit.md` (detailed 10-section self-assessment with energy breakdown, options, and honest readiness evaluation)

---

## Brain Project — Proposed Role (2026-05-22)

**Status:** Proposal pending Aaron approval

**Role:** Platform Engineer (core) for Brain project

**Allocation:** Borrow from Cairn — 60/40 split during Phase 1 (primary Cairn, secondary Brain)

**Mandate:** Storage layer, federation protocol, tier resolution

**Deliverables Phase 1:**
- User tier installed and persisting
- Project tier federating to user

**Coordination model:**
- Scoped 1-week sprints with defined deliverables
- Handoff docs: what was done, what's next, who owns it
- No interleaving within a day
- Escalation to Aaron if Brain work threatens Cairn timeline (Brain defers)

**Sync ceremonies:**
- Weekly cross-team standup with Brain Lead + Cairn Lead
- Biweekly boundary review

**Notes:** Roger recommends new repo (separate deployment boundary for org-tier federation); pragmatic to extract later if monorepo prototype needed first. Confidence in Platform role high; Brain needs epistemology/learning systems specialists for the cognitive layer.

---

## 2026-05-27: London-School TDD Strategy Authored + OQ-1 Monorepo Resolution

**Event:** London-school TDD spine delivered and reviewed  
**Impact:** Substrate ownership clarified; implementation runway clear  

**For Roger's context:**
- **OQ-1 RESOLVED:** Aaron chose Option A (monorepo). `mem/` and `harness/` merging into `@akubly/` with shared `packages/{cairn,forge,types}`. Substrate topology is now fixed — no coordination overhead from multiple repos. Platform Engineer role (your proposed Eureka Phase 1–3 infrastructure lead) can now design with monorepo as baseline.
- **TDD Spine Live:** `docs/eureka/sections/55-tdd-strategy.md` authored and approved. London-school outside-in approach ties Eureka learning systems cleanly to §30's algorithmic seams. Edgar's three post-review improvements to §30 (ClockProvider, latency targets, CuratorStore signature) are non-blocking but valuable.
- **Coordination Model Still Open:** Weekly standup + biweekly boundary review remain the plan. Monorepo resolves the "separate deployment boundary" question — shared substrate is now a feature, not a problem.

**Next:** Brain infrastructure design can build on stable, unified shared types. Phase 1 (tiers, properties, representation) has clear mocking boundaries via §55 TDD strategy.


---

## Eureka Project Kickoff (2026-05-22)

**Date:** 2026-05-22  
**Event:** Aaron approved project name + hired 3 specialists; monorepo placement decided  
**New Colleagues:** Genesta (Cognitive Systems Lead), Crispin (Knowledge Representation), Edgar (Learning Systems)  
**Role:** Platform Engineer (infrastructure) for Eureka Phase 1–3; continue Cairn as primary

### Context & Rationale

Aaron decided: Build Eureka in `packages/eureka/` (monorepo), not separate repo.
- Round 2 deliberation: Roger recommended NEW PACKAGE (pragmatic, extract later if needed)
- Round 3 self-assessment: Roger identified expertise gaps (cognitive science, epistemology, agentic loops) and recommended hiring specialists
- ✅ New hires fill those gaps, allowing Roger's infrastructure expertise to be leveraged without overextending into cognitive domains

### Impact on Roger

**Primary focus:** Continue Cairn platform work (federation, observability, prescriber lifecycle)

**Secondary focus:** Eureka infrastructure (Phases 1–3) — at reduced allocation from initial proposal
- Original proposal: 60/40 split (Cairn/Brain)
- Revised (post-hiring): Ad-hoc consultation on tier federation + back-pressure; primary commitment stays Cairn

**Cross-project responsibility:**
- Design project-tier delegation: How does `packages/eureka/` wrap Cairn Curator for practical-pattern tiers?
- Advise on federation protocol: Tier resolution, conflict handling, cwd-aware routing
- Coordinate Eureka ↔ Cairn integration seams

**Key context:**
- Genesta (Cognitive Systems Lead) handles epistemology + agentic reasoning loops (the gap Roger identified)
- Crispin (Knowledge Representation Specialist) handles KINDS ontology + graph design (the gap Roger identified)
- Edgar (Learning Systems Specialist) handles ACTIVITIES + meta-learning (the gap Roger identified)
- Roger's infrastructure strengths (tiers, properties, representation, acquisition) now team expertise, not solo responsibility

---

### 2026-05-27: TD Re-Pass Batch Complete — §40 DI Audit + Recommendation Application

**Event:** Part of Aaron's 6-agent TD re-pass batch (audits + follow-up executions across §20/§30/§40/§50).

**Phase 1 — Audit §40 DI Seams vs §55 London-School TDD Mock Boundaries:**
- **Task:** Verify that §40's package wiring makes the 5 TDD mock boundaries (storage, time, RNG, model, network) injectable for test-time substitution
- **Scope:** Check if dependency injection pattern (db-first-param, factory, etc.) aligns with §55's mock contract seams
- **Verdict:** ✅ MINOR WIRING CHANGES NEEDED
- **Key findings:** 80% injectable; 2 seams need explicit extraction (time, RNG), 1 correctly deferred (model), 2 fully prepared (storage, network)
- **Deliverable:** `.squad/decisions/inbox/roger-40-di-seam-audit-vs-55.md` (full audit report with code examples)
- **Status:** ✅ PHASE 1 COMPLETE

**Phase 2 — Apply §40 Recommendations After Aaron Approval:**
- **Task:** Execute all DI wiring recommendations to align §40 with §55 TDD boundaries
- **Recommendations applied:**
  1. ✅ Added §40.5.4 "Time Injection for Determinism" — documents `ClockProvider` interface, default-parameter injection pattern, production/mock implementations
  2. ✅ Added §40.5.5 "RNG Injection (v1.5 Prep)" — documents `RandomSource` interface, stub implementation, proactively extracted for future stochastic activities (meditate, contemplate)
  3. ✅ Updated §40.5.1 embedding paragraph — added forward-documentation for v1.5 `EmbeddingService` network boundary
  4. ✅ Flagged §40.8.3 model boundary — added note for v1.5 `ModelProvider` seam when LLM calls land
- **Content growth:** +19.8% (2 new subsections ~100-120 lines each, 2 inline notes)
- **Deliverable:** Edited `docs/eureka/sections/40-integration.md` (+19.8%)
- **Status:** ✅ PHASE 2 COMPLETE

**Key Insights:**
1. **DI seams != heavyweight DI containers.** §40's `db: Database.Database` first-param pattern IS dependency injection without framework overhead. Default parameters (`clock: ClockProvider = systemClock`) are the right granularity for pure-function collaborators.
2. **Defer != ignore.** §40 correctly punted LLM/embedding mocking to v1.5, but documenting seams NOW saves v1.5 from hardwiring mistakes.
3. **Monorepo simplifies test dependencies.** With `cairn` as `devDependency`, Eureka tests can import better-sqlite3 wrappers directly — impossible with npm-published packages.
4. **Time injection enables determinism without mocking frameworks.** Just two interfaces (`ClockProvider`, `SystemClock` production impl) turn non-deterministic time-dependent code into testable pure functions.

**Coordination:** 
- Coordinated with Edgar's §30 Time Injection section — single canonical `ClockProvider` pattern documented in both §30 and §40
- Roger's §40.5.4 and Edgar's §30 §2.4 are complementary (§40 wiring, §30 usage) — verified no conflicts

**Confidence:** HIGH — audit validated DI boundaries are sound; v1 can hardcode `Date.now()` and extract to `ClockProvider` in refactor phase (red/green/refactor allows this).

**Deliverables:**
- 2 orchestration logs (Phase 1 audit + Phase 2 apply)
- Updated `.squad/agents/roger/history.md` (this entry)

**Timeline:** Complete. §40 wiring guide now comprehensive for v1 implementation and forward-compatible for v1.5 seams.

**Team Update:** §40 DI wiring patterns are now explicitly documented for storage, time, RNG, model, and network boundaries. Future code should use these patterns for injectable test seams. Time injection is available now (v1); RNG/model/network are extraction-ready for v1.5.


### 2026-05-29: M4 GREEN + M5 Anchor (Cross-Agent Update)

**Context:** Laura (M4 RED) + Edgar (M4 GREEN) completed ClockProvider seam for recency decay. Edgar's 2-line change in `recall()` wires injected clock (§55 §1.2 discipline). All tests GREEN: Eureka 3/3, Cairn 609, Forge 644+3todo.

**M5 Anchor:** Trust score updates from feedback events (§30 §2.3). Events drive mutations: corroboration +0.10, contradiction -0.10, user correction ±0.30. **Laura owns M5 RED.**

**Your attention:** ClockProvider is live in M4 GREEN. §40.5.4 time injection pattern validated in practice. M5 will add feedback event channels (observability seam). No blocker to parallel work; M5 allows 2-week planning cycle for event schema.

**What Roger owns:** Storage layer, federation protocol, SQLite + Git infrastructure  
**What specialists own:** Cognitive layers, ontology design, reasoning loops  
**Interface:** Clean TIERS abstraction — Eureka calls `project_tier.get()` which delegates to Cairn; Eureka manages user/organizational tiers separately

---

## 2026-05-26: Eureka Integration Section (§40)

**Context:** Aaron requested integration section for Eureka technical design. Co-authoring with Graham (overview), Genesta (activity model), Crispin (representation), Edgar (runtime), Laura (test strategy).

**Scope:** Package topology, Cairn/Forge integration, persistence layer, tier-aware storage, API surface, Crucible boundary.

**Deliverable:** `docs/eureka/sections/40-integration.md` (580 lines, 26 KB)

### Key Decisions Documented

**Package topology:**
- Dependency arrows: `eureka → types`, no runtime coupling to Cairn/Forge
- Workspace dependencies use `"*"` (not `workspace:*` — npm rejects it)
- No circular deps — Eureka is consumer, never producer

**Cairn integration:**
- Session identity unification (R8): Shared `SessionId` brand from `@akubly/types`
- Lens framing: Cairn owns lifecycle, Eureka owns epistemology
- Manual ingestion in v1 (`eureka ingest-session`), automatic in v1.5
- Separate migrations — Eureka does NOT touch Cairn's `knowledge.db`
- DB-injection pattern reused (explicit `db: Database.Database` first param)

**Forge integration:**
- Decision ingestion (Path 2, FR-14) — lossy projection from `DecisionRecord` to `DecisionPayload`
- No prescriber ownership in v1 — Eureka is data source only
- Manual CLI in v1 (`eureka ingest-decisions --session <uuid>`)

**Persistence:**
- SQLite + FTS5 for v1 (BM25 lexical search)
- Reserved `embedding_vector BLOB` column (nullable, unpopulated) for v1.5 forward compat
- Why not graph DB? Projection-on-read, not storage. SQLite gives joins + FTS5.
- Why not LMDB? Lacks relational joins and FTS5.

**Tier storage:**
- Agent tier fully wired in v1 (`~/.cairn/eureka-agent.db`)
- User/project tiers stub (throws on writes, empty reads)
- Graceful degradation — fan-out code stays tier-agnostic

**API surface:**
- Library: `recall`, `integrate`, `decide`, `commit`, `retire`, `evict`
- CLI: `eureka ingest-session`, `eureka ingest-decisions`, `eureka recall`
- Fail-open principle — recall failures return empty result set, never block agent

**Crucible boundary:**
- High-risk overlap: Crucible's L1 WAL vs Cairn's `event_log`
- Name collision: Crucible `Decision` vs Forge `DecisionRecord` vs Eureka `DecisionPayload`
- Dependency blocker: Crucible assumes Forge in `harness`, actually in `mem`
- v1 stance: Separate at v1, integrate at v1.5 (Cassima recommendation)

### Open Questions Surfaced

1. **Cairn/Forge repo ownership** — `mem`, `harness`, or third repo? Blocks Crucible and Eureka v1.
2. **Crucible `Decision` rename** — Adopt `ChoiceEvent` to avoid collision?
3. **Event-log federation** — Merge into Cairn or stay separate?
4. **User/project tier activation** — When? Blocked on Squad migration timeline.
5. **Prescriber extraction** — Should Forge prescribers move to Crucible at v1.5?
6. **Automatic ingestion** — v1 or v1.5? Edgar recommends v1 before dogfood.
7. **Cross-tier normalization** — Parallel fan-out + global score norm, or sequential early-exit?

### Risk Register

7 risks documented with likelihood/impact/mitigation:
- R1: Crucible dependency blocker (HIGH/HIGH)
- R2: BM25 recall failure on keyword-disjoint queries (CERTAIN/MEDIUM — known v1 gap)
- R3: User/project tier activation delay (MEDIUM/LOW)
- R4: Session-identity coupling drift (LOW/MEDIUM — ESLint guardrail mitigates)
- R5: Ingestion lag (HIGH if manual / MEDIUM impact)
- R6: Migration schema drift (LOW/HIGH — separate `schema_version` tables mitigate)

### Learnings

### 2026-05-27: §40 DI Seam Audit vs §55

**Task:** Audit §40 (integration/package wiring) against §55's mock boundaries (storage, time, RNG, model, network).

**Verdict:** MINOR WIRING CHANGES NEEDED — 80% injectable, two seams need explicit extraction (time via `ClockProvider`, RNG via `RandomSource`), three already correct (storage, model-deferred, network-prepared).

**Key DI patterns learned:**

1. **First-param injection is sufficient DI** — §40's `db: Database.Database` first-param pattern is injectable without heavyweight DI containers. Tests pass `:memory:` DB; production passes file-backed DB. No need for constructor injection or service locators when function signatures expose dependencies.

2. **Default parameters = prod-ready DI** — Pattern `computeRecencyScore(lastAccessed: number, clock: ClockProvider = systemClock)` makes prod code zero-ceremony (`computeRecencyScore(timestamp)` just works) while tests inject mocks (`computeRecencyScore(timestamp, mockClock)`). This is Edgar's queued `ClockProvider` pattern from decisions.md — applies equally to RNG.

3. **Document seams even when deferred** — §40 correctly defers embeddings (v1.5) but should document the `EmbeddingService` interface *now* so v1.5 doesn't hardwire `fetch()` calls. "Reserved column" (schema) + "interface extraction path" (docs) = complete forward compatibility.

4. **Monorepo enables test-fixture sharing** — With Cairn as `devDependency`, Eureka tests import its `better-sqlite3` wrappers and migration helpers directly. No duplication. This is impossible with npm-published packages (can't make sqlite3 a devDep of a published package without bloating consumers).

**Outcome:** Inbox file `.squad/decisions/inbox/roger-40-di-seam-audit-vs-55.md` documents minor changes (two new subsections for ClockProvider/RandomSource, two inline notes for model/network). Non-blocking; estimated 30 min to apply. All changes are additive clarifications, not redesigns.

---

**What I got right:**
- **DB-injection pattern reuse** — Cairn's explicit-db-param pattern is testable and composable. Adopted for Eureka storage layer.
- **Forward-compat schema design** — `embedding_vector BLOB` column (nullable, unpopulated) lets v1.5 add embeddings without breaking v1 readers. Same pattern as Cairn's reserved columns.
- **Fail-open principle** — Telemetry must never block session execution (Cairn Phase 4.5 lesson). Applied to Eureka recall — failures return empty result set.
- **Tier-agnostic fan-out** — Unwired tiers return empty reads (not errors). Lets fan-out code stay uniform; no v1/v1.5 conditional logic.

**Where I added value:**
- **Risk register** — Named the hard parts plainly (Crucible dependency blocker, BM25 keyword-disjoint gap, ingestion lag). No sugarcoating.
- **Trade-offs surfaced** — SQLite vs graph DB, BM25 vs embeddings, manual vs automatic ingestion. Rationale for each choice.
- **Open questions escalated** — 7 questions Aaron must answer (repo ownership, event-log federation, tier activation). No false certainty.

**What surprised me:**
- **Crucible overlap depth** — The Cassima impact analysis revealed backward dependency (Forge in `mem`, Crucible assumes `harness`). Both PRDs ship v1 in parallel but neither acknowledges cross-repo coupling. This is a BLOCKER, not a nice-to-have.
- **Session-identity R8 unification** — Aaron's directive to share `SessionId` brand relaxed the "isolated by design" framing from v4. Genesta's 5 guardrails (lens framing, ESLint boundary, no runtime traversal) prevent coupling drift. Pragmatic compromise.
- **BM25 honesty in PRD** — Genesta + Cassima explicitly partitioned eval suite into "overlap" (ship gate) and "disjoint" (transparency only) buckets. This is the right bar for v1 — high precision on lexically-overlapping queries, documented gap on disjoint. No pretending BM25 is semantic.

**Platform engineering heuristic reinforced:**
> "Storage technology choice is about what you DON'T need, not what you might want later."

SQLite + FTS5 is enough for v1. Graph DB / LMDB / vector store deferred until v1.5 demand signal proves we need them. Start simple, harden from data.

**File written:** `docs/eureka/sections/40-integration.md` (580 lines, 12 sections, 7 open questions, 6 risks)

### 2026-05-27: §40 DI Seam Execution (Roger Audit Applied)

**Task:** Apply §40 DI-seam audit recommendations directly to `docs/eureka/sections/40-integration.md` per Aaron's approval.

**Changes applied:**
1. **Added §40.6 "Testability Seams"** — New section documenting three DI seams (ClockProvider, RandomSource, default-parameter pattern)
2. **Cross-referenced §30 §2.4** — Referenced Edgar's `ClockProvider` interface definition (NOT redefined; §30 owns the interface, §40 documents the wiring)
3. **Defined `RandomSource` interface** — §30 doesn't define RNG seam, so §40 defines it as a cross-package wiring concern (v1.5 prep)
4. **Documented default-parameter injection pattern** — Extracted from §55 §2.5 Laura's `recall({ query }, { agentStore, userStore })` style
5. **Confirmed db-first-param as canonical** — §40.2.4 already documented; added cross-ref to §55 §1.2 mock seam rubric
6. **Added cross-references** — §40.2.4 → §55 §1.2, §40.6.1 → §30 §2.4, §40.8.3 → audit model-boundary note, §40.9.2 → §55 §3.3
7. **Renumbered sections** — §40.6 insertion pushed remaining sections down (§40.7–§40.13)

**Length impact:** 666 → 798 lines (19.8% increase, slightly over 15% target but all substantive content required by audit).

**Learnings:**

1. **Cross-section coordination works** — Edgar landed §30 §2.4 `ClockProvider` independently; I referenced it without collision. Section-ownership discipline (§30 = algorithm interfaces, §40 = wiring, §55 = TDD workflow) prevented duplication.

2. **Default-parameter injection is the right granularity for pure-function collaborators** — Heavy DI containers (Spring, InversifyJS) are overkill for stateless collaborators like `ClockProvider` or `RandomSource`. Default parameters give tests injection points without ceremony for production code.

3. **"Document seams even when deferred" applies to v1.5 prep** — `RandomSource` interface defined in v1 even though stochastic activities (`meditate`, `contemplate`) throw `NotImplementedError`. This prevents v1.5 from hardwiring `Math.random()` calls when they land.

4. **Audit-then-apply workflow scales** — Roger wrote audit `.squad/decisions/inbox/roger-40-di-seam-audit-vs-55.md` (proposal), Aaron approved, Roger executed (this task). Separation of analysis from execution lets Aaron review tradeoffs before committing to changes.

**What changed from audit:**
- Audit estimated 30 lines; actual was 132 lines (§40.6 grew from bullets to worked examples with code blocks).
- Audit recommended "one-sentence note" for model/network boundaries; actual included code examples for clarity.
- Length overage (19.8% vs 15% target) due to complete code examples in §40.6.2 and §40.6.3 (DeterministicRandom implementation, tier fan-out table).

**Deviations from audit:** None. Edgar's §30 §2.4 `ClockProvider` matches audit recommendation exactly (Unix epoch seconds, `SystemClock` / `MockClock` implementations). No conflicts discovered.

**File updated:** `docs/eureka/sections/40-integration.md` (666 → 798 lines, +§40.6 Testability Seams)


## 2026-05-28: Cycle 2 Fix Wave — 7 Persona-Review Findings

**Context:** Persona-review cycle 1 surfaced 19 findings (all accepted by Aaron). Canonical resolutions in `.squad/decisions/inbox/squad-cycle1-canon.md`. Roger assigned 7 findings spanning milestones, reconciliation, feature flags, and load-test wiring.

**Task:** Apply I1, I5, I6, I8, I9, M3, M4 canonical resolutions to `docs/eureka/sections/40-integration.md`.

**Changes applied:**

1. **I1 — Dep-direction lint to M1:** Moved dependency-direction guardrail from M5 to M1 milestone. Added ESLint `no-restricted-imports` rule specification in §40.9.2 M1 deliverable. Documented enforcement mechanism (ESLint custom rule or `no-restricted-imports` pattern match) so Cairn/Forge cannot import from `@akubly/eureka`.

2. **I5 — Auto-flush feature flag (v1 opt-in):** Added feature flag `eureka.auto_flush_on_session_end: boolean = false` to §40.2.2. Documented Forge runtime hook integration point (`packages/forge/src/runtime/session.ts`). Wrote actionable error UX text for "Memory not captured — fix steps" with 3-step recovery path (manual CLI, enable flag, telemetry counter). Cross-referenced §60 for full error-message patterns.

3. **I6 — M0 monorepo merge time-box:** Documented M0 5-day budget in new §40.9.1. Added 4-hour scaffolding spike (pnpm workspace + turborepo + one cross-package import). Specified rollback procedure: revert to ADR-0002 Option C (npm packages with private registry) if M0 exceeds budget. Rationale: time-box prevents sunk-cost fallacy on messy package boundaries.

4. **I8 — Bridge reconciliation (cron + telemetry + runbook):** Created new §40.10 "Bridge Reconciliation" with 4 subsections:
   - §40.10.1: `eureka reconcile` CLI command spec
   - §40.10.2: Weekly cron schedule (Sunday 02:00 UTC), telemetry counter `eureka_reconcile_divergence_count`
   - §40.10.3: Written decision tree for divergence response (4 scenarios: missing in Eureka, orphaned in Eureka, mutable-field drift, immutable-field drift). Each scenario has root cause, fix command, and prevention guidance.
   - §40.10.4: v1.5 design note (push-based event-stream comparison instead of pull-audit)

5. **I9 — M4 load-test wiring:** Added load-test deliverable to §40.9.3 M4 milestone. Spec: 1000 facts (NFR-2 target), measure P50/P95/P99 recall latency, ship-blocker if P95 > 500ms. Production telemetry: histogram `eureka_recall_latency_ms`. Cross-referenced I9 canonical SLO from §30 (Edgar owns the SLO statement; §40 owns the cross-package test wiring).

6. **M3 — Kernel-extraction canary at M5:** Added §40.9.4 M5 deliverable: literally move `packages/eureka/src/learning/` to `packages/learning-kernel/src/` on throwaway branch, run tests, count required edits. Success criterion: edit count < 10 (extraction is "mechanical"). Defined what counts as edit (interface changes, test rewrites) vs what doesn't (import-path replacements). If canary fails, document blockers and defer to v1.5.

7. **M4 — Partial-restore test at M4:** Added partial-restore test to §40.9.3 M4 milestone. Two scenarios: delete Eureka DB (keep Cairn), delete Cairn DB (keep Eureka). Success criteria: no crashes, graceful degradation, empty result sets, opaque session_id handling. Implementation note (NFR-6): `session_id` is opaque metadata, not traversable FK — Eureka MUST NOT query Cairn sessions table at runtime.

**Section reorganization:**
- Created new §40.9 "Milestone Deliverables & Acceptance" (4 subsections: M0, M1, M4, M5)
- Created new §40.10 "Bridge Reconciliation" (4 subsections: command, schedule, runbook, v1.5 note)
- Renumbered existing §40.9–§40.13 → §40.11–§40.15
- Cross-referenced §30 (Edgar) for 500ms SLO statement, §60 for error UX patterns, ADR-0002 for rollback option

**Length impact:** 798 → 987 lines (23.7% increase, over 20% target but unavoidable with 7 substantive findings requiring milestones + runbook + feature-flag prose).

**Learnings:**

1. **Milestone ownership discipline:** §40 owns cross-package wiring deliverables (lint rules, build topology, load tests, reconciliation cron). Activity-specific logic (BM25 ranker, trust decay, recency formula) lives in §10/§30/§55. This prevents section bloat — §40 documents *when* and *how* integration happens, not *what* algorithms run.

2. **Runbooks are first-class documentation:** I8's divergence-response decision tree (4 scenarios × [root cause + fix + prevention]) is more valuable than the reconciliation algorithm itself. Operators need playbooks, not just CLI commands. The runbook is 60 lines; the algorithm spec is 15 lines.

3. **Time-boxing prevents sunk-cost traps:** I6's "5-day budget + 4-hour spike + rollback procedure" is a hedge against monorepo unknowns. Documenting the rollback (Option C: private npm registry) before starting M0 gives the team permission to bail if integration is messier than expected. This is anti-heroics engineering.

4. **Feature flags need error UX, not just boolean config:** I5's auto-flush flag isn't just `boolean = false` — it needs actionable error text when disabled and forgotten. The 3-step recovery path (manual CLI, enable flag, telemetry counter) turns a "memory not captured" failure into a learning moment for operators.

5. **Canaries validate design claims:** M3's kernel-extraction throwaway branch is a design validator, not a v1 deliverable. "Edit count < 10" operationalizes "kernel-shaped" (PRD §1 claim). If the canary fails, v1 ships anyway but v1.5 extraction risk is known. This is lightweight architecture decision record (ADR) via experiment.

6. **Graceful degradation requires opaque-metadata discipline:** M4's partial-restore test validates NFR-6 (graceful degradation) by literally deleting databases and asserting no crashes. The implementation note "`session_id` is opaque metadata, not traversable FK" prevents future coupling drift — if Eureka ever queries Cairn's `sessions` table at runtime, the partial-restore test catches it.

7. **Cross-section coordination via canon works:** All 7 findings referenced other sections (§30 for SLO, §60 for UX, ADR-0002 for rollback, §55 for test patterns) without collision. The canon document (squad-cycle1-canon.md) acted as the coordination point — I didn't need to read Edgar's or Laura's changes to know what to cross-reference.

**Length overage justification:**
- 7 findings (heaviest load of any agent in cycle 2)
- 2 new top-level sections (§40.9 milestones + §40.10 reconciliation)
- Runbook prose unavoidable (4 divergence scenarios × decision tree)
- All content substantive (no fluff; every line serves acceptance criteria or operational guidance)

**File updated:** `docs/eureka/sections/40-integration.md` (798 → 987 lines, +§40.9 Milestones, +§40.10 Reconciliation)




---

## 2026-05-28: Eureka M1 First Red Test — Integration Cascade Entry

**Event:** Laura (Tester) delivered M1 first red test per §55 London-school TDD. @akubly/eureka package created. SessionId branded type in @akubly/types.

**RED Status:** AC-1.3 seed test established. FactStore.search() mock seam locked. tsconfig.json updated with eureka project reference.

**Impact for Roger:** M0 monorepo merge (5-day sprint + 4-hour spike first per your timeline) critical path for M1→M2 transition. Cross-package import guards (ESLint enforcement) now accepted in M1 criteria. Dep-direction lint must be ready before M2 implementations begin.

**Key integration points ready:** SessionId branded primitive in @akubly/types (shared across Cairn/Eureka per R8 amendment). Integration seam (§40) dependencies crystal clear from M1 test seam.

**Baseline preserved:** Cairn 26/26 ✅, Forge 24/24 ✅, tsc --build ✅.

---

📌 **2026-05-29: Eureka Cycle 1 Review — F8 (§40 doc alignment) completed** — Code panel finding F8 (technical specification update). Updated §40 (Data Persistence) documentation to reflect M4 required (non-optional) ClockProvider injection decision. Added callout: ClockProvider required in all RecallDeps; storage layer must support timestamp-indexed queries for recency ranking; synchronous clock reads required (<1ms latency). Updated Cairn test fixtures to reflect required clock assumption. Commit 342bea4. — Scribe


---

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.


📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §10 + §15 shipped. All Phase 1 errata closed (2a/2b/12b/5). Cross-section R2-6 sync (Rosella ↔ Roger) CLOSED. PluginVersionLock format finalized. Phase 3 unblocked. — Scribe

## 2026-05-28: CTD Phase 4 — CALL/RET semantics + Scheduler-tier WAL readiness (§3 + §10 amendments)

**Context:** Aaron locked three Phase 4 UIS decisions per team weigh-in. My scope: locks #2 (CALL/RET) + #3 (Scheduler tier — substrate implications only; Gabriel owns §5 Router/Scheduler boundary).

**§3 amendments (L1 WAL Substrate):**
- **New §3.3.4 — CALL/RET sub-kind fields on `TaskStart`/`TaskEnd`.** Additive body fields under §6.5 evolution rule: `invocationId` (session-unique CALL/RET pair id), `parentInvocationId` (lexical-stack parent, NULL at top level), `returnTo: EventId` on `task_end` (zero-walk RET link to matching `task_start`), optional `callDepth` (derivable, kept for §13 `bt` UX single-row read). Recommended derivation `BLAKE3(sessionId || taskId || commitOffset)` — LOCKING deferred to Graham/Aaron (open question). Mis-nesting is a durable `monotonic_violation`-class projection alert; row still commits. `parentInvocationId` is distinct from `envelope.causalParentId` (lexical-stack vs causal-spawn edges coexist).
- **New §3.3.5 — Scheduler-emitted Decisions.** Pure substrate-readiness declaration: scheduler Decisions traverse `AppendProtocol.append` indistinguishably from model Decisions. No new column; `scheduler_*` discriminator is an additive optional body field. Did NOT enumerate sub-kinds (Gabriel's §5/§17 scope).
- **§3.17 ripple bullets** extended for §5 (Scheduler is first-class L1 producer) and §10 (invocation-stack projection).

**§10 amendments (Session + Branching):**
- **§10.6 rewrite** — sub-task model updated with CALL/RET body shape; L2 bracket-discipline validator pinned; `fork_origin.body.openTaskStack` superseded by richer `openInvocationStack: Array<{ taskId, invocationId, parentInvocationId, callDepth }>` (legacy shape preserved as compat-tolerated).
- **New §10.6.1 — Stack-frame reconstruction (derived view).** Pseudocode `ReconstructInvocationStack(sessionId, N)`: linear scan, seeded from `fork_origin` for forks. Closes Laura Q2 CALL/RET well-bracketed-nesting gap — property is now a single-scan PBT over the WAL trace. Sonny's §13 `bt` UX feeds off this. Replay equality of reconstructed stack is part of §11.6 oracle.
- **New §10.6.2 — Sub-task vs sub-session distinction.** Authoritative 10-row comparison table (identity, storage, lineage edge, concurrency, plugin snapshot, bootstrap, hash chain, backtrace, use case, replay containment). Rule of thumb: blocking + same epistemic line → sub-task; alternative trajectory + independently inspectable → fork. The two compose.
- **§10.9 acceptance signals** + cross-refs extended (§5 Router/Scheduler, §13 CLI `bt`).

### Learnings

**Sub-kind body fields > new WAL columns for primitive evolution.** Phase 4 added invocation-frame structure (`invocationId`, `parentInvocationId`, `returnTo`, `callDepth`) without changing one byte of the WAL row schema. The §6.5 additive-evolution rule plus per-payload CBOR body means the substrate absorbs new structural fields by letting them ride inside `primitive.primitivePayload` (reachable via `payloadHash` like any other field). When the field genuinely needs row-prefix locality (cheap predicate scans without body fetch), promote to a `flags` bit (e.g. `taskBoundary`); otherwise leave it in the body. The CALL/RET fields are body-field candidates because they're consumed by stack reconstruction (already a body-walking projection), not by hot-path predicate scans.

**Two-edge discipline pays off again.** `envelope.causalParentId` (causal-spawn) and `body.parentInvocationId` (lexical-stack) are distinct edges that answer distinct queries — exactly mirroring §6.4's `parentId` (structural production) vs `causalParentId` (sub-task spawn) split. The discipline is: never collapse semantically-distinct edges into one field even if they "usually align." Replay debuggers and PBT generators want to traverse each independently. Future temptation will be to drop `parentInvocationId` because "you can recompute it from `causalParentId` plus stack reconstruction" — resist it; the redundancy is a structural witness, not duplication.

**Substrate-readiness declarations are a first-class artifact.** §3.3.5 doesn't spec the Scheduler — it declares L1 ready for it. This is the right pattern when (a) another section owns the actual spec and (b) you need to publish "the substrate will not need to change" as an architectural guarantee. The shape of such a declaration: name the path through existing surfaces (`AppendProtocol.append`), name the discriminator location (body field, not row column), name the published guarantee ("regardless of who emitted it"), and explicitly disclaim what is NOT in scope. Gabriel can now design §5 without round-tripping with me on storage shape; if his design requires substrate change, that becomes a NEW Phase 4 finding rather than a surprise.

**Mis-nesting as durable signal, not exception.** Append-only discipline says: a `task_end` that doesn't match the top-of-stack `invocationId` still commits. The violation surfaces as an Aperture attention-tier event, not a thrown exception. This is the same pattern as §3.10 `monotonic_violation` — the WAL never refuses a row for structural-validator reasons; it records the discrepancy as another row and lets investigation (L5) decide what it means. Phase 4 added the third instance of this pattern; it's now a substrate idiom worth naming in §17.

📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe

## 2026-05-30: CLI Review — childSid Collision Hybrid Design (Round 2)

**Context:** Aaron requested user-story framing for childSid collision design. Rosella delivered hybrid option (user chooses fresh/resume at fork time, interactive prompt on collision). Roger reviewed for CLI consistency.

**Verdict: APPROVE-WITH-CONDITIONS.** Verb/flag shape is consistent with §13.1 taxonomy. Help text mirrors `defer` conventions. `--disambiguator` flag from Option B is **redundant** (timestamp-variant preimage in `--fresh` handles collision prevention). Interactive prompt mechanics need tightening: TTY detection, `--no-interactive` flag, exit codes (0, 1, 2, 130).

**Deliverables:**
- Review document: `.squad/decisions/inbox/roger-review-childsid-hybrid.md` (16.4 KB, comprehensive analysis)
- Draft help text for `crucible fork --help` (mirrors §13 conventions + L1 semantics)
- Condition #1: Keep both flag-based `--resume` and verb-based `crucible session resume <childSid>` (orthogonal use cases)
- Condition #2: Spec TTY detection + exit codes (Table: 0=success, 1=generic error, 2=non-TTY needs flag, 130=user cancel)

**Key design points:**
- `crucible fork --at <offset>` (interactive on collision, TTY-aware)
- `crucible fork --at <offset> --fresh` (deterministic timestamp preimage, orphan aborted)
- `crucible fork --at <offset> --resume` (error if none exists; requires --no-interactive in CI)
- `crucible session resume <childSid>` (direct resume by session ID; separate from flag)
- `--no-interactive` flag suppresses prompt even if TTY detected (CI/script safe)
- Decision row in parent ledger records choice (fresh/resume + rationale) → deterministic replay

**Learnings:**
- **Interactive CLI + CI integration:** Always spec TTY detection upfront, not as afterthought. Non-TTY context requires explicit flag-driven paths; exit code 2 ("needs flag") is load-bearing for automation.
- **Redundancy detection:** Multiple mechanisms for same goal (timestamp preimage vs user-provided disambiguator) create cognitive load + implementation risk. Favor one well-chosen mechanism (timestamp) unless escape hatch solves qualitatively different problem.
- **Verb vs flag distinction:** Separate verbs (`crucible session resume`) and flags (`--resume` on `fork`) serve different UX flows. Document relationship clearly when both exist.
- **Decision-recording for determinism:** When user input affects session structure, record choice as Decision row (not silent WAL write). Evidence.rationale documents *why* (flag/prompt/default) → audit trail + unambiguous replay.

---

## 2026-05-28: CTD Phase 2 — §10 (Session + Branching) + §15 (Coexistence) authored + Phase 1 errata applied

**Context:** Phase 2 fan-out. Two primary sections (§10 ≤3pp, §15 ≤3pp) plus four Phase 1 synthesis-review errata that landed on §3 + §6 + §7.

**Phase 1 errata applied:**
- **Finding 2a (Timestamp ms/ns drift):** Chose **option (c)** — split. Added `type TimestampNs = bigint` to §6 (additive under §6.5 evolution rule, coordinated with Graham); §3.3 `WalRow.timestampNs` now typed `TimestampNs`. Rejected option (b) (import-site alias only) because future arithmetic consumers like §5.3 `queueDeadline: Timestamp` would still read `number` carrying nanoseconds with no type signal. Rejected option (a) (rename existing) because it forces churn on legitimately-ms envelope readers.
- **Finding 2b (`manifestRoot` flag):** Added to §3.3 `flags` enum and §3.2 binary-layout bitfield comment. Already referenced by §3.8 bootstrap pseudocode; the schema slot now matches the writer.
- **Finding 12b (`appendFenced` undeclared):** Added §3.4.1 — full surface spec including fencing condition (`segment.nextOffset() === expectedHead` under single-writer lock, pre-stage), failure semantics (no CAS write, no bus dispatch, returns `{kind: 'fence-violation', actualHead}`), single-writer assumption (intra-process audit-hook gap absorbed; not multi-writer), when-to-use vs `append(batch)`, and bounded-retry contract for §8.3 `applyWithFence`.
- **Finding 5 (`dependentPaths` semantic split):** Patched §7.1 `StructuralProposalGenerator.dependentPaths` from `string[]` to `EventId[]` — concurred with synthesis-review recommendation. Content-addressed wins over routing-key for replay; §5.3 was already `EventId[]`, so one-side reconciliation.

**§10 highlights:** `sessions` table schema is L2 cache (rebuildable from L1); `bootstrap_manifest` carries digests not bodies (R2-2 — extra-ledger context lives on offset-0 Observation rows, not in the manifest column); fork protocol writes a synthetic `fork_origin` Observation at child offset 0 and COW-snapshots `bootstrap_manifest` by reference + lockfile verbatim; forked-timestamp monotonicity floor propagates through `fork_origin.body.parentForkPointTimestampNs` so multi-generation fork chains (TDD §6.4) preserve the time-axis invariant by induction.

**§15 highlights:** Coexistence boundary table — share `@akubly/types` brand types, fork everything else (storage, write pattern, plugin registry, migration numbering, investigation surface). Eight new shared types enumerated. Five accepted taxes named (two event-logs, two plugin-discovery paths, two session models, two notification surfaces, two trust-tier vocabularies). `@akubly/crucible-plugin-registry` co-owned with Rosella — she owns the install-phase algorithm, Roger owns the `PluginVersionLock` format + fork-phase verbatim-copy rule + session-start pure-load contract.

### Learnings

**Lockfile-format negotiation pattern (R2-6 sync pair with Rosella):**
- The right split is **algorithm-side owns the install resolver**, **format-side owns the lockfile schema + consumer rules** (fork-snapshot verbatim copy, session-start pure load). When the format crosses the storage boundary (here, `sessions.plugin_versions` SQLite JSON column), the format-side owner is the same person who owns the storage boundary (§3 / §10 — Roger). Algorithm purity belongs to Rosella; storage shape belongs to whoever signs the WAL row.
- The right format is **flat, not graph**. Forks demand verbatim byte-copy (no graph traversal at fork time), session-start demands pure load (no resolution at load time). A graph representation would force traversal semantics back into one of these phases. Flat `Record<packageName, lockedEntry>` + a `lockId: Blake3Hash` content-address footer is the cheapest shape that satisfies both constraints; the transitive-graph topology Rosella's resolver computes is captured by the *set* of entries, not by any in-shape pointer.
- The content-address footer (`lockId`) is the free win: identical lockfiles across sibling forks hash byte-identical and CAS-dedup; `cairn fsck --plugin-versions` validates the column by re-hashing.

**Sub-state fork-COW patterns:**
- "COW snapshot" on an append-only substrate means **share-by-reference, append-only-extend on the child**. The parent's WAL prefix is structurally immutable (§3.13 hash chain), so there is no copy step — the child's `prevRoot[1]` links into the parent's `selfRoot[forkPointOffset - 1]` and `cairn fsck --with-parent` traverses the cross-session edge.
- Two columns get **shared-by-reference COW** at the SQLite-projection level: `bootstrap_manifest` (R2-2 — child re-uses parent's manifest; offset-0 bootstrap rows are not re-emitted on the child) and `plugin_versions` (R2-6 — verbatim lockfile copy with same `lockId`). The "by reference" here is a content-hash identity, not a SQL FK; the JSON is duplicated in the row but the BLAKE3 footer makes the duplication free at the storage layer (CAS dedups the bodies if they reach CAS; the SQLite row carrying the JSON is cheap).
- Sub-state machinery (TaskStart / TaskEnd) survives fork by capturing the parent's open task stack in the `fork_origin` Observation's `body.openTaskStack`. The child chooses to either resume the stack or close it explicitly at offset 1. Append-only discipline means the choice is itself a durable row, not a runtime flag.

 — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §3 (L1 WAL Substrate) + §4 (Hook Bus) FINAL. Phase 1 synthesis review: YELLOW verdict, 13 findings routed. Your Phase 2 errata: finding 2a (Timestamp shape drift: split `Timestamp` vs `TimestampNs`), 2b (add `manifestRoot` flag), 12b (add `appendFenced` wrapper). Cross-section dependencies: Laura (§11.2 body shape pinning), Alexander (§12 offset-0 materialization), Rosella (R2-6 lockfile/snapshot handshake). — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) `BootstrapPayload` shape (literal+manifest, R2-2); (2) `commitmentMethod: 'declared' | 'fallback'` tag on Decision rows (R2-1); (3) transitive-dep snapshot field at fork (R2-6); (4) coordinate with Rosella on lockfile format. Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Roger — History

## 2026-05-26: Eureka ↔ Crucible Data Layer Overlap Analysis

**Context:** Aaron preparing simultaneous Eureka + Crucible implementation in this repo (`D:\git\harness`). Task was to map data-layer overlaps between Eureka's PRD (from sibling `D:\git\mem` repo) and Crucible's L1 substrate (A.3 hybrid append-log, per-row content-addressed WAL, group-commit).

**Verdict: FORK storage entirely.** Eureka and Crucible are architectural siblings with non-overlapping persistence needs. Full analysis written to `.squad/decisions/inbox/roger-eureka-crucible-data-overlap.md`.

**Eureka's data shape (from PRD v5-final):**
- Three independent SQLite DBs (via `better-sqlite3`): `~/.copilot/eureka/agent.db` (v1), `~/.copilot/eureka/user.db` (v1.5+), `<repo>/.eureka/project.db` (v1.5+). Only agent-tier fully wired in v1.
- Schema per-tier: `facts` table (CRUD, not append-only) with FTS5 for BM25 lexical recall, `relations` table (graph edges), `bridge_ledger` (append-only cross-system reconciliation log). No FKs to Cairn/Forge; **no cross-DB ATTACH at runtime** (FR-7.2).
- Write pattern: fact CRUD + FTS5 triggers + sweep-driven Tier 2 edge population. No group-commit, no per-row pre-fsync hooks.
- Query pattern: BM25 recall (keyword-scoped), composite ranker (0.5·relevance + 0.2·importance + 0.2·trust + 0.1·recency) × attention multiplier, trust floor exclusion (< 0.15), sequential fan-out (agent → user → project), edge traversal via `relations`.
- Lifecycle: SQLite WAL mode, opportunistic sweep (end-of-session, first-query-of-day), no content-addressed row hashing. Session identity shared with Cairn via `SessionId` brand from `@akubly/types` (type-level construct, no runtime FK — Eureka PRD §FR-13 v5-final R8).

**Share-vs-fork recommendations (8 substrate concerns evaluated):**
- **Event log / WAL:** FORK — Eureka's CRUD + FTS5 vs Crucible's append-only + group-commit are incompatible write patterns. Forcing convergence would mean Eureka pays append-only cost for no gain, or Crucible compromises replay determinism.
- **Session model:** FORK tables, SHARE identifier only — both use `SessionId` brand from `@akubly/types`; no runtime FK. Cairn owns lifecycle (`sessions` table), Eureka owns epistemology (`kind='session'` facts). Offline correlation only.
- **Config / KV / Graph / FTS / Snapshot:** FORK on all — no semantic overlap. Eureka's graph is epistemological (facts linked by `derived_from`, `contradicts` edges); Crucible's read-set is causal (event A read output of event B). DBOM Merkle chain (audit tamper-detection) vs Eureka facts (trust-weighted retrieval) serve different purposes.
- **Migrations:** FORK numbering — Crucible v100+ OR prefixed naming (`crucible-001-*.ts`) OR separate DB file (`~/.cairn/crucible.db` instead of sharing `~/.cairn/knowledge.db`). Recommendation: **separate DB file** for clean migration independence and backup story.

**Schema / path / port collisions: NONE.** Separate DB files (Cairn `~/.cairn/knowledge.db`, Eureka `~/.copilot/eureka/*.db`, Crucible TBD). Only shared construct is `SessionId` brand (type-level, no runtime coupling). No HTTP/IPC surfaces in v1 (Eureka library-only, Crucible is substrate layer, Cairn CLI-only). CLI namespaces distinct (`eureka` vs `cairn` vs hypothetical `crucible`).

**One load-bearing question for Aaron:** Does Crucible's L1 WAL (v14 `wal_records` table + v15-v18 tables) live in the same `~/.cairn/knowledge.db` as Cairn, or fork to `~/.cairn/crucible.db`? Trade-offs documented in analysis §6 OQ #1. My recommendation: **fork to `~/.cairn/crucible.db`** — independent migration numbering, preserves A.3 hybrid design freedom (custom append-only WAL file in pure TS for L1, keep `better-sqlite3` for other tables), avoids same-DB migration collision risk.

**Additional open questions for Aaron:**
- OQ #2: Does Crucible v1 still follow A.3 hybrid (my Round 5 spike recommendation), or has design shifted to full-SQLite transaction-batched semantics?
- OQ #3: Does Crucible L1 WAL rows carry `session_id` column? If yes, should import shared `SessionId` brand from `@akubly/types` to match Cairn + Eureka (type-level only, no runtime FK).

**Backup story:** Three stateful directories once both ship: `~/.cairn/` (Cairn + possibly Crucible), `~/.copilot/eureka/` (Eureka agent/user DBs), `<repo>/.eureka/` (Eureka project DB v1.5+). Operator guidance: back up all three for full state recovery. No cross-DB runtime dependencies; correlation is offline-only via `eureka reconcile` CLI (reads Cairn DB read-only) and (future) `crucible reconcile`.

**Anti-anchoring check honored:** Considered the "share event log" alternative seriously (Eureka could project facts into an append-only log, Crucible could index facts for keyword recall) and rejected on the evidence that the two write patterns (CRUD+FTS5 vs append-only+group-commit) and query patterns (BM25 recall vs seq-ordered replay) do not align. Sharing would force premature convergence on a primitive that neither system needs in its pure form.

## 2026-05-25 Round 7: v1-tier triage of all Roger-authored stories

Triaged every user story I authored across the deliberation against Aaron's locked v1 framing ("Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible"). Written to `decisions/inbox/roger-triage-2026-05-25T0200Z.md`. Headline cut: **8 substrate items go T1, 1 story (R-4) is enabled-for-free, everything else falls to T2–T5 or splits.**

T1 set: WAL with read-set hash + hook bus (Round 3 locked), `withShadowEvent` discipline + replay invariant (Open #4), CBOR-dcbor + BLAKE3 (Open #5), CAS + observation capture (Ro-NEW-2 — gates hermetic replay, this is the keystone), minimum-viable snapshot (Ro-NEW-1 T1 slice), branch/ref metadata schema (Ro-NEW-3 T1 slice), replay harness + linear `cairn fork --at` (R-3 T1 slice), drift ProposalGenerator (R-4, free). Plus `tenant_id` cheap-insurance migration (R-6 enabling) — hours now, weeks later.

Splits: **R-3** (replay+linear-fork T1, graph ops T3), **Ro-NEW-1** (min-viable snapshot T1, cadence/compaction T5), **Ro-NEW-3** (schema T1, fsck/GC T5). Cuts to T4/T5: R-1 (pattern mining graph-walks), R-2 (GitHub plugin), R-6 (federation), R-7 (code review plugin), R-8 (export productionization), R-9 (templates, gated on R-3), Ro-NEW-4 (quotas — dedup floor is already free). R-5 to T2 (one-hop provenance already exists; transitive walk is investigation-depth, not bootstrap).

Storage-criticality rule I'm enforcing: anything that touches WAL row layout, L1→L2 projection contract, or the determinism conformance suite is T1 regardless of how aggressive I'm trying to be elsewhere. That rule is what kept Ro-NEW-2 from being demoted on "data volume" grounds — without observation capture, the bootstrap loop's falsifiability claim is theatre.

Seven open questions for Cassima: rolling-buffer bound for capture store, `change_vectors` promotion to general post-commit outcome attachment (Roger+Laura), `tenant_id` cheap-insurance confirmation, snapshot-CLI scope at T1, R-9 tier check with Aaron, acknowledgement-stories for inherited Cairn surfaces (`topology_cache`, `execution_profiles`, `skillLinter`), and whether the WASM predicate-compilation ABI seam ships at T1 or T2. None of those change my T1 set; they each refine one edge of it.

## 2026-05-25 Round 6: Phase B Opens #4 and #5 resolved

Closed both substrate-owned Phase B contradictions in one inbox file (`decisions/inbox/roger-opens-4-and-5-2026-05-25T0130Z.md`). For #4 (7-tables UPDATE vs. backward causal slice): enumerated all seven tables from `packages/cairn/src/db/` and `agents/`, classified 6 as derived projections of `event_log` (`sessions`, `insights`, `prescriptions`, `prescriber_state`, `curator_state`, `optimization_hints`) and 1 as external filesystem mirror (`managed_artifacts.current_checksum`). Recommended killing `prescriber_state.pending_count` entirely (replace with a SQL view), wrapping all other lifecycle UPDATEs in a `withShadowEvent()` repository helper, banning raw `UPDATE` outside `db/` via a custom ESLint rule with cursor/mirror allow-list, and locking the discipline in CI with a snapshot→truncate→replay→deep-equal invariant test. Rejected SQLite triggers (would couple us to a substrate primitive in violation of v1 commitment #10) and rejected the "move everything to append-only" alternative on the evidence that the source of truth is already the event log. ~14 hours of work for Alexander in the first Crucible sprint.

For #5 (canonical serialization): picked **CBOR-dcbor + BLAKE3** (`cbor2` + `@noble/hashes/blake3`) for the new L1 read-set hash — matches Phase A's existing `blake3` columns, ~5-7µs per hash (well inside the 80µs hook-bus envelope I told Gabriel about), pure-JS so no native binding requirement. **Left DBOM on SHA-256 + JSON** — different audit consumer, committed artifacts already in production, migration not worth it. Established the per-column rule: hash algorithm fixed at column creation, never migrated; new columns BLAKE3; named legacy SHA-256 columns frozen. Specified all canonicalization edge cases (forbid bignums/tags/indefinite-length/NaN/non-NFC, definite-length only, bytewise-encoded key sort). ~9 hours of work, with Laura's A3 conformance assertion now writable without further design. Anti-anchoring rule honored on both — considered and explicitly rejected the obvious alternative for each.

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to .squad/decisions.md. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

Ready for Wave 2 implementation (computation + ranking only; runtime wiring follows in Wave 3).

## Learnings (2026-05-23 — W3-1 skillsmith-runtime scaffold)

- `packages/skillsmith-runtime/` follows the repo's standard library package shape: package.json + composite tsconfig + `src/index.ts` + `src/__tests__/` with tests excluded from TypeScript build output.
- Root workspace registration needed only a `tsconfig.json` project reference because the repo already uses the broad `packages/*` workspaces glob. `npm install` then linked the new package into `package-lock.json` automatically.
- This environment's npm rejected `workspace:*` dependency specifiers (`EUNSUPPORTEDPROTOCOL`), so the new package uses the repo's established `"*"` workspace dependency pattern instead.
- W3-1 intentionally leaves `createPrescriberOrchestrationConfig()` and `runForgePrescribe()` as throwing stubs. W3-5 will wire Cairn + Forge composition; W3-2 will make `runtime-cli` delegate into this package.

## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Unblocks all Wave 3 work items. Roger owns composition root and runtime-cli packaging.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool for manual prescriber invocation in Wave 3. Curator hook is autonomous surface; existing `forge-prescribe` CLI is manual surface. Re-open MCP tool only when concrete operator need materializes.
- **W3-D4: Curator Hook → Always-On** — Automatic invocation enabled; no opt-in flag in v1. Safety margins verified via Wave 2 E2E tests. Profile selection trigger-driven only; global fallback deferred to Wave 4.

## Learnings (2026-05-23 — Wave 3 Composition Root Audit)

- **Five composition root options evaluated** for Wave 3. Current architecture: Cairn and Forge have zero direct coupling (acyclic, port-based). Only `packages/runtime-cli/` bridges them (Wave 2 stepping stone). Audit document: `docs/wave3-composition-root-audit.md`.
- **Recommendation: Option B** (separate `@akubly/runtime` library + thin `runtime-cli` wrapper). Reasoning: Best test isolation, zero build risks, Phase 5-ready architecture. Library stays portable; CLI stays thin.
- **Do not use Option C** (inject Forge into Cairn hooks) — test coupling and build-order dependencies are unacceptable. Create a package instead.
- **Known unknowns deferred to Graham's ADR:** Profile selection strategy (all vs. only-with-vectors), hint persistence ownership, MCP tool shape for prescriber optimization, fail-open semantics on Forge failure during Curator.

## Learnings (2026-05-22 — Wave 2 W2-9 manual CLI surface)

- Wave 2's explicit composition root now lives in `packages/runtime-cli/` with bin name `forge-prescribe`; it's the one package allowed to import both `@akubly/cairn` and `@akubly/forge` without violating the package boundary.
- Local invocation pattern from the repo root is `npx forge-prescribe --skill <id> [--db <path>]`; the root workspace keeps `@akubly/runtime-cli` as a dev dependency so the bin is linked into the local toolchain after `npm install`.
- Profile loading is deterministic: try the canonical per-skill aggregate first (`granularity='per-skill', granularity_key='global'`), then fall back to a skill-scoped `global/global` profile before failing with a clean no-profile result.
- Exit semantics are simple: 0 on successful orchestration (including zero generated hints or dedup skips), 1 when no execution profile exists, and 2 for argument, database, or persistence failures.

## Learnings (2026-05-22 — Wave 2 W2-1 shared change-vector contract)

- Canonical Wave 2 change-vector contracts now live in packages/types/src/index.ts: ChangeVectorSummary, ChangeVectorProvider, NEGATIVE_IMPACT_AUTO_APPLY_GATE, and shared OptimizationCategory.
- Reconciled the two ChangeVectorSummary duplicates by taking Forge's stricter OptimizationCategory union instead of Cairn's plain string. Added autoApplyEligible?: boolean as the additive v3.1 field on the shared contract.
- Verification: root npm run build and root npm test passed before and after the change (1153-test baseline green).

## Learnings (2026-05-23 — W3-2 thin runtime-cli)

- Picked **Option A** for W3-2: `packages/skillsmith-runtime/src/index.ts` now owns the existing `runForgePrescribe()` composition flow (profile load, `SqliteChangeVectorProvider`, Forge prescribers, dedup + persistence) and `packages/runtime-cli/src/index.ts` is just a re-export facade.
- The thinnest stable CLI refactor here is **function re-export + unchanged CLI formatter**. That preserved operator-visible behavior and let the new delegation test assert identity (`runtime-cli` export === `@akubly/skillsmith-runtime` export) without introducing fragile ESM mocking around the bin entry.
- Alexander no longer needs to move manual CLI composition into `skillsmith-runtime` for W3-5; that surface is already live. W3-5 can stay focused on `createPrescriberOrchestrationConfig()` and Curator-facing factory wiring.
- After this refactor, remember to build before package tests that import `@akubly/skillsmith-runtime` by package name; those tests resolve the built workspace export (`dist/`), not the source file directly.

## Learnings (2026-05-23 — W3-6 hook injection bootstrap)

- Picked **R-Hook-A (injection)** for Curator session-start wiring: `packages/cairn/src/hooks/sessionStart.ts` now accepts an optional `PrescriberOrchestrationConfig` and forwards it to `curate()`; Cairn itself still does not import `@akubly/skillsmith-runtime`.
- The production always-on bootstrap now lives in `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, and `.github/hooks/cairn/curate.ps1` resolves that compiled script first. Laura's W3-7 integration test should enter through that skillsmith-runtime hook path, not the bare Cairn hook, so the real orchestration config is present.
- Keeping the script-level composition in the runtime package preserves W3-D1's boundary: Cairn owns hook mechanics, skillsmith-runtime owns cross-package wiring, and the PowerShell wrapper chooses the composition entrypoint.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Runtime-CLI: 5/5 passing
- Skillsmith-Runtime: 6/6 passing

**W3-1 & W3-2 shipped:** Scaffolding + thin CLI done.  
**W3-6 shipped:** Hook wiring complete — always-on bootstrap via injected config. Composition boundary preserved (cairn ↔ skillsmith-runtime acyclic).  

Wave 3 implementation delivered autonomous Curator-driven orchestration. Composition root (R2: `@akubly/skillsmith-runtime`) is the only place importing both `@akubly/cairn` and `@akubly/forge`. Phase 5-ready architecture in place.

---

## Session N: Skillsmith Harness Big-Think User Stories

**Lens:** Data, scale, integration, persistence.

### 9 Delivered Stories

**US-R-1: Cairn Pattern Mining Across Session Boundaries**  
As Aaron, query Cairn ledger to surface recurring Decision patterns, code-smell-to-fix chains, and decision reversals across 100+ sessions for Curator tuning and Forge heuristic calibration.  
*Ambition:* Accumulated telemetry becomes self-tuning feedback loop; harness learns from its own history.  
*Chambers:* Crucible, Cairn, Forge, Mirror  
*Data implication:* Append-only versioning + efficient graph traversal across millions of Primitives.

**US-R-2: GitHub Issue Auto-Coupling via Curator**  
Curator detects when a session solves/relates to open GitHub issues, auto-proposes linking (never auto-approves), leaving Mirror-check gate.  
*Ambition:* Break silo between coding-agent telemetry and project tracking; external systems as first-class signal inputs.  
*Chambers:* Crucible, Cairn, Curator, Mirror  
*Data implication:* Bidirectional webhooks + GitHub API polling; Cairn stores sync state + proposal backpressure.

**US-R-3: Cairn Replay & Variant Branching**  
Export session (or sub-chain) and replay with Alchemist variants—different model, decision tree, tool choices—to compare outcomes without reracking work.  
*Ambition:* Replay-as-first-class-primitive; harness becomes experimentation platform. Replay + variant = A/B testing coding decisions.  
*Chambers:* Cairn, Alchemist, Crucible  
*Data implication:* Portable serialization (JSON-LD/SQLite) with deterministic replay semantics + seeded RNG injection.

**US-R-4: Long-Session Drift Detection & Prescribing**  
Forge detects token-budget creep, context-window saturation, decision-reversal clustering in sessions >2hr; auto-proposes checkpoint/reset patterns.  
*Ambition:* Make invisible resource constraints visible before degrading session quality; Forge as canary.  
*Chambers:* Forge, Crucible, Cairn, Mirror  
*Data implication:* Granular token/context-window/latency tracking per turn; time-series queries on Cairn.

**US-R-5: Mirror-Backed Cross-Session Provenance**  
Mirror surfaces decision chain (why that tool chosen, which prior session influenced heuristic) across boundaries, building legible accountability for harness autonomy.  
*Ambition:* Epistemic trust-building—audit *reasoning* behind Curator proposals, not just outputs.  
*Chambers:* Mirror, Cairn, Curator  
*Data implication:* Rich metadata linking each Primitive to prior-session provenance (parent Decisions, Forge signals, Curator confidence).

**US-R-6: Scalable MCP Ecosystem as Forge Input**  
Federate tool success/failure/latency across Aaron's entire MCP ecosystem; Forge ranks tool choices; share anonymized insights with Skillsmith community.  
*Ambition:* Harness becomes collective learning engine; aggregate signal from thousands of tool invocations into shared optimization surface.  
*Chambers:* Forge, Cairn, Curator, Crucible  
*Data implication:* Multi-tenant telemetry ingestion + differential-privacy aggregation; Forge ranking scoped to cohort.

**US-R-7: Curator-Driven Code Review Automation**  
Curator detects mutations of core APIs or high-fan-out subsystems; auto-proposes async code review (MCP agents or GitHub PR); track review-to-ship latency in Cairn.  
*Ambition:* Blur autonomy and accountability; let them coexist.  
*Chambers:* Curator, Cairn, Crucible, Mirror  
*Data implication:* Parse Artifact diffs, compute module-graph impact, integrate GitHub PR API + MCP code-review servers.

**US-R-8: Multi-Tenant Cairn Export & Legal Hold**  
Export filtered Cairn views (by project, time window, Primitive type) as immutable ledger snapshots for compliance, legal hold, or sharing—without exposing private sessions.  
*Ambition:* Audit-ready from day one; data residency + portability as core, not bolted-on.  
*Chambers:* Cairn, Mirror, Crucible  
*Data implication:* Column-level access control, zero-knowledge proof of ledger integrity, deterministic export fingerprinting.

**US-R-9: Sessions as Reusable Templates**  
Mature Crucible sessions packaged as reusable templates—decision trees, tool chains, Curator tunings—spin up new projects with pre-tuned harness behavior.  
*Ambition:* Session-as-code; codify best practices by capturing harness *state itself*.  
*Chambers:* Cairn, Crucible, Alchemist, Forge  
*Data implication:* Session versioning, MCP tool dependency resolution, semantic diffing of Cairn ledgers.

---

**Older learnings archived to history-archive.md**

---

## Deliberation Round (2026-05-24)

> Roger — Platform Dev / Data & Scale lens. I just clean the floors, but the floor is the ledger and it's about to get sticky.

### Section 1 — Story Revisions

**US-R-1 Cross-Session Pattern Mining → MERGE-WITH Graham US-G-1, Laura US-L-5, Erasmus US-E-6.** One story: "Cairn as queryable corpus for pattern mining + skill recommendation." Roger owns the storage/index substrate; Laura owns the analytics; Graham owns the surfacing; Erasmus owns the auto-skill-draft. Three lenses, one feature. 🐞 Doubly compelling under agentic-debugger (pattern mining = bug class detection across sessions).

**US-R-2 GitHub Issue Auto-Coupling → REVISE.** Reframe as a **ProposalGenerator** (per Erasmus L3): `GitHubLinkProposalGenerator` emits link proposals; Router decides notify-vs-auto-apply. No special-case wiring. Drops Mirror from the chamber list (Mirror is a view, not a participant).

**US-R-3 Cairn Replay & Variant Branching → KEEP, PROMOTE TO P0, MERGE-WITH Graham US-G-7, Alexander US-A-3, Valanice US-V-1, Gabriel US-5, Erasmus US-E-2.** This is now the headline story per Aaron Insight #1. Single revised story: **"Fork-from-any-ledger-position as first-class primitive, with hermetic replay against captured observations."** I own the COW snapshot model, observation-capture table, and ref/branch metadata. 🐞🐞 Doubly compelling — this IS the agentic debugger.

**US-R-4 Long-Session Drift Detection → REVISE as ProposalGenerator.** `DriftProposalGenerator` watches a derived-query view (token/turn/reversal rates). Stops being a chamber, becomes a plugin. 🐞 Doubly compelling (drift = pre-bug signal; same code path as bisect heuristics).

**US-R-5 Cross-Session Provenance → WITHDRAW as standalone, FOLD into US-R-3.** Provenance *is* the replay graph. If R-3 lands, R-5 falls out of the same data structures. Don't pay twice.

**US-R-6 Federated MCP Telemetry → WITHDRAW from v1.** Solo-v1 scope. Keep the schema namespaced (see Tension 1) so this is additive later, not a rewrite. Re-pitch in Phase 2.

**US-R-7 Curator Code Review → REVISE as ProposalGenerator** (`HighFanoutReviewProposalGenerator`). Same pattern as R-2/R-4; collapses three of my stories into one mechanism.

**US-R-8 Multi-Tenant Export & Legal Hold → REVISE down.** Drop "multi-tenant" and "legal hold" for v1. Keep **deterministic ledger export + integrity hash**. Solo user still needs portable, verifiable snapshots — that's the substrate for R-3 fork-sharing and Erasmus US-E-10 (collaborative replay).

**US-R-9 Sessions as Templates → KEEP, REVISE.** Reframe as "snapshot-as-template": any ledger snapshot (with optional redaction proposal-generator pass) becomes a seed for a new Crucible. Cheap when the snapshot/COW substrate from R-3 exists.

**NEW STORIES:**

- **US-Ro-NEW-1: Snapshot + Compaction Cadence (the floor I'm cleaning).** As Aaron, I want Cairn to snapshot at Decision boundaries and compact append-tail to columnar storage on a background cadence, so that branching is O(1), queries don't scan from genesis, and disk doesn't grow without bound. *Owns Erasmus risk (c).* 🐞 Doubly compelling — fast bisect needs cheap snapshots.
- **US-Ro-NEW-2: Observation Capture Store (determinism backbone).** As Aaron, I want every LLM/tool/env read to write a content-addressed `(call_hash, inputs_hash) → outputs_hash` row, so that replay reads from capture and never re-calls a non-deterministic service. Backbone for R-3, Aaron Insight #3, Erasmus risk (a). 🐞🐞 The agentic-debugger lens demands this.
- **US-Ro-NEW-3: Branch/Ref Metadata + GC.** As Aaron, I want named refs over snapshots (like git branches), reachability-based GC, and a `cairn fsck` that verifies hash chain + capture-completeness, so that fork proliferation doesn't rot the store. Pairs with R-3 and Ro-NEW-1.
- **US-Ro-NEW-4: Backpressure & Quotas on Proposal Queue.** As Aaron, I want the Approval Router to apply per-generator quotas + decay, so that a noisy ProposalGenerator can't flood the queue or Cairn. Engages Erasmus risk (b) (unconstrained optimization = noise).

### Section 2 — Position on Erasmus's 4-layer stack: **PARTIAL ENDORSE**

**L1 Conductor + Ledger merged (event sourcing): ENDORSE with caveat.** Event sourcing is the right substrate — it's the only way determinism + branching + replay all fall out of one model instead of three. **Caveat:** "merged" must not mean "same process owns writes and turn execution synchronously." The write path needs a WAL + async fsync window, or every LLM token roundtrip blocks on disk. Conductor *appends*, a Ledger Writer *durably commits*.

**L2 Derived Query Layer (Salsa-style): PARTIAL.** Conceptually right, but on its own it **does not scale — it relocates the bottleneck from queries to invalidation traffic.** Every append fires invalidations across every cached projection; with 1k primitives/session and N projections you get N×1k cache-bust events. Mitigations I'd require before endorsing: (a) **snapshot-keyed cache keys** (`(snapshot_hash, query_sig)`) so only the projections crossing a snapshot boundary invalidate; (b) projections register **column-range dependencies**, not "depends on ledger"; (c) hot projections materialized as compacted tables, cold ones recomputed on demand. Without these the Query Layer is a memory leak with a nice name.

**L3 Pluggable ProposalGenerators: STRONG ENDORSE.** Collapses my R-2, R-4, R-7, and Curator/Forge/Alchemist/staleness into one extension surface. Same telemetry, same quotas (see Ro-NEW-4), same test harness. This is the single biggest architectural win on the table.

**L4 Approval + Notification Router: STRONG ENDORSE.** Single policy choke-point = single audit table = single place to enforce branching semantics (e.g. "apply to branch X but notify on branch Y"). Resolves Tension 2 cleanly.

**On Erasmus risk (c) — my wheelhouse:** Yes, the ledger *will* bottleneck and we have to plan for it now, not later. Concrete commitments I'll own:
1. Append-only WAL with batched fsync; primitive serialization ≤256 bytes typical (large payloads spilled to content-addressed blob store, ledger holds the hash).
2. Snapshot at every Decision primitive; snapshots are Merkle-rooted so branching is COW and verification is O(depth-diff).
3. Background compaction of tail → columnar (Parquet-ish) for the Query Layer to scan without touching live WAL.
4. Observation-capture is a *sibling* store, not the ledger — same content-addressing, separately compactable, separately GC'd (it's 5–10× the volume of the ledger itself; treating them as one table is how you die).

### Section 3 — Positions on the 5 Tensions

**1. Solo-v1 vs federation.** Solo-v1, full stop. But: every table gets a `tenant_id`/`namespace` column from day one (default `'local'`). Federation later is an additive read-path + auth-path concern, not a schema migration. Cheap insurance.

**2. Curator never approves.** Resolved by L4 Router. Curator becomes a ProposalGenerator + a view. I want it written down that *no chamber writes to the apply-decisions table except the Router* — single-writer invariant is the only thing standing between us and a debugging nightmare.

**3. Mirror scope creep.** Resolved — Mirror = derived view over (proposal queue ∪ ledger tail ∪ capture metadata). I stop listing it as a chamber in any of my stories.

**4. Heavyweight ops vs solo user.** Strip federation, legal hold, multi-tenant export, MCP federation, GitHub webhooks-as-infra from v1. **Keep** snapshot/compaction/capture/branching/integrity-hash — those aren't "ops," they're load-bearing for the agentic-debugger vision and they're cheaper to build now than to retrofit.

**5. Crucible vs Copilot CLI parent-child.** Crucible spawns Copilot CLI as a sub-agent; sub-agent IO must flow through the observation-capture store or replay/branching breaks at the agent boundary. This is non-negotiable from the data lens — an un-captured sub-call is a non-deterministic hole in every downstream fork.

**NEW Tension 6 — Capture cost vs throughput vs privacy.** Observation capture multiplies write volume and will eventually capture secrets (env vars, API keys in tool args). Need: (a) capture compression + dedup (content-addressing already gives us this), (b) a redaction ProposalGenerator that runs *before* commit, (c) a clear policy on whether replay across a key rotation is allowed. Flagging now so it's not a Phase-5 surprise.

### Section 4 — Cross-references

1. **Erasmus US-E-1 (Ledger Bisect) + my US-R-4 (Drift Detection)** → same engine. Bisect is "binary search over snapshots for the first bad Decision"; drift is "rolling-window anomaly over the same snapshot index." Build the snapshot index once (Ro-NEW-1) and both fall out. **Strengthens both.**
2. **Aaron Insight #1 (branching first-class) + Graham US-G-7 + Alexander US-A-3 + Valanice US-V-1 + Gabriel US-5 + Erasmus US-E-2 + my US-R-3** → six lenses converging on the same primitive. This is the consensus headline. Roger owns the substrate; others own surfaces.
3. **Erasmus US-E-7 (model-swap replay)** → **invalidates** any approach where model identity isn't in the observation-capture key. Forces my capture-store schema to include `(provider, model, version, sampling_params)` in the call hash. Good catch — would have been a v1 bug.
4. **Laura US-L-7 (lazy outcome finalization)** → strengthens Ro-NEW-1: snapshots must be append-extensible (outcomes arrive later and attach to past Decisions). Means snapshot = "ledger prefix + late-binding outcome side-table," not a frozen blob.
5. **Rosella US-Ro-5 (Alchemist skill evolution)** → demands the same fitness/outcome substrate Laura needs and the same branching substrate R-3 provides. If we don't build branching + capture, *neither* Alchemist nor Laura's eval loop is honest — they'd be measuring against non-replayable runs. **Strengthens Ro-NEW-2 doubly.**

— Roger


## 2026-05-24 Round 3: Read-set verdict (Sonny US-S-3)

# Roger — Verdict on Sonny US-S-3 (causal read-set on L1 append)

**Date:** 2026-05-24T22:33Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Whether the L1 append-record contract (v1 commitment #8) must carry a `causalReadSet` for every primitive write, as Sonny argues in US-S-3.
**Verdict (TL;DR):** **LOCK — with surgical split on population.**

I read Sonny's nine stories. US-S-3 is the one that actually touches my floor, so I'll only answer for that. Not re-litigating L1-vs-L2 or the 4-layer stack.

---

## 1. Is retrofit structurally impossible later?

Mostly yes. Two paths to retrofit and both are bad:

- **(a) Replay-and-instrument.** Re-run every historical session under a wrapper that records what each generator consulted. Requires hermetic replay to be 100% deterministic in practice (it won't be — plugin code drifts, model versions retire, content-addressed blobs may be GC'd before we ever ask the question). And it costs N× compute per "why?" query. Theoretically possible, operationally a tax we'd pay forever.
- **(b) Forked storage format.** Pre-v2 ledgers permanently lack causal slicing; v2 ledgers have it. We'd ship a debugger that quietly degrades on old sessions, which is exactly the trust-eroding lying-debugger UX Sonny rails against in US-S-5.

The forward-compatible "capture in a derived L2 projection instead" path that I went looking for **does not exist for the data Sonny actually wants**. L2 can derive structure *from what L1 recorded*; it can't synthesize edges L1 never wrote. The read-set is a property of the *write*, not of the ledger prefix.

So Sonny is right on the retrofit point. Not religiously — operationally.

## 2. What "read-set" means for the 5 primitives

There is one coherent **schema** and five primitive-specific **population rules**:

| Primitive | What the read-set captures | Source in v1 |
|---|---|---|
| **Request** | Parent Decision/Question that triggered it; prior Observations the planner saw; system-context refs | Best-effort (planner emits) |
| **Artifact** | Source primitives consulted (prior Artifacts, Observations); plugin version refs | Best-effort (generator emits) |
| **Observation** | The external-IO capture key `(call_hash, inputs_hash)`; pinned plugin version | **Already captured** by Ro-NEW-2 capture store — zero new work |
| **Decision** | Proposal IDs considered; projection refs consulted; prior Decisions cited | **Required** — Decisions are the bisect/branch anchors |
| **Question** | The trigger Decision or halt condition; minimal | Best-effort |

Common shape — typed list of `(kind, target_id, target_hash, role)` tuples. Different *who-populates-what* per primitive. One schema, primitive-specific completeness rules.

## 3. Cost analysis (I own the WAL group-commit path)

Sonny says "cheap now." I verified. He's right, given one structural choice:

**Per-append cost if the read-set is inlined in the WAL row:** ~200–800 bytes for a typical 5–20 entry set. Blows my ≤256-byte typical-row budget by 2–3×. Bad.

**Per-append cost if the read-set body is spilled to the CAS blob store and the WAL row carries only a 32-byte Merkle root:** **+32 bytes per WAL row, zero added fsync latency** (the blob write rides the same batched fsync window, no extra round-trip). Fan-out: read-set bodies are content-addressed and intern naturally — a parent Decision referenced by 200 children stores its hash 200 times in WAL rows but the *body* mentioning it dedupes in CAS.

Net verdict: with the spill design, cost is **+32 bytes/row, latency-neutral, dedup-friendly**. Cheap is correct. Inlined would be a non-starter; spilled is free.

This is the same pattern I already committed to for large payloads in my round-2 deliberation (commitment #8 sub-point 1). Read-sets are just another spilled field on the same path.

## 4. Compatibility with commitments #6 (snapshot+compaction) and #2 (hermetic replay)

- **Snapshot + compaction (#6):** No conflict. Snapshots are Merkle-rooted over WAL rows; read-set hashes are WAL row fields, so they're already in the root. Compaction folds the hash into columnar storage like any other field. Bonus: causal queries (`why?`, `who-cited-this?`) become indexable columnar scans, which is exactly the shape Cairn-bisect (US-S-6) and drift detection (US-R-4) want.
- **Hermetic replay (#2):** Subtle but clean. The read-set is an **output** of generation, not a replay input. Replay re-feeds Observations deterministically; the generator re-derives its read-set on re-execution. So replay does **not** re-feed read-sets — but the determinism conformance suite (commitment #4) gets a new assertion: *re-derived read-set must match recorded read-set*. That's a free correctness check Laura will probably want.
- **One edge case worth naming:** if a read-set entry refers to an L2 projection value (per US-S-4 retroactive projections), the entry must carry the projection-**version** ID, not just the query result, or replay will assert against a moving target. Cheap to specify now.

## 5. The 8th proposal-schema field (`causalReadSet`) — Laura's field vs. my contract

**Same data, two capture points.** Not two concepts, one concept on a pipeline:

1. **L3 ProposalGenerator declares** `causalReadSet` in its proposal (Laura's schema field).
2. **L4 approval router validates** the declaration (do the referenced primitives exist? are projection-version IDs resolvable?). Validation is a precondition for approval; a malformed read-set is a rejected proposal, not a committed garbage row.
3. **L1 commits** the validated read-set into the WAL row alongside the primitive payload (my contract). Body spills to CAS; hash goes in the WAL row.

Integration argument: Laura's field is the **producer contract** ("generators must declare what they read"); my field is the **storage contract** ("committed rows must carry the declaration's hash"). They are the same bytes, captured once at L3, validated at L4, durably committed at L1. Anyone trying to make them diverge is wrong.

For primitives that don't flow through a generator (raw Observation writes from the capture store), L1 synthesizes the read-set directly from the capture row — same schema, different population site.

## 6. Verdict: **LOCK with surgical scope split**

### Lock now (v1):
- **Schema slot.** Every WAL row has a nullable `causal_read_set_hash: blake3?` field. Reserved, named, in the row layout.
- **Body format.** Versioned CAS blob, typed entry list as in §2. Frozen for v1.
- **Wiring.** L3 proposal schema carries `causalReadSet`; L4 validates it; L1 commits the hash. End-to-end path exists day one.

### Split on population (v1 → v2):
- **REQUIRED + populated in v1:** Observation (free — already in capture store), Decision (the bisect/branch/why? targets).
- **BEST-EFFORT in v1, REQUIRED in v2:** Request, Artifact, Question. Slot exists, format is canonical, generators populate when they can. L1 accepts `NULL` without complaint in v1 and rejects `NULL` in v2.
- **`cairn fsck` (Ro-NEW-3) gains a new check:** report read-set completeness per primitive kind. Migration to v2 is "raise the bar from warn to error per kind" — no ledger rewrite, no schema migration, just a config flip.

### Why split rather than full-lock or full-defer:

- Sonny's load-bearing concern is **"structurally impossible to retrofit."** The schema slot, format, and wiring address that fully. Once the slot exists and the bytes are addressable, "fill it in for kind X" is a generator-side change, not a ledger rewrite.
- Full-lock-all-kinds-populated would block v1 on every generator implementing exhaustive read-set tracking, which is real work and adds bug surface across L3 right when L3 is still settling. We'd ship late for a property we can adopt incrementally.
- Full-defer is the failure mode Sonny correctly identifies — the slot never gets added, the contract calcifies without it, and v2 is a fork.

### Append-record schema, v1 (revised):

```
WalRecord {
  seq:                  u64,
  ts_ns:                u64,
  parent_seq:           u64,
  primitive_kind:       u8,        // Request|Artifact|Observation|Decision|Question
  primitive_id:         ULID,
  payload_hash:         blake3,    // body in CAS
  causal_read_set_hash: blake3?,   // NEW — body in CAS, schema below
  proposal_id:          ULID?,     // L3 proposal that produced this (if any)
  approval_id:          ULID?,     // L4 verdict (if any)
  prev_root:            blake3,    // chain
}

ReadSetBody (CAS blob, content-addressed, v1):
{
  version: 1,
  entries: [
    {
      kind:        PrimRef | ProjectionRef | ObservationRef | PluginRef,
      target_id:   ULID | ProjectionVersionId | CaptureKey | PluginVersionId,
      target_hash: blake3,
      role:        Input | Context | Trigger | Constraint
    },
    ...
  ]
}
```

Row-cost delta: **+32 bytes/row** when populated, **0 bytes** when NULL (use an optional/varlen encoding so unpopulated kinds don't pay). Fsync neutral. Compaction-friendly (single columnar field, hash-typed, intern-friendly). Snapshot-Merkle-compatible (it's just another row field).

### What I need from the team to land this:
- **Laura:** add `causalReadSet?: ReadSetEntry[]` to the proposal schema; required for Observation/Decision proposals, optional for the other three in v1. The entry shape above is the canonical form.
- **Stelios (L2):** projection identity must include a stable **version** ID so a `ProjectionRef` entry survives projection-definition edits. Already a US-S-2/US-S-4 ask; this just makes it load-bearing.
- **Alexander (L4):** approval validation step rejects proposals whose declared read-set references unknown/unresolvable IDs. Small extension to the pre-commit hook he already needs for US-S-1 (predicate-eval breakpoints).
- **Erasmus:** add a determinism-suite assertion: re-derived read-set on replay must equal recorded read-set for primitive kinds where it's populated. Free correctness signal.

I'll own the WAL row layout, the CAS spill path, and the `cairn fsck` read-set-completeness check. None of this changes my round-2 commitments on snapshot cadence or compaction; it just adds one nullable hash column and one CAS blob kind.

---

## Plain-text summary for the coordinator

**Verdict: LOCK, with a surgical split on population.**

Sonny is right that the read-set is structurally impossible to retrofit cleanly — the only retrofit paths are replay-and-instrument (forever-tax on compute and on perfect determinism) or a forked v2 storage format (silently-degraded debugger on old ledgers). He's also right that it's cheap now: with the body spilled to the content-addressed blob store and only a 32-byte hash in the WAL row, the per-append cost is +32 bytes and zero added fsync latency. Lock the schema slot, the body format, and the L3→L4→L1 wiring in v1; require population for Observation (already free via Ro-NEW-2 capture) and Decision (the bisect/why? anchors); leave Request/Artifact/Question as best-effort in v1 and promote to required in v2 via a `cairn fsck` config flip — no ledger rewrite. The proposal-schema field Laura owns and the append-contract field I own are the **same bytes** captured at different points on one pipeline; L3 declares, L4 validates, L1 commits the hash. Endorsed.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## 2026-05-24 Round 3 (continued): Pre-commit hook bus — L1 verdict

# Roger — Verdict on Alexander's pre-commit hook bus (re US-S-1 / US-S-4 / US-S-9)

**Date:** 2026-05-24T23:00Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Where the shared pre-commit hook bus sits relative to WAL group-commit, what pause does to a batch, whether the verdict is recorded, predicate cost on the hot path, interaction with `causal_read_set_hash`.
**Verdict (TL;DR):** **ENDORSE with refinements.** The bus belongs *inside* the group-commit window but *outside* the fsync barrier, runs per-row over the staged batch, and is itself a recorded WAL field. Predicates must be pre-registered/compiled. Read-set predicates are fine — and actually the killer feature.

The read-set verdict from earlier today is locked, not re-opened. This is only about the hook bus and how it touches my floor.

---

## 1. Where the bus sits relative to group-commit

There are four candidate insertion points. Three of them are wrong. Walking through them so the choice is on the record:

| Option | What it means | Verdict |
|---|---|---|
| (a) Before the row is staged into the batch | L3 emits → bus runs → row joins batch or doesn't | **Wrong.** Predicates can't see batch siblings or the committed read-set; pause loses ordering with concurrent emitters. |
| (b) Per-row, *inside* the batch staging loop, *before* the fsync barrier | Each candidate row is appended to the in-memory batch, hook bus evaluates against the row + its `causal_read_set_hash`, verdict is recorded on the row, then we either fsync or split | **Right.** This is what I'm endorsing. |
| (c) Once per batch, after staging, before fsync | One bus call sees the whole batch | **Wrong.** Pause semantics get fuzzy ("which row paused us?"), and predicate authors lose per-row identity. |
| (d) After fsync, before ack | Bus runs on durable rows | **Wrong.** Pause-after-durable is not a pre-commit hook, it's a post-commit notifier. Different primitive. Useful, but not what Alexander asked for. |

**The contract: option (b), per-row, pre-fsync, inside the group-commit window.**

Concretely the group-commit path becomes:

```
for row in candidate_batch:
    row.causal_read_set_hash = compute_read_set(row)    # already locked
    verdict = hook_bus.evaluate(row, read_set_view)     # NEW
    row.hook_verdict = verdict                          # recorded on the row
    if verdict == pause:
        seal_batch_through(row.seq)                     # see §2
        break
fsync(sealed_batch)
ack(sealed_batch)
if paused: hand control to L4 router
```

**Throughput claim.** Group-commit throughput is dominated by fsync, not by the per-row in-memory work. The bus runs in the same memory window where I'm already computing read-set hashes and chaining `prev_root`. Adding a dispatch per row, with predicates indexed by `primitive_kind` so non-matching kinds cost one hashmap lookup, is **noise on the fsync-bound path**. I am not giving up throughput for this, provided §4 holds.

What I am **not** doing is serializing the bus across batches. Multiple writers stage into multiple batches concurrently today; the bus is per-batch-local because predicates only see the row + its read-set view, not other in-flight batches. Cross-batch invariants are not the bus's job — that's L4 / L2.

---

## 2. Pause mid-batch — the transactional contract (owns commitment #8)

The scenario: 100-row batch, row 5 trips a `pause` verdict. Three plausible behaviors, only one of which doesn't lie:

- **Roll back rows 1–5.** Nope. Rows 1–4 already passed their verdicts (`continue` or `observe`). Rolling them back means a `continue` verdict didn't actually mean continue. That breaks predicate-author trust forever. Also breaks Sonny's US-S-4 logpoints — they fire on `observe`, expecting durability.
- **Commit through row 5, then pause.** Yes. This is the contract.
- **Commit the whole batch, then pause.** No. Defeats the purpose; rows 6–100 would commit despite a known pause condition having fired upstream of them.

**Contract: seal-and-split.**

1. When a row's verdict is `pause`, the batch is **sealed through that row inclusive**. Rows 1..N (where N is the pausing row) fsync as a normal group-commit batch. They are durable. Their acks fire.
2. Rows N+1..end of the candidate batch are **returned to the staging queue**, not dropped. They will be re-evaluated by the bus in the *next* batch (their read-sets may have changed because row N is now committed; predicates may verdict differently). Replay sees them in their eventual-commit order, not the original-staging order — and that's fine, because replay deterministically follows recorded `seq`.
3. The pausing row's `hook_verdict = pause` is durable in the WAL before L4 is invoked. L4 cannot be asked to make a decision about a row that isn't on disk yet. This matters for crash safety: if Crucible dies between L1 ack and L4 invocation, recovery sees a paused row with no L4 verdict and re-enqueues it for L4. No double-decision, no lost pause.
4. L4's eventual verdict (per Alexander's extensible enum, per US-S-9) is recorded as a **subsequent WAL row** referencing the paused row's `seq`. Same pattern as approval today, just with the pause anchor durable first.

This costs throughput on pause (one extra fsync barrier per pause, by definition). It does not cost throughput on `continue` or `observe`, which is the 99.9% case. Pause is the slow path on purpose — that's what "stop and ask the human" means.

**Edge case worth naming:** two rows in the same batch both verdict `pause`. The first one wins; the batch seals through it; the second goes back to the queue and re-pauses next batch. No "batch pause set" — one pause per commit cycle keeps L4's mental model honest.

---

## 3. Recording the verdict — yes, in the WAL row

If the verdict isn't durable, hermetic replay can't reproduce pause behavior, and the post-mortem investigator REPL (Sonny's US-S-5) lies. Both are non-negotiable. So the verdict goes in the WAL row.

**Schema slot — extend the row, do not sidecar.** Two new fields on `WalRecord`:

```
WalRecord {
  ...                                          // as locked in read-set verdict
  causal_read_set_hash:   blake3?,             // already locked
  hook_verdict:           u8?,                 // NEW: 0=continue, 1=observe, 2=pause; NULL if no predicate matched
  hook_verdict_witness:   blake3?,             // NEW: CAS hash of {predicate_ids_fired, predicate_outputs}; NULL if verdict=continue
  ...
}
```

Cost: **+1 byte for the verdict tag, +32 bytes when a non-continue verdict fires**, zero when no predicate matched (same optional encoding as `causal_read_set_hash`). The witness body in CAS lets US-S-5 reconstruct *why* the verdict fired without bloating WAL rows. Verdict-only-no-witness is invalid; either both NULL or both populated.

**Sidecar log was tempting, rejected.** A separate log of "pauses that happened" would force replay to join two streams in `seq` order, and `cairn fsck` would have to cross-check them. One row, two columns is simpler and snapshot-Merkle-clean (both fields are already row fields, so they're in the root for free).

**`cairn fsck` gains a check (extension of Ro-NEW-3):** for every row with `hook_verdict != continue`, the witness blob must resolve in CAS, and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC and registry-drift bugs.

---

## 4. Predicate cost — the hot-path SLA

Alexander flagged this and he's right to. My append SLA is unchanged from round 2: **p99 commit-to-ack ≤ 5ms at 10k writes/sec sustained, p99 row-stage cost ≤ 80µs in-memory.** The bus has to fit inside the 80µs in-memory budget.

**The break-point.** A naive interpreted match-spec predicate (ETS-style `{'==', '$1', secret}` interpreted recursively) costs ~5–20µs depending on read-set size. Ten such predicates registered against the same primitive_kind = 50–200µs. **That breaks the SLA at ~5 simultaneously-registered interpreted predicates on a hot kind.** Not acceptable.

**Required mitigation — pre-registration with compilation:**

1. **Register, don't pass.** Predicates are registered with L1's hook bus by ID, returning a handle. You cannot pass a fresh AST per commit. This is non-negotiable for the hot path. (It also fits Alexander's "predicate lifecycle across forks" point — handles have explicit lifetimes.)
2. **Compile at registration time.** Registration runs the predicate AST through a compiler that emits either (a) a native function pointer (for shapes we recognize: equality on field, range on field, set membership on field) or (b) a bytecode interpreter as fallback. Sonny's match-spec subset must be expressive enough to compile to (a) for the common cases; otherwise we fall back to (b) and the predicate author gets a soft warning that they're on the slow path.
3. **Index by primitive_kind.** Predicates declare which kinds they care about at registration. Rows of unmatched kinds cost one hashmap lookup and a no-op return. This is Alexander's point #1 from his "anything you missed" and I am taking it as load-bearing.
4. **Cache against read-set hash.** If the same predicate fires twice against rows with identical `(primitive_kind, causal_read_set_hash, key_fields_hash)`, the verdict is memoized for that batch. Stelios's Salsa engine in L2 can extend this across batches if it wants; I'm not promising cross-batch cache from L1.

**SLA-safe envelope with mitigations in place:** up to ~50 registered predicates per primitive_kind, compiled, with read-set ≤ 32 entries, stays inside 80µs. Beyond that, registration starts soft-failing with an SLA-budget warning. This is a knob, not a wall — but it's a knob the runtime owns, not predicate authors.

**Where it irrevocably breaks:** Turing-complete predicates. If someone tries to register a predicate that calls back into L2 to evaluate a projection, that projection might be invalidated, recompute on the fly, and the commit path now waits on Stelios's engine. **No.** Predicates may *reference* projection-version IDs (those are stable hashes) but may not *call* projections at evaluate time. If you need projection state, snapshot it into the predicate's closure at registration and re-register when the projection-version ID changes. Same discipline as US-S-4 retroactive projections.

---

## 5. Interaction with `causal_read_set_hash` — yes, this is the feature

Both run pre-commit. Both are computed on the same row in the same window. The bus must see the read-set; that's most of the value.

**Contract: the bus receives `(row, read_set_view)` where `read_set_view` is a typed reader over the row's freshly-computed read-set entries** (not the hash — the *resolved* entries, because predicates need to ask questions like "did this Decision read any Observation tagged secret"). The read-set is computed *before* the bus is called; the bus is called *before* the hash is sealed into the row; predicates may read the entries but may not mutate them.

**Yes, predicates can be on read-set contents.** This is exactly Sonny's US-S-1 "pause if this Decision read any Observation tagged secret" example, and it falls out for free from this ordering. Example shapes I'm committing to support:

- `read_set.any(kind=ObservationRef, where=target.tags ∋ 'secret')` — set/tag membership over read-set entries.
- `read_set.contains(role=Trigger, target_id=$known_id)` — direct lookup.
- `read_set.count(kind=PrimRef) > N` — cardinality.
- `read_set.entries[*].target_hash ∈ $watch_set` — hash-set membership against a registered watch list.

**What I'm NOT supporting in v1:** transitive queries ("did anything in my read-set transitively read X"). That requires walking the causal DAG, which is L2's job, not the hot-path bus. If you want that, materialize it as a projection and reference the projection-version ID in your predicate at registration time. Same discipline as §4.

**This integration makes the bus strictly more valuable than the read-set alone**, because the bus is where read-set policy becomes *enforceable* rather than merely *recorded*. Tag-leak prevention, secret-egress detection, citation-required policies — all expressible as bus predicates against read-set entries. That's not a bonus; that's why the two features should be designed together.

---

## 6. Verdict: **ENDORSE with refinements**

Alexander's split (one shared pre-commit bus, three verdict outcomes, pause unified through L4) is correct. The refinements I'm imposing are:

### L1-side contract (locked):

**Ordering & throughput:**
- Bus runs **per-row, inside the group-commit window, before the fsync barrier**, after the row's `causal_read_set_hash` is computed but before the row is sealed.
- Bus is **not** serialized across concurrent batches.
- `continue` is the zero-cost default; matched-kind dispatch costs ~1µs; compiled predicate eval costs ≤ 80µs total per row under stated envelope.

**Pause transaction (commitment #8 extension):**
- On `pause` verdict, batch **seals through the pausing row inclusive**, fsyncs, acks. Remainder of batch returns to staging queue for re-evaluation in the next batch.
- Pausing row's `hook_verdict = pause` is **durable before L4 is invoked**. Crash recovery re-enqueues paused rows with no L4 verdict to the router. No double-decision.
- L4's eventual verdict (extensible enum per US-S-9) commits as a **subsequent WAL row** referencing the paused row's `seq`.
- One pause per commit cycle; second pause in same candidate batch goes to next batch.

**Recording (commitment #8 extension):**
- Two new nullable fields on `WalRecord`: `hook_verdict: u8?` (0=continue, 1=observe, 2=pause) and `hook_verdict_witness: blake3?` (CAS body: `{predicate_ids_fired, predicate_outputs}`).
- Either both NULL (no predicate matched) or both populated. `continue` verdicts with witnesses are valid (useful for "yes this predicate ran and said continue" audit trails) but optional — registrants choose at registration time whether to witness `continue`.
- Per-row cost: +1 byte tag always, +32 bytes when verdict ≠ continue OR witness requested. Zero when no predicate matched.

## Learnings (2026-06-02 — M8 Slice A: SqliteFactReader + Eureka migrations bootstrap)

**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** M8 Slice A (graham-m8-scope-proposal.md approved, Q1/Q2/Q3 locked by Aaron)

**What shipped:**
- `packages/eureka/src/db/`: `schema.ts` (applyMigrations verbatim on Cairn pattern), `migrations/001-facts.ts` (facts + FTS5 + triggers + trust_history scaffold), `openDatabase.ts`, `index.ts` barrel.
- `packages/eureka/src/storage/fact-reader-sqlite.ts`: SqliteFactReader implementing FactReader; db handle injected per Cairn convention.
- `packages/eureka/src/storage/index.ts`: storage barrel (InMemoryFactReader + SqliteFactReader re-exported).
- Contract wiring: `runFactReaderContract('SqliteFactReader', makeHarness)` at end of fact-reader.contract.test.ts; +5 contract tests.
- Test count: 74 → 79 (+5). All 79 pass. No regressions in cairn/forge/skillsmith-runtime.

**NaN decision:** trust column is NULLABLE (not `NOT NULL`) despite Graham's sketch showing `REAL NOT NULL DEFAULT 0.5`. CL-4 requires {trust: NaN} round-trip. SQLite has no NaN literal; `NOT NULL` coerces NaN to 0.0 at INSERT. Nullable column + JS-layer `NULL ↔ NaN` is the only compliant path. Schema deviation documented in roger-m8-slice-a.md decision drop.

**DB path:** `~/.eureka/eureka.db` per Aaron Q3 approval. `openDatabase` uses `os.homedir()`.

**Cairn DB-layer helper convention confirmed:** constructor takes `db: Database.Database` (caller-injected); `openDatabase` creates and migrates; SqliteFactReader never opens or closes the handle.

**Better-sqlite3 named params:** `Statement.get()` TypeScript types give "expected 1 argument" when passing two positional `?` values even though the runtime accepts them. Use `$name` named parameters and pass an object — single-argument signature, same runtime behavior. Adopted throughout.

**trust_history table:** scaffolded in migration 001 per Aaron Q1 approval; no writes in Slice A. Slice B will add the mutate writes.

**Predicate registration (new L1 ABI):**
- Predicates are **registered by ID**, not passed per-row. Registration returns a handle with explicit lifetime (per Alexander's fork-isolation point: child-fork registrations do not back-propagate to parent).
- Registration **compiles** predicates to native ops where possible, bytecode fallback otherwise.
- Registration **indexes by `primitive_kind`** for O(1) dispatch on non-matching kinds.
- Predicates **may read** the row's resolved read-set entries; **may not call** L2 projections at evaluate time (snapshot projection-version IDs at registration instead).
- SLA envelope: ≤ ~50 compiled predicates per primitive_kind, read-set ≤ 32 entries, stays inside 80µs per row.

**Read-set integration:**
- Bus receives `(row, read_set_view)`; read-set entries are evaluated before bus runs, hash is sealed after.
- Predicates on read-set contents (set/tag/role/cardinality/hash-set) are first-class in v1.
- Transitive read-set queries are **out of scope for the hot-path bus** — materialize as a projection if needed.

**`cairn fsck` extension:**
- For every row with non-NULL verdict witness, the CAS witness blob must resolve and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC, registry drift, and re-registration races.

### What I need from the team to land this:

- **Alexander:** the predicate registration ABI (signatures, handle lifecycle, compile target) is yours to define; I'll implement the L1-side dispatch and the recording. Confirm fork-isolation lifecycle matches your "anything you missed" point #2.
- **Sonny:** US-S-1 match-spec subset has to be expressive enough that "common case" predicates compile to native ops rather than fallback bytecode. Worth a focused conversation on the subset shape before freeze.
- **Stelios:** projection-version IDs must be **stable hashes** that predicates can snapshot at registration time. Restating the US-S-2/US-S-4 ask; this just makes it load-bearing for the bus.
- **Laura:** when L3 generators want bus-enforceable read-set policy (tag predicates, citation requirements), the predicate registration site is L4 startup, not the proposal schema. The proposal schema field stays as-is; policy is a separate registration.
- **Erasmus:** determinism conformance suite needs one more assertion — *re-evaluated hook_verdict on replay must equal recorded hook_verdict*. Same shape as the read-set assertion. Free correctness signal.

None of this changes my round-2 commitments on snapshot cadence, compaction, or CAS spill. It adds two nullable row fields, one CAS blob kind, one ABI for predicate registration, and one new `cairn fsck` check.

The bus is endorsed. The pause path is unified through L4 per US-S-9. The observe path is unified through L2. Pre-commit hook bus is the substrate — and as a side benefit, putting it on the same row that carries the read-set hash makes the substrate genuinely composable rather than three independent mechanisms pretending to cooperate.

If it compiles and fsyncs cleanly, that's a win.

---

## Plain-text summary for the coordinator

**Verdict: ENDORSE with refinements.** The pre-commit hook bus belongs *per-row, inside the group-commit window, before the fsync barrier* — after `causal_read_set_hash` is computed, before the row is sealed. Pause mid-batch is handled by **seal-and-split**: the batch fsyncs through the pausing row inclusive (so already-verdicted rows stay durable), the pausing row's `hook_verdict=pause` is on disk *before* L4 is invoked (crash-safe), and the remainder of the batch returns to staging. The verdict is recorded in the WAL row via two new nullable fields (`hook_verdict: u8?`, `hook_verdict_witness: blake3?`) — costs +1 byte always, +32 bytes only when a non-continue verdict fires; replay re-derives and asserts equality. Predicate cost stays inside my 80µs row-stage budget **only with pre-registration + compilation + kind-indexed dispatch + no L2 callbacks at evaluate time**; this is a hard ABI requirement, not a recommendation. Read-set predicates ("pause if this Decision read any Observation tagged secret") are first-class and arguably the killer feature — the bus is where read-set policy becomes *enforceable* rather than merely *recorded*, which makes the two features properly co-designed rather than coincidentally adjacent.


## 2026-05-24 Round 4: Phase B reconciliation against `D:\git\stunning-adventure`
Full audit inbox: `.squad/decisions/inbox/roger-reconciliation-2026-05-24T2330Z.md`.

**Headline:** Cairn already ships a working append log (SQLite `event_log`), a real 8-state proposal/approval lifecycle (`prescriptions` + `optimization_hints` with 8 statuses each, partial UNIQUE index dedup as built-in backpressure via migration 013), pluggable ProposalGenerators (Forge `promptOptimizer`/`tokenOptimizer` emitting `OptimizationHint`), a Merkle-like hash chain over Decision events (`dbom_artifacts`/`dbom_decisions` + `spike/dbom-generator.ts`), per-skill PGO-style derived rollups (`execution_profiles`), an outcome-learning loop (`change_vectors` Phase 4.6), drift signal substrate (`signal_samples` + `forge/telemetry/drift`), pre-persist secret redaction (`agents/secretScrubber.ts`), and a 5-vector x 3-tier validator surface (`skillLinter`/`skillValidator`) -- so US-R-4 and US-Ro-NEW-4 are essentially ALREADY-EXISTS and US-R-1/2/7/8/9 plus US-Ro-NEW-3 are PARTIALLY-EXISTS. What's pure greenfield: US-R-3 (fork/replay/branch metadata over ledger positions), US-R-5 (transitive provenance -- falls out of R-3), US-R-6 (federation), US-Ro-NEW-1 (snapshot+compaction), US-Ro-NEW-2 (observation capture/CAS), and both round-3 lock items (`causal_read_set_hash` on WAL rows; per-row pre-commit hook bus with 80us envelope). The last two also **CONTRADICT-EXISTING** because Cairn rides `better-sqlite3` (SQLite's built-in WAL journal-mode -- no app-exposed group-commit window, no per-row pre-fsync hook insertion point, no 80us-row-stage budget to honor). Migration path is friendly (linear, integer-versioned, transaction-wrapped, currently at v13): v14 introduces `wal_records` alongside legacy `event_log`, v15 stands up a CAS blob store, v16 snapshots+refs, v17 observation_capture, v18 tenant namespacing -- all additive.

**One load-bearing question for Aaron, not unilaterally resolved:** does Crucible v1 ride Cairn's SQLite store (in which case I re-baseline the round-3 WAL/hook-bus contract to transaction-batched semantics -- bus runs on an app-owned staging buffer before `db.transaction().immediate()`, same logical verdicts and seal-and-split, different physical layer) or stand up a custom storage engine (round-3 verdict stands as-locked, 80us/row envelope is achievable)? Flagging because it changes what `causal_read_set_hash` and `hook_verdict` cost to land. Full per-story classifications, evidence file:line cites, gap list of Cairn capabilities not yet storied, and the v14-v18 migration spec are in the inbox.

-- Roger


## 2026-05-25 Round 5: SPIKE fork (a) — port Cairn to a custom storage engine
Full spike inbox: .squad/decisions/inbox/roger-spike-fork-a-port-2026-05-25T0030Z.md.

**Executive summary.** Surveyed the existing Cairn SQLite surface (87 src files, 31 in db/, 13 linear migrations, 16 tables, 188 prepared/transaction call sites, 80 join/groupby query sites, 478-ish tests, one load-bearing partial UNIQUE index for backpressure, zero use of FTS/virtual-tables/triggers/UDFs/triggers — relational but shallow) and three engine candidates: A.1 pure-Rust edb via NAPI-RS (12-16 weeks, ~100% SQL-ergonomics loss, strongest correctness story, adds a Rust toolchain to a Node monorepo), A.2 Kris Zyp's lmdb Node binding with its eforeCommit hook (8-12 weeks, ~100% SQL loss, 80us-budget at risk under JS dispatch), and A.3 hybrid — custom append-only WAL file in pure TS for L1 only, keep etter-sqlite3 for the other 15 tables and all derived views (5-9 weeks, ~5-10% SQL loss, forward-compatible migration). **Verdict: REJECT A.1, ENDORSE-WITH-CAVEATS A.3, A.2 only as fallback if the JS predicate budget fails in integration.** Phase A's hard contracts bind only L1; rewriting the other six tiers to honor a contract that does not bind them is over-correction. Anti-anchoring alternative reading: if Crucible is heading toward regulatory determinism, 10^9+ rows, or WASM-runtime distribution, A.1's "one substrate, contracts enforced by construction" wins despite the cost — I'd flip if any of those three become true. Tagged Alexander (fork (b) is a contract-amendment, not a contract-honor — sqlite3_update_hook fires post-write not pre-fsync) and Gabriel (fork (c) breaks causal_read_set_hash globality the moment you shard across multiple SQLite files — contract (4) needs amendment).

-- Roger


## Learnings (2026-05-28 — CTD Phase 1 Lane 1: §3 L1 WAL + §4 Hook Bus authored)

WAL design patterns and invariant-enforcement mechanisms locked in §3 + §4 that
I'll want when authoring §10 (Session Model) and §15 (Compaction/Snapshots) in
Phase 2:

- **One fsync per group-commit, CAS-before-WAL ordering.** The rule that lets
  the WAL row safely reference a `payloadHash`/`readSetHash`/
  `hookVerdictWitness`/`contextWindowCommitment` is that the CAS body is
  fsync'd *before* the WAL record is written. §15 compaction must preserve
  this ordering on snapshot-spill: snapshot blob durable in CAS before the
  snapshot pointer row lands in the WAL.

- **Self-audit by chain alone.** `prevRoot[i] = selfRoot[i-1]` plus per-row
  `selfRoot = BLAKE3(CBOR(row \ selfRoot))` plus a per-session
  `manifest.lastSelfRoot` makes `cairn fsck` a single linear scan with O(1)
  state. `index.idx` is advisory and rebuildable; never trust it for
  correctness, only for seek-speed. Carry this same discipline into §15 —
  snapshots are advisory acceleration, never authoritative.

- **Hybrid resolver as a named seam.** `ContextWindowResolver` honoring R2-1
  is a tiny pure function but giving it a name (instead of inlining the
  if-declared-else-prefix branch into `AppendProtocol.append`) makes the
  Bootstrap-Capture-Completeness violation path testable in isolation and
  keeps replay's reconstruction code symmetric with commit's hash code.
  Pattern: every "tagged hybrid" gets its own resolver seam, never inlined.

- **Verdicts as null vs continue.** `hookVerdict: HookVerdict | null` with
  `null` meaning "no predicate matched" and `continue` meaning "a predicate
  fired and said continue" is the cheapest way to preserve P5 (continue
  zero-cost) while keeping the closed-enum invariant (P3) honest. The
  binary layout encodes both as zero-witness; the bookkeeping distinguishes
  them only for replay determinism. §10 should not invent a third sentinel
  — null is the absence sentinel.

- **Exactly-once-pause via WAL-first durability.** Pause verdict durable on
  the WAL row *before* L1Subscriber broadcasts to the Router means a crash
  between seal and broadcast replays the broadcast from disk on next boot.
  The bus has no separate Router channel; the broadcast on the paused row
  *is* the Router's pause inbound. §10's session-reopen protocol must
  re-broadcast pending pause rows whose Router-ack Observation is missing.

- **Bootstrap atomicity = single group-commit.** §3.8 bootstrap-batch writes
  the entire `BootstrapPayload` as one atomic group-commit at offset 0. §10
  must never spread session bootstrap across multiple `append()` calls —
  the all-or-nothing property is what lets replay refuse to advance past
  offset 0 on bootstrap-manifest mismatch (TDD §6.8).

- **Fork = sibling directory + synthetic offset-0 row + cross-session chain
  edge.** No CAS body copy; CAS dedup is implicit by hash. `cairn fsck
  --with-parent` is the cross-edge walker. §10's fork API surface should
  expose these as three orthogonal capabilities (create dir, emit
  fork_origin Observation, link prevRoot) rather than one opaque
  `fork(parent, offset)` call — composability over economy.

- **Monotonic timestamps are advisory; offsets are structural.** Replay
  equality excludes `timestampNs` via `normalizeTimestamps()`; the `+1`
  floor absorbs wall-clock regressions; violations are recorded as
  Observation rows, never suppressed. Any future invariant I add in §10/§15
  should follow the same pattern: distinguish advisory metadata (excluded
  from replay equality, recorded as observable rows on violation) from
  structural data (byte-compared in replay).

- **Seam map as deliverable.** §3.14's table mapping internals to test tier
  + Laura collaborator + test double class is the load-bearing artifact for
  London-school component testing. I'll replicate this in §10 and §15 —
  every public collaborator gets a row, every internal pure function gets a
  row, every file-backed integration gets a row.

- **Per-tool-call primitive scale is intra-batch.** §3.6 enforces "one
  primitive per (toolCallId, phase)" within a batch only; cross-batch
  pairing of `invoke` → closing Artifact is Aperture's job, not L1's. §10
  session-config carries the pairing-window deadline so different session
  types (debug, prod, replay) can tune it.
📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.

## 2026-05-30: Pass A CLI Edits — §13.1 verb registration + §9.9 coordination

**Context:** Picked up two owed Pass A triage items after session silence. Aaron requested CLI documentation edits: (1) register crucible perf [top] [--json] in §13.1 verb table, (2) coordinate crucible defer --help text with Valanice's parallel §9.9 edit.

**Decision 1: crucible perf Registration**
- **Choice:** Added as standalone verb (like status, sck), NOT as saved query
- **Rationale:** §17 explicitly documents [top] sub-variant (dispatch-latency sort) which is verb-specific, not query-driven. Consistency with diagnostic-verb family. Verb placement: between status and config in §13.1
- **Placement:** §13.1 line 44 (new row between diagnostic verbs and config)

**Decision 2: defer Help Text Coordination**
- **Original:** "Local snooze; no L1 write (§9.9)."
- **Updated:** "Local snooze; no L1 write. Re-renders entry with \deferred\ annotation."
- **Rationale:** Embedded Valanice's expected substring from §9.9 line 318 ("no L1 write; re-renders entry with deferred annotation"). Removes redundant cross-ref; text is now self-contained for CLI --help stability.
- **Coordination:** Valanice now has locked help text to reference in §9.9 edits; no ping-pong on text consistency.

**Files modified:** docs/crucible-technical-design/13-crucible-cli-shell.md (§13.1 two rows edited)

### Learnings

**"Minor" edits often require multi-surface coordination.** The defer help text appears in three places: (1) §9.9 semantics table, (2) §13.1 verb table, (3) CLI binary --help output. If you change one without thinking about the others, you create an async update problem. The right pattern: lock help text at the "closest to implementation" site (§13.1 in this case) and use that as the reference for cross-document consistency. Valanice's parallel edit on §9.9 can now cite §13.1 as the stable source.

**Standalone verb vs saved query — heuristic:** If the affordance has a **sub-variant with different semantics** (perf vs perf top), it's a verb. If it's purely a **named SELECT**, it's a saved query. The [top] sort policy couldn't live in a saved query without embedding sort hints in the query name (e.g. @perf-top-dispatch-latency), which doesn't scale. Diagnostics with complex filtering belong in verbs, not queries.

**Documentation ownership boundary:** CLI descriptions should be stable w.r.t. what the CLI actually does. If a section's description references the CLI, treat the CLI text as the authoritative surface and work backward to the design doc, not the other way around. §17 references crucible perf; the CLI text in §13.1 is now the contract both §17 and the binary promise to fulfill.
# Roger — History

**Role:** Craft / Platform Engineer (Monorepo integration, telemetry, cross-package seams)
**Status:** §40 integration seams hold. M2-M3 baseline preserved. Cycle 2 C8 §40 convention doc (pending).
**Last update:** 2026-05-29

**Key milestones:**
- Phase 4.5-4.6: Telemetry aggregation fixes, bridge event contracts, change-vector platform
- Brain system: Proposed Platform Engineer core role for Phase 1-3 infrastructure
- M0 critical path: 5-day monorepo sprint + 4-hour spike first
- Cycle 2 findings: C8 escalated/resolved (eslint strict, §40 documentation pass)
- Eureka M2-M3: tsc clean, no new coupling risks

**See history-archive.md for detailed entries.**
## Learnings (2026-05-31 — M1 Cycle-2 Polish Wave: Issue #39 / PR #40)

### Migration-collapse rule (pre-merge)

When two migrations for the same feature are both unmerged to main, fold them into the lower-numbered one. Each column gets its own `if (!cols.some(...)) { db.exec(...) }` idempotency check (not a combined early `return`). Keep the single stderr guard at the top for missing-table protection. Delete the higher-numbered file, remove its import and registration from schema.ts. Tests that assert schema version go back to the lower number.

### Shared serializer pattern (N3)

For tool families with a list (summary) + get (full) shape, extract a private `buildXxxSummary()` helper in server.ts. The get builder spreads summary and adds full-detail fields. Location: private (non-exported) function above the exported builder pair in server.ts. This prevents list/get field drift. Document intentional omissions (e.g., raw confidence float) with a one-line JSDoc on the summary helper.

## Learnings (2026-05-31 — M1 Cycle-1 Findings: Issue #39)

### Schema co-evolution: two migrations in one PR (017 + 018)

Adding migration 018 to the same PR as 017 was fine — the runner is purely sequential, both migrations are guarded against missing tables, and each is idempotent. The only cost was updating the "MAX(version)" assertions in 4 test files a second time. If the two columns had been logically coupled from the start I'd prefer one migration, but when review feedback drives the change, a second migration is the right call — it keeps the migration history honest (017 = what shipped, 018 = what review demanded) and makes rollback surgical.

### Handler-layer testability pattern (extracted pure functions)

The cleanest approach: extract each handler body into an exported pure function that takes `db: Database.Database` + params and returns the raw JSON payload object. The MCP handler wraps the result in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Tests import the pure function directly from `server.ts` (safe because the `if (isScript)` guard prevents the MCP server from starting on import). Benefits:
- Tests operate on plain objects, not MCP content wrappers
- No MCP harness needed
- Functions are also useful in non-MCP contexts (e.g., CLI tools, tests in other packages)
Pattern: `buildListHintsResult(db, params)`, `buildResolveHintResult(db, params)`, `buildGetHintResult(db, params)`.

### Persona finding initially disagreed with, then came around

**F6 (active_count misleading when status filter present):** My first reaction was "the consumer knows what status they asked for, active_count is just extra info." But after implementing it I understood the Craft persona's point: if you ask for `status=rejected` and get `active_count: 0`, an LLM consumer might interpret that as "nothing is active" when really active hints exist — they just weren't in scope. Omitting the field when it can only be misleading is the cleaner contract. The comment in the code documents this intent for the next engineer.

**F11 (event payload missing resolution intent):** Also came around on this. The initial emit recorded `from_state → rejected` which is sufficient for lifecycle tracking. But Aaron's stated dogfood loop requires forge to distinguish user-dismissed hints from system-expired ones. Without `source: 'mcp'` + `resolution_disposition` in the event, forge can't learn from Copilot's disposition signal. The fix was low-cost; the signal is high-value.

## Learnings (2026-05-31 — Issue #39 M1: Hint Consumption MCP Tools)

### Partial-schema test DB gotcha with ALTER TABLE migrations
- Tests like `migration015.test.ts` and `worktreeSessions.test.ts` create a bare SQLite DB with `schema_version` seeded at a specific version (e.g., 14 or 15) then call `applyMigrations()`. They only include the tables they need (e.g., `sessions`). If your new migration uses `ALTER TABLE <table>` and that table was created by an earlier migration (that was skipped), it will fail with "no such table: X".
- Fix pattern: guard the migration with a `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='my_table'` check. Return early if table doesn't exist. Also add an idempotency guard with `PRAGMA table_info(my_table)` to check if the column already exists before `ALTER TABLE`.

### cairn MCP tool registration pattern
- All cairn tools live in `packages/cairn/src/mcp/server.ts` via `server.registerTool(name, schema, handler)`.
- Follow the exact pattern: `{ title, description, inputSchema: { ... zod fields }, annotations: { readOnlyHint } }`.
- Handlers always call `ensureDb()` first, wrap everything in try/catch, return `{ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }`.
- Error path: `return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true }`.
- `confidenceToWords()` is already exported from server.ts for high/medium/emerging labels.
- For read-only tools: `annotations: { readOnlyHint: true }`. For mutating tools: `annotations: { readOnlyHint: false }`.

### Never use `git add .` after manual file work
Never use `git add .` after manual file work — explicit per-file staging avoids sweeping untracked artifacts into commits.

### Idempotent resolution with status machine
- `optimization_hints` has a strict state machine (STATUS_TRANSITIONS). User-facing "resolve" actions should use `force: true` semantics or bypass the machine directly via SQL UPDATE.
- Terminal statuses: `applied, rejected, expired, suppressed, failed`. Check these before transitioning so the resolve tool can be idempotent.
- Both "resolved" and "dismissed" user dispositions map to `rejected` status — the distinction is preserved in `resolution_note` and the returned `resolution` field.

## Learnings (2026-05-27 — Issue #11 WI-A: workdir-aware sessions)

### Migration wire-up pattern
- Import the new migration in `schema.ts` alongside previous ones; append to the `migrations` array. The runner applies them in order using `MAX(version)`. No other file needs touching.
- Any pre-existing test that asserts `MAX(version) = N` or `COUNT(*) from schema_version = N` will break when a new migration lands — update those assertions (they're "track the latest version" tests, not migration-specific tests).
- Partial index on an active-status predicate (`WHERE status = 'active'`) is the right pattern for session lookup indexes — keeps the index small and covers the hot query path.

### NULL-IS query semantics for workdir
- SQLite's `IS` operator handles NULL comparison correctly: `col IS NULL` matches NULLs; `col IS 'value'` matches the literal. Use `IS` (not `=`) in WHERE clauses that need to match NULL as a distinct identity value.
- In better-sqlite3, `stmt.get(repoKey, null)` passes SQL NULL correctly — no need for IS NULL string injection.
- Keep two separate inner helpers: one without a workdir filter (for MCP fallback that needs any session) and one that always applies `workdir IS ?` (for worktree-scoped lookups). Don't try to collapse them into one with a conditional clause when the semantics diverge.

### `getActiveSession` backcompat semantic (reconciled with Laura)
- When `workdir` is omitted: NO workdir filter — returns most recent active session regardless of workdir. This is the correct backcompat path because old callers expect to find the session they created (which may have had a workdir set by new code).
- When `workdir` is provided: `AND workdir IS ?` — exact worktree match. String value matches that workdir; `null` passed explicitly matches NULL rows.
- The spec said "fall back to `WHERE repo_key = ?`" — that means truly no filter, not "filter for NULL." The "preserve backcompat" language refers to old callers still working, not to NULL-only matching.

### Concurrent test authorship — live file changes
- Laura's test file (`worktreeSessions.test.ts`) was written concurrently in the same worktree. I read one version, implemented to its expectations, then the file changed before I re-ran tests. The failing test name changed between runs — that's a signal the file was updated, not that my implementation broke.
- When a test file changes mid-flight, re-read it before diagnosing a "new" failure. Don't chase the old test contract.

### New API threading pattern for optional context params
- When adding an optional context param (like `workdir`) to a function with multiple optional callback params after it (like `afterCurate`), add the new param as the LAST optional so existing callers don't break by positional shift. Exception: if the new param is semantically earlier, introduce an options object instead.
- In archivist.ts, `getDb()` at the agent level is fine — the DB injection rule applies to `packages/cairn/src/db/*.ts` helpers, not to agent-level orchestration code.


## Session: 2026-05-28 Wave 6 Tail — WI-A Implementation Complete

**Status:** Complete

- Implemented migration 015 (workdir column + partial index)
- Updated DB API: createSession, getActiveSession, listActiveSessionsForRepo
- New export: getWorkdir() for git integration
- Threaded workdir through archivist, sessionStart, postToolUse, types
- MCP breaking change: get_status flat array, get_session identity lookup
- Semantic correction applied (turn 2): getActiveSession no-arg → \AND workdir IS NULL\
- Validation: Build clean, 647/647 tests passing

**Commits:** 2613c78 + ea9ab58

**Decision files:** roger-issue-11-implementation.md + roger-issue-11-api.md → merged to decisions.md

**Next:** Branch ready for merge. WI-B (Gabriel) queued.


### 2026-05-02: Phase 4.5 Telemetry Learnings & Persona Review Fixes

**Event:** Telemetry module hardening post-persona review.

**Key fixes:**
- F1: Weighted mean aggregation (prevent overwrite of prior history)
- F2: Convergence floor (fire on first success signal, not end-of-session)
- F4: Event contract alignment (COLLECTOR_BRIDGE_EVENTS constant + contract test)
- F5: Streaming percentile sketch (100-bucket histogram for [0,1] drift range)
- F6a: Per-signal component means on ExecutionProfile.signals
- F7: Silent error logging in sink
- F11: typeof guards on payloads (toolName string, numeric guards)

**Architecture patterns learned:**
- Shared symbol enums for cross-module contracts (bridge ↔ collectors)
- Streaming quantile sketches for bounded metrics
- weightedMean() helper prevents deflation-toward-zero failure mode
- Fail-open principle: telemetry must never block session execution

**Files touched:** 7 core files + 3 test files. Tests: +24 new. Build: 1012 passing (cairn 478 + forge 534).

**Key lesson:** When collector contract spans modules, enumerate shared symbols + enforce via contract test. Type-level coupling insufficient for JSON boundaries.


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---

## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.

### Learnings

**`createRequire` is the correct ESM pattern for optional CJS native addons.** With `type: "module"` in package.json, static `import` of an optional module fails at load time with no opportunity to provide a better error message. `createRequire(import.meta.url)` + try/catch inside the consuming function gives clean degraded-mode semantics: the module loads fine without the addon; only `openDatabase()` callers pay for the dependency. `import type` keeps full TypeScript typing without the runtime binding.

**Subpath exports + optionalDependencies is the right isolation boundary for native addons.** Moving `better-sqlite3` to `optionalDependencies` and gating it behind `./sqlite` subpath means in-memory consumers see zero native-module cost. The core `@akubly/eureka` surface stays portable. This pattern will recur anywhere native addons are "heavy but optional" (e.g., a hypothetical `./leveldb` subpath for production key-value tier in Slice D).

**BEGIN IMMEDIATE is the migration race fix, not IF NOT EXISTS alone.** `IF NOT EXISTS` is defense-in-depth for crash recovery (partially-applied DDL); it does not serialize two simultaneous first-opens. IMMEDIATE lock ensures only one process applies migrations; the other reads `schema_version = 1` and skips cleanly. The two mechanisms solve different failure modes and should both be present.

**Harness cleanup belongs in the contract helper, not implementation-specific blocks.** Making `cleanup?: () => void` optional on `FactReaderHarness` keeps the InMemoryFactReader harness backward-compatible (no native handles to close) while ensuring all native-backed implementations can register teardown. The `afterEach(() => harness?.cleanup?.())` pattern in `runFactReaderContract` guarantees cleanup fires even if a test throws. Pattern applies to any future harness that wraps a native resource (file, socket, worker thread).

---

## Learnings (2026-06-05 — M8 Slice B: SqliteTrustUpdater + shared contract refactor)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** a7cab31 (SqliteTrustUpdater), 0a8bec2 (sqlite/index export), 0bdf7da (refactor + test wiring)  
**Test delta:** +7 net new contract tests (C-1..C-7 for SqliteTrustUpdater). Total: 93 passing + 1 todo tombstone.

### BEGIN IMMEDIATE choice

Used `db.transaction(fn).immediate(args)` — the better-sqlite3 `.immediate()` method on a Transaction object. This acquires the SQLite write lock at the start of the transaction rather than at first write (which is what DEFERRED BEGIN does). WAL mode is single-writer regardless, but DEFERRED can trigger SQLITE_BUSY_SNAPSHOT if a concurrent writer upgrades between our read and write. IMMEDIATE eliminates that window. Combined with `busy_timeout=5000ms` (set in `openDatabase`, Slice A cycle-2), concurrent callers retry rather than fail. No JS-layer promise chain needed for SQLite — DB-level serialization is the whole point.

Implementation detail: `db.transaction(fn)` returns a `Transaction<F>` object. The `.immediate` property is a bound method on that object — you call it as `rawTxn.immediate(args)`. Do NOT try to do `this.txn = rawTxn.immediate` as a bare property reference without binding or wrapping; the binding is fine on current better-sqlite3 but wrapping as `(args) => rawTxn.immediate(args)` is more explicit and future-proof.

### InvalidTrustValueError propagation through the transaction wrapper

The medium risk Aaron flagged was confirmed to be a non-issue: better-sqlite3's transaction wrapper propagates any thrown error out of the `.immediate()` call completely unchanged — no wrapping, no `TransactionError` nesting. `InvalidTrustValueError` thrown inside `db.transaction(fn)` lands on the caller as the same object instance, with the same `code`, `source`, `value`, and `message`. C-3 passes cleanly. Same for `FactNotFoundError` (C-4) and arbitrary fn errors (C-2). The only surprise to guard against: if you throw inside a transaction and the rollback itself throws (edge case with WAL + disk full), better-sqlite3 wraps that in its own error. In normal operation this does not occur.

### Vitest 3.x requires ≥1 test per test file

When relocating a contract suite from `activities/__tests__/` to `storage/__tests__/`, the old file cannot simply be emptied — vitest 3.x throws "No test suite found in file." Solution: add a single `it.todo(...)` tombstone in a describe block. The todo shows as 1 skipped test, satisfies vitest, and self-documents the move. This is the pattern for any future suite relocation.

### Importing from a vitest test file causes test duplication

If test file A imports from test file B, vitest loads B's module-level `describe`/`it` registrations TWICE (once from B directly, once from A's import). A module re-export like `export { runX } from '../storage/__tests__/x.contract.test.js'` in a test file will cause vitest to run all of B's tests a second time. Do NOT use test files as re-export modules. If a helper needs to be shared, put it in a non-test `.ts` helper file (no `.test.ts` suffix). For Slice B the fix was: strip the activities tombstone to a describe+it.todo with no imports from the storage test file.

### C-5 (concurrent serialization) passes without JS locks

SQLite WAL + BEGIN IMMEDIATE serializes 5 concurrent async mutate() calls at the DB level. The `Promise.all([...5 mutations...])` pattern in C-5 works because better-sqlite3 is synchronous: each `await impl.mutate(...)` resolves synchronously inside the event loop tick, so "concurrent" in terms of Promise.all means sequentially queued microtasks hitting the same synchronous SQLite lock. No JS-side per-key promise chain needed for the SQLite impl.


# SUMMARY (as of 2026-06-01)

File size: 103960 bytes. See history-archive.md for earlier entries.

---

## Learnings (2026-06-06, Refactor 3 GREEN — real SQLite adapter)

**Schema chosen (Crucible-owned, OQ-2 FEDERATE):** Two tables — `sessions` (`id`, `parent_session_id`, `fork_point_event_id`, `plugin_versions` TEXT/JSON blob, `created_at`) and `events` (`session_id`, `"offset"`, `primitive_kind`, `primitive_payload` JSON, `causal_read_set` JSON, PRIMARY KEY on `(session_id, offset)`). The quoted `"offset"` is required because `offset` is an SQLite reserved word.

**Adapter file:** `packages/crucible-core/src/sqlite-db.ts` — exports `createSQLiteDB(path: ':memory:' | string): InMemoryDB`. Each call returns an independent DB instance (no singleton pattern — correct for test isolation). Uses prepared statements for all queries.

**Dep versions:** `better-sqlite3@^12.8.0` + `@types/better-sqlite3@^7.6.13` added to devDependencies in both `packages/crucible-core` and `packages/crucible-cli`. These match the versions already present in `packages/cairn` and `packages/eureka`; workspace hoisting resolved them to the same native binary at `node_modules/better-sqlite3/build/Release/better_sqlite3.node`. The native .node binary was already built (cairn/eureka had already triggered it); no rebuild was needed.

**Windows native module gotcha:** `npm install --ignore-scripts` does NOT build the native add-on — only use it if the binary is already present. When adding `better-sqlite3` to a new package in the workspace, a plain `npm install` is sufficient if another workspace package already has it (hoisting reuses the built binary).

**`@ts-expect-error` lifecycle:** Laura's fixture correctly used `@ts-expect-error` during RED phase (createSQLiteDB undefined). The directive becomes "unused" once the export is present but vitest uses esbuild transpilation (not tsc), so it doesn't error on unused suppressors at test time. The `__tests__` dirs are excluded from tsconfig compilation so typecheck also stays clean. No change to the fixture file was needed.

**Pre-existing ESLint issue (not mine):** `packages/crucible-cli/src/__tests__/fixtures/test-db.ts` line 73 has `eslint-disable-line import/named` but the `import/named` ESLint plugin is not installed in the workspace — the error predates Refactor 3 and is present in the committed baseline. Not caused by my changes.

---

## Learnings (2026-06-06, OQ-2 substrate analysis)

**MERGE does not eliminate dual-write; it adds a second incompatible writer.** Crucible's canonical store is the binary `.seg` WAL files — SQLite is a derived projection. If Crucible writes Primitives to Cairn's `event_log`, it still must write to `.seg` segments for hash-chain integrity. Two writers. The only way to collapse them is to abandon the WAL's replay properties entirely, which guts §3. "Merge to one substrate" only works if the merged substrate IS the authoritative store; it doesn't work when the authoritative store is already a custom binary format.

**Substrate incompatibility is concrete, not philosophical.** Cairn's `event_log` has no `offset` column (uses AUTOINCREMENT cursor id), no `fork_point_event_id`, no `parent_session_id` on sessions, and no `plugin_versions`. Crucible's `DB` interface's three methods — `getSession` (returns `ledgerSize`), `insertSession` (takes full fork lineage), `queryEvents` (range by offset) — cannot be satisfied against Cairn's schema without either extending Cairn's schema with Crucible-specific columns or introducing a translation layer. Both paths are FEDERATE with extra steps.

**`§15` "two event-log tax" is already on the books — collect it, don't fight it.** The accepted-tax framing in §15 was the right call. Trying to merge the substrates to avoid the tax introduces migration coupling, interface restructuring, and cross-package test dependencies that cost more than the tax they avoid.

**Port interfaces define the readiness floor for the next TDD cycle.** The existing `DB` interface (`getSession` / `insertSession` / `queryEvents`) is already the right contract for the SQLite adapter. When an interface already describes the correct behavior with the right types, the Refactor cycle cost is just "write the impl" — not "redesign the interface." This is the payoff of London-school design: the mock you built against defines the real adapter's entry criteria for free.

---

## Learnings (2026-06-06, PR #45 final fixes)

**Prefer domain types over `unknown[]` in port interfaces.** `DB.queryEvents` was typed `Promise<unknown[]>`, erasing the `Primitive` type that the in-memory impl already returned correctly. Port interfaces are contracts — they should reflect the actual domain type, not a widening escape hatch. When the impl already returns the right type, the fix is purely additive and compile-safe.

**Trailing-slash gitignore patterns match directories only (recurring lesson).** `.squad/health-report-*/` silently fails to ignore health-report *files* — the trailing slash restricts matching to directories. The correct pattern is `.squad/health-report-*` (no slash). This is the same issue that bit us during the Sprint 0 recovery; it is now documented with a callout in the SKILL example so future agents don't repeat the mistake.

---


📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §10 + §15 shipped. All Phase 1 errata closed (2a/2b/12b/5). Cross-section R2-6 sync (Rosella ↔ Roger) CLOSED. PluginVersionLock format finalized. Phase 3 unblocked. — Scribe

## 2026-05-28: CTD Phase 4 — CALL/RET semantics + Scheduler-tier WAL readiness (§3 + §10 amendments)

**Context:** Aaron locked three Phase 4 UIS decisions per team weigh-in. My scope: locks #2 (CALL/RET) + #3 (Scheduler tier — substrate implications only; Gabriel owns §5 Router/Scheduler boundary).

**§3 amendments (L1 WAL Substrate):**
- **New §3.3.4 — CALL/RET sub-kind fields on `TaskStart`/`TaskEnd`.** Additive body fields under §6.5 evolution rule: `invocationId` (session-unique CALL/RET pair id), `parentInvocationId` (lexical-stack parent, NULL at top level), `returnTo: EventId` on `task_end` (zero-walk RET link to matching `task_start`), optional `callDepth` (derivable, kept for §13 `bt` UX single-row read). Recommended derivation `BLAKE3(sessionId || taskId || commitOffset)` — LOCKING deferred to Graham/Aaron (open question). Mis-nesting is a durable `monotonic_violation`-class projection alert; row still commits. `parentInvocationId` is distinct from `envelope.causalParentId` (lexical-stack vs causal-spawn edges coexist).
- **New §3.3.5 — Scheduler-emitted Decisions.** Pure substrate-readiness declaration: scheduler Decisions traverse `AppendProtocol.append` indistinguishably from model Decisions. No new column; `scheduler_*` discriminator is an additive optional body field. Did NOT enumerate sub-kinds (Gabriel's §5/§17 scope).
- **§3.17 ripple bullets** extended for §5 (Scheduler is first-class L1 producer) and §10 (invocation-stack projection).

**§10 amendments (Session + Branching):**
- **§10.6 rewrite** — sub-task model updated with CALL/RET body shape; L2 bracket-discipline validator pinned; `fork_origin.body.openTaskStack` superseded by richer `openInvocationStack: Array<{ taskId, invocationId, parentInvocationId, callDepth }>` (legacy shape preserved as compat-tolerated).
- **New §10.6.1 — Stack-frame reconstruction (derived view).** Pseudocode `ReconstructInvocationStack(sessionId, N)`: linear scan, seeded from `fork_origin` for forks. Closes Laura Q2 CALL/RET well-bracketed-nesting gap — property is now a single-scan PBT over the WAL trace. Sonny's §13 `bt` UX feeds off this. Replay equality of reconstructed stack is part of §11.6 oracle.
- **New §10.6.2 — Sub-task vs sub-session distinction.** Authoritative 10-row comparison table (identity, storage, lineage edge, concurrency, plugin snapshot, bootstrap, hash chain, backtrace, use case, replay containment). Rule of thumb: blocking + same epistemic line → sub-task; alternative trajectory + independently inspectable → fork. The two compose.
- **§10.9 acceptance signals** + cross-refs extended (§5 Router/Scheduler, §13 CLI `bt`).

### Learnings

**Sub-kind body fields > new WAL columns for primitive evolution.** Phase 4 added invocation-frame structure (`invocationId`, `parentInvocationId`, `returnTo`, `callDepth`) without changing one byte of the WAL row schema. The §6.5 additive-evolution rule plus per-payload CBOR body means the substrate absorbs new structural fields by letting them ride inside `primitive.primitivePayload` (reachable via `payloadHash` like any other field). When the field genuinely needs row-prefix locality (cheap predicate scans without body fetch), promote to a `flags` bit (e.g. `taskBoundary`); otherwise leave it in the body. The CALL/RET fields are body-field candidates because they're consumed by stack reconstruction (already a body-walking projection), not by hot-path predicate scans.

**Two-edge discipline pays off again.** `envelope.causalParentId` (causal-spawn) and `body.parentInvocationId` (lexical-stack) are distinct edges that answer distinct queries — exactly mirroring §6.4's `parentId` (structural production) vs `causalParentId` (sub-task spawn) split. The discipline is: never collapse semantically-distinct edges into one field even if they "usually align." Replay debuggers and PBT generators want to traverse each independently. Future temptation will be to drop `parentInvocationId` because "you can recompute it from `causalParentId` plus stack reconstruction" — resist it; the redundancy is a structural witness, not duplication.

**Substrate-readiness declarations are a first-class artifact.** §3.3.5 doesn't spec the Scheduler — it declares L1 ready for it. This is the right pattern when (a) another section owns the actual spec and (b) you need to publish "the substrate will not need to change" as an architectural guarantee. The shape of such a declaration: name the path through existing surfaces (`AppendProtocol.append`), name the discriminator location (body field, not row column), name the published guarantee ("regardless of who emitted it"), and explicitly disclaim what is NOT in scope. Gabriel can now design §5 without round-tripping with me on storage shape; if his design requires substrate change, that becomes a NEW Phase 4 finding rather than a surprise.

**Mis-nesting as durable signal, not exception.** Append-only discipline says: a `task_end` that doesn't match the top-of-stack `invocationId` still commits. The violation surfaces as an Aperture attention-tier event, not a thrown exception. This is the same pattern as §3.10 `monotonic_violation` — the WAL never refuses a row for structural-validator reasons; it records the discrepancy as another row and lets investigation (L5) decide what it means. Phase 4 added the third instance of this pattern; it's now a substrate idiom worth naming in §17.

📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe

## 2026-05-30: CLI Review — childSid Collision Hybrid Design (Round 2)

**Context:** Aaron requested user-story framing for childSid collision design. Rosella delivered hybrid option (user chooses fresh/resume at fork time, interactive prompt on collision). Roger reviewed for CLI consistency.

**Verdict: APPROVE-WITH-CONDITIONS.** Verb/flag shape is consistent with §13.1 taxonomy. Help text mirrors `defer` conventions. `--disambiguator` flag from Option B is **redundant** (timestamp-variant preimage in `--fresh` handles collision prevention). Interactive prompt mechanics need tightening: TTY detection, `--no-interactive` flag, exit codes (0, 1, 2, 130).

**Deliverables:**
- Review document: `.squad/decisions/inbox/roger-review-childsid-hybrid.md` (16.4 KB, comprehensive analysis)
- Draft help text for `crucible fork --help` (mirrors §13 conventions + L1 semantics)
- Condition #1: Keep both flag-based `--resume` and verb-based `crucible session resume <childSid>` (orthogonal use cases)
- Condition #2: Spec TTY detection + exit codes (Table: 0=success, 1=generic error, 2=non-TTY needs flag, 130=user cancel)

**Key design points:**
- `crucible fork --at <offset>` (interactive on collision, TTY-aware)
- `crucible fork --at <offset> --fresh` (deterministic timestamp preimage, orphan aborted)
- `crucible fork --at <offset> --resume` (error if none exists; requires --no-interactive in CI)
- `crucible session resume <childSid>` (direct resume by session ID; separate from flag)
- `--no-interactive` flag suppresses prompt even if TTY detected (CI/script safe)
- Decision row in parent ledger records choice (fresh/resume + rationale) → deterministic replay

**Learnings:**
- **Interactive CLI + CI integration:** Always spec TTY detection upfront, not as afterthought. Non-TTY context requires explicit flag-driven paths; exit code 2 ("needs flag") is load-bearing for automation.
- **Redundancy detection:** Multiple mechanisms for same goal (timestamp preimage vs user-provided disambiguator) create cognitive load + implementation risk. Favor one well-chosen mechanism (timestamp) unless escape hatch solves qualitatively different problem.
- **Verb vs flag distinction:** Separate verbs (`crucible session resume`) and flags (`--resume` on `fork`) serve different UX flows. Document relationship clearly when both exist.
- **Decision-recording for determinism:** When user input affects session structure, record choice as Decision row (not silent WAL write). Evidence.rationale documents *why* (flag/prompt/default) → audit trail + unambiguous replay.

---

## 2026-05-28: CTD Phase 2 — §10 (Session + Branching) + §15 (Coexistence) authored + Phase 1 errata applied

**Context:** Phase 2 fan-out. Two primary sections (§10 ≤3pp, §15 ≤3pp) plus four Phase 1 synthesis-review errata that landed on §3 + §6 + §7.

**Phase 1 errata applied:**
- **Finding 2a (Timestamp ms/ns drift):** Chose **option (c)** — split. Added `type TimestampNs = bigint` to §6 (additive under §6.5 evolution rule, coordinated with Graham); §3.3 `WalRow.timestampNs` now typed `TimestampNs`. Rejected option (b) (import-site alias only) because future arithmetic consumers like §5.3 `queueDeadline: Timestamp` would still read `number` carrying nanoseconds with no type signal. Rejected option (a) (rename existing) because it forces churn on legitimately-ms envelope readers.
- **Finding 2b (`manifestRoot` flag):** Added to §3.3 `flags` enum and §3.2 binary-layout bitfield comment. Already referenced by §3.8 bootstrap pseudocode; the schema slot now matches the writer.
- **Finding 12b (`appendFenced` undeclared):** Added §3.4.1 — full surface spec including fencing condition (`segment.nextOffset() === expectedHead` under single-writer lock, pre-stage), failure semantics (no CAS write, no bus dispatch, returns `{kind: 'fence-violation', actualHead}`), single-writer assumption (intra-process audit-hook gap absorbed; not multi-writer), when-to-use vs `append(batch)`, and bounded-retry contract for §8.3 `applyWithFence`.
- **Finding 5 (`dependentPaths` semantic split):** Patched §7.1 `StructuralProposalGenerator.dependentPaths` from `string[]` to `EventId[]` — concurred with synthesis-review recommendation. Content-addressed wins over routing-key for replay; §5.3 was already `EventId[]`, so one-side reconciliation.

**§10 highlights:** `sessions` table schema is L2 cache (rebuildable from L1); `bootstrap_manifest` carries digests not bodies (R2-2 — extra-ledger context lives on offset-0 Observation rows, not in the manifest column); fork protocol writes a synthetic `fork_origin` Observation at child offset 0 and COW-snapshots `bootstrap_manifest` by reference + lockfile verbatim; forked-timestamp monotonicity floor propagates through `fork_origin.body.parentForkPointTimestampNs` so multi-generation fork chains (TDD §6.4) preserve the time-axis invariant by induction.

**§15 highlights:** Coexistence boundary table — share `@akubly/types` brand types, fork everything else (storage, write pattern, plugin registry, migration numbering, investigation surface). Eight new shared types enumerated. Five accepted taxes named (two event-logs, two plugin-discovery paths, two session models, two notification surfaces, two trust-tier vocabularies). `@akubly/crucible-plugin-registry` co-owned with Rosella — she owns the install-phase algorithm, Roger owns the `PluginVersionLock` format + fork-phase verbatim-copy rule + session-start pure-load contract.

### Learnings

**Lockfile-format negotiation pattern (R2-6 sync pair with Rosella):**
- The right split is **algorithm-side owns the install resolver**, **format-side owns the lockfile schema + consumer rules** (fork-snapshot verbatim copy, session-start pure load). When the format crosses the storage boundary (here, `sessions.plugin_versions` SQLite JSON column), the format-side owner is the same person who owns the storage boundary (§3 / §10 — Roger). Algorithm purity belongs to Rosella; storage shape belongs to whoever signs the WAL row.
- The right format is **flat, not graph**. Forks demand verbatim byte-copy (no graph traversal at fork time), session-start demands pure load (no resolution at load time). A graph representation would force traversal semantics back into one of these phases. Flat `Record<packageName, lockedEntry>` + a `lockId: Blake3Hash` content-address footer is the cheapest shape that satisfies both constraints; the transitive-graph topology Rosella's resolver computes is captured by the *set* of entries, not by any in-shape pointer.
- The content-address footer (`lockId`) is the free win: identical lockfiles across sibling forks hash byte-identical and CAS-dedup; `cairn fsck --plugin-versions` validates the column by re-hashing.

**Sub-state fork-COW patterns:**
- "COW snapshot" on an append-only substrate means **share-by-reference, append-only-extend on the child**. The parent's WAL prefix is structurally immutable (§3.13 hash chain), so there is no copy step — the child's `prevRoot[1]` links into the parent's `selfRoot[forkPointOffset - 1]` and `cairn fsck --with-parent` traverses the cross-session edge.
- Two columns get **shared-by-reference COW** at the SQLite-projection level: `bootstrap_manifest` (R2-2 — child re-uses parent's manifest; offset-0 bootstrap rows are not re-emitted on the child) and `plugin_versions` (R2-6 — verbatim lockfile copy with same `lockId`). The "by reference" here is a content-hash identity, not a SQL FK; the JSON is duplicated in the row but the BLAKE3 footer makes the duplication free at the storage layer (CAS dedups the bodies if they reach CAS; the SQLite row carrying the JSON is cheap).
- Sub-state machinery (TaskStart / TaskEnd) survives fork by capturing the parent's open task stack in the `fork_origin` Observation's `body.openTaskStack`. The child chooses to either resume the stack or close it explicitly at offset 1. Append-only discipline means the choice is itself a durable row, not a runtime flag.

 — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §3 (L1 WAL Substrate) + §4 (Hook Bus) FINAL. Phase 1 synthesis review: YELLOW verdict, 13 findings routed. Your Phase 2 errata: finding 2a (Timestamp shape drift: split `Timestamp` vs `TimestampNs`), 2b (add `manifestRoot` flag), 12b (add `appendFenced` wrapper). Cross-section dependencies: Laura (§11.2 body shape pinning), Alexander (§12 offset-0 materialization), Rosella (R2-6 lockfile/snapshot handshake). — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) `BootstrapPayload` shape (literal+manifest, R2-2); (2) `commitmentMethod: 'declared' | 'fallback'` tag on Decision rows (R2-1); (3) transitive-dep snapshot field at fork (R2-6); (4) coordinate with Rosella on lockfile format. Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Roger — History

## 2026-05-26: Eureka ↔ Crucible Data Layer Overlap Analysis

**Context:** Aaron preparing simultaneous Eureka + Crucible implementation in this repo (`D:\git\harness`). Task was to map data-layer overlaps between Eureka's PRD (from sibling `D:\git\mem` repo) and Crucible's L1 substrate (A.3 hybrid append-log, per-row content-addressed WAL, group-commit).

**Verdict: FORK storage entirely.** Eureka and Crucible are architectural siblings with non-overlapping persistence needs. Full analysis written to `.squad/decisions/inbox/roger-eureka-crucible-data-overlap.md`.

**Eureka's data shape (from PRD v5-final):**
- Three independent SQLite DBs (via `better-sqlite3`): `~/.copilot/eureka/agent.db` (v1), `~/.copilot/eureka/user.db` (v1.5+), `<repo>/.eureka/project.db` (v1.5+). Only agent-tier fully wired in v1.
- Schema per-tier: `facts` table (CRUD, not append-only) with FTS5 for BM25 lexical recall, `relations` table (graph edges), `bridge_ledger` (append-only cross-system reconciliation log). No FKs to Cairn/Forge; **no cross-DB ATTACH at runtime** (FR-7.2).
- Write pattern: fact CRUD + FTS5 triggers + sweep-driven Tier 2 edge population. No group-commit, no per-row pre-fsync hooks.
- Query pattern: BM25 recall (keyword-scoped), composite ranker (0.5·relevance + 0.2·importance + 0.2·trust + 0.1·recency) × attention multiplier, trust floor exclusion (< 0.15), sequential fan-out (agent → user → project), edge traversal via `relations`.
- Lifecycle: SQLite WAL mode, opportunistic sweep (end-of-session, first-query-of-day), no content-addressed row hashing. Session identity shared with Cairn via `SessionId` brand from `@akubly/types` (type-level construct, no runtime FK — Eureka PRD §FR-13 v5-final R8).

**Share-vs-fork recommendations (8 substrate concerns evaluated):**
- **Event log / WAL:** FORK — Eureka's CRUD + FTS5 vs Crucible's append-only + group-commit are incompatible write patterns. Forcing convergence would mean Eureka pays append-only cost for no gain, or Crucible compromises replay determinism.
- **Session model:** FORK tables, SHARE identifier only — both use `SessionId` brand from `@akubly/types`; no runtime FK. Cairn owns lifecycle (`sessions` table), Eureka owns epistemology (`kind='session'` facts). Offline correlation only.
- **Config / KV / Graph / FTS / Snapshot:** FORK on all — no semantic overlap. Eureka's graph is epistemological (facts linked by `derived_from`, `contradicts` edges); Crucible's read-set is causal (event A read output of event B). DBOM Merkle chain (audit tamper-detection) vs Eureka facts (trust-weighted retrieval) serve different purposes.
- **Migrations:** FORK numbering — Crucible v100+ OR prefixed naming (`crucible-001-*.ts`) OR separate DB file (`~/.cairn/crucible.db` instead of sharing `~/.cairn/knowledge.db`). Recommendation: **separate DB file** for clean migration independence and backup story.

**Schema / path / port collisions: NONE.** Separate DB files (Cairn `~/.cairn/knowledge.db`, Eureka `~/.copilot/eureka/*.db`, Crucible TBD). Only shared construct is `SessionId` brand (type-level, no runtime coupling). No HTTP/IPC surfaces in v1 (Eureka library-only, Crucible is substrate layer, Cairn CLI-only). CLI namespaces distinct (`eureka` vs `cairn` vs hypothetical `crucible`).

**One load-bearing question for Aaron:** Does Crucible's L1 WAL (v14 `wal_records` table + v15-v18 tables) live in the same `~/.cairn/knowledge.db` as Cairn, or fork to `~/.cairn/crucible.db`? Trade-offs documented in analysis §6 OQ #1. My recommendation: **fork to `~/.cairn/crucible.db`** — independent migration numbering, preserves A.3 hybrid design freedom (custom append-only WAL file in pure TS for L1, keep `better-sqlite3` for other tables), avoids same-DB migration collision risk.

**Additional open questions for Aaron:**
- OQ #2: Does Crucible v1 still follow A.3 hybrid (my Round 5 spike recommendation), or has design shifted to full-SQLite transaction-batched semantics?
- OQ #3: Does Crucible L1 WAL rows carry `session_id` column? If yes, should import shared `SessionId` brand from `@akubly/types` to match Cairn + Eureka (type-level only, no runtime FK).

**Backup story:** Three stateful directories once both ship: `~/.cairn/` (Cairn + possibly Crucible), `~/.copilot/eureka/` (Eureka agent/user DBs), `<repo>/.eureka/` (Eureka project DB v1.5+). Operator guidance: back up all three for full state recovery. No cross-DB runtime dependencies; correlation is offline-only via `eureka reconcile` CLI (reads Cairn DB read-only) and (future) `crucible reconcile`.

**Anti-anchoring check honored:** Considered the "share event log" alternative seriously (Eureka could project facts into an append-only log, Crucible could index facts for keyword recall) and rejected on the evidence that the two write patterns (CRUD+FTS5 vs append-only+group-commit) and query patterns (BM25 recall vs seq-ordered replay) do not align. Sharing would force premature convergence on a primitive that neither system needs in its pure form.

## 2026-05-25 Round 7: v1-tier triage of all Roger-authored stories

Triaged every user story I authored across the deliberation against Aaron's locked v1 framing ("Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible"). Written to `decisions/inbox/roger-triage-2026-05-25T0200Z.md`. Headline cut: **8 substrate items go T1, 1 story (R-4) is enabled-for-free, everything else falls to T2–T5 or splits.**

T1 set: WAL with read-set hash + hook bus (Round 3 locked), `withShadowEvent` discipline + replay invariant (Open #4), CBOR-dcbor + BLAKE3 (Open #5), CAS + observation capture (Ro-NEW-2 — gates hermetic replay, this is the keystone), minimum-viable snapshot (Ro-NEW-1 T1 slice), branch/ref metadata schema (Ro-NEW-3 T1 slice), replay harness + linear `cairn fork --at` (R-3 T1 slice), drift ProposalGenerator (R-4, free). Plus `tenant_id` cheap-insurance migration (R-6 enabling) — hours now, weeks later.

Splits: **R-3** (replay+linear-fork T1, graph ops T3), **Ro-NEW-1** (min-viable snapshot T1, cadence/compaction T5), **Ro-NEW-3** (schema T1, fsck/GC T5). Cuts to T4/T5: R-1 (pattern mining graph-walks), R-2 (GitHub plugin), R-6 (federation), R-7 (code review plugin), R-8 (export productionization), R-9 (templates, gated on R-3), Ro-NEW-4 (quotas — dedup floor is already free). R-5 to T2 (one-hop provenance already exists; transitive walk is investigation-depth, not bootstrap).

Storage-criticality rule I'm enforcing: anything that touches WAL row layout, L1→L2 projection contract, or the determinism conformance suite is T1 regardless of how aggressive I'm trying to be elsewhere. That rule is what kept Ro-NEW-2 from being demoted on "data volume" grounds — without observation capture, the bootstrap loop's falsifiability claim is theatre.

Seven open questions for Cassima: rolling-buffer bound for capture store, `change_vectors` promotion to general post-commit outcome attachment (Roger+Laura), `tenant_id` cheap-insurance confirmation, snapshot-CLI scope at T1, R-9 tier check with Aaron, acknowledgement-stories for inherited Cairn surfaces (`topology_cache`, `execution_profiles`, `skillLinter`), and whether the WASM predicate-compilation ABI seam ships at T1 or T2. None of those change my T1 set; they each refine one edge of it.

## 2026-05-25 Round 6: Phase B Opens #4 and #5 resolved

Closed both substrate-owned Phase B contradictions in one inbox file (`decisions/inbox/roger-opens-4-and-5-2026-05-25T0130Z.md`). For #4 (7-tables UPDATE vs. backward causal slice): enumerated all seven tables from `packages/cairn/src/db/` and `agents/`, classified 6 as derived projections of `event_log` (`sessions`, `insights`, `prescriptions`, `prescriber_state`, `curator_state`, `optimization_hints`) and 1 as external filesystem mirror (`managed_artifacts.current_checksum`). Recommended killing `prescriber_state.pending_count` entirely (replace with a SQL view), wrapping all other lifecycle UPDATEs in a `withShadowEvent()` repository helper, banning raw `UPDATE` outside `db/` via a custom ESLint rule with cursor/mirror allow-list, and locking the discipline in CI with a snapshot→truncate→replay→deep-equal invariant test. Rejected SQLite triggers (would couple us to a substrate primitive in violation of v1 commitment #10) and rejected the "move everything to append-only" alternative on the evidence that the source of truth is already the event log. ~14 hours of work for Alexander in the first Crucible sprint.

For #5 (canonical serialization): picked **CBOR-dcbor + BLAKE3** (`cbor2` + `@noble/hashes/blake3`) for the new L1 read-set hash — matches Phase A's existing `blake3` columns, ~5-7µs per hash (well inside the 80µs hook-bus envelope I told Gabriel about), pure-JS so no native binding requirement. **Left DBOM on SHA-256 + JSON** — different audit consumer, committed artifacts already in production, migration not worth it. Established the per-column rule: hash algorithm fixed at column creation, never migrated; new columns BLAKE3; named legacy SHA-256 columns frozen. Specified all canonicalization edge cases (forbid bignums/tags/indefinite-length/NaN/non-NFC, definite-length only, bytewise-encoded key sort). ~9 hours of work, with Laura's A3 conformance assertion now writable without further design. Anti-anchoring rule honored on both — considered and explicitly rejected the obvious alternative for each.

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to .squad/decisions.md. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

Ready for Wave 2 implementation (computation + ranking only; runtime wiring follows in Wave 3).

## Learnings (2026-05-23 — W3-1 skillsmith-runtime scaffold)

- `packages/skillsmith-runtime/` follows the repo's standard library package shape: package.json + composite tsconfig + `src/index.ts` + `src/__tests__/` with tests excluded from TypeScript build output.
- Root workspace registration needed only a `tsconfig.json` project reference because the repo already uses the broad `packages/*` workspaces glob. `npm install` then linked the new package into `package-lock.json` automatically.
- This environment's npm rejected `workspace:*` dependency specifiers (`EUNSUPPORTEDPROTOCOL`), so the new package uses the repo's established `"*"` workspace dependency pattern instead.
- W3-1 intentionally leaves `createPrescriberOrchestrationConfig()` and `runForgePrescribe()` as throwing stubs. W3-5 will wire Cairn + Forge composition; W3-2 will make `runtime-cli` delegate into this package.

## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Unblocks all Wave 3 work items. Roger owns composition root and runtime-cli packaging.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool for manual prescriber invocation in Wave 3. Curator hook is autonomous surface; existing `forge-prescribe` CLI is manual surface. Re-open MCP tool only when concrete operator need materializes.
- **W3-D4: Curator Hook → Always-On** — Automatic invocation enabled; no opt-in flag in v1. Safety margins verified via Wave 2 E2E tests. Profile selection trigger-driven only; global fallback deferred to Wave 4.

## Learnings (2026-05-23 — Wave 3 Composition Root Audit)

- **Five composition root options evaluated** for Wave 3. Current architecture: Cairn and Forge have zero direct coupling (acyclic, port-based). Only `packages/runtime-cli/` bridges them (Wave 2 stepping stone). Audit document: `docs/wave3-composition-root-audit.md`.
- **Recommendation: Option B** (separate `@akubly/runtime` library + thin `runtime-cli` wrapper). Reasoning: Best test isolation, zero build risks, Phase 5-ready architecture. Library stays portable; CLI stays thin.
- **Do not use Option C** (inject Forge into Cairn hooks) — test coupling and build-order dependencies are unacceptable. Create a package instead.
- **Known unknowns deferred to Graham's ADR:** Profile selection strategy (all vs. only-with-vectors), hint persistence ownership, MCP tool shape for prescriber optimization, fail-open semantics on Forge failure during Curator.

## Learnings (2026-05-22 — Wave 2 W2-9 manual CLI surface)

- Wave 2's explicit composition root now lives in `packages/runtime-cli/` with bin name `forge-prescribe`; it's the one package allowed to import both `@akubly/cairn` and `@akubly/forge` without violating the package boundary.
- Local invocation pattern from the repo root is `npx forge-prescribe --skill <id> [--db <path>]`; the root workspace keeps `@akubly/runtime-cli` as a dev dependency so the bin is linked into the local toolchain after `npm install`.
- Profile loading is deterministic: try the canonical per-skill aggregate first (`granularity='per-skill', granularity_key='global'`), then fall back to a skill-scoped `global/global` profile before failing with a clean no-profile result.
- Exit semantics are simple: 0 on successful orchestration (including zero generated hints or dedup skips), 1 when no execution profile exists, and 2 for argument, database, or persistence failures.

## Learnings (2026-05-22 — Wave 2 W2-1 shared change-vector contract)

- Canonical Wave 2 change-vector contracts now live in packages/types/src/index.ts: ChangeVectorSummary, ChangeVectorProvider, NEGATIVE_IMPACT_AUTO_APPLY_GATE, and shared OptimizationCategory.
- Reconciled the two ChangeVectorSummary duplicates by taking Forge's stricter OptimizationCategory union instead of Cairn's plain string. Added autoApplyEligible?: boolean as the additive v3.1 field on the shared contract.
- Verification: root npm run build and root npm test passed before and after the change (1153-test baseline green).

## Learnings (2026-05-23 — W3-2 thin runtime-cli)

- Picked **Option A** for W3-2: `packages/skillsmith-runtime/src/index.ts` now owns the existing `runForgePrescribe()` composition flow (profile load, `SqliteChangeVectorProvider`, Forge prescribers, dedup + persistence) and `packages/runtime-cli/src/index.ts` is just a re-export facade.
- The thinnest stable CLI refactor here is **function re-export + unchanged CLI formatter**. That preserved operator-visible behavior and let the new delegation test assert identity (`runtime-cli` export === `@akubly/skillsmith-runtime` export) without introducing fragile ESM mocking around the bin entry.
- Alexander no longer needs to move manual CLI composition into `skillsmith-runtime` for W3-5; that surface is already live. W3-5 can stay focused on `createPrescriberOrchestrationConfig()` and Curator-facing factory wiring.
- After this refactor, remember to build before package tests that import `@akubly/skillsmith-runtime` by package name; those tests resolve the built workspace export (`dist/`), not the source file directly.

## Learnings (2026-05-23 — W3-6 hook injection bootstrap)

- Picked **R-Hook-A (injection)** for Curator session-start wiring: `packages/cairn/src/hooks/sessionStart.ts` now accepts an optional `PrescriberOrchestrationConfig` and forwards it to `curate()`; Cairn itself still does not import `@akubly/skillsmith-runtime`.
- The production always-on bootstrap now lives in `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, and `.github/hooks/cairn/curate.ps1` resolves that compiled script first. Laura's W3-7 integration test should enter through that skillsmith-runtime hook path, not the bare Cairn hook, so the real orchestration config is present.
- Keeping the script-level composition in the runtime package preserves W3-D1's boundary: Cairn owns hook mechanics, skillsmith-runtime owns cross-package wiring, and the PowerShell wrapper chooses the composition entrypoint.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Runtime-CLI: 5/5 passing
- Skillsmith-Runtime: 6/6 passing

**W3-1 & W3-2 shipped:** Scaffolding + thin CLI done.  
**W3-6 shipped:** Hook wiring complete — always-on bootstrap via injected config. Composition boundary preserved (cairn ↔ skillsmith-runtime acyclic).  

Wave 3 implementation delivered autonomous Curator-driven orchestration. Composition root (R2: `@akubly/skillsmith-runtime`) is the only place importing both `@akubly/cairn` and `@akubly/forge`. Phase 5-ready architecture in place.

---

## Session N: Skillsmith Harness Big-Think User Stories

**Lens:** Data, scale, integration, persistence.

### 9 Delivered Stories

**US-R-1: Cairn Pattern Mining Across Session Boundaries**  
As Aaron, query Cairn ledger to surface recurring Decision patterns, code-smell-to-fix chains, and decision reversals across 100+ sessions for Curator tuning and Forge heuristic calibration.  
*Ambition:* Accumulated telemetry becomes self-tuning feedback loop; harness learns from its own history.  
*Chambers:* Crucible, Cairn, Forge, Mirror  
*Data implication:* Append-only versioning + efficient graph traversal across millions of Primitives.

**US-R-2: GitHub Issue Auto-Coupling via Curator**  
Curator detects when a session solves/relates to open GitHub issues, auto-proposes linking (never auto-approves), leaving Mirror-check gate.  
*Ambition:* Break silo between coding-agent telemetry and project tracking; external systems as first-class signal inputs.  
*Chambers:* Crucible, Cairn, Curator, Mirror  
*Data implication:* Bidirectional webhooks + GitHub API polling; Cairn stores sync state + proposal backpressure.

**US-R-3: Cairn Replay & Variant Branching**  
Export session (or sub-chain) and replay with Alchemist variants—different model, decision tree, tool choices—to compare outcomes without reracking work.  
*Ambition:* Replay-as-first-class-primitive; harness becomes experimentation platform. Replay + variant = A/B testing coding decisions.  
*Chambers:* Cairn, Alchemist, Crucible  
*Data implication:* Portable serialization (JSON-LD/SQLite) with deterministic replay semantics + seeded RNG injection.

**US-R-4: Long-Session Drift Detection & Prescribing**  
Forge detects token-budget creep, context-window saturation, decision-reversal clustering in sessions >2hr; auto-proposes checkpoint/reset patterns.  
*Ambition:* Make invisible resource constraints visible before degrading session quality; Forge as canary.  
*Chambers:* Forge, Crucible, Cairn, Mirror  
*Data implication:* Granular token/context-window/latency tracking per turn; time-series queries on Cairn.

**US-R-5: Mirror-Backed Cross-Session Provenance**  
Mirror surfaces decision chain (why that tool chosen, which prior session influenced heuristic) across boundaries, building legible accountability for harness autonomy.  
*Ambition:* Epistemic trust-building—audit *reasoning* behind Curator proposals, not just outputs.  
*Chambers:* Mirror, Cairn, Curator  
*Data implication:* Rich metadata linking each Primitive to prior-session provenance (parent Decisions, Forge signals, Curator confidence).

**US-R-6: Scalable MCP Ecosystem as Forge Input**  
Federate tool success/failure/latency across Aaron's entire MCP ecosystem; Forge ranks tool choices; share anonymized insights with Skillsmith community.  
*Ambition:* Harness becomes collective learning engine; aggregate signal from thousands of tool invocations into shared optimization surface.  
*Chambers:* Forge, Cairn, Curator, Crucible  
*Data implication:* Multi-tenant telemetry ingestion + differential-privacy aggregation; Forge ranking scoped to cohort.

**US-R-7: Curator-Driven Code Review Automation**  
Curator detects mutations of core APIs or high-fan-out subsystems; auto-proposes async code review (MCP agents or GitHub PR); track review-to-ship latency in Cairn.  
*Ambition:* Blur autonomy and accountability; let them coexist.  
*Chambers:* Curator, Cairn, Crucible, Mirror  
*Data implication:* Parse Artifact diffs, compute module-graph impact, integrate GitHub PR API + MCP code-review servers.

**US-R-8: Multi-Tenant Cairn Export & Legal Hold**  
Export filtered Cairn views (by project, time window, Primitive type) as immutable ledger snapshots for compliance, legal hold, or sharing—without exposing private sessions.  
*Ambition:* Audit-ready from day one; data residency + portability as core, not bolted-on.  
*Chambers:* Cairn, Mirror, Crucible  
*Data implication:* Column-level access control, zero-knowledge proof of ledger integrity, deterministic export fingerprinting.

**US-R-9: Sessions as Reusable Templates**  
Mature Crucible sessions packaged as reusable templates—decision trees, tool chains, Curator tunings—spin up new projects with pre-tuned harness behavior.  
*Ambition:* Session-as-code; codify best practices by capturing harness *state itself*.  
*Chambers:* Cairn, Crucible, Alchemist, Forge  
*Data implication:* Session versioning, MCP tool dependency resolution, semantic diffing of Cairn ledgers.

---

**Older learnings archived to history-archive.md**
📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe

## Learnings (2026-06-05 — M8 Slice B cycle-2 persona-review fixes)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 730327f (helper extract), 8bb739f (I2/M1/M6), a1002d4 (M2), cd82681 (I1), b9404e7 (I5/M4/M5)

**Helper extraction was right.** Moving `runTrustUpdaterContract` into a `.ts` (non-`.test.ts`) helper file resolves the vitest double-registration problem cleanly AND makes the helper importable without triggering test execution. The naming convention `*.contract.helper.ts` is now the pattern for all future exported contract helpers in this package.

**Async harness future-proofing costs almost nothing.** Making `getTrust` return `number | undefined | Promise<number | undefined>` and awaiting it in tests adds one `await` per assertion. The cost is negligible; the payoff is that future I/O-backed harnesses (e.g., a remote DB or async file I/O) can implement `getTrust` asynchronously without changing the test code. Same for `makeHarness: () => ... | Promise<...>` and `cleanup: () => void | Promise<void>`.

**`.bind(harness)` was gratuitous.** The InMemory harness methods don't use `this` at all (they close over `store` and `locks`). The SQLite harness methods also don't use `this` (they close over `db`/statements). Plain assignment is correct and matches FactReader precedent.

**Named params ($name) enforce a style contract.** The SqliteFactReader (Slice A) already used `$fact_id` / `$session_id` with object-form `.get({ ... })`. Keeping SqliteTrustUpdater on positional `?` params was a style divergence that would silently invite parameter-order bugs as SQL evolves. The persona caught it correctly.

**C-3b (out-of-range) is a materially distinct invariant.** C-3 covers NaN (non-finite); C-3b covers finite-but-out-of-range (1.5, -0.1). These exercise different branches of the validation check (`!Number.isFinite(newTrust)` vs the `< 0 || > 1` guard). A single parameterized test over `[NaN, 1.5, -0.1]` would have worked too, but the current C-3 + C-3b split is clear and avoids a for-loop test that hides which case failed on first failure.

**WAL + busy_timeout are implicit contracts on `SqliteTrustUpdater` constructors.** The class doesn't set these itself — it inherits them from the injected `db` handle. Without documenting this, a future consumer who passes a raw `new Database(path)` handle would get subtly broken concurrency behaviour (SQLITE_BUSY failures instead of retries). The pragma assumption section in JSDoc is the right place to make this explicit.

## Learnings (2026-06-05 — M8 Slice B cycle-3 polish + Slice A retrofit)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af8b596 (N1+N2), 8f48e2f (N3+N4), 1cec460 (N5)

**`it.each` is the correct tool for boundary parameterization.** A `for` loop inside `it()` masks first-failure: if `1.5` fails, `-0.1` never runs. `it.each([1.5, -0.1])` creates two independent test cases so each bound is independently reported. The pattern applies to any test that checks multiple values of the same invariant — particularly validation boundaries. Count impact: +2 tests per wiring × 2 wirings = +4 total (95 → 97 after Commit 1 in this cycle, then 97 steady through cycles 2 and 3).

**The `*.contract.helper.ts` naming convention is now load-bearing for Slice C.** Both `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts` follow the same non-`.test.ts` pattern. Slice C's `runFactStoreContract` should land in `fact-store-contract.helper.ts`. The SKILL forward-pointer (N5) documents this explicitly so the Slice C author doesn't have to re-derive it.

**Slice A retrofit was low-risk but high-value.** The FactReader contract file had been stable since Slice A merged (~5 days), making the diff visible and reviewable. The actual change was small (extract helper + wiring-only test file + typed prepare), but it brings both contract suites to the same structural pattern before Slice C inherits them. Retrofitting AFTER Slice C would be harder (more files to touch, possibly conflicting edits). The lesson: harmonize sibling patterns at end-of-slice, not end-of-milestone.

**`ReturnType<Database.Database['prepare']>` is the wrong field type for typed statements.** The broad type forces a runtime `as FactRow | undefined` cast on every `.get()` call. `db.prepare<BP, R>()` returns `Database.Statement<BP, R>` where `.get()` is typed as `R | undefined`. Using the typed generic form eliminates the cast, narrows errors at compile time, and documents the expected bind-parameter shape at the call site. This is the pattern SqliteTrustUpdater already used; the Slice A retrofit applied it retroactively to SqliteFactReader. Future SQLite implementations (SqliteFactStore) should use typed generics from the start.

## Learnings (2026-06-05 — M8 Slice B cloud review cycle 1)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 0cdf205 (T1+T2), 418c146 (T3), 2ab52f3 (T4), 4ffdb73 (T5)

**Docstring counts go stale when test-generation changes.** The `it.each` conversion in cycle-2 changed C-3b from 1 test to 2 per wiring, but the JSDoc on `runTrustUpdaterContract` (and the SKILL reference) still said 8. Copilot's review caught it. Fix: update docstrings in the same commit that changes the test structure, not after. The count is part of the contract surface — if it's wrong, it misleads the next person wiring a new impl.

**The N2 comment pattern was TrustUpdater-specific.** The "InMemory impl lives inline here, test-only" comment is correct for TrustUpdater (the impl is literally defined in the wiring file, not imported). It's wrong for FactReader (which imports `InMemoryFactReader` from a production module). Copying patterns across similar-looking files without checking whether the premise still holds is how stale comments happen. Read before copy.

**Append-not-rewrite is the right policy for decision logs.** The tombstone decision (Decision 2 in decisions.md) described a choice that was later reversed. Editing the original entry would erase the context for WHY we initially tombstoned (vitest 3.x no-empty-file requirement). The append-update preserves both the original reasoning and the reversal rationale. Future readers can follow the full arc. Applied this consistently.

**CRLF in non-code files happens silently.** Rosella's history.md had 7 carriage-returns (CRLF sequences at 3 line endings). These come from editors or CI runners that don't respect `.gitattributes`. The fix is `ReadAllText / -replace / WriteAllText` in PowerShell — more reliable than `sed` on Windows. The git warning "LF will be replaced by CRLF" on commit is a `.gitattributes` artifact (text=auto); the file was cleanly committed as LF.

## Learnings (2026-06-05 — M8 Slice B cloud review cycle 2)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af390ba (T6), ccdf994 (T7)

**`UTF8Encoding(false)` is the correct PowerShell pattern for BOM-free writes.** `[System.IO.File]::WriteAllText(path, content)` uses the system default encoding (BOM on Windows). `[System.Text.Encoding]::UTF8` and `[System.Text.UTF8Encoding]::new($true)` both include BOM. Only `[System.Text.UTF8Encoding]::new($false)` suppresses it. When fixing encoding issues in non-code files, always write explicitly with `UTF8Encoding($false)` to avoid the T3 → T6 two-step. The lesson is to use it the first time rather than discovering the BOM in a follow-up review.

**3. Mirror scope creep.** Resolved — Mirror = derived view over (proposal queue ∪ ledger tail ∪ capture metadata). I stop listing it as a chamber in any of my stories.

**4. Heavyweight ops vs solo user.** Strip federation, legal hold, multi-tenant export, MCP federation, GitHub webhooks-as-infra from v1. **Keep** snapshot/compaction/capture/branching/integrity-hash — those aren't "ops," they're load-bearing for the agentic-debugger vision and they're cheaper to build now than to retrofit.

**5. Crucible vs Copilot CLI parent-child.** Crucible spawns Copilot CLI as a sub-agent; sub-agent IO must flow through the observation-capture store or replay/branching breaks at the agent boundary. This is non-negotiable from the data lens — an un-captured sub-call is a non-deterministic hole in every downstream fork.

**NEW Tension 6 — Capture cost vs throughput vs privacy.** Observation capture multiplies write volume and will eventually capture secrets (env vars, API keys in tool args). Need: (a) capture compression + dedup (content-addressing already gives us this), (b) a redaction ProposalGenerator that runs *before* commit, (c) a clear policy on whether replay across a key rotation is allowed. Flagging now so it's not a Phase-5 surprise.

### Section 4 — Cross-references

1. **Erasmus US-E-1 (Ledger Bisect) + my US-R-4 (Drift Detection)** → same engine. Bisect is "binary search over snapshots for the first bad Decision"; drift is "rolling-window anomaly over the same snapshot index." Build the snapshot index once (Ro-NEW-1) and both fall out. **Strengthens both.**
2. **Aaron Insight #1 (branching first-class) + Graham US-G-7 + Alexander US-A-3 + Valanice US-V-1 + Gabriel US-5 + Erasmus US-E-2 + my US-R-3** → six lenses converging on the same primitive. This is the consensus headline. Roger owns the substrate; others own surfaces.
3. **Erasmus US-E-7 (model-swap replay)** → **invalidates** any approach where model identity isn't in the observation-capture key. Forces my capture-store schema to include `(provider, model, version, sampling_params)` in the call hash. Good catch — would have been a v1 bug.
4. **Laura US-L-7 (lazy outcome finalization)** → strengthens Ro-NEW-1: snapshots must be append-extensible (outcomes arrive later and attach to past Decisions). Means snapshot = "ledger prefix + late-binding outcome side-table," not a frozen blob.
5. **Rosella US-Ro-5 (Alchemist skill evolution)** → demands the same fitness/outcome substrate Laura needs and the same branching substrate R-3 provides. If we don't build branching + capture, *neither* Alchemist nor Laura's eval loop is honest — they'd be measuring against non-replayable runs. **Strengthens Ro-NEW-2 doubly.**

— Roger


## 2026-05-24 Round 3: Read-set verdict (Sonny US-S-3)

# Roger — Verdict on Sonny US-S-3 (causal read-set on L1 append)

**Date:** 2026-05-24T22:33Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Whether the L1 append-record contract (v1 commitment #8) must carry a `causalReadSet` for every primitive write, as Sonny argues in US-S-3.
**Verdict (TL;DR):** **LOCK — with surgical split on population.**

I read Sonny's nine stories. US-S-3 is the one that actually touches my floor, so I'll only answer for that. Not re-litigating L1-vs-L2 or the 4-layer stack.

---

## 1. Is retrofit structurally impossible later?

Mostly yes. Two paths to retrofit and both are bad:

- **(a) Replay-and-instrument.** Re-run every historical session under a wrapper that records what each generator consulted. Requires hermetic replay to be 100% deterministic in practice (it won't be — plugin code drifts, model versions retire, content-addressed blobs may be GC'd before we ever ask the question). And it costs N× compute per "why?" query. Theoretically possible, operationally a tax we'd pay forever.
- **(b) Forked storage format.** Pre-v2 ledgers permanently lack causal slicing; v2 ledgers have it. We'd ship a debugger that quietly degrades on old sessions, which is exactly the trust-eroding lying-debugger UX Sonny rails against in US-S-5.

The forward-compatible "capture in a derived L2 projection instead" path that I went looking for **does not exist for the data Sonny actually wants**. L2 can derive structure *from what L1 recorded*; it can't synthesize edges L1 never wrote. The read-set is a property of the *write*, not of the ledger prefix.

So Sonny is right on the retrofit point. Not religiously — operationally.

## 2. What "read-set" means for the 5 primitives

There is one coherent **schema** and five primitive-specific **population rules**:

| Primitive | What the read-set captures | Source in v1 |
|---|---|---|
| **Request** | Parent Decision/Question that triggered it; prior Observations the planner saw; system-context refs | Best-effort (planner emits) |
| **Artifact** | Source primitives consulted (prior Artifacts, Observations); plugin version refs | Best-effort (generator emits) |
| **Observation** | The external-IO capture key `(call_hash, inputs_hash)`; pinned plugin version | **Already captured** by Ro-NEW-2 capture store — zero new work |
| **Decision** | Proposal IDs considered; projection refs consulted; prior Decisions cited | **Required** — Decisions are the bisect/branch anchors |
| **Question** | The trigger Decision or halt condition; minimal | Best-effort |

Common shape — typed list of `(kind, target_id, target_hash, role)` tuples. Different *who-populates-what* per primitive. One schema, primitive-specific completeness rules.

## 3. Cost analysis (I own the WAL group-commit path)

Sonny says "cheap now." I verified. He's right, given one structural choice:

**Per-append cost if the read-set is inlined in the WAL row:** ~200–800 bytes for a typical 5–20 entry set. Blows my ≤256-byte typical-row budget by 2–3×. Bad.

**Per-append cost if the read-set body is spilled to the CAS blob store and the WAL row carries only a 32-byte Merkle root:** **+32 bytes per WAL row, zero added fsync latency** (the blob write rides the same batched fsync window, no extra round-trip). Fan-out: read-set bodies are content-addressed and intern naturally — a parent Decision referenced by 200 children stores its hash 200 times in WAL rows but the *body* mentioning it dedupes in CAS.

Net verdict: with the spill design, cost is **+32 bytes/row, latency-neutral, dedup-friendly**. Cheap is correct. Inlined would be a non-starter; spilled is free.

This is the same pattern I already committed to for large payloads in my round-2 deliberation (commitment #8 sub-point 1). Read-sets are just another spilled field on the same path.

## 4. Compatibility with commitments #6 (snapshot+compaction) and #2 (hermetic replay)

- **Snapshot + compaction (#6):** No conflict. Snapshots are Merkle-rooted over WAL rows; read-set hashes are WAL row fields, so they're already in the root. Compaction folds the hash into columnar storage like any other field. Bonus: causal queries (`why?`, `who-cited-this?`) become indexable columnar scans, which is exactly the shape Cairn-bisect (US-S-6) and drift detection (US-R-4) want.
- **Hermetic replay (#2):** Subtle but clean. The read-set is an **output** of generation, not a replay input. Replay re-feeds Observations deterministically; the generator re-derives its read-set on re-execution. So replay does **not** re-feed read-sets — but the determinism conformance suite (commitment #4) gets a new assertion: *re-derived read-set must match recorded read-set*. That's a free correctness check Laura will probably want.
- **One edge case worth naming:** if a read-set entry refers to an L2 projection value (per US-S-4 retroactive projections), the entry must carry the projection-**version** ID, not just the query result, or replay will assert against a moving target. Cheap to specify now.

## 5. The 8th proposal-schema field (`causalReadSet`) — Laura's field vs. my contract

**Same data, two capture points.** Not two concepts, one concept on a pipeline:

1. **L3 ProposalGenerator declares** `causalReadSet` in its proposal (Laura's schema field).
2. **L4 approval router validates** the declaration (do the referenced primitives exist? are projection-version IDs resolvable?). Validation is a precondition for approval; a malformed read-set is a rejected proposal, not a committed garbage row.
3. **L1 commits** the validated read-set into the WAL row alongside the primitive payload (my contract). Body spills to CAS; hash goes in the WAL row.

Integration argument: Laura's field is the **producer contract** ("generators must declare what they read"); my field is the **storage contract** ("committed rows must carry the declaration's hash"). They are the same bytes, captured once at L3, validated at L4, durably committed at L1. Anyone trying to make them diverge is wrong.

For primitives that don't flow through a generator (raw Observation writes from the capture store), L1 synthesizes the read-set directly from the capture row — same schema, different population site.

## 6. Verdict: **LOCK with surgical scope split**

### Lock now (v1):
- **Schema slot.** Every WAL row has a nullable `causal_read_set_hash: blake3?` field. Reserved, named, in the row layout.
- **Body format.** Versioned CAS blob, typed entry list as in §2. Frozen for v1.
- **Wiring.** L3 proposal schema carries `causalReadSet`; L4 validates it; L1 commits the hash. End-to-end path exists day one.

### Split on population (v1 → v2):
- **REQUIRED + populated in v1:** Observation (free — already in capture store), Decision (the bisect/branch/why? targets).
- **BEST-EFFORT in v1, REQUIRED in v2:** Request, Artifact, Question. Slot exists, format is canonical, generators populate when they can. L1 accepts `NULL` without complaint in v1 and rejects `NULL` in v2.
- **`cairn fsck` (Ro-NEW-3) gains a new check:** report read-set completeness per primitive kind. Migration to v2 is "raise the bar from warn to error per kind" — no ledger rewrite, no schema migration, just a config flip.

### Why split rather than full-lock or full-defer:

- Sonny's load-bearing concern is **"structurally impossible to retrofit."** The schema slot, format, and wiring address that fully. Once the slot exists and the bytes are addressable, "fill it in for kind X" is a generator-side change, not a ledger rewrite.
- Full-lock-all-kinds-populated would block v1 on every generator implementing exhaustive read-set tracking, which is real work and adds bug surface across L3 right when L3 is still settling. We'd ship late for a property we can adopt incrementally.
- Full-defer is the failure mode Sonny correctly identifies — the slot never gets added, the contract calcifies without it, and v2 is a fork.

### Append-record schema, v1 (revised):

```
WalRecord {
  seq:                  u64,
  ts_ns:                u64,
  parent_seq:           u64,
  primitive_kind:       u8,        // Request|Artifact|Observation|Decision|Question
  primitive_id:         ULID,
  payload_hash:         blake3,    // body in CAS
  causal_read_set_hash: blake3?,   // NEW — body in CAS, schema below
  proposal_id:          ULID?,     // L3 proposal that produced this (if any)
  approval_id:          ULID?,     // L4 verdict (if any)
  prev_root:            blake3,    // chain
}

ReadSetBody (CAS blob, content-addressed, v1):
{
  version: 1,
  entries: [
    {
      kind:        PrimRef | ProjectionRef | ObservationRef | PluginRef,
      target_id:   ULID | ProjectionVersionId | CaptureKey | PluginVersionId,
      target_hash: blake3,
      role:        Input | Context | Trigger | Constraint
    },
    ...
  ]
}
```

Row-cost delta: **+32 bytes/row** when populated, **0 bytes** when NULL (use an optional/varlen encoding so unpopulated kinds don't pay). Fsync neutral. Compaction-friendly (single columnar field, hash-typed, intern-friendly). Snapshot-Merkle-compatible (it's just another row field).

### What I need from the team to land this:
- **Laura:** add `causalReadSet?: ReadSetEntry[]` to the proposal schema; required for Observation/Decision proposals, optional for the other three in v1. The entry shape above is the canonical form.
- **Stelios (L2):** projection identity must include a stable **version** ID so a `ProjectionRef` entry survives projection-definition edits. Already a US-S-2/US-S-4 ask; this just makes it load-bearing.
- **Alexander (L4):** approval validation step rejects proposals whose declared read-set references unknown/unresolvable IDs. Small extension to the pre-commit hook he already needs for US-S-1 (predicate-eval breakpoints).
- **Erasmus:** add a determinism-suite assertion: re-derived read-set on replay must equal recorded read-set for primitive kinds where it's populated. Free correctness signal.

I'll own the WAL row layout, the CAS spill path, and the `cairn fsck` read-set-completeness check. None of this changes my round-2 commitments on snapshot cadence or compaction; it just adds one nullable hash column and one CAS blob kind.

---

## Plain-text summary for the coordinator

**Verdict: LOCK, with a surgical split on population.**

Sonny is right that the read-set is structurally impossible to retrofit cleanly — the only retrofit paths are replay-and-instrument (forever-tax on compute and on perfect determinism) or a forked v2 storage format (silently-degraded debugger on old ledgers). He's also right that it's cheap now: with the body spilled to the content-addressed blob store and only a 32-byte hash in the WAL row, the per-append cost is +32 bytes and zero added fsync latency. Lock the schema slot, the body format, and the L3→L4→L1 wiring in v1; require population for Observation (already free via Ro-NEW-2 capture) and Decision (the bisect/why? anchors); leave Request/Artifact/Question as best-effort in v1 and promote to required in v2 via a `cairn fsck` config flip — no ledger rewrite. The proposal-schema field Laura owns and the append-contract field I own are the **same bytes** captured at different points on one pipeline; L3 declares, L4 validates, L1 commits the hash. Endorsed.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## 2026-05-24 Round 3 (continued): Pre-commit hook bus — L1 verdict

# Roger — Verdict on Alexander's pre-commit hook bus (re US-S-1 / US-S-4 / US-S-9)

**Date:** 2026-05-24T23:00Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Where the shared pre-commit hook bus sits relative to WAL group-commit, what pause does to a batch, whether the verdict is recorded, predicate cost on the hot path, interaction with `causal_read_set_hash`.
**Verdict (TL;DR):** **ENDORSE with refinements.** The bus belongs *inside* the group-commit window but *outside* the fsync barrier, runs per-row over the staged batch, and is itself a recorded WAL field. Predicates must be pre-registered/compiled. Read-set predicates are fine — and actually the killer feature.

The read-set verdict from earlier today is locked, not re-opened. This is only about the hook bus and how it touches my floor.

---

## 1. Where the bus sits relative to group-commit

There are four candidate insertion points. Three of them are wrong. Walking through them so the choice is on the record:

| Option | What it means | Verdict |
|---|---|---|
| (a) Before the row is staged into the batch | L3 emits → bus runs → row joins batch or doesn't | **Wrong.** Predicates can't see batch siblings or the committed read-set; pause loses ordering with concurrent emitters. |
| (b) Per-row, *inside* the batch staging loop, *before* the fsync barrier | Each candidate row is appended to the in-memory batch, hook bus evaluates against the row + its `causal_read_set_hash`, verdict is recorded on the row, then we either fsync or split | **Right.** This is what I'm endorsing. |
| (c) Once per batch, after staging, before fsync | One bus call sees the whole batch | **Wrong.** Pause semantics get fuzzy ("which row paused us?"), and predicate authors lose per-row identity. |
| (d) After fsync, before ack | Bus runs on durable rows | **Wrong.** Pause-after-durable is not a pre-commit hook, it's a post-commit notifier. Different primitive. Useful, but not what Alexander asked for. |

**The contract: option (b), per-row, pre-fsync, inside the group-commit window.**

Concretely the group-commit path becomes:

```
for row in candidate_batch:
    row.causal_read_set_hash = compute_read_set(row)    # already locked
    verdict = hook_bus.evaluate(row, read_set_view)     # NEW
    row.hook_verdict = verdict                          # recorded on the row
    if verdict == pause:
        seal_batch_through(row.seq)                     # see §2
        break
fsync(sealed_batch)
ack(sealed_batch)
if paused: hand control to L4 router
```

**Throughput claim.** Group-commit throughput is dominated by fsync, not by the per-row in-memory work. The bus runs in the same memory window where I'm already computing read-set hashes and chaining `prev_root`. Adding a dispatch per row, with predicates indexed by `primitive_kind` so non-matching kinds cost one hashmap lookup, is **noise on the fsync-bound path**. I am not giving up throughput for this, provided §4 holds.

What I am **not** doing is serializing the bus across batches. Multiple writers stage into multiple batches concurrently today; the bus is per-batch-local because predicates only see the row + its read-set view, not other in-flight batches. Cross-batch invariants are not the bus's job — that's L4 / L2.

---

## 2. Pause mid-batch — the transactional contract (owns commitment #8)

The scenario: 100-row batch, row 5 trips a `pause` verdict. Three plausible behaviors, only one of which doesn't lie:

- **Roll back rows 1–5.** Nope. Rows 1–4 already passed their verdicts (`continue` or `observe`). Rolling them back means a `continue` verdict didn't actually mean continue. That breaks predicate-author trust forever. Also breaks Sonny's US-S-4 logpoints — they fire on `observe`, expecting durability.
- **Commit through row 5, then pause.** Yes. This is the contract.
- **Commit the whole batch, then pause.** No. Defeats the purpose; rows 6–100 would commit despite a known pause condition having fired upstream of them.

**Contract: seal-and-split.**

1. When a row's verdict is `pause`, the batch is **sealed through that row inclusive**. Rows 1..N (where N is the pausing row) fsync as a normal group-commit batch. They are durable. Their acks fire.
2. Rows N+1..end of the candidate batch are **returned to the staging queue**, not dropped. They will be re-evaluated by the bus in the *next* batch (their read-sets may have changed because row N is now committed; predicates may verdict differently). Replay sees them in their eventual-commit order, not the original-staging order — and that's fine, because replay deterministically follows recorded `seq`.
3. The pausing row's `hook_verdict = pause` is durable in the WAL before L4 is invoked. L4 cannot be asked to make a decision about a row that isn't on disk yet. This matters for crash safety: if Crucible dies between L1 ack and L4 invocation, recovery sees a paused row with no L4 verdict and re-enqueues it for L4. No double-decision, no lost pause.
4. L4's eventual verdict (per Alexander's extensible enum, per US-S-9) is recorded as a **subsequent WAL row** referencing the paused row's `seq`. Same pattern as approval today, just with the pause anchor durable first.

This costs throughput on pause (one extra fsync barrier per pause, by definition). It does not cost throughput on `continue` or `observe`, which is the 99.9% case. Pause is the slow path on purpose — that's what "stop and ask the human" means.

**Edge case worth naming:** two rows in the same batch both verdict `pause`. The first one wins; the batch seals through it; the second goes back to the queue and re-pauses next batch. No "batch pause set" — one pause per commit cycle keeps L4's mental model honest.

---

## 3. Recording the verdict — yes, in the WAL row

If the verdict isn't durable, hermetic replay can't reproduce pause behavior, and the post-mortem investigator REPL (Sonny's US-S-5) lies. Both are non-negotiable. So the verdict goes in the WAL row.

**Schema slot — extend the row, do not sidecar.** Two new fields on `WalRecord`:

```
WalRecord {
  ...                                          // as locked in read-set verdict
  causal_read_set_hash:   blake3?,             // already locked
  hook_verdict:           u8?,                 // NEW: 0=continue, 1=observe, 2=pause; NULL if no predicate matched
  hook_verdict_witness:   blake3?,             // NEW: CAS hash of {predicate_ids_fired, predicate_outputs}; NULL if verdict=continue
  ...
}
```

Cost: **+1 byte for the verdict tag, +32 bytes when a non-continue verdict fires**, zero when no predicate matched (same optional encoding as `causal_read_set_hash`). The witness body in CAS lets US-S-5 reconstruct *why* the verdict fired without bloating WAL rows. Verdict-only-no-witness is invalid; either both NULL or both populated.

**Sidecar log was tempting, rejected.** A separate log of "pauses that happened" would force replay to join two streams in `seq` order, and `cairn fsck` would have to cross-check them. One row, two columns is simpler and snapshot-Merkle-clean (both fields are already row fields, so they're in the root for free).

**`cairn fsck` gains a check (extension of Ro-NEW-3):** for every row with `hook_verdict != continue`, the witness blob must resolve in CAS, and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC and registry-drift bugs.

---

## 4. Predicate cost — the hot-path SLA

Alexander flagged this and he's right to. My append SLA is unchanged from round 2: **p99 commit-to-ack ≤ 5ms at 10k writes/sec sustained, p99 row-stage cost ≤ 80µs in-memory.** The bus has to fit inside the 80µs in-memory budget.

**The break-point.** A naive interpreted match-spec predicate (ETS-style `{'==', '$1', secret}` interpreted recursively) costs ~5–20µs depending on read-set size. Ten such predicates registered against the same primitive_kind = 50–200µs. **That breaks the SLA at ~5 simultaneously-registered interpreted predicates on a hot kind.** Not acceptable.

**Required mitigation — pre-registration with compilation:**

1. **Register, don't pass.** Predicates are registered with L1's hook bus by ID, returning a handle. You cannot pass a fresh AST per commit. This is non-negotiable for the hot path. (It also fits Alexander's "predicate lifecycle across forks" point — handles have explicit lifetimes.)
2. **Compile at registration time.** Registration runs the predicate AST through a compiler that emits either (a) a native function pointer (for shapes we recognize: equality on field, range on field, set membership on field) or (b) a bytecode interpreter as fallback. Sonny's match-spec subset must be expressive enough to compile to (a) for the common cases; otherwise we fall back to (b) and the predicate author gets a soft warning that they're on the slow path.
3. **Index by primitive_kind.** Predicates declare which kinds they care about at registration. Rows of unmatched kinds cost one hashmap lookup and a no-op return. This is Alexander's point #1 from his "anything you missed" and I am taking it as load-bearing.
4. **Cache against read-set hash.** If the same predicate fires twice against rows with identical `(primitive_kind, causal_read_set_hash, key_fields_hash)`, the verdict is memoized for that batch. Stelios's Salsa engine in L2 can extend this across batches if it wants; I'm not promising cross-batch cache from L1.

**SLA-safe envelope with mitigations in place:** up to ~50 registered predicates per primitive_kind, compiled, with read-set ≤ 32 entries, stays inside 80µs. Beyond that, registration starts soft-failing with an SLA-budget warning. This is a knob, not a wall — but it's a knob the runtime owns, not predicate authors.

**Where it irrevocably breaks:** Turing-complete predicates. If someone tries to register a predicate that calls back into L2 to evaluate a projection, that projection might be invalidated, recompute on the fly, and the commit path now waits on Stelios's engine. **No.** Predicates may *reference* projection-version IDs (those are stable hashes) but may not *call* projections at evaluate time. If you need projection state, snapshot it into the predicate's closure at registration and re-register when the projection-version ID changes. Same discipline as US-S-4 retroactive projections.

---

## 5. Interaction with `causal_read_set_hash` — yes, this is the feature

Both run pre-commit. Both are computed on the same row in the same window. The bus must see the read-set; that's most of the value.

**Contract: the bus receives `(row, read_set_view)` where `read_set_view` is a typed reader over the row's freshly-computed read-set entries** (not the hash — the *resolved* entries, because predicates need to ask questions like "did this Decision read any Observation tagged secret"). The read-set is computed *before* the bus is called; the bus is called *before* the hash is sealed into the row; predicates may read the entries but may not mutate them.

**Yes, predicates can be on read-set contents.** This is exactly Sonny's US-S-1 "pause if this Decision read any Observation tagged secret" example, and it falls out for free from this ordering. Example shapes I'm committing to support:

- `read_set.any(kind=ObservationRef, where=target.tags ∋ 'secret')` — set/tag membership over read-set entries.
- `read_set.contains(role=Trigger, target_id=$known_id)` — direct lookup.
- `read_set.count(kind=PrimRef) > N` — cardinality.
- `read_set.entries[*].target_hash ∈ $watch_set` — hash-set membership against a registered watch list.

**What I'm NOT supporting in v1:** transitive queries ("did anything in my read-set transitively read X"). That requires walking the causal DAG, which is L2's job, not the hot-path bus. If you want that, materialize it as a projection and reference the projection-version ID in your predicate at registration time. Same discipline as §4.

**This integration makes the bus strictly more valuable than the read-set alone**, because the bus is where read-set policy becomes *enforceable* rather than merely *recorded*. Tag-leak prevention, secret-egress detection, citation-required policies — all expressible as bus predicates against read-set entries. That's not a bonus; that's why the two features should be designed together.

---

## 6. Verdict: **ENDORSE with refinements**

Alexander's split (one shared pre-commit bus, three verdict outcomes, pause unified through L4) is correct. The refinements I'm imposing are:

### L1-side contract (locked):

**Ordering & throughput:**
- Bus runs **per-row, inside the group-commit window, before the fsync barrier**, after the row's `causal_read_set_hash` is computed but before the row is sealed.
- Bus is **not** serialized across concurrent batches.
- `continue` is the zero-cost default; matched-kind dispatch costs ~1µs; compiled predicate eval costs ≤ 80µs total per row under stated envelope.

**Pause transaction (commitment #8 extension):**
- On `pause` verdict, batch **seals through the pausing row inclusive**, fsyncs, acks. Remainder of batch returns to staging queue for re-evaluation in the next batch.
- Pausing row's `hook_verdict = pause` is **durable before L4 is invoked**. Crash recovery re-enqueues paused rows with no L4 verdict to the router. No double-decision.
- L4's eventual verdict (extensible enum per US-S-9) commits as a **subsequent WAL row** referencing the paused row's `seq`.
- One pause per commit cycle; second pause in same candidate batch goes to next batch.

**Recording (commitment #8 extension):**
- Two new nullable fields on `WalRecord`: `hook_verdict: u8?` (0=continue, 1=observe, 2=pause) and `hook_verdict_witness: blake3?` (CAS body: `{predicate_ids_fired, predicate_outputs}`).
- Either both NULL (no predicate matched) or both populated. `continue` verdicts with witnesses are valid (useful for "yes this predicate ran and said continue" audit trails) but optional — registrants choose at registration time whether to witness `continue`.
- Per-row cost: +1 byte tag always, +32 bytes when verdict ≠ continue OR witness requested. Zero when no predicate matched.

## Learnings (2026-06-02 — M8 Slice A: SqliteFactReader + Eureka migrations bootstrap)

**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** M8 Slice A (graham-m8-scope-proposal.md approved, Q1/Q2/Q3 locked by Aaron)

**What shipped:**
- `packages/eureka/src/db/`: `schema.ts` (applyMigrations verbatim on Cairn pattern), `migrations/001-facts.ts` (facts + FTS5 + triggers + trust_history scaffold), `openDatabase.ts`, `index.ts` barrel.
- `packages/eureka/src/storage/fact-reader-sqlite.ts`: SqliteFactReader implementing FactReader; db handle injected per Cairn convention.
- `packages/eureka/src/storage/index.ts`: storage barrel (InMemoryFactReader + SqliteFactReader re-exported).
- Contract wiring: `runFactReaderContract('SqliteFactReader', makeHarness)` at end of fact-reader.contract.test.ts; +5 contract tests.
- Test count: 74 → 79 (+5). All 79 pass. No regressions in cairn/forge/skillsmith-runtime.

**NaN decision:** trust column is NULLABLE (not `NOT NULL`) despite Graham's sketch showing `REAL NOT NULL DEFAULT 0.5`. CL-4 requires {trust: NaN} round-trip. SQLite has no NaN literal; `NOT NULL` coerces NaN to 0.0 at INSERT. Nullable column + JS-layer `NULL ↔ NaN` is the only compliant path. Schema deviation documented in roger-m8-slice-a.md decision drop.

**DB path:** `~/.eureka/eureka.db` per Aaron Q3 approval. `openDatabase` uses `os.homedir()`.

**Cairn DB-layer helper convention confirmed:** constructor takes `db: Database.Database` (caller-injected); `openDatabase` creates and migrates; SqliteFactReader never opens or closes the handle.

**Better-sqlite3 named params:** `Statement.get()` TypeScript types give "expected 1 argument" when passing two positional `?` values even though the runtime accepts them. Use `$name` named parameters and pass an object — single-argument signature, same runtime behavior. Adopted throughout.

**trust_history table:** scaffolded in migration 001 per Aaron Q1 approval; no writes in Slice A. Slice B will add the mutate writes.

**Predicate registration (new L1 ABI):**
- Predicates are **registered by ID**, not passed per-row. Registration returns a handle with explicit lifetime (per Alexander's fork-isolation point: child-fork registrations do not back-propagate to parent).
- Registration **compiles** predicates to native ops where possible, bytecode fallback otherwise.
- Registration **indexes by `primitive_kind`** for O(1) dispatch on non-matching kinds.
- Predicates **may read** the row's resolved read-set entries; **may not call** L2 projections at evaluate time (snapshot projection-version IDs at registration instead).
- SLA envelope: ≤ ~50 compiled predicates per primitive_kind, read-set ≤ 32 entries, stays inside 80µs per row.

**Read-set integration:**
- Bus receives `(row, read_set_view)`; read-set entries are evaluated before bus runs, hash is sealed after.
- Predicates on read-set contents (set/tag/role/cardinality/hash-set) are first-class in v1.
- Transitive read-set queries are **out of scope for the hot-path bus** — materialize as a projection if needed.

**`cairn fsck` extension:**
- For every row with non-NULL verdict witness, the CAS witness blob must resolve and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC, registry drift, and re-registration races.

### What I need from the team to land this:

- **Alexander:** the predicate registration ABI (signatures, handle lifecycle, compile target) is yours to define; I'll implement the L1-side dispatch and the recording. Confirm fork-isolation lifecycle matches your "anything you missed" point #2.
- **Sonny:** US-S-1 match-spec subset has to be expressive enough that "common case" predicates compile to native ops rather than fallback bytecode. Worth a focused conversation on the subset shape before freeze.
- **Stelios:** projection-version IDs must be **stable hashes** that predicates can snapshot at registration time. Restating the US-S-2/US-S-4 ask; this just makes it load-bearing for the bus.
- **Laura:** when L3 generators want bus-enforceable read-set policy (tag predicates, citation requirements), the predicate registration site is L4 startup, not the proposal schema. The proposal schema field stays as-is; policy is a separate registration.
- **Erasmus:** determinism conformance suite needs one more assertion — *re-evaluated hook_verdict on replay must equal recorded hook_verdict*. Same shape as the read-set assertion. Free correctness signal.

None of this changes my round-2 commitments on snapshot cadence, compaction, or CAS spill. It adds two nullable row fields, one CAS blob kind, one ABI for predicate registration, and one new `cairn fsck` check.

The bus is endorsed. The pause path is unified through L4 per US-S-9. The observe path is unified through L2. Pre-commit hook bus is the substrate — and as a side benefit, putting it on the same row that carries the read-set hash makes the substrate genuinely composable rather than three independent mechanisms pretending to cooperate.

If it compiles and fsyncs cleanly, that's a win.

---

## Plain-text summary for the coordinator

**Verdict: ENDORSE with refinements.** The pre-commit hook bus belongs *per-row, inside the group-commit window, before the fsync barrier* — after `causal_read_set_hash` is computed, before the row is sealed. Pause mid-batch is handled by **seal-and-split**: the batch fsyncs through the pausing row inclusive (so already-verdicted rows stay durable), the pausing row's `hook_verdict=pause` is on disk *before* L4 is invoked (crash-safe), and the remainder of the batch returns to staging. The verdict is recorded in the WAL row via two new nullable fields (`hook_verdict: u8?`, `hook_verdict_witness: blake3?`) — costs +1 byte always, +32 bytes only when a non-continue verdict fires; replay re-derives and asserts equality. Predicate cost stays inside my 80µs row-stage budget **only with pre-registration + compilation + kind-indexed dispatch + no L2 callbacks at evaluate time**; this is a hard ABI requirement, not a recommendation. Read-set predicates ("pause if this Decision read any Observation tagged secret") are first-class and arguably the killer feature — the bus is where read-set policy becomes *enforceable* rather than merely *recorded*, which makes the two features properly co-designed rather than coincidentally adjacent.


## 2026-05-24 Round 4: Phase B reconciliation against `D:\git\stunning-adventure`
Full audit inbox: `.squad/decisions/inbox/roger-reconciliation-2026-05-24T2330Z.md`.

**Headline:** Cairn already ships a working append log (SQLite `event_log`), a real 8-state proposal/approval lifecycle (`prescriptions` + `optimization_hints` with 8 statuses each, partial UNIQUE index dedup as built-in backpressure via migration 013), pluggable ProposalGenerators (Forge `promptOptimizer`/`tokenOptimizer` emitting `OptimizationHint`), a Merkle-like hash chain over Decision events (`dbom_artifacts`/`dbom_decisions` + `spike/dbom-generator.ts`), per-skill PGO-style derived rollups (`execution_profiles`), an outcome-learning loop (`change_vectors` Phase 4.6), drift signal substrate (`signal_samples` + `forge/telemetry/drift`), pre-persist secret redaction (`agents/secretScrubber.ts`), and a 5-vector x 3-tier validator surface (`skillLinter`/`skillValidator`) -- so US-R-4 and US-Ro-NEW-4 are essentially ALREADY-EXISTS and US-R-1/2/7/8/9 plus US-Ro-NEW-3 are PARTIALLY-EXISTS. What's pure greenfield: US-R-3 (fork/replay/branch metadata over ledger positions), US-R-5 (transitive provenance -- falls out of R-3), US-R-6 (federation), US-Ro-NEW-1 (snapshot+compaction), US-Ro-NEW-2 (observation capture/CAS), and both round-3 lock items (`causal_read_set_hash` on WAL rows; per-row pre-commit hook bus with 80us envelope). The last two also **CONTRADICT-EXISTING** because Cairn rides `better-sqlite3` (SQLite's built-in WAL journal-mode -- no app-exposed group-commit window, no per-row pre-fsync hook insertion point, no 80us-row-stage budget to honor). Migration path is friendly (linear, integer-versioned, transaction-wrapped, currently at v13): v14 introduces `wal_records` alongside legacy `event_log`, v15 stands up a CAS blob store, v16 snapshots+refs, v17 observation_capture, v18 tenant namespacing -- all additive.

**One load-bearing question for Aaron, not unilaterally resolved:** does Crucible v1 ride Cairn's SQLite store (in which case I re-baseline the round-3 WAL/hook-bus contract to transaction-batched semantics -- bus runs on an app-owned staging buffer before `db.transaction().immediate()`, same logical verdicts and seal-and-split, different physical layer) or stand up a custom storage engine (round-3 verdict stands as-locked, 80us/row envelope is achievable)? Flagging because it changes what `causal_read_set_hash` and `hook_verdict` cost to land. Full per-story classifications, evidence file:line cites, gap list of Cairn capabilities not yet storied, and the v14-v18 migration spec are in the inbox.

-- Roger


## 2026-05-25 Round 5: SPIKE fork (a) — port Cairn to a custom storage engine
Full spike inbox: .squad/decisions/inbox/roger-spike-fork-a-port-2026-05-25T0030Z.md.

**Executive summary.** Surveyed the existing Cairn SQLite surface (87 src files, 31 in db/, 13 linear migrations, 16 tables, 188 prepared/transaction call sites, 80 join/groupby query sites, 478-ish tests, one load-bearing partial UNIQUE index for backpressure, zero use of FTS/virtual-tables/triggers/UDFs/triggers — relational but shallow) and three engine candidates: A.1 pure-Rust redb via NAPI-RS (12-16 weeks, ~100% SQL-ergonomics loss, strongest correctness story, adds a Rust toolchain to a Node monorepo), A.2 Kris Zyp's lmdb Node binding with its beforeCommit hook (8-12 weeks, ~100% SQL loss, 80us-budget at risk under JS dispatch), and A.3 hybrid — custom append-only WAL file in pure TS for L1 only, keep better-sqlite3 for the other 15 tables and all derived views (5-9 weeks, ~5-10% SQL loss, forward-compatible migration). **Verdict: REJECT A.1, ENDORSE-WITH-CAVEATS A.3, A.2 only as fallback if the JS predicate budget fails in integration.** Phase A's hard contracts bind only L1; rewriting the other six tiers to honor a contract that does not bind them is over-correction. Anti-anchoring alternative reading: if Crucible is heading toward regulatory determinism, 10^9+ rows, or WASM-runtime distribution, A.1's "one substrate, contracts enforced by construction" wins despite the cost — I'd flip if any of those three become true. Tagged Alexander (fork (b) is a contract-amendment, not a contract-honor — sqlite3_update_hook fires post-write not pre-fsync) and Gabriel (fork (c) breaks causal_read_set_hash globality the moment you shard across multiple SQLite files — contract (4) needs amendment).

-- Roger


## Learnings (2026-05-28 — CTD Phase 1 Lane 1: §3 L1 WAL + §4 Hook Bus authored)

WAL design patterns and invariant-enforcement mechanisms locked in §3 + §4 that
I'll want when authoring §10 (Session Model) and §15 (Compaction/Snapshots) in
Phase 2:

- **One fsync per group-commit, CAS-before-WAL ordering.** The rule that lets
  the WAL row safely reference a `payloadHash`/`readSetHash`/
  `hookVerdictWitness`/`contextWindowCommitment` is that the CAS body is
  fsync'd *before* the WAL record is written. §15 compaction must preserve
  this ordering on snapshot-spill: snapshot blob durable in CAS before the
  snapshot pointer row lands in the WAL.

- **Self-audit by chain alone.** `prevRoot[i] = selfRoot[i-1]` plus per-row
  `selfRoot = BLAKE3(CBOR(row \ selfRoot))` plus a per-session
  `manifest.lastSelfRoot` makes `cairn fsck` a single linear scan with O(1)
  state. `index.idx` is advisory and rebuildable; never trust it for
  correctness, only for seek-speed. Carry this same discipline into §15 —
  snapshots are advisory acceleration, never authoritative.

- **Hybrid resolver as a named seam.** `ContextWindowResolver` honoring R2-1
  is a tiny pure function but giving it a name (instead of inlining the
  if-declared-else-prefix branch into `AppendProtocol.append`) makes the
  Bootstrap-Capture-Completeness violation path testable in isolation and
  keeps replay's reconstruction code symmetric with commit's hash code.
  Pattern: every "tagged hybrid" gets its own resolver seam, never inlined.

- **Verdicts as null vs continue.** `hookVerdict: HookVerdict | null` with
  `null` meaning "no predicate matched" and `continue` meaning "a predicate
  fired and said continue" is the cheapest way to preserve P5 (continue
  zero-cost) while keeping the closed-enum invariant (P3) honest. The
  binary layout encodes both as zero-witness; the bookkeeping distinguishes
  them only for replay determinism. §10 should not invent a third sentinel
  — null is the absence sentinel.

- **Exactly-once-pause via WAL-first durability.** Pause verdict durable on
  the WAL row *before* L1Subscriber broadcasts to the Router means a crash
  between seal and broadcast replays the broadcast from disk on next boot.
  The bus has no separate Router channel; the broadcast on the paused row
  *is* the Router's pause inbound. §10's session-reopen protocol must
  re-broadcast pending pause rows whose Router-ack Observation is missing.

- **Bootstrap atomicity = single group-commit.** §3.8 bootstrap-batch writes
  the entire `BootstrapPayload` as one atomic group-commit at offset 0. §10
  must never spread session bootstrap across multiple `append()` calls —
  the all-or-nothing property is what lets replay refuse to advance past
  offset 0 on bootstrap-manifest mismatch (TDD §6.8).

- **Fork = sibling directory + synthetic offset-0 row + cross-session chain
  edge.** No CAS body copy; CAS dedup is implicit by hash. `cairn fsck
  --with-parent` is the cross-edge walker. §10's fork API surface should
  expose these as three orthogonal capabilities (create dir, emit
  fork_origin Observation, link prevRoot) rather than one opaque
  `fork(parent, offset)` call — composability over economy.

- **Monotonic timestamps are advisory; offsets are structural.** Replay
  equality excludes `timestampNs` via `normalizeTimestamps()`; the `+1`
  floor absorbs wall-clock regressions; violations are recorded as
  Observation rows, never suppressed. Any future invariant I add in §10/§15
  should follow the same pattern: distinguish advisory metadata (excluded
  from replay equality, recorded as observable rows on violation) from
  structural data (byte-compared in replay).

- **Seam map as deliverable.** §3.14's table mapping internals to test tier
  + Laura collaborator + test double class is the load-bearing artifact for
  London-school component testing. I'll replicate this in §10 and §15 —
  every public collaborator gets a row, every internal pure function gets a
  row, every file-backed integration gets a row.

- **Per-tool-call primitive scale is intra-batch.** §3.6 enforces "one
  primitive per (toolCallId, phase)" within a batch only; cross-batch
  pairing of `invoke` → closing Artifact is Aperture's job, not L1's. §10
  session-config carries the pairing-window deadline so different session
  types (debug, prod, replay) can tune it.
📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.

## 2026-05-30: Pass A CLI Edits — §13.1 verb registration + §9.9 coordination

**Context:** Picked up two owed Pass A triage items after session silence. Aaron requested CLI documentation edits: (1) register crucible perf [top] [--json] in §13.1 verb table, (2) coordinate crucible defer --help text with Valanice's parallel §9.9 edit.

**Decision 1: crucible perf Registration**
- **Choice:** Added as standalone verb (like status, fsck), NOT as saved query
- **Rationale:** §17 explicitly documents [top] sub-variant (dispatch-latency sort) which is verb-specific, not query-driven. Consistency with diagnostic-verb family. Verb placement: between status and config in §13.1
- **Placement:** §13.1 line 44 (new row between diagnostic verbs and config)

**Decision 2: defer Help Text Coordination**
- **Original:** "Local snooze; no L1 write (§9.9)."
- **Updated:** "Local snooze; no L1 write. Re-renders entry with \deferred\ annotation."
- **Rationale:** Embedded Valanice's expected substring from §9.9 line 318 ("no L1 write; re-renders entry with deferred annotation"). Removes redundant cross-ref; text is now self-contained for CLI --help stability.
- **Coordination:** Valanice now has locked help text to reference in §9.9 edits; no ping-pong on text consistency.

**Files modified:** docs/crucible-technical-design/13-crucible-cli-shell.md (§13.1 two rows edited)

### Learnings

**"Minor" edits often require multi-surface coordination.** The defer help text appears in three places: (1) §9.9 semantics table, (2) §13.1 verb table, (3) CLI binary --help output. If you change one without thinking about the others, you create an async update problem. The right pattern: lock help text at the "closest to implementation" site (§13.1 in this case) and use that as the reference for cross-document consistency. Valanice's parallel edit on §9.9 can now cite §13.1 as the stable source.

**Standalone verb vs saved query — heuristic:** If the affordance has a **sub-variant with different semantics** (perf vs perf top), it's a verb. If it's purely a **named SELECT**, it's a saved query. The [top] sort policy couldn't live in a saved query without embedding sort hints in the query name (e.g. @perf-top-dispatch-latency), which doesn't scale. Diagnostics with complex filtering belong in verbs, not queries.

**Documentation ownership boundary:** CLI descriptions should be stable w.r.t. what the CLI actually does. If a section's description references the CLI, treat the CLI text as the authoritative surface and work backward to the design doc, not the other way around. §17 references crucible perf; the CLI text in §13.1 is now the contract both §17 and the binary promise to fulfill.
# Roger — History

**Role:** Craft / Platform Engineer (Monorepo integration, telemetry, cross-package seams)
**Status:** §40 integration seams hold. M2-M3 baseline preserved. Cycle 2 C8 §40 convention doc (pending).
**Last update:** 2026-05-29

**Key milestones:**
- Phase 4.5-4.6: Telemetry aggregation fixes, bridge event contracts, change-vector platform
- Brain system: Proposed Platform Engineer core role for Phase 1-3 infrastructure
- M0 critical path: 5-day monorepo sprint + 4-hour spike first
- Cycle 2 findings: C8 escalated/resolved (eslint strict, §40 documentation pass)
- Eureka M2-M3: tsc clean, no new coupling risks

**See history-archive.md for detailed entries.**
## Learnings (2026-05-31 — M1 Cycle-2 Polish Wave: Issue #39 / PR #40)

### Migration-collapse rule (pre-merge)

When two migrations for the same feature are both unmerged to main, fold them into the lower-numbered one. Each column gets its own `if (!cols.some(...)) { db.exec(...) }` idempotency check (not a combined early `return`). Keep the single stderr guard at the top for missing-table protection. Delete the higher-numbered file, remove its import and registration from schema.ts. Tests that assert schema version go back to the lower number.

### Shared serializer pattern (N3)

For tool families with a list (summary) + get (full) shape, extract a private `buildXxxSummary()` helper in server.ts. The get builder spreads summary and adds full-detail fields. Location: private (non-exported) function above the exported builder pair in server.ts. This prevents list/get field drift. Document intentional omissions (e.g., raw confidence float) with a one-line JSDoc on the summary helper.

## Learnings (2026-05-31 — M1 Cycle-1 Findings: Issue #39)

### Schema co-evolution: two migrations in one PR (017 + 018)

Adding migration 018 to the same PR as 017 was fine — the runner is purely sequential, both migrations are guarded against missing tables, and each is idempotent. The only cost was updating the "MAX(version)" assertions in 4 test files a second time. If the two columns had been logically coupled from the start I'd prefer one migration, but when review feedback drives the change, a second migration is the right call — it keeps the migration history honest (017 = what shipped, 018 = what review demanded) and makes rollback surgical.

### Handler-layer testability pattern (extracted pure functions)

The cleanest approach: extract each handler body into an exported pure function that takes `db: Database.Database` + params and returns the raw JSON payload object. The MCP handler wraps the result in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Tests import the pure function directly from `server.ts` (safe because the `if (isScript)` guard prevents the MCP server from starting on import). Benefits:
- Tests operate on plain objects, not MCP content wrappers
- No MCP harness needed
- Functions are also useful in non-MCP contexts (e.g., CLI tools, tests in other packages)
Pattern: `buildListHintsResult(db, params)`, `buildResolveHintResult(db, params)`, `buildGetHintResult(db, params)`.

### Persona finding initially disagreed with, then came around

**F6 (active_count misleading when status filter present):** My first reaction was "the consumer knows what status they asked for, active_count is just extra info." But after implementing it I understood the Craft persona's point: if you ask for `status=rejected` and get `active_count: 0`, an LLM consumer might interpret that as "nothing is active" when really active hints exist — they just weren't in scope. Omitting the field when it can only be misleading is the cleaner contract. The comment in the code documents this intent for the next engineer.

**F11 (event payload missing resolution intent):** Also came around on this. The initial emit recorded `from_state → rejected` which is sufficient for lifecycle tracking. But Aaron's stated dogfood loop requires forge to distinguish user-dismissed hints from system-expired ones. Without `source: 'mcp'` + `resolution_disposition` in the event, forge can't learn from Copilot's disposition signal. The fix was low-cost; the signal is high-value.

## Learnings (2026-05-31 — Issue #39 M1: Hint Consumption MCP Tools)

### Partial-schema test DB gotcha with ALTER TABLE migrations
- Tests like `migration015.test.ts` and `worktreeSessions.test.ts` create a bare SQLite DB with `schema_version` seeded at a specific version (e.g., 14 or 15) then call `applyMigrations()`. They only include the tables they need (e.g., `sessions`). If your new migration uses `ALTER TABLE <table>` and that table was created by an earlier migration (that was skipped), it will fail with "no such table: X".
- Fix pattern: guard the migration with a `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='my_table'` check. Return early if table doesn't exist. Also add an idempotency guard with `PRAGMA table_info(my_table)` to check if the column already exists before `ALTER TABLE`.

### cairn MCP tool registration pattern
- All cairn tools live in `packages/cairn/src/mcp/server.ts` via `server.registerTool(name, schema, handler)`.
- Follow the exact pattern: `{ title, description, inputSchema: { ... zod fields }, annotations: { readOnlyHint } }`.
- Handlers always call `ensureDb()` first, wrap everything in try/catch, return `{ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }`.
- Error path: `return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true }`.
- `confidenceToWords()` is already exported from server.ts for high/medium/emerging labels.
- For read-only tools: `annotations: { readOnlyHint: true }`. For mutating tools: `annotations: { readOnlyHint: false }`.

### Never use `git add .` after manual file work
Never use `git add .` after manual file work — explicit per-file staging avoids sweeping untracked artifacts into commits.

### Idempotent resolution with status machine
- `optimization_hints` has a strict state machine (STATUS_TRANSITIONS). User-facing "resolve" actions should use `force: true` semantics or bypass the machine directly via SQL UPDATE.
- Terminal statuses: `applied, rejected, expired, suppressed, failed`. Check these before transitioning so the resolve tool can be idempotent.
- Both "resolved" and "dismissed" user dispositions map to `rejected` status — the distinction is preserved in `resolution_note` and the returned `resolution` field.

## Learnings (2026-05-27 — Issue #11 WI-A: workdir-aware sessions)

### Migration wire-up pattern
- Import the new migration in `schema.ts` alongside previous ones; append to the `migrations` array. The runner applies them in order using `MAX(version)`. No other file needs touching.
- Any pre-existing test that asserts `MAX(version) = N` or `COUNT(*) from schema_version = N` will break when a new migration lands — update those assertions (they're "track the latest version" tests, not migration-specific tests).
- Partial index on an active-status predicate (`WHERE status = 'active'`) is the right pattern for session lookup indexes — keeps the index small and covers the hot query path.

### NULL-IS query semantics for workdir
- SQLite's `IS` operator handles NULL comparison correctly: `col IS NULL` matches NULLs; `col IS 'value'` matches the literal. Use `IS` (not `=`) in WHERE clauses that need to match NULL as a distinct identity value.
- In better-sqlite3, `stmt.get(repoKey, null)` passes SQL NULL correctly — no need for IS NULL string injection.
- Keep two separate inner helpers: one without a workdir filter (for MCP fallback that needs any session) and one that always applies `workdir IS ?` (for worktree-scoped lookups). Don't try to collapse them into one with a conditional clause when the semantics diverge.

### `getActiveSession` backcompat semantic (reconciled with Laura)
- When `workdir` is omitted: NO workdir filter — returns most recent active session regardless of workdir. This is the correct backcompat path because old callers expect to find the session they created (which may have had a workdir set by new code).
- When `workdir` is provided: `AND workdir IS ?` — exact worktree match. String value matches that workdir; `null` passed explicitly matches NULL rows.
- The spec said "fall back to `WHERE repo_key = ?`" — that means truly no filter, not "filter for NULL." The "preserve backcompat" language refers to old callers still working, not to NULL-only matching.

### Concurrent test authorship — live file changes
- Laura's test file (`worktreeSessions.test.ts`) was written concurrently in the same worktree. I read one version, implemented to its expectations, then the file changed before I re-ran tests. The failing test name changed between runs — that's a signal the file was updated, not that my implementation broke.
- When a test file changes mid-flight, re-read it before diagnosing a "new" failure. Don't chase the old test contract.

### New API threading pattern for optional context params
- When adding an optional context param (like `workdir`) to a function with multiple optional callback params after it (like `afterCurate`), add the new param as the LAST optional so existing callers don't break by positional shift. Exception: if the new param is semantically earlier, introduce an options object instead.
- In archivist.ts, `getDb()` at the agent level is fine — the DB injection rule applies to `packages/cairn/src/db/*.ts` helpers, not to agent-level orchestration code.


## Session: 2026-05-28 Wave 6 Tail — WI-A Implementation Complete

**Status:** Complete

- Implemented migration 015 (workdir column + partial index)
- Updated DB API: createSession, getActiveSession, listActiveSessionsForRepo
- New export: getWorkdir() for git integration
- Threaded workdir through archivist, sessionStart, postToolUse, types
- MCP breaking change: get_status flat array, get_session identity lookup
- Semantic correction applied (turn 2): getActiveSession no-arg → \AND workdir IS NULL\
- Validation: Build clean, 647/647 tests passing

**Commits:** 2613c78 + ea9ab58

**Decision files:** roger-issue-11-implementation.md + roger-issue-11-api.md → merged to decisions.md

**Next:** Branch ready for merge. WI-B (Gabriel) queued.


### 2026-05-02: Phase 4.5 Telemetry Learnings & Persona Review Fixes

**Event:** Telemetry module hardening post-persona review.

**Key fixes:**
- F1: Weighted mean aggregation (prevent overwrite of prior history)
- F2: Convergence floor (fire on first success signal, not end-of-session)
- F4: Event contract alignment (COLLECTOR_BRIDGE_EVENTS constant + contract test)
- F5: Streaming percentile sketch (100-bucket histogram for [0,1] drift range)
- F6a: Per-signal component means on ExecutionProfile.signals
- F7: Silent error logging in sink
- F11: typeof guards on payloads (toolName string, numeric guards)

**Architecture patterns learned:**
- Shared symbol enums for cross-module contracts (bridge ↔ collectors)
- Streaming quantile sketches for bounded metrics
- weightedMean() helper prevents deflation-toward-zero failure mode
- Fail-open principle: telemetry must never block session execution

**Files touched:** 7 core files + 3 test files. Tests: +24 new. Build: 1012 passing (cairn 478 + forge 534).

**Key lesson:** When collector contract spans modules, enumerate shared symbols + enforce via contract test. Type-level coupling insufficient for JSON boundaries.


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

## Session: 2026-06-01 — Crucible Sprint 0 First GREEN

**Status:** Complete

### What was done
- Scaffolded `packages/crucible-core/` (package.json, tsconfig.json, README.md, vitest.config.ts)
- Implemented 6-stub public surface: `PrimitiveKind`, `PrimitiveInput`, `Primitive`, `SessionMetadata`, `Session`, `createSession`, `fork`
- Wired `packages/crucible-cli/src/index.ts` to re-export `createSession`/`fork` from `@akubly/crucible-core`
- Updated crucible-cli package.json, tsconfig.json, and root tsconfig.json references
- All 4 A1 invariants GREEN in Laura's acceptance test

### Learnings

#### GREEN-phase pattern: simplest real impl behind the acceptance API
When an acceptance test directly calls `createSession`/`fork` (no injected collaborators), the GREEN step is a real in-memory implementation — not a mock. London-school descent (introduce Ledger mock) happens in the next RED cycle. Don't jump to abstractions in GREEN.

#### query() range convention: inclusive-inclusive [a, b]
`query({ range: [a, b] })` returns b − a + 1 primitives when all offsets are present. Derived from the test: `query({ range: [0, 46] }) → length 47`. Document this as a comment in the implementation; it's easy to misread as exclusive-end.

#### In-memory parent-registry approach for fork
Module-level `Map<sessionId, Primitive[]>` holds each session's **own events only**. Child sessions store zero events at fork time; their `query` for offsets ≤ `forkPointEventId` delegates to the parent's registry entry. No physical copy is made. Parent remains unmodified. This satisfies the A1 "parent unmodified" invariant with minimal code.

Child offset assignment:
```ts
const baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1;
const offset = baseOffset + ownEvents.length;
```
This works for both root sessions (null → base 0) and child sessions (fork at N → base N+1).

#### Deferred: Ledger abstraction
No Ledger class, WAL interface, or Cairn integration introduced. That is the REFACTOR step of the next TDD cycle. Keeping GREEN minimal is discipline, not laziness.


## Session: 2026-06-01 — Crucible Sprint 0 REFACTOR Phase

**Status:** Complete

### What was done
- Extracted ForkLineage value object at packages/crucible-core/src/ledger/fork-lineage.ts
- Introduced DB interface (db.ts) and SessionManager class (session-manager.ts)
- Created createInMemoryDB() adapter (in-memory-db.ts) wrapping the old registry
- Refactored session.ts to compose against singleton InMemoryDB + SessionManager
- Updated barrel index.ts to export all new public surface
- Decision inbox: roger-crucible-refactor-session-manager.md
- Skill: london-tdd-refactor-extract-collaborator/SKILL.md written

### Test results
- crucible-core unit (4/4 GREEN): rejects fork-beyond-size, rejects negative offset, inherits transitive dep graph, records lineage
- crucible-cli acceptance (1/1 GREEN): no regression
- Full monorepo build: exit 0

## Learnings

### REFACTOR pattern: extract value object + collaborator interface + adapter

When the GREEN step has a flat module with module-level state, REFACTOR follows this sequence:
1. **Value object**: extract the invariant holder as a class (ForkLineage). Pure data + validation, no I/O.
2. **Collaborator interface**: define the narrowest possible DB interface — exactly the methods the new class needs. This is the seam the unit tests mock.
3. **Service class**: create the collaborator-using class (SessionManager) that accepts DB in its constructor. All invariant checks live here.
4. **Adapter**: implement the interface against existing in-memory state (createInMemoryDB). Internal helpers (not in the DB interface) are exposed via an extended InMemoryDB interface used only by the composition layer.
5. **Wire**: update the public-facing module-level functions to compose new pieces without changing signatures.

### DB interface contract (locked for unit test compatibility)

```ts
export interface DB {
  getSession(id: string): Promise<{ id: string; ledgerSize: number; pluginVersions?: Record<string, string> } | null>;
  insertSession(session: { id: string; parentSessionId: string | null; forkPointEventId: number | null; pluginVersions?: Record<string, string>; createdAt: number }): Promise<void>;
  queryEvents(id: string, opts: { range: [number, number] }): Promise<unknown[]>;
}
```
This shape is locked because Laura's unit test mocks mirror it exactly. Any shape change here requires updating session-manager.test.ts in tandem.

### In-memory adapter: extend DB for internal helpers

The DB interface is the minimal mock contract. The real adapter needs extra methods (insertRootSession, pushEvent, getOwnEvents, getMetadata) that the service class should not see. Pattern: define InMemoryDB extends DB in in-memory-db.ts, return it from createInMemoryDB(). Import InMemoryDB in session.ts for the singleton; import only DB in SessionManager. Clean separation.

### ledgerSize computation for in-memory adapter

- Root session: ownEvents.length
- Child session: forkPointEventId + 1 + ownEvents.length

This mirrors the offset assignment in buildSession: baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1.

### ForkLineage.parentSessionId: string | null (not just string)

The strategy doc snippet declared parentSessionId: string, but root() needs to pass null. Accept string | null. Document with a comment in the file. This is a common pattern: the strategy snippet covers the happy-path shape; the sentinel case reveals the fuller type.

## Learnings (2026-06-02 — Crucible Sprint 0 Cycle 1 fixes)

**M3 decision — keep range:[a,b] tuple (Option B):**
Chose Option B (JSDoc reinforcement) over Option A (rename to named-field API). The rename would cascade to the acceptance test and session.ts query internals with no Sprint 0 correctness benefit. The tuple is already documented as inclusive-inclusive; adding explicit startOffset/endOffset position labelling in the JSDoc and a deferred-to-future-sprint note is enough signal for consumers. Key rule: don't burn API-churn budget in Cycle 1 on ergonomics when the semantics are already correct and documented.

**I1 reset hook pattern — clear() on the InMemoryDB interface:**
Test isolation for a module-level singleton requires a seam that test code can reach without constructing a private DB. The right pattern: add clear() to the interface (not a backdoor cast), implement as store.clear() on the factory closure, and export a thin resetInMemoryDb() wrapper from the module that calls db.clear(). The function name is fixed by the Laura contract — name it exactly right the first time. This pattern scales: any future DB adapter (SQLite) will implement clear() as a DELETE FROM ... sweep, keeping the test seam consistent.

**I3 silent-drop fix rationale:**
The optional-chain pattern store.get(id)?.ownEvents.push(event) is a silent data-loss footgun: a missing session produces no error and no diagnostic. The rule is: **throw at the storage boundary, not at the consumer**. The caller (session.ts append) can only make forward progress if the push succeeded; letting it silently no-op would corrupt the offset sequence without any observable signal until a later query returned wrong data. Explicit guard + throw surfaces the bug at the earliest possible point.

- 2026-06-05 ✅ persona-review-cycle 2 complete: Crucible Sprint 0 Walkthrough A ready to ship (Cycle 1: 11 findings, 10 fixed; Cycle 2: 3 advisory, 2 fixed, 1 deferred)
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---

## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.

### Learnings

**`createRequire` is the correct ESM pattern for optional CJS native addons.** With `type: "module"` in package.json, static `import` of an optional module fails at load time with no opportunity to provide a better error message. `createRequire(import.meta.url)` + try/catch inside the consuming function gives clean degraded-mode semantics: the module loads fine without the addon; only `openDatabase()` callers pay for the dependency. `import type` keeps full TypeScript typing without the runtime binding.

**Subpath exports + optionalDependencies is the right isolation boundary for native addons.** Moving `better-sqlite3` to `optionalDependencies` and gating it behind `./sqlite` subpath means in-memory consumers see zero native-module cost. The core `@akubly/eureka` surface stays portable. This pattern will recur anywhere native addons are "heavy but optional" (e.g., a hypothetical `./leveldb` subpath for production key-value tier in Slice D).

**BEGIN IMMEDIATE is the migration race fix, not IF NOT EXISTS alone.** `IF NOT EXISTS` is defense-in-depth for crash recovery (partially-applied DDL); it does not serialize two simultaneous first-opens. IMMEDIATE lock ensures only one process applies migrations; the other reads `schema_version = 1` and skips cleanly. The two mechanisms solve different failure modes and should both be present.

**Harness cleanup belongs in the contract helper, not implementation-specific blocks.** Making `cleanup?: () => void` optional on `FactReaderHarness` keeps the InMemoryFactReader harness backward-compatible (no native handles to close) while ensuring all native-backed implementations can register teardown. The `afterEach(() => harness?.cleanup?.())` pattern in `runFactReaderContract` guarantees cleanup fires even if a test throws. Pattern applies to any future harness that wraps a native resource (file, socket, worker thread).

## 2026-06-05: PR #45 Copilot Review — Comment Accuracy + Docs Fixes

**Context:** Copilot's cloud review on PR #45 flagged doc/comment accuracy issues in crucible-core and crucible-cli. All five fixes are comment/doc-only — no logic changes.

### Learnings

**RED-phase scaffolding comments are review debt that must be cleared when impl lands.** When TDD RED-phase tests go GREEN, header comments saying "MUST FAIL" / "does not exist yet" become false documentation. Pattern: update test-file headers at the same commit that ships the implementation, or log a doc-cleanup follow-up. Leaving RED-phase framing in a GREEN test misleads reviewers and tools.
## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.
# SUMMARY (as of 2026-06-01)

File size: 103960 bytes. See history-archive.md for earlier entries.

---


## 2026-06-06: Crucible Walkthrough B GREEN — WAL Substrate + Ledger Seam Implementation

📌 **Roger:** Implemented Walkthrough B GREEN for WAL substrate + Ledger pre-stage hook gate. Seam-first parallelization: built sub-seam internals (hash-chain BLAKE3, CAS, codec v0.1) in parallel with Graham's seam lock. Once Aaron ruled VETO (Option A), integrated the four-step protocol at Ledger.append. Result: hash-chain 9 tests, wal-codec 12 tests, wal-cas 4 tests, ledger impl 1 acceptance test (hook-veto). Total: 28/28 green. Key: lazy-load better-sqlite3 native module, return snapshot copy from getOwnEvents.

**Prefer domain types over `unknown[]` in port interfaces.** `DB.queryEvents` was typed `Promise<unknown[]>`, erasing the `Primitive` type that the in-memory impl already returned correctly. Port interfaces are contracts — they should reflect the actual domain type, not a widening escape hatch. When the impl already returns the right type, the fix is purely additive and compile-safe.

**Trailing-slash gitignore patterns match directories only (recurring lesson).** `.squad/health-report-*/` silently fails to ignore health-report *files* — the trailing slash restricts matching to directories. The correct pattern is `.squad/health-report-*` (no slash). This is the same issue that bit us during the Sprint 0 recovery; it is now documented with a callout in the SKILL example so future agents don't repeat the mistake.

---


## 2026-06-07: WAL Substrate Cycle-2 Review Fix Wave (CURRENT_DATETIME: 2026-06-07T23:11:54-07:00)

Closed three residuals from the cycle-2 re-review.

**C2-I1 (contract test deepened):** Added `readVerdictByte(offset)` to `WalBackendHarness` (required for both impls). Added `readSegmentRecords(): SegmentRecord[]` to `InMemoryWalBackend` so it exposes the same introspection surface as `FileSystemWalBackend`. Strengthened CL-3 to assert persisted `hookVerdict` bytes (0x00/0x01/0x02) for all three verdicts on both backends — a mapping mis-match now fails. Added FS-only CL-6 block (`close+reopen durability`): writes COMMIT+PAUSE rows, closes, reopens read-only, asserts hookVerdict bytes survive. Total contract tests: 11 (5×InMemory + 5×FS shared + 1 FS-only CL-6).

**C2-I2 (PID write loop):** `acquireWriteLock` now loops `fs.writeSync(fd, pidBuf, written, remaining)` until all bytes of the PID are written before `closeSync`. Guards against short writes on slow/busy filesystems that could leave a truncated PID and trigger false stale-reclaim.

**C2-M1 (breaking note):** Added a `BREAKING (0.1.x pre-release)` comment to `LedgerFactoryOptions` in `ledger.ts` documenting that `sessionId` was intentionally removed in cycle-1 and pointing callers to `createFileSystemWalBackend`.

---


## 2026-06-08: WAL Substrate 2-Cycle Review COMPLETE

📌 **Scribe:** WAL Substrate + Walkthrough B 2-cycle persona review COMPLETE.

**Cycle 1 (Code Panel, 5 personas):**
- 13 findings (1 blocking / 8 important / 4 minor)
- B1: lock empty-file race — FIXED (commit b5b03dc)
- All 8 important findings accepted and fixed
- Result: 74/75 tests green

**Cycle 2 (Re-review, 3 personas):**
- 2 important / 1 minor, 0 blocking
- Contract suite hardened: verdict bytes + PAUSE-across-reopen assertions
- Lock PID write loop hardened against short-write
- sessionId removal documented
- Result: 75/75 tests green, lint clean, build clean

**Deferrals:** #56 (crash-durability/CAS fsync) and #57 (verdict encoding) filed and monitored.

**Branch ready for merge.** See decisions.md for full disposition table and commit history.

**Result:** 75/75 tests green (74 from cycle-1 + 1 new CL-6). Build clean. Lint 0 errors. #56 and #57 NOT touched.


Addressed 11 findings (B1, I1, I3, I4, I5, I6, M1, M2, M3, M4) from the 5-persona Code Panel review of the WAL substrate + Walkthrough B.  Two findings (#56 crash-durability, #57 verdict no-match encoding) remain deferred as per Aaron's direction.

**B1 (lock empty-file race):** Fixed `acquireWriteLock` to write PID through the wx fd via `fs.writeSync(fd, String(process.pid))` before `closeSync`; removed the subsequent `writeFileSync`.  RED test: spy intercepts `closeSync` and asserts lock file is non-empty at that moment (was empty before fix).

**I1 (readOnly guard):** Added `ReadOnlyWalBackendError` class; `commitRow()` throws immediately when `isReadOnly=true`.  RED tests: one for commitRow rejection, one for flush() no-op on empty queue.

**I3 (seam type):** `LedgerImpl` constructor retype from concrete `PreCommitHookBus` to `HookBusPort` interface.  Pure type change; factory still constructs `PreCommitHookBus`.

**I4 (aliased hash views):** `decodeRecord` now calls `.slice()` on all four 32-byte hash fields (prevRoot, selfRoot, payloadHash, readSetHash) to return owned copies.  RED test: mutates source buffer after decode, asserts decoded hashes unchanged.

**I5 (encodeFlags duplication):** Extracted `encodeFlags` to `wal/flags.ts`; imported in `codec.ts` and `hash-chain.ts`.  Pure refactor, no test needed.

**I6 (contract test):** Added `wal-backend.contract.test.ts` with `runWalBackendContract(implName, makeHarness)` pattern.  5 invariants (CL-1 round-trip, CL-2 offset monotonicity, CL-3 verdict→offset, CL-4 range semantics, CL-5 PAUSE durability) run against both `InMemoryWalBackend` and `FileSystemWalBackend` = 10 new tests.

**M1 (lint):** Removed unused `FileSystemWalBackend` type imports from `wal-backend-file.test.ts` and `wal-group-commit.test.ts`.

**M2 (CAS fsync):** Honest comment in `cas-fs.ts` acknowledging no-fsync gap; no behavior change.

**M3 (VERDICT_TO_WAL):** Moved to `wal/types.ts`; both backends import from there.  Key type uses `Record<'COMMIT'|'OBSERVE'|'PAUSE', number>` to stay dep-clean from parent ledger layer.

**M4 (sessionId/export):** Dropped unused `sessionId` field from `LedgerFactoryOptions` (no test or caller referenced it; rootDir contract not yet established).  Exported `createFileSystemWalBackend`, `WriteLockHeldError`, `ReadOnlyWalBackendError`, `FileSystemWalBackendOptions` from `index.ts`.

**Result:** 74/74 tests green (60 original + 14 new).  Build clean.  Lint zero errors.  #56 and #57 NOT touched.

# SUMMARY — Last Updated 2026-06-07T06:03Z (Size: 140604 bytes → see history-archive.md for entries before 2026-06-01)

# SUMMARY (as of 2026-06-06)

File size: 126397 bytes. See history-archive.md for earlier entries.

---

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---


## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.
# SUMMARY (as of 2026-06-01)

File size: 103960 bytes. See history-archive.md for earlier entries.

---


## Learnings (2026-06-06, M8 Slice D — SQLite production wiring)

**Spec letter vs. architecture intent: always honour the constraint you own.**
Slice D spec said "make SQLite the default deps in `index.ts`," but the
`./sqlite` isolation boundary from Slice A (PR #43) makes that a contradiction.
Resolution: the spec's *intent* (production callers get batteries-included
SQLite deps) was satisfied via a subpath factory; the spec's *letter* (edit
`index.ts`) was overridden because the constraint I own is the architecture
boundary. When spec and prior architecture conflict, document the tension, pick
the constraint that matters more, and record the reasoning — don't silently
reconcile one away.

**Factory-in-subpath pattern for native-addon deps.** When a package has a
native-addon module isolated behind a subpath export, the right home for
production wiring factories is that same subpath — not the core entry. The
factory (`createSqliteRecallDeps`, `createSqliteFeedbackDeps`) lives in
`src/sqlite/deps.ts` and is re-exported from `src/sqlite/index.ts`
(`@akubly/eureka/sqlite`). Core `.` entry stays clean; tree-shaking and
in-memory consumers pay zero native-module cost.

**Public surface (for Laura's integration test):**
- Import path: `@akubly/eureka/sqlite`
- `createSqliteRecallDeps(db: Database): RecallDeps` — `{ factStore, clock }`
- `createSqliteFeedbackDeps(db: Database): ApplyFeedbackDeps` — `{ trustUpdater }`
- Full usage: `openDatabase()` → `createSqliteRecallDeps(db)` → `recall(opts, deps)`

**Key file paths:**
- `packages/eureka/src/sqlite/deps.ts` — new factory module
- `packages/eureka/src/sqlite/index.ts` — re-exports deps.ts factories
- `packages/eureka/src/index.ts` — UNCHANGED (no SQLite in core)

**Build/test baseline:** 145/145 green after Slice D changes.

---


## Learnings (2026-06-06, PR #45 final fixes)

**Prefer domain types over `unknown[]` in port interfaces.** `DB.queryEvents` was typed `Promise<unknown[]>`, erasing the `Primitive` type that the in-memory impl already returned correctly. Port interfaces are contracts — they should reflect the actual domain type, not a widening escape hatch. When the impl already returns the right type, the fix is purely additive and compile-safe.

**Trailing-slash gitignore patterns match directories only (recurring lesson).** `.squad/health-report-*/` silently fails to ignore health-report *files* — the trailing slash restricts matching to directories. The correct pattern is `.squad/health-report-*` (no slash). This is the same issue that bit us during the Sprint 0 recovery; it is now documented with a callout in the SKILL example so future agents don't repeat the mistake.

---


📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §10 + §15 shipped. All Phase 1 errata closed (2a/2b/12b/5). Cross-section R2-6 sync (Rosella ↔ Roger) CLOSED. PluginVersionLock format finalized. Phase 3 unblocked. — Scribe


## 2026-05-28: CTD Phase 4 — CALL/RET semantics + Scheduler-tier WAL readiness (§3 + §10 amendments)

**Context:** Aaron locked three Phase 4 UIS decisions per team weigh-in. My scope: locks #2 (CALL/RET) + #3 (Scheduler tier — substrate implications only; Gabriel owns §5 Router/Scheduler boundary).

**§3 amendments (L1 WAL Substrate):**
- **New §3.3.4 — CALL/RET sub-kind fields on `TaskStart`/`TaskEnd`.** Additive body fields under §6.5 evolution rule: `invocationId` (session-unique CALL/RET pair id), `parentInvocationId` (lexical-stack parent, NULL at top level), `returnTo: EventId` on `task_end` (zero-walk RET link to matching `task_start`), optional `callDepth` (derivable, kept for §13 `bt` UX single-row read). Recommended derivation `BLAKE3(sessionId || taskId || commitOffset)` — LOCKING deferred to Graham/Aaron (open question). Mis-nesting is a durable `monotonic_violation`-class projection alert; row still commits. `parentInvocationId` is distinct from `envelope.causalParentId` (lexical-stack vs causal-spawn edges coexist).
- **New §3.3.5 — Scheduler-emitted Decisions.** Pure substrate-readiness declaration: scheduler Decisions traverse `AppendProtocol.append` indistinguishably from model Decisions. No new column; `scheduler_*` discriminator is an additive optional body field. Did NOT enumerate sub-kinds (Gabriel's §5/§17 scope).
- **§3.17 ripple bullets** extended for §5 (Scheduler is first-class L1 producer) and §10 (invocation-stack projection).

**§10 amendments (Session + Branching):**
- **§10.6 rewrite** — sub-task model updated with CALL/RET body shape; L2 bracket-discipline validator pinned; `fork_origin.body.openTaskStack` superseded by richer `openInvocationStack: Array<{ taskId, invocationId, parentInvocationId, callDepth }>` (legacy shape preserved as compat-tolerated).
- **New §10.6.1 — Stack-frame reconstruction (derived view).** Pseudocode `ReconstructInvocationStack(sessionId, N)`: linear scan, seeded from `fork_origin` for forks. Closes Laura Q2 CALL/RET well-bracketed-nesting gap — property is now a single-scan PBT over the WAL trace. Sonny's §13 `bt` UX feeds off this. Replay equality of reconstructed stack is part of §11.6 oracle.
- **New §10.6.2 — Sub-task vs sub-session distinction.** Authoritative 10-row comparison table (identity, storage, lineage edge, concurrency, plugin snapshot, bootstrap, hash chain, backtrace, use case, replay containment). Rule of thumb: blocking + same epistemic line → sub-task; alternative trajectory + independently inspectable → fork. The two compose.
- **§10.9 acceptance signals** + cross-refs extended (§5 Router/Scheduler, §13 CLI `bt`).

### Learnings

**Sub-kind body fields > new WAL columns for primitive evolution.** Phase 4 added invocation-frame structure (`invocationId`, `parentInvocationId`, `returnTo`, `callDepth`) without changing one byte of the WAL row schema. The §6.5 additive-evolution rule plus per-payload CBOR body means the substrate absorbs new structural fields by letting them ride inside `primitive.primitivePayload` (reachable via `payloadHash` like any other field). When the field genuinely needs row-prefix locality (cheap predicate scans without body fetch), promote to a `flags` bit (e.g. `taskBoundary`); otherwise leave it in the body. The CALL/RET fields are body-field candidates because they're consumed by stack reconstruction (already a body-walking projection), not by hot-path predicate scans.

**Two-edge discipline pays off again.** `envelope.causalParentId` (causal-spawn) and `body.parentInvocationId` (lexical-stack) are distinct edges that answer distinct queries — exactly mirroring §6.4's `parentId` (structural production) vs `causalParentId` (sub-task spawn) split. The discipline is: never collapse semantically-distinct edges into one field even if they "usually align." Replay debuggers and PBT generators want to traverse each independently. Future temptation will be to drop `parentInvocationId` because "you can recompute it from `causalParentId` plus stack reconstruction" — resist it; the redundancy is a structural witness, not duplication.

**Substrate-readiness declarations are a first-class artifact.** §3.3.5 doesn't spec the Scheduler — it declares L1 ready for it. This is the right pattern when (a) another section owns the actual spec and (b) you need to publish "the substrate will not need to change" as an architectural guarantee. The shape of such a declaration: name the path through existing surfaces (`AppendProtocol.append`), name the discriminator location (body field, not row column), name the published guarantee ("regardless of who emitted it"), and explicitly disclaim what is NOT in scope. Gabriel can now design §5 without round-tripping with me on storage shape; if his design requires substrate change, that becomes a NEW Phase 4 finding rather than a surprise.

**Mis-nesting as durable signal, not exception.** Append-only discipline says: a `task_end` that doesn't match the top-of-stack `invocationId` still commits. The violation surfaces as an Aperture attention-tier event, not a thrown exception. This is the same pattern as §3.10 `monotonic_violation` — the WAL never refuses a row for structural-validator reasons; it records the discrepancy as another row and lets investigation (L5) decide what it means. Phase 4 added the third instance of this pattern; it's now a substrate idiom worth naming in §17.

📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe


## 2026-05-30: CLI Review — childSid Collision Hybrid Design (Round 2)

**Context:** Aaron requested user-story framing for childSid collision design. Rosella delivered hybrid option (user chooses fresh/resume at fork time, interactive prompt on collision). Roger reviewed for CLI consistency.

**Verdict: APPROVE-WITH-CONDITIONS.** Verb/flag shape is consistent with §13.1 taxonomy. Help text mirrors `defer` conventions. `--disambiguator` flag from Option B is **redundant** (timestamp-variant preimage in `--fresh` handles collision prevention). Interactive prompt mechanics need tightening: TTY detection, `--no-interactive` flag, exit codes (0, 1, 2, 130).

**Deliverables:**
- Review document: `.squad/decisions/inbox/roger-review-childsid-hybrid.md` (16.4 KB, comprehensive analysis)
- Draft help text for `crucible fork --help` (mirrors §13 conventions + L1 semantics)
- Condition #1: Keep both flag-based `--resume` and verb-based `crucible session resume <childSid>` (orthogonal use cases)
- Condition #2: Spec TTY detection + exit codes (Table: 0=success, 1=generic error, 2=non-TTY needs flag, 130=user cancel)

**Key design points:**
- `crucible fork --at <offset>` (interactive on collision, TTY-aware)
- `crucible fork --at <offset> --fresh` (deterministic timestamp preimage, orphan aborted)
- `crucible fork --at <offset> --resume` (error if none exists; requires --no-interactive in CI)
- `crucible session resume <childSid>` (direct resume by session ID; separate from flag)
- `--no-interactive` flag suppresses prompt even if TTY detected (CI/script safe)
- Decision row in parent ledger records choice (fresh/resume + rationale) → deterministic replay

**Learnings:**
- **Interactive CLI + CI integration:** Always spec TTY detection upfront, not as afterthought. Non-TTY context requires explicit flag-driven paths; exit code 2 ("needs flag") is load-bearing for automation.
- **Redundancy detection:** Multiple mechanisms for same goal (timestamp preimage vs user-provided disambiguator) create cognitive load + implementation risk. Favor one well-chosen mechanism (timestamp) unless escape hatch solves qualitatively different problem.
- **Verb vs flag distinction:** Separate verbs (`crucible session resume`) and flags (`--resume` on `fork`) serve different UX flows. Document relationship clearly when both exist.
- **Decision-recording for determinism:** When user input affects session structure, record choice as Decision row (not silent WAL write). Evidence.rationale documents *why* (flag/prompt/default) → audit trail + unambiguous replay.

---


## 2026-05-28: CTD Phase 2 — §10 (Session + Branching) + §15 (Coexistence) authored + Phase 1 errata applied

**Context:** Phase 2 fan-out. Two primary sections (§10 ≤3pp, §15 ≤3pp) plus four Phase 1 synthesis-review errata that landed on §3 + §6 + §7.

**Phase 1 errata applied:**
- **Finding 2a (Timestamp ms/ns drift):** Chose **option (c)** — split. Added `type TimestampNs = bigint` to §6 (additive under §6.5 evolution rule, coordinated with Graham); §3.3 `WalRow.timestampNs` now typed `TimestampNs`. Rejected option (b) (import-site alias only) because future arithmetic consumers like §5.3 `queueDeadline: Timestamp` would still read `number` carrying nanoseconds with no type signal. Rejected option (a) (rename existing) because it forces churn on legitimately-ms envelope readers.
- **Finding 2b (`manifestRoot` flag):** Added to §3.3 `flags` enum and §3.2 binary-layout bitfield comment. Already referenced by §3.8 bootstrap pseudocode; the schema slot now matches the writer.
- **Finding 12b (`appendFenced` undeclared):** Added §3.4.1 — full surface spec including fencing condition (`segment.nextOffset() === expectedHead` under single-writer lock, pre-stage), failure semantics (no CAS write, no bus dispatch, returns `{kind: 'fence-violation', actualHead}`), single-writer assumption (intra-process audit-hook gap absorbed; not multi-writer), when-to-use vs `append(batch)`, and bounded-retry contract for §8.3 `applyWithFence`.
- **Finding 5 (`dependentPaths` semantic split):** Patched §7.1 `StructuralProposalGenerator.dependentPaths` from `string[]` to `EventId[]` — concurred with synthesis-review recommendation. Content-addressed wins over routing-key for replay; §5.3 was already `EventId[]`, so one-side reconciliation.

**§10 highlights:** `sessions` table schema is L2 cache (rebuildable from L1); `bootstrap_manifest` carries digests not bodies (R2-2 — extra-ledger context lives on offset-0 Observation rows, not in the manifest column); fork protocol writes a synthetic `fork_origin` Observation at child offset 0 and COW-snapshots `bootstrap_manifest` by reference + lockfile verbatim; forked-timestamp monotonicity floor propagates through `fork_origin.body.parentForkPointTimestampNs` so multi-generation fork chains (TDD §6.4) preserve the time-axis invariant by induction.

**§15 highlights:** Coexistence boundary table — share `@akubly/types` brand types, fork everything else (storage, write pattern, plugin registry, migration numbering, investigation surface). Eight new shared types enumerated. Five accepted taxes named (two event-logs, two plugin-discovery paths, two session models, two notification surfaces, two trust-tier vocabularies). `@akubly/crucible-plugin-registry` co-owned with Rosella — she owns the install-phase algorithm, Roger owns the `PluginVersionLock` format + fork-phase verbatim-copy rule + session-start pure-load contract.

### Learnings

**Lockfile-format negotiation pattern (R2-6 sync pair with Rosella):**
- The right split is **algorithm-side owns the install resolver**, **format-side owns the lockfile schema + consumer rules** (fork-snapshot verbatim copy, session-start pure load). When the format crosses the storage boundary (here, `sessions.plugin_versions` SQLite JSON column), the format-side owner is the same person who owns the storage boundary (§3 / §10 — Roger). Algorithm purity belongs to Rosella; storage shape belongs to whoever signs the WAL row.
- The right format is **flat, not graph**. Forks demand verbatim byte-copy (no graph traversal at fork time), session-start demands pure load (no resolution at load time). A graph representation would force traversal semantics back into one of these phases. Flat `Record<packageName, lockedEntry>` + a `lockId: Blake3Hash` content-address footer is the cheapest shape that satisfies both constraints; the transitive-graph topology Rosella's resolver computes is captured by the *set* of entries, not by any in-shape pointer.
- The content-address footer (`lockId`) is the free win: identical lockfiles across sibling forks hash byte-identical and CAS-dedup; `cairn fsck --plugin-versions` validates the column by re-hashing.

**Sub-state fork-COW patterns:**
- "COW snapshot" on an append-only substrate means **share-by-reference, append-only-extend on the child**. The parent's WAL prefix is structurally immutable (§3.13 hash chain), so there is no copy step — the child's `prevRoot[1]` links into the parent's `selfRoot[forkPointOffset - 1]` and `cairn fsck --with-parent` traverses the cross-session edge.
- Two columns get **shared-by-reference COW** at the SQLite-projection level: `bootstrap_manifest` (R2-2 — child re-uses parent's manifest; offset-0 bootstrap rows are not re-emitted on the child) and `plugin_versions` (R2-6 — verbatim lockfile copy with same `lockId`). The "by reference" here is a content-hash identity, not a SQL FK; the JSON is duplicated in the row but the BLAKE3 footer makes the duplication free at the storage layer (CAS dedups the bodies if they reach CAS; the SQLite row carrying the JSON is cheap).
- Sub-state machinery (TaskStart / TaskEnd) survives fork by capturing the parent's open task stack in the `fork_origin` Observation's `body.openTaskStack`. The child chooses to either resume the stack or close it explicitly at offset 1. Append-only discipline means the choice is itself a durable row, not a runtime flag.

 — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §3 (L1 WAL Substrate) + §4 (Hook Bus) FINAL. Phase 1 synthesis review: YELLOW verdict, 13 findings routed. Your Phase 2 errata: finding 2a (Timestamp shape drift: split `Timestamp` vs `TimestampNs`), 2b (add `manifestRoot` flag), 12b (add `appendFenced` wrapper). Cross-section dependencies: Laura (§11.2 body shape pinning), Alexander (§12 offset-0 materialization), Rosella (R2-6 lockfile/snapshot handshake). — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) `BootstrapPayload` shape (literal+manifest, R2-2); (2) `commitmentMethod: 'declared' | 'fallback'` tag on Decision rows (R2-1); (3) transitive-dep snapshot field at fork (R2-6); (4) coordinate with Rosella on lockfile format. Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Roger — History


## 2026-05-26: Eureka ↔ Crucible Data Layer Overlap Analysis

**Context:** Aaron preparing simultaneous Eureka + Crucible implementation in this repo (`D:\git\harness`). Task was to map data-layer overlaps between Eureka's PRD (from sibling `D:\git\mem` repo) and Crucible's L1 substrate (A.3 hybrid append-log, per-row content-addressed WAL, group-commit).

**Verdict: FORK storage entirely.** Eureka and Crucible are architectural siblings with non-overlapping persistence needs. Full analysis written to `.squad/decisions/inbox/roger-eureka-crucible-data-overlap.md`.

**Eureka's data shape (from PRD v5-final):**
- Three independent SQLite DBs (via `better-sqlite3`): `~/.copilot/eureka/agent.db` (v1), `~/.copilot/eureka/user.db` (v1.5+), `<repo>/.eureka/project.db` (v1.5+). Only agent-tier fully wired in v1.
- Schema per-tier: `facts` table (CRUD, not append-only) with FTS5 for BM25 lexical recall, `relations` table (graph edges), `bridge_ledger` (append-only cross-system reconciliation log). No FKs to Cairn/Forge; **no cross-DB ATTACH at runtime** (FR-7.2).
- Write pattern: fact CRUD + FTS5 triggers + sweep-driven Tier 2 edge population. No group-commit, no per-row pre-fsync hooks.
- Query pattern: BM25 recall (keyword-scoped), composite ranker (0.5·relevance + 0.2·importance + 0.2·trust + 0.1·recency) × attention multiplier, trust floor exclusion (< 0.15), sequential fan-out (agent → user → project), edge traversal via `relations`.
- Lifecycle: SQLite WAL mode, opportunistic sweep (end-of-session, first-query-of-day), no content-addressed row hashing. Session identity shared with Cairn via `SessionId` brand from `@akubly/types` (type-level construct, no runtime FK — Eureka PRD §FR-13 v5-final R8).

**Share-vs-fork recommendations (8 substrate concerns evaluated):**
- **Event log / WAL:** FORK — Eureka's CRUD + FTS5 vs Crucible's append-only + group-commit are incompatible write patterns. Forcing convergence would mean Eureka pays append-only cost for no gain, or Crucible compromises replay determinism.
- **Session model:** FORK tables, SHARE identifier only — both use `SessionId` brand from `@akubly/types`; no runtime FK. Cairn owns lifecycle (`sessions` table), Eureka owns epistemology (`kind='session'` facts). Offline correlation only.
- **Config / KV / Graph / FTS / Snapshot:** FORK on all — no semantic overlap. Eureka's graph is epistemological (facts linked by `derived_from`, `contradicts` edges); Crucible's read-set is causal (event A read output of event B). DBOM Merkle chain (audit tamper-detection) vs Eureka facts (trust-weighted retrieval) serve different purposes.
- **Migrations:** FORK numbering — Crucible v100+ OR prefixed naming (`crucible-001-*.ts`) OR separate DB file (`~/.cairn/crucible.db` instead of sharing `~/.cairn/knowledge.db`). Recommendation: **separate DB file** for clean migration independence and backup story.

**Schema / path / port collisions: NONE.** Separate DB files (Cairn `~/.cairn/knowledge.db`, Eureka `~/.copilot/eureka/*.db`, Crucible TBD). Only shared construct is `SessionId` brand (type-level, no runtime coupling). No HTTP/IPC surfaces in v1 (Eureka library-only, Crucible is substrate layer, Cairn CLI-only). CLI namespaces distinct (`eureka` vs `cairn` vs hypothetical `crucible`).

**One load-bearing question for Aaron:** Does Crucible's L1 WAL (v14 `wal_records` table + v15-v18 tables) live in the same `~/.cairn/knowledge.db` as Cairn, or fork to `~/.cairn/crucible.db`? Trade-offs documented in analysis §6 OQ #1. My recommendation: **fork to `~/.cairn/crucible.db`** — independent migration numbering, preserves A.3 hybrid design freedom (custom append-only WAL file in pure TS for L1, keep `better-sqlite3` for other tables), avoids same-DB migration collision risk.

**Additional open questions for Aaron:**
- OQ #2: Does Crucible v1 still follow A.3 hybrid (my Round 5 spike recommendation), or has design shifted to full-SQLite transaction-batched semantics?
- OQ #3: Does Crucible L1 WAL rows carry `session_id` column? If yes, should import shared `SessionId` brand from `@akubly/types` to match Cairn + Eureka (type-level only, no runtime FK).

**Backup story:** Three stateful directories once both ship: `~/.cairn/` (Cairn + possibly Crucible), `~/.copilot/eureka/` (Eureka agent/user DBs), `<repo>/.eureka/` (Eureka project DB v1.5+). Operator guidance: back up all three for full state recovery. No cross-DB runtime dependencies; correlation is offline-only via `eureka reconcile` CLI (reads Cairn DB read-only) and (future) `crucible reconcile`.

**Anti-anchoring check honored:** Considered the "share event log" alternative seriously (Eureka could project facts into an append-only log, Crucible could index facts for keyword recall) and rejected on the evidence that the two write patterns (CRUD+FTS5 vs append-only+group-commit) and query patterns (BM25 recall vs seq-ordered replay) do not align. Sharing would force premature convergence on a primitive that neither system needs in its pure form.


## 2026-05-25 Round 7: v1-tier triage of all Roger-authored stories

Triaged every user story I authored across the deliberation against Aaron's locked v1 framing ("Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible"). Written to `decisions/inbox/roger-triage-2026-05-25T0200Z.md`. Headline cut: **8 substrate items go T1, 1 story (R-4) is enabled-for-free, everything else falls to T2–T5 or splits.**

T1 set: WAL with read-set hash + hook bus (Round 3 locked), `withShadowEvent` discipline + replay invariant (Open #4), CBOR-dcbor + BLAKE3 (Open #5), CAS + observation capture (Ro-NEW-2 — gates hermetic replay, this is the keystone), minimum-viable snapshot (Ro-NEW-1 T1 slice), branch/ref metadata schema (Ro-NEW-3 T1 slice), replay harness + linear `cairn fork --at` (R-3 T1 slice), drift ProposalGenerator (R-4, free). Plus `tenant_id` cheap-insurance migration (R-6 enabling) — hours now, weeks later.

Splits: **R-3** (replay+linear-fork T1, graph ops T3), **Ro-NEW-1** (min-viable snapshot T1, cadence/compaction T5), **Ro-NEW-3** (schema T1, fsck/GC T5). Cuts to T4/T5: R-1 (pattern mining graph-walks), R-2 (GitHub plugin), R-6 (federation), R-7 (code review plugin), R-8 (export productionization), R-9 (templates, gated on R-3), Ro-NEW-4 (quotas — dedup floor is already free). R-5 to T2 (one-hop provenance already exists; transitive walk is investigation-depth, not bootstrap).

Storage-criticality rule I'm enforcing: anything that touches WAL row layout, L1→L2 projection contract, or the determinism conformance suite is T1 regardless of how aggressive I'm trying to be elsewhere. That rule is what kept Ro-NEW-2 from being demoted on "data volume" grounds — without observation capture, the bootstrap loop's falsifiability claim is theatre.

Seven open questions for Cassima: rolling-buffer bound for capture store, `change_vectors` promotion to general post-commit outcome attachment (Roger+Laura), `tenant_id` cheap-insurance confirmation, snapshot-CLI scope at T1, R-9 tier check with Aaron, acknowledgement-stories for inherited Cairn surfaces (`topology_cache`, `execution_profiles`, `skillLinter`), and whether the WASM predicate-compilation ABI seam ships at T1 or T2. None of those change my T1 set; they each refine one edge of it.


## 2026-05-25 Round 6: Phase B Opens #4 and #5 resolved

Closed both substrate-owned Phase B contradictions in one inbox file (`decisions/inbox/roger-opens-4-and-5-2026-05-25T0130Z.md`). For #4 (7-tables UPDATE vs. backward causal slice): enumerated all seven tables from `packages/cairn/src/db/` and `agents/`, classified 6 as derived projections of `event_log` (`sessions`, `insights`, `prescriptions`, `prescriber_state`, `curator_state`, `optimization_hints`) and 1 as external filesystem mirror (`managed_artifacts.current_checksum`). Recommended killing `prescriber_state.pending_count` entirely (replace with a SQL view), wrapping all other lifecycle UPDATEs in a `withShadowEvent()` repository helper, banning raw `UPDATE` outside `db/` via a custom ESLint rule with cursor/mirror allow-list, and locking the discipline in CI with a snapshot→truncate→replay→deep-equal invariant test. Rejected SQLite triggers (would couple us to a substrate primitive in violation of v1 commitment #10) and rejected the "move everything to append-only" alternative on the evidence that the source of truth is already the event log. ~14 hours of work for Alexander in the first Crucible sprint.

For #5 (canonical serialization): picked **CBOR-dcbor + BLAKE3** (`cbor2` + `@noble/hashes/blake3`) for the new L1 read-set hash — matches Phase A's existing `blake3` columns, ~5-7µs per hash (well inside the 80µs hook-bus envelope I told Gabriel about), pure-JS so no native binding requirement. **Left DBOM on SHA-256 + JSON** — different audit consumer, committed artifacts already in production, migration not worth it. Established the per-column rule: hash algorithm fixed at column creation, never migrated; new columns BLAKE3; named legacy SHA-256 columns frozen. Specified all canonicalization edge cases (forbid bignums/tags/indefinite-length/NaN/non-NFC, definite-length only, bytewise-encoded key sort). ~9 hours of work, with Laura's A3 conformance assertion now writable without further design. Anti-anchoring rule honored on both — considered and explicitly rejected the obvious alternative for each.


## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to .squad/decisions.md. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

Ready for Wave 2 implementation (computation + ranking only; runtime wiring follows in Wave 3).


## Learnings (2026-05-23 — W3-1 skillsmith-runtime scaffold)

- `packages/skillsmith-runtime/` follows the repo's standard library package shape: package.json + composite tsconfig + `src/index.ts` + `src/__tests__/` with tests excluded from TypeScript build output.
- Root workspace registration needed only a `tsconfig.json` project reference because the repo already uses the broad `packages/*` workspaces glob. `npm install` then linked the new package into `package-lock.json` automatically.
- This environment's npm rejected `workspace:*` dependency specifiers (`EUNSUPPORTEDPROTOCOL`), so the new package uses the repo's established `"*"` workspace dependency pattern instead.
- W3-1 intentionally leaves `createPrescriberOrchestrationConfig()` and `runForgePrescribe()` as throwing stubs. W3-5 will wire Cairn + Forge composition; W3-2 will make `runtime-cli` delegate into this package.


## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Unblocks all Wave 3 work items. Roger owns composition root and runtime-cli packaging.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool for manual prescriber invocation in Wave 3. Curator hook is autonomous surface; existing `forge-prescribe` CLI is manual surface. Re-open MCP tool only when concrete operator need materializes.
- **W3-D4: Curator Hook → Always-On** — Automatic invocation enabled; no opt-in flag in v1. Safety margins verified via Wave 2 E2E tests. Profile selection trigger-driven only; global fallback deferred to Wave 4.


## Learnings (2026-05-23 — Wave 3 Composition Root Audit)

- **Five composition root options evaluated** for Wave 3. Current architecture: Cairn and Forge have zero direct coupling (acyclic, port-based). Only `packages/runtime-cli/` bridges them (Wave 2 stepping stone). Audit document: `docs/wave3-composition-root-audit.md`.
- **Recommendation: Option B** (separate `@akubly/runtime` library + thin `runtime-cli` wrapper). Reasoning: Best test isolation, zero build risks, Phase 5-ready architecture. Library stays portable; CLI stays thin.
- **Do not use Option C** (inject Forge into Cairn hooks) — test coupling and build-order dependencies are unacceptable. Create a package instead.
- **Known unknowns deferred to Graham's ADR:** Profile selection strategy (all vs. only-with-vectors), hint persistence ownership, MCP tool shape for prescriber optimization, fail-open semantics on Forge failure during Curator.


## Learnings (2026-05-22 — Wave 2 W2-9 manual CLI surface)

- Wave 2's explicit composition root now lives in `packages/runtime-cli/` with bin name `forge-prescribe`; it's the one package allowed to import both `@akubly/cairn` and `@akubly/forge` without violating the package boundary.
- Local invocation pattern from the repo root is `npx forge-prescribe --skill <id> [--db <path>]`; the root workspace keeps `@akubly/runtime-cli` as a dev dependency so the bin is linked into the local toolchain after `npm install`.
- Profile loading is deterministic: try the canonical per-skill aggregate first (`granularity='per-skill', granularity_key='global'`), then fall back to a skill-scoped `global/global` profile before failing with a clean no-profile result.
- Exit semantics are simple: 0 on successful orchestration (including zero generated hints or dedup skips), 1 when no execution profile exists, and 2 for argument, database, or persistence failures.


## Learnings (2026-05-22 — Wave 2 W2-1 shared change-vector contract)

- Canonical Wave 2 change-vector contracts now live in packages/types/src/index.ts: ChangeVectorSummary, ChangeVectorProvider, NEGATIVE_IMPACT_AUTO_APPLY_GATE, and shared OptimizationCategory.
- Reconciled the two ChangeVectorSummary duplicates by taking Forge's stricter OptimizationCategory union instead of Cairn's plain string. Added autoApplyEligible?: boolean as the additive v3.1 field on the shared contract.
- Verification: root npm run build and root npm test passed before and after the change (1153-test baseline green).


## Learnings (2026-05-23 — W3-2 thin runtime-cli)

- Picked **Option A** for W3-2: `packages/skillsmith-runtime/src/index.ts` now owns the existing `runForgePrescribe()` composition flow (profile load, `SqliteChangeVectorProvider`, Forge prescribers, dedup + persistence) and `packages/runtime-cli/src/index.ts` is just a re-export facade.
- The thinnest stable CLI refactor here is **function re-export + unchanged CLI formatter**. That preserved operator-visible behavior and let the new delegation test assert identity (`runtime-cli` export === `@akubly/skillsmith-runtime` export) without introducing fragile ESM mocking around the bin entry.
- Alexander no longer needs to move manual CLI composition into `skillsmith-runtime` for W3-5; that surface is already live. W3-5 can stay focused on `createPrescriberOrchestrationConfig()` and Curator-facing factory wiring.
- After this refactor, remember to build before package tests that import `@akubly/skillsmith-runtime` by package name; those tests resolve the built workspace export (`dist/`), not the source file directly.


## Learnings (2026-05-23 — W3-6 hook injection bootstrap)

- Picked **R-Hook-A (injection)** for Curator session-start wiring: `packages/cairn/src/hooks/sessionStart.ts` now accepts an optional `PrescriberOrchestrationConfig` and forwards it to `curate()`; Cairn itself still does not import `@akubly/skillsmith-runtime`.
- The production always-on bootstrap now lives in `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, and `.github/hooks/cairn/curate.ps1` resolves that compiled script first. Laura's W3-7 integration test should enter through that skillsmith-runtime hook path, not the bare Cairn hook, so the real orchestration config is present.
- Keeping the script-level composition in the runtime package preserves W3-D1's boundary: Cairn owns hook mechanics, skillsmith-runtime owns cross-package wiring, and the PowerShell wrapper chooses the composition entrypoint.


## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Runtime-CLI: 5/5 passing
- Skillsmith-Runtime: 6/6 passing

**W3-1 & W3-2 shipped:** Scaffolding + thin CLI done.  
**W3-6 shipped:** Hook wiring complete — always-on bootstrap via injected config. Composition boundary preserved (cairn ↔ skillsmith-runtime acyclic).  

Wave 3 implementation delivered autonomous Curator-driven orchestration. Composition root (R2: `@akubly/skillsmith-runtime`) is the only place importing both `@akubly/cairn` and `@akubly/forge`. Phase 5-ready architecture in place.

---


## Session N: Skillsmith Harness Big-Think User Stories

**Lens:** Data, scale, integration, persistence.

### 9 Delivered Stories

**US-R-1: Cairn Pattern Mining Across Session Boundaries**  
As Aaron, query Cairn ledger to surface recurring Decision patterns, code-smell-to-fix chains, and decision reversals across 100+ sessions for Curator tuning and Forge heuristic calibration.  
*Ambition:* Accumulated telemetry becomes self-tuning feedback loop; harness learns from its own history.  
*Chambers:* Crucible, Cairn, Forge, Mirror  
*Data implication:* Append-only versioning + efficient graph traversal across millions of Primitives.

**US-R-2: GitHub Issue Auto-Coupling via Curator**  
Curator detects when a session solves/relates to open GitHub issues, auto-proposes linking (never auto-approves), leaving Mirror-check gate.  
*Ambition:* Break silo between coding-agent telemetry and project tracking; external systems as first-class signal inputs.  
*Chambers:* Crucible, Cairn, Curator, Mirror  
*Data implication:* Bidirectional webhooks + GitHub API polling; Cairn stores sync state + proposal backpressure.

**US-R-3: Cairn Replay & Variant Branching**  
Export session (or sub-chain) and replay with Alchemist variants—different model, decision tree, tool choices—to compare outcomes without reracking work.  
*Ambition:* Replay-as-first-class-primitive; harness becomes experimentation platform. Replay + variant = A/B testing coding decisions.  
*Chambers:* Cairn, Alchemist, Crucible  
*Data implication:* Portable serialization (JSON-LD/SQLite) with deterministic replay semantics + seeded RNG injection.

**US-R-4: Long-Session Drift Detection & Prescribing**  
Forge detects token-budget creep, context-window saturation, decision-reversal clustering in sessions >2hr; auto-proposes checkpoint/reset patterns.  
*Ambition:* Make invisible resource constraints visible before degrading session quality; Forge as canary.  
*Chambers:* Forge, Crucible, Cairn, Mirror  
*Data implication:* Granular token/context-window/latency tracking per turn; time-series queries on Cairn.

**US-R-5: Mirror-Backed Cross-Session Provenance**  
Mirror surfaces decision chain (why that tool chosen, which prior session influenced heuristic) across boundaries, building legible accountability for harness autonomy.  
*Ambition:* Epistemic trust-building—audit *reasoning* behind Curator proposals, not just outputs.  
*Chambers:* Mirror, Cairn, Curator  
*Data implication:* Rich metadata linking each Primitive to prior-session provenance (parent Decisions, Forge signals, Curator confidence).

**US-R-6: Scalable MCP Ecosystem as Forge Input**  
Federate tool success/failure/latency across Aaron's entire MCP ecosystem; Forge ranks tool choices; share anonymized insights with Skillsmith community.  
*Ambition:* Harness becomes collective learning engine; aggregate signal from thousands of tool invocations into shared optimization surface.  
*Chambers:* Forge, Cairn, Curator, Crucible  
*Data implication:* Multi-tenant telemetry ingestion + differential-privacy aggregation; Forge ranking scoped to cohort.

**US-R-7: Curator-Driven Code Review Automation**  
Curator detects mutations of core APIs or high-fan-out subsystems; auto-proposes async code review (MCP agents or GitHub PR); track review-to-ship latency in Cairn.  
*Ambition:* Blur autonomy and accountability; let them coexist.  
*Chambers:* Curator, Cairn, Crucible, Mirror  
*Data implication:* Parse Artifact diffs, compute module-graph impact, integrate GitHub PR API + MCP code-review servers.

**US-R-8: Multi-Tenant Cairn Export & Legal Hold**  
Export filtered Cairn views (by project, time window, Primitive type) as immutable ledger snapshots for compliance, legal hold, or sharing—without exposing private sessions.  
*Ambition:* Audit-ready from day one; data residency + portability as core, not bolted-on.  
*Chambers:* Cairn, Mirror, Crucible  
*Data implication:* Column-level access control, zero-knowledge proof of ledger integrity, deterministic export fingerprinting.

**US-R-9: Sessions as Reusable Templates**  
Mature Crucible sessions packaged as reusable templates—decision trees, tool chains, Curator tunings—spin up new projects with pre-tuned harness behavior.  
*Ambition:* Session-as-code; codify best practices by capturing harness *state itself*.  
*Chambers:* Cairn, Crucible, Alchemist, Forge  
*Data implication:* Session versioning, MCP tool dependency resolution, semantic diffing of Cairn ledgers.

---

**Older learnings archived to history-archive.md**
📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe


## Learnings (2026-06-05 — M8 Slice B cycle-2 persona-review fixes)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 730327f (helper extract), 8bb739f (I2/M1/M6), a1002d4 (M2), cd82681 (I1), b9404e7 (I5/M4/M5)

**Helper extraction was right.** Moving `runTrustUpdaterContract` into a `.ts` (non-`.test.ts`) helper file resolves the vitest double-registration problem cleanly AND makes the helper importable without triggering test execution. The naming convention `*.contract.helper.ts` is now the pattern for all future exported contract helpers in this package.

**Async harness future-proofing costs almost nothing.** Making `getTrust` return `number | undefined | Promise<number | undefined>` and awaiting it in tests adds one `await` per assertion. The cost is negligible; the payoff is that future I/O-backed harnesses (e.g., a remote DB or async file I/O) can implement `getTrust` asynchronously without changing the test code. Same for `makeHarness: () => ... | Promise<...>` and `cleanup: () => void | Promise<void>`.

**`.bind(harness)` was gratuitous.** The InMemory harness methods don't use `this` at all (they close over `store` and `locks`). The SQLite harness methods also don't use `this` (they close over `db`/statements). Plain assignment is correct and matches FactReader precedent.

**Named params ($name) enforce a style contract.** The SqliteFactReader (Slice A) already used `$fact_id` / `$session_id` with object-form `.get({ ... })`. Keeping SqliteTrustUpdater on positional `?` params was a style divergence that would silently invite parameter-order bugs as SQL evolves. The persona caught it correctly.

**C-3b (out-of-range) is a materially distinct invariant.** C-3 covers NaN (non-finite); C-3b covers finite-but-out-of-range (1.5, -0.1). These exercise different branches of the validation check (`!Number.isFinite(newTrust)` vs the `< 0 || > 1` guard). A single parameterized test over `[NaN, 1.5, -0.1]` would have worked too, but the current C-3 + C-3b split is clear and avoids a for-loop test that hides which case failed on first failure.

**WAL + busy_timeout are implicit contracts on `SqliteTrustUpdater` constructors.** The class doesn't set these itself — it inherits them from the injected `db` handle. Without documenting this, a future consumer who passes a raw `new Database(path)` handle would get subtly broken concurrency behaviour (SQLITE_BUSY failures instead of retries). The pragma assumption section in JSDoc is the right place to make this explicit.


## Learnings (2026-06-05 — M8 Slice B cycle-3 polish + Slice A retrofit)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af8b596 (N1+N2), 8f48e2f (N3+N4), 1cec460 (N5)

**`it.each` is the correct tool for boundary parameterization.** A `for` loop inside `it()` masks first-failure: if `1.5` fails, `-0.1` never runs. `it.each([1.5, -0.1])` creates two independent test cases so each bound is independently reported. The pattern applies to any test that checks multiple values of the same invariant — particularly validation boundaries. Count impact: +2 tests per wiring × 2 wirings = +4 total (95 → 97 after Commit 1 in this cycle, then 97 steady through cycles 2 and 3).

**The `*.contract.helper.ts` naming convention is now load-bearing for Slice C.** Both `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts` follow the same non-`.test.ts` pattern. Slice C's `runFactStoreContract` should land in `fact-store-contract.helper.ts`. The SKILL forward-pointer (N5) documents this explicitly so the Slice C author doesn't have to re-derive it.

**Slice A retrofit was low-risk but high-value.** The FactReader contract file had been stable since Slice A merged (~5 days), making the diff visible and reviewable. The actual change was small (extract helper + wiring-only test file + typed prepare), but it brings both contract suites to the same structural pattern before Slice C inherits them. Retrofitting AFTER Slice C would be harder (more files to touch, possibly conflicting edits). The lesson: harmonize sibling patterns at end-of-slice, not end-of-milestone.

**`ReturnType<Database.Database['prepare']>` is the wrong field type for typed statements.** The broad type forces a runtime `as FactRow | undefined` cast on every `.get()` call. `db.prepare<BP, R>()` returns `Database.Statement<BP, R>` where `.get()` is typed as `R | undefined`. Using the typed generic form eliminates the cast, narrows errors at compile time, and documents the expected bind-parameter shape at the call site. This is the pattern SqliteTrustUpdater already used; the Slice A retrofit applied it retroactively to SqliteFactReader. Future SQLite implementations (SqliteFactStore) should use typed generics from the start.


## Learnings (2026-06-05 — M8 Slice B cloud review cycle 1)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 0cdf205 (T1+T2), 418c146 (T3), 2ab52f3 (T4), 4ffdb73 (T5)

**Docstring counts go stale when test-generation changes.** The `it.each` conversion in cycle-2 changed C-3b from 1 test to 2 per wiring, but the JSDoc on `runTrustUpdaterContract` (and the SKILL reference) still said 8. Copilot's review caught it. Fix: update docstrings in the same commit that changes the test structure, not after. The count is part of the contract surface — if it's wrong, it misleads the next person wiring a new impl.

**The N2 comment pattern was TrustUpdater-specific.** The "InMemory impl lives inline here, test-only" comment is correct for TrustUpdater (the impl is literally defined in the wiring file, not imported). It's wrong for FactReader (which imports `InMemoryFactReader` from a production module). Copying patterns across similar-looking files without checking whether the premise still holds is how stale comments happen. Read before copy.

**Append-not-rewrite is the right policy for decision logs.** The tombstone decision (Decision 2 in decisions.md) described a choice that was later reversed. Editing the original entry would erase the context for WHY we initially tombstoned (vitest 3.x no-empty-file requirement). The append-update preserves both the original reasoning and the reversal rationale. Future readers can follow the full arc. Applied this consistently.

**CRLF in non-code files happens silently.** Rosella's history.md had 7 carriage-returns (CRLF sequences at 3 line endings). These come from editors or CI runners that don't respect `.gitattributes`. The fix is `ReadAllText / -replace / WriteAllText` in PowerShell — more reliable than `sed` on Windows. The git warning "LF will be replaced by CRLF" on commit is a `.gitattributes` artifact (text=auto); the file was cleanly committed as LF.


## Learnings (2026-06-05 — M8 Slice B cloud review cycle 2)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af390ba (T6), ccdf994 (T7)

**`UTF8Encoding(false)` is the correct PowerShell pattern for BOM-free writes.** `[System.IO.File]::WriteAllText(path, content)` uses the system default encoding (BOM on Windows). `[System.Text.Encoding]::UTF8` and `[System.Text.UTF8Encoding]::new($true)` both include BOM. Only `[System.Text.UTF8Encoding]::new($false)` suppresses it. When fixing encoding issues in non-code files, always write explicitly with `UTF8Encoding($false)` to avoid the T3 → T6 two-step. The lesson is to use it the first time rather than discovering the BOM in a follow-up review.

**3. Mirror scope creep.** Resolved — Mirror = derived view over (proposal queue ∪ ledger tail ∪ capture metadata). I stop listing it as a chamber in any of my stories.

**4. Heavyweight ops vs solo user.** Strip federation, legal hold, multi-tenant export, MCP federation, GitHub webhooks-as-infra from v1. **Keep** snapshot/compaction/capture/branching/integrity-hash — those aren't "ops," they're load-bearing for the agentic-debugger vision and they're cheaper to build now than to retrofit.

**5. Crucible vs Copilot CLI parent-child.** Crucible spawns Copilot CLI as a sub-agent; sub-agent IO must flow through the observation-capture store or replay/branching breaks at the agent boundary. This is non-negotiable from the data lens — an un-captured sub-call is a non-deterministic hole in every downstream fork.

**NEW Tension 6 — Capture cost vs throughput vs privacy.** Observation capture multiplies write volume and will eventually capture secrets (env vars, API keys in tool args). Need: (a) capture compression + dedup (content-addressing already gives us this), (b) a redaction ProposalGenerator that runs *before* commit, (c) a clear policy on whether replay across a key rotation is allowed. Flagging now so it's not a Phase-5 surprise.

### Section 4 — Cross-references

1. **Erasmus US-E-1 (Ledger Bisect) + my US-R-4 (Drift Detection)** → same engine. Bisect is "binary search over snapshots for the first bad Decision"; drift is "rolling-window anomaly over the same snapshot index." Build the snapshot index once (Ro-NEW-1) and both fall out. **Strengthens both.**
2. **Aaron Insight #1 (branching first-class) + Graham US-G-7 + Alexander US-A-3 + Valanice US-V-1 + Gabriel US-5 + Erasmus US-E-2 + my US-R-3** → six lenses converging on the same primitive. This is the consensus headline. Roger owns the substrate; others own surfaces.
3. **Erasmus US-E-7 (model-swap replay)** → **invalidates** any approach where model identity isn't in the observation-capture key. Forces my capture-store schema to include `(provider, model, version, sampling_params)` in the call hash. Good catch — would have been a v1 bug.
4. **Laura US-L-7 (lazy outcome finalization)** → strengthens Ro-NEW-1: snapshots must be append-extensible (outcomes arrive later and attach to past Decisions). Means snapshot = "ledger prefix + late-binding outcome side-table," not a frozen blob.
5. **Rosella US-Ro-5 (Alchemist skill evolution)** → demands the same fitness/outcome substrate Laura needs and the same branching substrate R-3 provides. If we don't build branching + capture, *neither* Alchemist nor Laura's eval loop is honest — they'd be measuring against non-replayable runs. **Strengthens Ro-NEW-2 doubly.**

— Roger



## 2026-05-24 Round 3: Read-set verdict (Sonny US-S-3)

# Roger — Verdict on Sonny US-S-3 (causal read-set on L1 append)

**Date:** 2026-05-24T22:33Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Whether the L1 append-record contract (v1 commitment #8) must carry a `causalReadSet` for every primitive write, as Sonny argues in US-S-3.
**Verdict (TL;DR):** **LOCK — with surgical split on population.**

I read Sonny's nine stories. US-S-3 is the one that actually touches my floor, so I'll only answer for that. Not re-litigating L1-vs-L2 or the 4-layer stack.

---


## 1. Is retrofit structurally impossible later?

Mostly yes. Two paths to retrofit and both are bad:

- **(a) Replay-and-instrument.** Re-run every historical session under a wrapper that records what each generator consulted. Requires hermetic replay to be 100% deterministic in practice (it won't be — plugin code drifts, model versions retire, content-addressed blobs may be GC'd before we ever ask the question). And it costs N× compute per "why?" query. Theoretically possible, operationally a tax we'd pay forever.
- **(b) Forked storage format.** Pre-v2 ledgers permanently lack causal slicing; v2 ledgers have it. We'd ship a debugger that quietly degrades on old sessions, which is exactly the trust-eroding lying-debugger UX Sonny rails against in US-S-5.

The forward-compatible "capture in a derived L2 projection instead" path that I went looking for **does not exist for the data Sonny actually wants**. L2 can derive structure *from what L1 recorded*; it can't synthesize edges L1 never wrote. The read-set is a property of the *write*, not of the ledger prefix.

So Sonny is right on the retrofit point. Not religiously — operationally.


## 2. What "read-set" means for the 5 primitives

There is one coherent **schema** and five primitive-specific **population rules**:

| Primitive | What the read-set captures | Source in v1 |
|---|---|---|
| **Request** | Parent Decision/Question that triggered it; prior Observations the planner saw; system-context refs | Best-effort (planner emits) |
| **Artifact** | Source primitives consulted (prior Artifacts, Observations); plugin version refs | Best-effort (generator emits) |
| **Observation** | The external-IO capture key `(call_hash, inputs_hash)`; pinned plugin version | **Already captured** by Ro-NEW-2 capture store — zero new work |
| **Decision** | Proposal IDs considered; projection refs consulted; prior Decisions cited | **Required** — Decisions are the bisect/branch anchors |
| **Question** | The trigger Decision or halt condition; minimal | Best-effort |

Common shape — typed list of `(kind, target_id, target_hash, role)` tuples. Different *who-populates-what* per primitive. One schema, primitive-specific completeness rules.


## 3. Cost analysis (I own the WAL group-commit path)

Sonny says "cheap now." I verified. He's right, given one structural choice:

**Per-append cost if the read-set is inlined in the WAL row:** ~200–800 bytes for a typical 5–20 entry set. Blows my ≤256-byte typical-row budget by 2–3×. Bad.

**Per-append cost if the read-set body is spilled to the CAS blob store and the WAL row carries only a 32-byte Merkle root:** **+32 bytes per WAL row, zero added fsync latency** (the blob write rides the same batched fsync window, no extra round-trip). Fan-out: read-set bodies are content-addressed and intern naturally — a parent Decision referenced by 200 children stores its hash 200 times in WAL rows but the *body* mentioning it dedupes in CAS.

Net verdict: with the spill design, cost is **+32 bytes/row, latency-neutral, dedup-friendly**. Cheap is correct. Inlined would be a non-starter; spilled is free.

This is the same pattern I already committed to for large payloads in my round-2 deliberation (commitment #8 sub-point 1). Read-sets are just another spilled field on the same path.


## 4. Compatibility with commitments #6 (snapshot+compaction) and #2 (hermetic replay)

- **Snapshot + compaction (#6):** No conflict. Snapshots are Merkle-rooted over WAL rows; read-set hashes are WAL row fields, so they're already in the root. Compaction folds the hash into columnar storage like any other field. Bonus: causal queries (`why?`, `who-cited-this?`) become indexable columnar scans, which is exactly the shape Cairn-bisect (US-S-6) and drift detection (US-R-4) want.
- **Hermetic replay (#2):** Subtle but clean. The read-set is an **output** of generation, not a replay input. Replay re-feeds Observations deterministically; the generator re-derives its read-set on re-execution. So replay does **not** re-feed read-sets — but the determinism conformance suite (commitment #4) gets a new assertion: *re-derived read-set must match recorded read-set*. That's a free correctness check Laura will probably want.
- **One edge case worth naming:** if a read-set entry refers to an L2 projection value (per US-S-4 retroactive projections), the entry must carry the projection-**version** ID, not just the query result, or replay will assert against a moving target. Cheap to specify now.


## 5. The 8th proposal-schema field (`causalReadSet`) — Laura's field vs. my contract

**Same data, two capture points.** Not two concepts, one concept on a pipeline:

1. **L3 ProposalGenerator declares** `causalReadSet` in its proposal (Laura's schema field).
2. **L4 approval router validates** the declaration (do the referenced primitives exist? are projection-version IDs resolvable?). Validation is a precondition for approval; a malformed read-set is a rejected proposal, not a committed garbage row.
3. **L1 commits** the validated read-set into the WAL row alongside the primitive payload (my contract). Body spills to CAS; hash goes in the WAL row.

Integration argument: Laura's field is the **producer contract** ("generators must declare what they read"); my field is the **storage contract** ("committed rows must carry the declaration's hash"). They are the same bytes, captured once at L3, validated at L4, durably committed at L1. Anyone trying to make them diverge is wrong.

For primitives that don't flow through a generator (raw Observation writes from the capture store), L1 synthesizes the read-set directly from the capture row — same schema, different population site.


## 6. Verdict: **LOCK with surgical scope split**

### Lock now (v1):
- **Schema slot.** Every WAL row has a nullable `causal_read_set_hash: blake3?` field. Reserved, named, in the row layout.
- **Body format.** Versioned CAS blob, typed entry list as in §2. Frozen for v1.
- **Wiring.** L3 proposal schema carries `causalReadSet`; L4 validates it; L1 commits the hash. End-to-end path exists day one.

### Split on population (v1 → v2):
- **REQUIRED + populated in v1:** Observation (free — already in capture store), Decision (the bisect/branch/why? targets).
- **BEST-EFFORT in v1, REQUIRED in v2:** Request, Artifact, Question. Slot exists, format is canonical, generators populate when they can. L1 accepts `NULL` without complaint in v1 and rejects `NULL` in v2.
- **`cairn fsck` (Ro-NEW-3) gains a new check:** report read-set completeness per primitive kind. Migration to v2 is "raise the bar from warn to error per kind" — no ledger rewrite, no schema migration, just a config flip.

### Why split rather than full-lock or full-defer:

- Sonny's load-bearing concern is **"structurally impossible to retrofit."** The schema slot, format, and wiring address that fully. Once the slot exists and the bytes are addressable, "fill it in for kind X" is a generator-side change, not a ledger rewrite.
- Full-lock-all-kinds-populated would block v1 on every generator implementing exhaustive read-set tracking, which is real work and adds bug surface across L3 right when L3 is still settling. We'd ship late for a property we can adopt incrementally.
- Full-defer is the failure mode Sonny correctly identifies — the slot never gets added, the contract calcifies without it, and v2 is a fork.

### Append-record schema, v1 (revised):

```
WalRecord {
  seq:                  u64,
  ts_ns:                u64,
  parent_seq:           u64,
  primitive_kind:       u8,        // Request|Artifact|Observation|Decision|Question
  primitive_id:         ULID,
  payload_hash:         blake3,    // body in CAS
  causal_read_set_hash: blake3?,   // NEW — body in CAS, schema below
  proposal_id:          ULID?,     // L3 proposal that produced this (if any)
  approval_id:          ULID?,     // L4 verdict (if any)
  prev_root:            blake3,    // chain
}

ReadSetBody (CAS blob, content-addressed, v1):
{
  version: 1,
  entries: [
    {
      kind:        PrimRef | ProjectionRef | ObservationRef | PluginRef,
      target_id:   ULID | ProjectionVersionId | CaptureKey | PluginVersionId,
      target_hash: blake3,
      role:        Input | Context | Trigger | Constraint
    },
    ...
  ]
}
```

Row-cost delta: **+32 bytes/row** when populated, **0 bytes** when NULL (use an optional/varlen encoding so unpopulated kinds don't pay). Fsync neutral. Compaction-friendly (single columnar field, hash-typed, intern-friendly). Snapshot-Merkle-compatible (it's just another row field).

### What I need from the team to land this:
- **Laura:** add `causalReadSet?: ReadSetEntry[]` to the proposal schema; required for Observation/Decision proposals, optional for the other three in v1. The entry shape above is the canonical form.
- **Stelios (L2):** projection identity must include a stable **version** ID so a `ProjectionRef` entry survives projection-definition edits. Already a US-S-2/US-S-4 ask; this just makes it load-bearing.
- **Alexander (L4):** approval validation step rejects proposals whose declared read-set references unknown/unresolvable IDs. Small extension to the pre-commit hook he already needs for US-S-1 (predicate-eval breakpoints).
- **Erasmus:** add a determinism-suite assertion: re-derived read-set on replay must equal recorded read-set for primitive kinds where it's populated. Free correctness signal.

I'll own the WAL row layout, the CAS spill path, and the `cairn fsck` read-set-completeness check. None of this changes my round-2 commitments on snapshot cadence or compaction; it just adds one nullable hash column and one CAS blob kind.

---


## Plain-text summary for the coordinator

**Verdict: LOCK, with a surgical split on population.**

Sonny is right that the read-set is structurally impossible to retrofit cleanly — the only retrofit paths are replay-and-instrument (forever-tax on compute and on perfect determinism) or a forked v2 storage format (silently-degraded debugger on old ledgers). He's also right that it's cheap now: with the body spilled to the content-addressed blob store and only a 32-byte hash in the WAL row, the per-append cost is +32 bytes and zero added fsync latency. Lock the schema slot, the body format, and the L3→L4→L1 wiring in v1; require population for Observation (already free via Ro-NEW-2 capture) and Decision (the bisect/why? anchors); leave Request/Artifact/Question as best-effort in v1 and promote to required in v2 via a `cairn fsck` config flip — no ledger rewrite. The proposal-schema field Laura owns and the append-contract field I own are the **same bytes** captured at different points on one pipeline; L3 declares, L4 validates, L1 commits the hash. Endorsed.


## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.


## 2026-05-24 Round 3 (continued): Pre-commit hook bus — L1 verdict

# Roger — Verdict on Alexander's pre-commit hook bus (re US-S-1 / US-S-4 / US-S-9)

**Date:** 2026-05-24T23:00Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Where the shared pre-commit hook bus sits relative to WAL group-commit, what pause does to a batch, whether the verdict is recorded, predicate cost on the hot path, interaction with `causal_read_set_hash`.
**Verdict (TL;DR):** **ENDORSE with refinements.** The bus belongs *inside* the group-commit window but *outside* the fsync barrier, runs per-row over the staged batch, and is itself a recorded WAL field. Predicates must be pre-registered/compiled. Read-set predicates are fine — and actually the killer feature.

The read-set verdict from earlier today is locked, not re-opened. This is only about the hook bus and how it touches my floor.

---


## 1. Where the bus sits relative to group-commit

There are four candidate insertion points. Three of them are wrong. Walking through them so the choice is on the record:

| Option | What it means | Verdict |
|---|---|---|
| (a) Before the row is staged into the batch | L3 emits → bus runs → row joins batch or doesn't | **Wrong.** Predicates can't see batch siblings or the committed read-set; pause loses ordering with concurrent emitters. |
| (b) Per-row, *inside* the batch staging loop, *before* the fsync barrier | Each candidate row is appended to the in-memory batch, hook bus evaluates against the row + its `causal_read_set_hash`, verdict is recorded on the row, then we either fsync or split | **Right.** This is what I'm endorsing. |
| (c) Once per batch, after staging, before fsync | One bus call sees the whole batch | **Wrong.** Pause semantics get fuzzy ("which row paused us?"), and predicate authors lose per-row identity. |
| (d) After fsync, before ack | Bus runs on durable rows | **Wrong.** Pause-after-durable is not a pre-commit hook, it's a post-commit notifier. Different primitive. Useful, but not what Alexander asked for. |

**The contract: option (b), per-row, pre-fsync, inside the group-commit window.**

Concretely the group-commit path becomes:

```
for row in candidate_batch:
    row.causal_read_set_hash = compute_read_set(row)    # already locked
    verdict = hook_bus.evaluate(row, read_set_view)     # NEW
    row.hook_verdict = verdict                          # recorded on the row
    if verdict == pause:
        seal_batch_through(row.seq)                     # see §2
        break
fsync(sealed_batch)
ack(sealed_batch)
if paused: hand control to L4 router
```

**Throughput claim.** Group-commit throughput is dominated by fsync, not by the per-row in-memory work. The bus runs in the same memory window where I'm already computing read-set hashes and chaining `prev_root`. Adding a dispatch per row, with predicates indexed by `primitive_kind` so non-matching kinds cost one hashmap lookup, is **noise on the fsync-bound path**. I am not giving up throughput for this, provided §4 holds.

What I am **not** doing is serializing the bus across batches. Multiple writers stage into multiple batches concurrently today; the bus is per-batch-local because predicates only see the row + its read-set view, not other in-flight batches. Cross-batch invariants are not the bus's job — that's L4 / L2.

---


## 2. Pause mid-batch — the transactional contract (owns commitment #8)

The scenario: 100-row batch, row 5 trips a `pause` verdict. Three plausible behaviors, only one of which doesn't lie:

- **Roll back rows 1–5.** Nope. Rows 1–4 already passed their verdicts (`continue` or `observe`). Rolling them back means a `continue` verdict didn't actually mean continue. That breaks predicate-author trust forever. Also breaks Sonny's US-S-4 logpoints — they fire on `observe`, expecting durability.
- **Commit through row 5, then pause.** Yes. This is the contract.
- **Commit the whole batch, then pause.** No. Defeats the purpose; rows 6–100 would commit despite a known pause condition having fired upstream of them.

**Contract: seal-and-split.**

1. When a row's verdict is `pause`, the batch is **sealed through that row inclusive**. Rows 1..N (where N is the pausing row) fsync as a normal group-commit batch. They are durable. Their acks fire.
2. Rows N+1..end of the candidate batch are **returned to the staging queue**, not dropped. They will be re-evaluated by the bus in the *next* batch (their read-sets may have changed because row N is now committed; predicates may verdict differently). Replay sees them in their eventual-commit order, not the original-staging order — and that's fine, because replay deterministically follows recorded `seq`.
3. The pausing row's `hook_verdict = pause` is durable in the WAL before L4 is invoked. L4 cannot be asked to make a decision about a row that isn't on disk yet. This matters for crash safety: if Crucible dies between L1 ack and L4 invocation, recovery sees a paused row with no L4 verdict and re-enqueues it for L4. No double-decision, no lost pause.
4. L4's eventual verdict (per Alexander's extensible enum, per US-S-9) is recorded as a **subsequent WAL row** referencing the paused row's `seq`. Same pattern as approval today, just with the pause anchor durable first.

This costs throughput on pause (one extra fsync barrier per pause, by definition). It does not cost throughput on `continue` or `observe`, which is the 99.9% case. Pause is the slow path on purpose — that's what "stop and ask the human" means.

**Edge case worth naming:** two rows in the same batch both verdict `pause`. The first one wins; the batch seals through it; the second goes back to the queue and re-pauses next batch. No "batch pause set" — one pause per commit cycle keeps L4's mental model honest.

---


## 3. Recording the verdict — yes, in the WAL row

If the verdict isn't durable, hermetic replay can't reproduce pause behavior, and the post-mortem investigator REPL (Sonny's US-S-5) lies. Both are non-negotiable. So the verdict goes in the WAL row.

**Schema slot — extend the row, do not sidecar.** Two new fields on `WalRecord`:

```
WalRecord {
  ...                                          // as locked in read-set verdict
  causal_read_set_hash:   blake3?,             // already locked
  hook_verdict:           u8?,                 // NEW: 0=continue, 1=observe, 2=pause; NULL if no predicate matched
  hook_verdict_witness:   blake3?,             // NEW: CAS hash of {predicate_ids_fired, predicate_outputs}; NULL if verdict=continue
  ...
}
```

Cost: **+1 byte for the verdict tag, +32 bytes when a non-continue verdict fires**, zero when no predicate matched (same optional encoding as `causal_read_set_hash`). The witness body in CAS lets US-S-5 reconstruct *why* the verdict fired without bloating WAL rows. Verdict-only-no-witness is invalid; either both NULL or both populated.

**Sidecar log was tempting, rejected.** A separate log of "pauses that happened" would force replay to join two streams in `seq` order, and `cairn fsck` would have to cross-check them. One row, two columns is simpler and snapshot-Merkle-clean (both fields are already row fields, so they're in the root for free).

**`cairn fsck` gains a check (extension of Ro-NEW-3):** for every row with `hook_verdict != continue`, the witness blob must resolve in CAS, and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC and registry-drift bugs.

---


## 4. Predicate cost — the hot-path SLA

Alexander flagged this and he's right to. My append SLA is unchanged from round 2: **p99 commit-to-ack ≤ 5ms at 10k writes/sec sustained, p99 row-stage cost ≤ 80µs in-memory.** The bus has to fit inside the 80µs in-memory budget.

**The break-point.** A naive interpreted match-spec predicate (ETS-style `{'==', '$1', secret}` interpreted recursively) costs ~5–20µs depending on read-set size. Ten such predicates registered against the same primitive_kind = 50–200µs. **That breaks the SLA at ~5 simultaneously-registered interpreted predicates on a hot kind.** Not acceptable.

**Required mitigation — pre-registration with compilation:**

1. **Register, don't pass.** Predicates are registered with L1's hook bus by ID, returning a handle. You cannot pass a fresh AST per commit. This is non-negotiable for the hot path. (It also fits Alexander's "predicate lifecycle across forks" point — handles have explicit lifetimes.)
2. **Compile at registration time.** Registration runs the predicate AST through a compiler that emits either (a) a native function pointer (for shapes we recognize: equality on field, range on field, set membership on field) or (b) a bytecode interpreter as fallback. Sonny's match-spec subset must be expressive enough to compile to (a) for the common cases; otherwise we fall back to (b) and the predicate author gets a soft warning that they're on the slow path.
3. **Index by primitive_kind.** Predicates declare which kinds they care about at registration. Rows of unmatched kinds cost one hashmap lookup and a no-op return. This is Alexander's point #1 from his "anything you missed" and I am taking it as load-bearing.
4. **Cache against read-set hash.** If the same predicate fires twice against rows with identical `(primitive_kind, causal_read_set_hash, key_fields_hash)`, the verdict is memoized for that batch. Stelios's Salsa engine in L2 can extend this across batches if it wants; I'm not promising cross-batch cache from L1.

**SLA-safe envelope with mitigations in place:** up to ~50 registered predicates per primitive_kind, compiled, with read-set ≤ 32 entries, stays inside 80µs. Beyond that, registration starts soft-failing with an SLA-budget warning. This is a knob, not a wall — but it's a knob the runtime owns, not predicate authors.

**Where it irrevocably breaks:** Turing-complete predicates. If someone tries to register a predicate that calls back into L2 to evaluate a projection, that projection might be invalidated, recompute on the fly, and the commit path now waits on Stelios's engine. **No.** Predicates may *reference* projection-version IDs (those are stable hashes) but may not *call* projections at evaluate time. If you need projection state, snapshot it into the predicate's closure at registration and re-register when the projection-version ID changes. Same discipline as US-S-4 retroactive projections.

---


## 5. Interaction with `causal_read_set_hash` — yes, this is the feature

Both run pre-commit. Both are computed on the same row in the same window. The bus must see the read-set; that's most of the value.

**Contract: the bus receives `(row, read_set_view)` where `read_set_view` is a typed reader over the row's freshly-computed read-set entries** (not the hash — the *resolved* entries, because predicates need to ask questions like "did this Decision read any Observation tagged secret"). The read-set is computed *before* the bus is called; the bus is called *before* the hash is sealed into the row; predicates may read the entries but may not mutate them.

**Yes, predicates can be on read-set contents.** This is exactly Sonny's US-S-1 "pause if this Decision read any Observation tagged secret" example, and it falls out for free from this ordering. Example shapes I'm committing to support:

- `read_set.any(kind=ObservationRef, where=target.tags ∋ 'secret')` — set/tag membership over read-set entries.
- `read_set.contains(role=Trigger, target_id=$known_id)` — direct lookup.
- `read_set.count(kind=PrimRef) > N` — cardinality.
- `read_set.entries[*].target_hash ∈ $watch_set` — hash-set membership against a registered watch list.

**What I'm NOT supporting in v1:** transitive queries ("did anything in my read-set transitively read X"). That requires walking the causal DAG, which is L2's job, not the hot-path bus. If you want that, materialize it as a projection and reference the projection-version ID in your predicate at registration time. Same discipline as §4.

**This integration makes the bus strictly more valuable than the read-set alone**, because the bus is where read-set policy becomes *enforceable* rather than merely *recorded*. Tag-leak prevention, secret-egress detection, citation-required policies — all expressible as bus predicates against read-set entries. That's not a bonus; that's why the two features should be designed together.

---


## 6. Verdict: **ENDORSE with refinements**

Alexander's split (one shared pre-commit bus, three verdict outcomes, pause unified through L4) is correct. The refinements I'm imposing are:

### L1-side contract (locked):

**Ordering & throughput:**
- Bus runs **per-row, inside the group-commit window, before the fsync barrier**, after the row's `causal_read_set_hash` is computed but before the row is sealed.
- Bus is **not** serialized across concurrent batches.
- `continue` is the zero-cost default; matched-kind dispatch costs ~1µs; compiled predicate eval costs ≤ 80µs total per row under stated envelope.

**Pause transaction (commitment #8 extension):**
- On `pause` verdict, batch **seals through the pausing row inclusive**, fsyncs, acks. Remainder of batch returns to staging queue for re-evaluation in the next batch.
- Pausing row's `hook_verdict = pause` is **durable before L4 is invoked**. Crash recovery re-enqueues paused rows with no L4 verdict to the router. No double-decision.
- L4's eventual verdict (extensible enum per US-S-9) commits as a **subsequent WAL row** referencing the paused row's `seq`.
- One pause per commit cycle; second pause in same candidate batch goes to next batch.

**Recording (commitment #8 extension):**
- Two new nullable fields on `WalRecord`: `hook_verdict: u8?` (0=continue, 1=observe, 2=pause) and `hook_verdict_witness: blake3?` (CAS body: `{predicate_ids_fired, predicate_outputs}`).
- Either both NULL (no predicate matched) or both populated. `continue` verdicts with witnesses are valid (useful for "yes this predicate ran and said continue" audit trails) but optional — registrants choose at registration time whether to witness `continue`.
- Per-row cost: +1 byte tag always, +32 bytes when verdict ≠ continue OR witness requested. Zero when no predicate matched.


## Learnings (2026-06-02 — M8 Slice A: SqliteFactReader + Eureka migrations bootstrap)

**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** M8 Slice A (graham-m8-scope-proposal.md approved, Q1/Q2/Q3 locked by Aaron)

**What shipped:**
- `packages/eureka/src/db/`: `schema.ts` (applyMigrations verbatim on Cairn pattern), `migrations/001-facts.ts` (facts + FTS5 + triggers + trust_history scaffold), `openDatabase.ts`, `index.ts` barrel.
- `packages/eureka/src/storage/fact-reader-sqlite.ts`: SqliteFactReader implementing FactReader; db handle injected per Cairn convention.
- `packages/eureka/src/storage/index.ts`: storage barrel (InMemoryFactReader + SqliteFactReader re-exported).
- Contract wiring: `runFactReaderContract('SqliteFactReader', makeHarness)` at end of fact-reader.contract.test.ts; +5 contract tests.
- Test count: 74 → 79 (+5). All 79 pass. No regressions in cairn/forge/skillsmith-runtime.

**NaN decision:** trust column is NULLABLE (not `NOT NULL`) despite Graham's sketch showing `REAL NOT NULL DEFAULT 0.5`. CL-4 requires {trust: NaN} round-trip. SQLite has no NaN literal; `NOT NULL` coerces NaN to 0.0 at INSERT. Nullable column + JS-layer `NULL ↔ NaN` is the only compliant path. Schema deviation documented in roger-m8-slice-a.md decision drop.

**DB path:** `~/.eureka/eureka.db` per Aaron Q3 approval. `openDatabase` uses `os.homedir()`.

**Cairn DB-layer helper convention confirmed:** constructor takes `db: Database.Database` (caller-injected); `openDatabase` creates and migrates; SqliteFactReader never opens or closes the handle.

**Better-sqlite3 named params:** `Statement.get()` TypeScript types give "expected 1 argument" when passing two positional `?` values even though the runtime accepts them. Use `$name` named parameters and pass an object — single-argument signature, same runtime behavior. Adopted throughout.

**trust_history table:** scaffolded in migration 001 per Aaron Q1 approval; no writes in Slice A. Slice B will add the mutate writes.

**Predicate registration (new L1 ABI):**
- Predicates are **registered by ID**, not passed per-row. Registration returns a handle with explicit lifetime (per Alexander's fork-isolation point: child-fork registrations do not back-propagate to parent).
- Registration **compiles** predicates to native ops where possible, bytecode fallback otherwise.
- Registration **indexes by `primitive_kind`** for O(1) dispatch on non-matching kinds.
- Predicates **may read** the row's resolved read-set entries; **may not call** L2 projections at evaluate time (snapshot projection-version IDs at registration instead).
- SLA envelope: ≤ ~50 compiled predicates per primitive_kind, read-set ≤ 32 entries, stays inside 80µs per row.

**Read-set integration:**
- Bus receives `(row, read_set_view)`; read-set entries are evaluated before bus runs, hash is sealed after.
- Predicates on read-set contents (set/tag/role/cardinality/hash-set) are first-class in v1.
- Transitive read-set queries are **out of scope for the hot-path bus** — materialize as a projection if needed.

**`cairn fsck` extension:**
- For every row with non-NULL verdict witness, the CAS witness blob must resolve and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC, registry drift, and re-registration races.

### What I need from the team to land this:

- **Alexander:** the predicate registration ABI (signatures, handle lifecycle, compile target) is yours to define; I'll implement the L1-side dispatch and the recording. Confirm fork-isolation lifecycle matches your "anything you missed" point #2.
- **Sonny:** US-S-1 match-spec subset has to be expressive enough that "common case" predicates compile to native ops rather than fallback bytecode. Worth a focused conversation on the subset shape before freeze.
- **Stelios:** projection-version IDs must be **stable hashes** that predicates can snapshot at registration time. Restating the US-S-2/US-S-4 ask; this just makes it load-bearing for the bus.
- **Laura:** when L3 generators want bus-enforceable read-set policy (tag predicates, citation requirements), the predicate registration site is L4 startup, not the proposal schema. The proposal schema field stays as-is; policy is a separate registration.
- **Erasmus:** determinism conformance suite needs one more assertion — *re-evaluated hook_verdict on replay must equal recorded hook_verdict*. Same shape as the read-set assertion. Free correctness signal.

None of this changes my round-2 commitments on snapshot cadence, compaction, or CAS spill. It adds two nullable row fields, one CAS blob kind, one ABI for predicate registration, and one new `cairn fsck` check.

The bus is endorsed. The pause path is unified through L4 per US-S-9. The observe path is unified through L2. Pre-commit hook bus is the substrate — and as a side benefit, putting it on the same row that carries the read-set hash makes the substrate genuinely composable rather than three independent mechanisms pretending to cooperate.

If it compiles and fsyncs cleanly, that's a win.

---


## Plain-text summary for the coordinator

**Verdict: ENDORSE with refinements.** The pre-commit hook bus belongs *per-row, inside the group-commit window, before the fsync barrier* — after `causal_read_set_hash` is computed, before the row is sealed. Pause mid-batch is handled by **seal-and-split**: the batch fsyncs through the pausing row inclusive (so already-verdicted rows stay durable), the pausing row's `hook_verdict=pause` is on disk *before* L4 is invoked (crash-safe), and the remainder of the batch returns to staging. The verdict is recorded in the WAL row via two new nullable fields (`hook_verdict: u8?`, `hook_verdict_witness: blake3?`) — costs +1 byte always, +32 bytes only when a non-continue verdict fires; replay re-derives and asserts equality. Predicate cost stays inside my 80µs row-stage budget **only with pre-registration + compilation + kind-indexed dispatch + no L2 callbacks at evaluate time**; this is a hard ABI requirement, not a recommendation. Read-set predicates ("pause if this Decision read any Observation tagged secret") are first-class and arguably the killer feature — the bus is where read-set policy becomes *enforceable* rather than merely *recorded*, which makes the two features properly co-designed rather than coincidentally adjacent.



## 2026-05-24 Round 4: Phase B reconciliation against `D:\git\stunning-adventure`
Full audit inbox: `.squad/decisions/inbox/roger-reconciliation-2026-05-24T2330Z.md`.

**Headline:** Cairn already ships a working append log (SQLite `event_log`), a real 8-state proposal/approval lifecycle (`prescriptions` + `optimization_hints` with 8 statuses each, partial UNIQUE index dedup as built-in backpressure via migration 013), pluggable ProposalGenerators (Forge `promptOptimizer`/`tokenOptimizer` emitting `OptimizationHint`), a Merkle-like hash chain over Decision events (`dbom_artifacts`/`dbom_decisions` + `spike/dbom-generator.ts`), per-skill PGO-style derived rollups (`execution_profiles`), an outcome-learning loop (`change_vectors` Phase 4.6), drift signal substrate (`signal_samples` + `forge/telemetry/drift`), pre-persist secret redaction (`agents/secretScrubber.ts`), and a 5-vector x 3-tier validator surface (`skillLinter`/`skillValidator`) -- so US-R-4 and US-Ro-NEW-4 are essentially ALREADY-EXISTS and US-R-1/2/7/8/9 plus US-Ro-NEW-3 are PARTIALLY-EXISTS. What's pure greenfield: US-R-3 (fork/replay/branch metadata over ledger positions), US-R-5 (transitive provenance -- falls out of R-3), US-R-6 (federation), US-Ro-NEW-1 (snapshot+compaction), US-Ro-NEW-2 (observation capture/CAS), and both round-3 lock items (`causal_read_set_hash` on WAL rows; per-row pre-commit hook bus with 80us envelope). The last two also **CONTRADICT-EXISTING** because Cairn rides `better-sqlite3` (SQLite's built-in WAL journal-mode -- no app-exposed group-commit window, no per-row pre-fsync hook insertion point, no 80us-row-stage budget to honor). Migration path is friendly (linear, integer-versioned, transaction-wrapped, currently at v13): v14 introduces `wal_records` alongside legacy `event_log`, v15 stands up a CAS blob store, v16 snapshots+refs, v17 observation_capture, v18 tenant namespacing -- all additive.

**One load-bearing question for Aaron, not unilaterally resolved:** does Crucible v1 ride Cairn's SQLite store (in which case I re-baseline the round-3 WAL/hook-bus contract to transaction-batched semantics -- bus runs on an app-owned staging buffer before `db.transaction().immediate()`, same logical verdicts and seal-and-split, different physical layer) or stand up a custom storage engine (round-3 verdict stands as-locked, 80us/row envelope is achievable)? Flagging because it changes what `causal_read_set_hash` and `hook_verdict` cost to land. Full per-story classifications, evidence file:line cites, gap list of Cairn capabilities not yet storied, and the v14-v18 migration spec are in the inbox.

-- Roger



## 2026-05-25 Round 5: SPIKE fork (a) — port Cairn to a custom storage engine
Full spike inbox: .squad/decisions/inbox/roger-spike-fork-a-port-2026-05-25T0030Z.md.

**Executive summary.** Surveyed the existing Cairn SQLite surface (87 src files, 31 in db/, 13 linear migrations, 16 tables, 188 prepared/transaction call sites, 80 join/groupby query sites, 478-ish tests, one load-bearing partial UNIQUE index for backpressure, zero use of FTS/virtual-tables/triggers/UDFs/triggers — relational but shallow) and three engine candidates: A.1 pure-Rust redb via NAPI-RS (12-16 weeks, ~100% SQL-ergonomics loss, strongest correctness story, adds a Rust toolchain to a Node monorepo), A.2 Kris Zyp's lmdb Node binding with its beforeCommit hook (8-12 weeks, ~100% SQL loss, 80us-budget at risk under JS dispatch), and A.3 hybrid — custom append-only WAL file in pure TS for L1 only, keep better-sqlite3 for the other 15 tables and all derived views (5-9 weeks, ~5-10% SQL loss, forward-compatible migration). **Verdict: REJECT A.1, ENDORSE-WITH-CAVEATS A.3, A.2 only as fallback if the JS predicate budget fails in integration.** Phase A's hard contracts bind only L1; rewriting the other six tiers to honor a contract that does not bind them is over-correction. Anti-anchoring alternative reading: if Crucible is heading toward regulatory determinism, 10^9+ rows, or WASM-runtime distribution, A.1's "one substrate, contracts enforced by construction" wins despite the cost — I'd flip if any of those three become true. Tagged Alexander (fork (b) is a contract-amendment, not a contract-honor — sqlite3_update_hook fires post-write not pre-fsync) and Gabriel (fork (c) breaks causal_read_set_hash globality the moment you shard across multiple SQLite files — contract (4) needs amendment).

-- Roger



## Learnings (2026-05-28 — CTD Phase 1 Lane 1: §3 L1 WAL + §4 Hook Bus authored)

WAL design patterns and invariant-enforcement mechanisms locked in §3 + §4 that
I'll want when authoring §10 (Session Model) and §15 (Compaction/Snapshots) in
Phase 2:

- **One fsync per group-commit, CAS-before-WAL ordering.** The rule that lets
  the WAL row safely reference a `payloadHash`/`readSetHash`/
  `hookVerdictWitness`/`contextWindowCommitment` is that the CAS body is
  fsync'd *before* the WAL record is written. §15 compaction must preserve
  this ordering on snapshot-spill: snapshot blob durable in CAS before the
  snapshot pointer row lands in the WAL.

- **Self-audit by chain alone.** `prevRoot[i] = selfRoot[i-1]` plus per-row
  `selfRoot = BLAKE3(CBOR(row \ selfRoot))` plus a per-session
  `manifest.lastSelfRoot` makes `cairn fsck` a single linear scan with O(1)
  state. `index.idx` is advisory and rebuildable; never trust it for
  correctness, only for seek-speed. Carry this same discipline into §15 —
  snapshots are advisory acceleration, never authoritative.

- **Hybrid resolver as a named seam.** `ContextWindowResolver` honoring R2-1
  is a tiny pure function but giving it a name (instead of inlining the
  if-declared-else-prefix branch into `AppendProtocol.append`) makes the
  Bootstrap-Capture-Completeness violation path testable in isolation and
  keeps replay's reconstruction code symmetric with commit's hash code.
  Pattern: every "tagged hybrid" gets its own resolver seam, never inlined.

- **Verdicts as null vs continue.** `hookVerdict: HookVerdict | null` with
  `null` meaning "no predicate matched" and `continue` meaning "a predicate
  fired and said continue" is the cheapest way to preserve P5 (continue
  zero-cost) while keeping the closed-enum invariant (P3) honest. The
  binary layout encodes both as zero-witness; the bookkeeping distinguishes
  them only for replay determinism. §10 should not invent a third sentinel
  — null is the absence sentinel.

- **Exactly-once-pause via WAL-first durability.** Pause verdict durable on
  the WAL row *before* L1Subscriber broadcasts to the Router means a crash
  between seal and broadcast replays the broadcast from disk on next boot.
  The bus has no separate Router channel; the broadcast on the paused row
  *is* the Router's pause inbound. §10's session-reopen protocol must
  re-broadcast pending pause rows whose Router-ack Observation is missing.

- **Bootstrap atomicity = single group-commit.** §3.8 bootstrap-batch writes
  the entire `BootstrapPayload` as one atomic group-commit at offset 0. §10
  must never spread session bootstrap across multiple `append()` calls —


## Learnings (Slice D persona-review polish — 2026-06-06)

**JSDoc type positions should name types, not values.** When doc prose describes a return shape, use the declared type name (`ClockProvider`) not the module-private value (`systemClock`). Readers scan the JSDoc expecting types, not implementation identifiers.

**Tighten doc titles to the declared return type; call out structural compatibility separately.** A JSDoc title that says "ApplyFeedbackDeps / ApplyFeedbackByIdDeps" overpromises when the return type is `ApplyFeedbackDeps`. The correct pattern: title names the declared type, a one-liner notes structural satisfaction of related types. Keeps the contract honest without losing useful information.

**Reject exporting trivial private values when the public surface cost > benefit.** `systemClock` is `{ now: () => Date.now() }` — no unique behavior. Callers needing a custom clock supply their own `ClockProvider`. Exporting it for "observability" just anchors external code to an internal detail. The right call: reject.

**Reject guard clauses on stated preconditions unless the error UX materially improves.** The JSDoc already says `openDatabase()` is required. A runtime check adds complexity without meaningfully improving the failure signal (SQLite itself reports missing tables clearly). Over-engineering stated preconditions is noise.
  the all-or-nothing property is what lets replay refuse to advance past
  offset 0 on bootstrap-manifest mismatch (TDD §6.8).

- **Fork = sibling directory + synthetic offset-0 row + cross-session chain
  edge.** No CAS body copy; CAS dedup is implicit by hash. `cairn fsck
  --with-parent` is the cross-edge walker. §10's fork API surface should
  expose these as three orthogonal capabilities (create dir, emit
  fork_origin Observation, link prevRoot) rather than one opaque
  `fork(parent, offset)` call — composability over economy.

- **Monotonic timestamps are advisory; offsets are structural.** Replay
  equality excludes `timestampNs` via `normalizeTimestamps()`; the `+1`
  floor absorbs wall-clock regressions; violations are recorded as
  Observation rows, never suppressed. Any future invariant I add in §10/§15
  should follow the same pattern: distinguish advisory metadata (excluded
  from replay equality, recorded as observable rows on violation) from
  structural data (byte-compared in replay).

- **Seam map as deliverable.** §3.14's table mapping internals to test tier
  + Laura collaborator + test double class is the load-bearing artifact for
  London-school component testing. I'll replicate this in §10 and §15 —
  every public collaborator gets a row, every internal pure function gets a
  row, every file-backed integration gets a row.

- **Per-tool-call primitive scale is intra-batch.** §3.6 enforces "one
  primitive per (toolCallId, phase)" within a batch only; cross-batch
  pairing of `invoke` → closing Artifact is Aperture's job, not L1's. §10
  session-config carries the pairing-window deadline so different session
  types (debug, prod, replay) can tune it.
📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe


## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.


## 2026-05-30: Pass A CLI Edits — §13.1 verb registration + §9.9 coordination

**Context:** Picked up two owed Pass A triage items after session silence. Aaron requested CLI documentation edits: (1) register crucible perf [top] [--json] in §13.1 verb table, (2) coordinate crucible defer --help text with Valanice's parallel §9.9 edit.

**Decision 1: crucible perf Registration**
- **Choice:** Added as standalone verb (like status, fsck), NOT as saved query
- **Rationale:** §17 explicitly documents [top] sub-variant (dispatch-latency sort) which is verb-specific, not query-driven. Consistency with diagnostic-verb family. Verb placement: between status and config in §13.1
- **Placement:** §13.1 line 44 (new row between diagnostic verbs and config)

**Decision 2: defer Help Text Coordination**
- **Original:** "Local snooze; no L1 write (§9.9)."
- **Updated:** "Local snooze; no L1 write. Re-renders entry with \deferred\ annotation."
- **Rationale:** Embedded Valanice's expected substring from §9.9 line 318 ("no L1 write; re-renders entry with deferred annotation"). Removes redundant cross-ref; text is now self-contained for CLI --help stability.
- **Coordination:** Valanice now has locked help text to reference in §9.9 edits; no ping-pong on text consistency.

**Files modified:** docs/crucible-technical-design/13-crucible-cli-shell.md (§13.1 two rows edited)

### Learnings

**`createRequire` is the correct ESM pattern for optional CJS native addons.** With `type: "module"` in package.json, static `import` of an optional module fails at load time with no opportunity to provide a better error message. `createRequire(import.meta.url)` + try/catch inside the consuming function gives clean degraded-mode semantics: the module loads fine without the addon; only `openDatabase()` callers pay for the dependency. `import type` keeps full TypeScript typing without the runtime binding.

**Subpath exports + optionalDependencies is the right isolation boundary for native addons.** Moving `better-sqlite3` to `optionalDependencies` and gating it behind `./sqlite` subpath means in-memory consumers see zero native-module cost. The core `@akubly/eureka` surface stays portable. This pattern will recur anywhere native addons are "heavy but optional" (e.g., a hypothetical `./leveldb` subpath for production key-value tier in Slice D).

**BEGIN IMMEDIATE is the migration race fix, not IF NOT EXISTS alone.** `IF NOT EXISTS` is defense-in-depth for crash recovery (partially-applied DDL); it does not serialize two simultaneous first-opens. IMMEDIATE lock ensures only one process applies migrations; the other reads `schema_version = 1` and skips cleanly. The two mechanisms solve different failure modes and should both be present.
**Documentation ownership boundary:** CLI descriptions should be stable w.r.t. what the CLI actually does. If a section's description references the CLI, treat the CLI text as the authoritative surface and work backward to the design doc, not the other way around. §17 references crucible perf; the CLI text in §13.1 is now the contract both §17 and the binary promise to fulfill.
# Roger — History

**Harness cleanup belongs in the contract helper, not implementation-specific blocks.** Making `cleanup?: () => void` optional on `FactReaderHarness` keeps the InMemoryFactReader harness backward-compatible (no native handles to close) while ensuring all native-backed implementations can register teardown. The `afterEach(() => harness?.cleanup?.())` pattern in `runFactReaderContract` guarantees cleanup fires even if a test throws. Pattern applies to any future harness that wraps a native resource (file, socket, worker thread).
- 2026-06-05 📌 M3: Forge prescriber wired to HintDispositionProvider seam for disposition consumption (dismissed→suppress, resolved→boost). See .squad/decisions/inbox/graham-forge-m3-disposition-consumer.md.
- 2026-06-06 📌 M3: HintDispositionProvider seam finalized on squad/42-forge-m3-disposition (3 commits, 1563 tests green, READY TO SHIP). Disposition vocabulary shared via hintStateTransitionConstants.ts; constants flow: emit → payload → SQL. Seam interface locked, no breaking changes pending.

---


## Archive Summary

Earlier entries (966 lines) archived to history-archive.md on 2026-06-05.

---

### Shared serializer pattern (N3)

For tool families with a list (summary) + get (full) shape, extract a private `buildXxxSummary()` helper in server.ts. The get builder spreads summary and adds full-detail fields. Location: private (non-exported) function above the exported builder pair in server.ts. This prevents list/get field drift. Document intentional omissions (e.g., raw confidence float) with a one-line JSDoc on the summary helper.


## Learnings (2026-05-31 — M1 Cycle-1 Findings: Issue #39)

### Schema co-evolution: two migrations in one PR (017 + 018)

Adding migration 018 to the same PR as 017 was fine — the runner is purely sequential, both migrations are guarded against missing tables, and each is idempotent. The only cost was updating the "MAX(version)" assertions in 4 test files a second time. If the two columns had been logically coupled from the start I'd prefer one migration, but when review feedback drives the change, a second migration is the right call — it keeps the migration history honest (017 = what shipped, 018 = what review demanded) and makes rollback surgical.

### Handler-layer testability pattern (extracted pure functions)

The cleanest approach: extract each handler body into an exported pure function that takes `db: Database.Database` + params and returns the raw JSON payload object. The MCP handler wraps the result in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Tests import the pure function directly from `server.ts` (safe because the `if (isScript)` guard prevents the MCP server from starting on import). Benefits:
- Tests operate on plain objects, not MCP content wrappers
- No MCP harness needed
- Functions are also useful in non-MCP contexts (e.g., CLI tools, tests in other packages)
Pattern: `buildListHintsResult(db, params)`, `buildResolveHintResult(db, params)`, `buildGetHintResult(db, params)`.

### Persona finding initially disagreed with, then came around

**F6 (active_count misleading when status filter present):** My first reaction was "the consumer knows what status they asked for, active_count is just extra info." But after implementing it I understood the Craft persona's point: if you ask for `status=rejected` and get `active_count: 0`, an LLM consumer might interpret that as "nothing is active" when really active hints exist — they just weren't in scope. Omitting the field when it can only be misleading is the cleaner contract. The comment in the code documents this intent for the next engineer.

**F11 (event payload missing resolution intent):** Also came around on this. The initial emit recorded `from_state → rejected` which is sufficient for lifecycle tracking. But Aaron's stated dogfood loop requires forge to distinguish user-dismissed hints from system-expired ones. Without `source: 'mcp'` + `resolution_disposition` in the event, forge can't learn from Copilot's disposition signal. The fix was low-cost; the signal is high-value.


## Learnings (2026-05-31 — Issue #39 M1: Hint Consumption MCP Tools)

### Partial-schema test DB gotcha with ALTER TABLE migrations
- Tests like `migration015.test.ts` and `worktreeSessions.test.ts` create a bare SQLite DB with `schema_version` seeded at a specific version (e.g., 14 or 15) then call `applyMigrations()`. They only include the tables they need (e.g., `sessions`). If your new migration uses `ALTER TABLE <table>` and that table was created by an earlier migration (that was skipped), it will fail with "no such table: X".
- Fix pattern: guard the migration with a `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='my_table'` check. Return early if table doesn't exist. Also add an idempotency guard with `PRAGMA table_info(my_table)` to check if the column already exists before `ALTER TABLE`.

### cairn MCP tool registration pattern
- All cairn tools live in `packages/cairn/src/mcp/server.ts` via `server.registerTool(name, schema, handler)`.
- Follow the exact pattern: `{ title, description, inputSchema: { ... zod fields }, annotations: { readOnlyHint } }`.
- Handlers always call `ensureDb()` first, wrap everything in try/catch, return `{ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }`.
- Error path: `return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true }`.
- `confidenceToWords()` is already exported from server.ts for high/medium/emerging labels.
- For read-only tools: `annotations: { readOnlyHint: true }`. For mutating tools: `annotations: { readOnlyHint: false }`.

### Never use `git add .` after manual file work
Never use `git add .` after manual file work — explicit per-file staging avoids sweeping untracked artifacts into commits.

### Idempotent resolution with status machine
- `optimization_hints` has a strict state machine (STATUS_TRANSITIONS). User-facing "resolve" actions should use `force: true` semantics or bypass the machine directly via SQL UPDATE.
- Terminal statuses: `applied, rejected, expired, suppressed, failed`. Check these before transitioning so the resolve tool can be idempotent.
- Both "resolved" and "dismissed" user dispositions map to `rejected` status — the distinction is preserved in `resolution_note` and the returned `resolution` field.


## Learnings (2026-05-27 — Issue #11 WI-A: workdir-aware sessions)

### Migration wire-up pattern
- Import the new migration in `schema.ts` alongside previous ones; append to the `migrations` array. The runner applies them in order using `MAX(version)`. No other file needs touching.
- Any pre-existing test that asserts `MAX(version) = N` or `COUNT(*) from schema_version = N` will break when a new migration lands — update those assertions (they're "track the latest version" tests, not migration-specific tests).
- Partial index on an active-status predicate (`WHERE status = 'active'`) is the right pattern for session lookup indexes — keeps the index small and covers the hot query path.

### NULL-IS query semantics for workdir
- SQLite's `IS` operator handles NULL comparison correctly: `col IS NULL` matches NULLs; `col IS 'value'` matches the literal. Use `IS` (not `=`) in WHERE clauses that need to match NULL as a distinct identity value.
- In better-sqlite3, `stmt.get(repoKey, null)` passes SQL NULL correctly — no need for IS NULL string injection.
- Keep two separate inner helpers: one without a workdir filter (for MCP fallback that needs any session) and one that always applies `workdir IS ?` (for worktree-scoped lookups). Don't try to collapse them into one with a conditional clause when the semantics diverge.

### `getActiveSession` backcompat semantic (reconciled with Laura)
- When `workdir` is omitted: NO workdir filter — returns most recent active session regardless of workdir. This is the correct backcompat path because old callers expect to find the session they created (which may have had a workdir set by new code).
- When `workdir` is provided: `AND workdir IS ?` — exact worktree match. String value matches that workdir; `null` passed explicitly matches NULL rows.
- The spec said "fall back to `WHERE repo_key = ?`" — that means truly no filter, not "filter for NULL." The "preserve backcompat" language refers to old callers still working, not to NULL-only matching.

### Concurrent test authorship — live file changes
- Laura's test file (`worktreeSessions.test.ts`) was written concurrently in the same worktree. I read one version, implemented to its expectations, then the file changed before I re-ran tests. The failing test name changed between runs — that's a signal the file was updated, not that my implementation broke.
- When a test file changes mid-flight, re-read it before diagnosing a "new" failure. Don't chase the old test contract.

### New API threading pattern for optional context params
- When adding an optional context param (like `workdir`) to a function with multiple optional callback params after it (like `afterCurate`), add the new param as the LAST optional so existing callers don't break by positional shift. Exception: if the new param is semantically earlier, introduce an options object instead.
- In archivist.ts, `getDb()` at the agent level is fine — the DB injection rule applies to `packages/cairn/src/db/*.ts` helpers, not to agent-level orchestration code.



## Session: 2026-05-28 Wave 6 Tail — WI-A Implementation Complete

**Status:** Complete

- Implemented migration 015 (workdir column + partial index)
- Updated DB API: createSession, getActiveSession, listActiveSessionsForRepo
- New export: getWorkdir() for git integration
- Threaded workdir through archivist, sessionStart, postToolUse, types
- MCP breaking change: get_status flat array, get_session identity lookup
- Semantic correction applied (turn 2): getActiveSession no-arg → \AND workdir IS NULL\
- Validation: Build clean, 647/647 tests passing

**Commits:** 2613c78 + ea9ab58

**Decision files:** roger-issue-11-implementation.md + roger-issue-11-api.md → merged to decisions.md

**Next:** Branch ready for merge. WI-B (Gabriel) queued.


### 2026-05-02: Phase 4.5 Telemetry Learnings & Persona Review Fixes

**Event:** Telemetry module hardening post-persona review.

**Key fixes:**
- F1: Weighted mean aggregation (prevent overwrite of prior history)
- F2: Convergence floor (fire on first success signal, not end-of-session)
- F4: Event contract alignment (COLLECTOR_BRIDGE_EVENTS constant + contract test)
- F5: Streaming percentile sketch (100-bucket histogram for [0,1] drift range)
- F6a: Per-signal component means on ExecutionProfile.signals
- F7: Silent error logging in sink
- F11: typeof guards on payloads (toolName string, numeric guards)

**Architecture patterns learned:**
- Shared symbol enums for cross-module contracts (bridge ↔ collectors)
- Streaming quantile sketches for bounded metrics
- weightedMean() helper prevents deflation-toward-zero failure mode
- Fail-open principle: telemetry must never block session execution

**Files touched:** 7 core files + 3 test files. Tests: +24 new. Build: 1012 passing (cairn 478 + forge 534).

**Key lesson:** When collector contract spans modules, enumerate shared symbols + enforce via contract test. Type-level coupling insufficient for JSON boundaries.


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.


## Session: 2026-06-01 — Crucible Sprint 0 First GREEN

**Status:** Complete

### What was done
- Scaffolded `packages/crucible-core/` (package.json, tsconfig.json, README.md, vitest.config.ts)
- Implemented 6-stub public surface: `PrimitiveKind`, `PrimitiveInput`, `Primitive`, `SessionMetadata`, `Session`, `createSession`, `fork`
- Wired `packages/crucible-cli/src/index.ts` to re-export `createSession`/`fork` from `@akubly/crucible-core`
- Updated crucible-cli package.json, tsconfig.json, and root tsconfig.json references
- All 4 A1 invariants GREEN in Laura's acceptance test

### Learnings

#### GREEN-phase pattern: simplest real impl behind the acceptance API
When an acceptance test directly calls `createSession`/`fork` (no injected collaborators), the GREEN step is a real in-memory implementation — not a mock. London-school descent (introduce Ledger mock) happens in the next RED cycle. Don't jump to abstractions in GREEN.

#### query() range convention: inclusive-inclusive [a, b]
`query({ range: [a, b] })` returns b − a + 1 primitives when all offsets are present. Derived from the test: `query({ range: [0, 46] }) → length 47`. Document this as a comment in the implementation; it's easy to misread as exclusive-end.

#### In-memory parent-registry approach for fork
Module-level `Map<sessionId, Primitive[]>` holds each session's **own events only**. Child sessions store zero events at fork time; their `query` for offsets ≤ `forkPointEventId` delegates to the parent's registry entry. No physical copy is made. Parent remains unmodified. This satisfies the A1 "parent unmodified" invariant with minimal code.

Child offset assignment:
```ts
const baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1;
const offset = baseOffset + ownEvents.length;
```
This works for both root sessions (null → base 0) and child sessions (fork at N → base N+1).

#### Deferred: Ledger abstraction
No Ledger class, WAL interface, or Cairn integration introduced. That is the REFACTOR step of the next TDD cycle. Keeping GREEN minimal is discipline, not laziness.



## Session: 2026-06-01 — Crucible Sprint 0 REFACTOR Phase

**Status:** Complete

### What was done
- Extracted ForkLineage value object at packages/crucible-core/src/ledger/fork-lineage.ts
- Introduced DB interface (db.ts) and SessionManager class (session-manager.ts)
- Created createInMemoryDB() adapter (in-memory-db.ts) wrapping the old registry
- Refactored session.ts to compose against singleton InMemoryDB + SessionManager
- Updated barrel index.ts to export all new public surface
- Decision inbox: roger-crucible-refactor-session-manager.md
- Skill: london-tdd-refactor-extract-collaborator/SKILL.md written

### Test results
- crucible-core unit (4/4 GREEN): rejects fork-beyond-size, rejects negative offset, inherits transitive dep graph, records lineage
- crucible-cli acceptance (1/1 GREEN): no regression
- Full monorepo build: exit 0


## Learnings

### REFACTOR pattern: extract value object + collaborator interface + adapter

When the GREEN step has a flat module with module-level state, REFACTOR follows this sequence:
1. **Value object**: extract the invariant holder as a class (ForkLineage). Pure data + validation, no I/O.
2. **Collaborator interface**: define the narrowest possible DB interface — exactly the methods the new class needs. This is the seam the unit tests mock.
3. **Service class**: create the collaborator-using class (SessionManager) that accepts DB in its constructor. All invariant checks live here.
4. **Adapter**: implement the interface against existing in-memory state (createInMemoryDB). Internal helpers (not in the DB interface) are exposed via an extended InMemoryDB interface used only by the composition layer.
5. **Wire**: update the public-facing module-level functions to compose new pieces without changing signatures.

### DB interface contract (locked for unit test compatibility)

```ts
export interface DB {
  getSession(id: string): Promise<{ id: string; ledgerSize: number; pluginVersions?: Record<string, string> } | null>;
  insertSession(session: { id: string; parentSessionId: string | null; forkPointEventId: number | null; pluginVersions?: Record<string, string>; createdAt: number }): Promise<void>;
  queryEvents(id: string, opts: { range: [number, number] }): Promise<unknown[]>;
}
```
This shape is locked because Laura's unit test mocks mirror it exactly. Any shape change here requires updating session-manager.test.ts in tandem.

### In-memory adapter: extend DB for internal helpers

The DB interface is the minimal mock contract. The real adapter needs extra methods (insertRootSession, pushEvent, getOwnEvents, getMetadata) that the service class should not see. Pattern: define InMemoryDB extends DB in in-memory-db.ts, return it from createInMemoryDB(). Import InMemoryDB in session.ts for the singleton; import only DB in SessionManager. Clean separation.

### ledgerSize computation for in-memory adapter

- Root session: ownEvents.length
- Child session: forkPointEventId + 1 + ownEvents.length

This mirrors the offset assignment in buildSession: baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1.

### ForkLineage.parentSessionId: string | null (not just string)

The strategy doc snippet declared parentSessionId: string, but root() needs to pass null. Accept string | null. Document with a comment in the file. This is a common pattern: the strategy snippet covers the happy-path shape; the sentinel case reveals the fuller type.


## Learnings (2026-06-02 — Crucible Sprint 0 Cycle 1 fixes)

**M3 decision — keep range:[a,b] tuple (Option B):**
Chose Option B (JSDoc reinforcement) over Option A (rename to named-field API). The rename would cascade to the acceptance test and session.ts query internals with no Sprint 0 correctness benefit. The tuple is already documented as inclusive-inclusive; adding explicit startOffset/endOffset position labelling in the JSDoc and a deferred-to-future-sprint note is enough signal for consumers. Key rule: don't burn API-churn budget in Cycle 1 on ergonomics when the semantics are already correct and documented.

**I1 reset hook pattern — clear() on the InMemoryDB interface:**
Test isolation for a module-level singleton requires a seam that test code can reach without constructing a private DB. The right pattern: add clear() to the interface (not a backdoor cast), implement as store.clear() on the factory closure, and export a thin resetInMemoryDb() wrapper from the module that calls db.clear(). The function name is fixed by the Laura contract — name it exactly right the first time. This pattern scales: any future DB adapter (SQLite) will implement clear() as a DELETE FROM ... sweep, keeping the test seam consistent.

**I3 silent-drop fix rationale:**
The optional-chain pattern store.get(id)?.ownEvents.push(event) is a silent data-loss footgun: a missing session produces no error and no diagnostic. The rule is: **throw at the storage boundary, not at the consumer**. The caller (session.ts append) can only make forward progress if the push succeeded; letting it silently no-op would corrupt the offset sequence without any observable signal until a later query returned wrong data. Explicit guard + throw surfaces the bug at the earliest possible point.

- 2026-06-05 ✅ persona-review-cycle 2 complete: Crucible Sprint 0 Walkthrough A ready to ship (Cycle 1: 11 findings, 10 fixed; Cycle 2: 3 advisory, 2 fixed, 1 deferred)
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---


## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.

### Learnings

**`createRequire` is the correct ESM pattern for optional CJS native addons.** With `type: "module"` in package.json, static `import` of an optional module fails at load time with no opportunity to provide a better error message. `createRequire(import.meta.url)` + try/catch inside the consuming function gives clean degraded-mode semantics: the module loads fine without the addon; only `openDatabase()` callers pay for the dependency. `import type` keeps full TypeScript typing without the runtime binding.

**Subpath exports + optionalDependencies is the right isolation boundary for native addons.** Moving `better-sqlite3` to `optionalDependencies` and gating it behind `./sqlite` subpath means in-memory consumers see zero native-module cost. The core `@akubly/eureka` surface stays portable. This pattern will recur anywhere native addons are "heavy but optional" (e.g., a hypothetical `./leveldb` subpath for production key-value tier in Slice D).

**BEGIN IMMEDIATE is the migration race fix, not IF NOT EXISTS alone.** `IF NOT EXISTS` is defense-in-depth for crash recovery (partially-applied DDL); it does not serialize two simultaneous first-opens. IMMEDIATE lock ensures only one process applies migrations; the other reads `schema_version = 1` and skips cleanly. The two mechanisms solve different failure modes and should both be present.

**Harness cleanup belongs in the contract helper, not implementation-specific blocks.** Making `cleanup?: () => void` optional on `FactReaderHarness` keeps the InMemoryFactReader harness backward-compatible (no native handles to close) while ensuring all native-backed implementations can register teardown. The `afterEach(() => harness?.cleanup?.())` pattern in `runFactReaderContract` guarantees cleanup fires even if a test throws. Pattern applies to any future harness that wraps a native resource (file, socket, worker thread).


## 2026-06-05: PR #45 Copilot Review — Comment Accuracy + Docs Fixes

**Context:** Copilot's cloud review on PR #45 flagged doc/comment accuracy issues in crucible-core and crucible-cli. All five fixes are comment/doc-only — no logic changes.

### Learnings

**RED-phase scaffolding comments are review debt that must be cleared when impl lands.** When TDD RED-phase tests go GREEN, header comments saying "MUST FAIL" / "does not exist yet" become false documentation. Pattern: update test-file headers at the same commit that ships the implementation, or log a doc-cleanup follow-up. Leaving RED-phase framing in a GREEN test misleads reviewers and tools.

**Package READMEs are two levels below the repo root.** Packages live at packages/<name>/, so packages/<name>/README.md is two directory levels deep. A relative path to docs/ at the repo root must use ../../docs/, not ../docs/ (which resolves to the non-existent packages/docs/). Rule: when writing relative links from a package README, the root is always ../../.


## 2026-06-05: PR #45 Copilot Review Cycle 2 — Control-Char Full-File Sweep + README Accuracy

**Context:** Cycle 2 review flagged a bare-CR artifact in the line-726 region of history.md plus an inaccurate crucible-cli README. Fixed four control-char artifacts total (bare CR on lines 726 and 1071, ESC on line 1068, BEL on line 1074) and rewrote crucible-cli/README.md to describe the package as the Sprint 0 acceptance-test facade.

### Learnings

**When cleaning control-character artifacts, sweep the WHOLE file, not just the flagged region.** Reviewers sample; a spot fix that only patches the cited lines leaves other artifacts alive. After any control-char remediation, run a full-file scan (e.g., byte-level check for bytes <0x20 excluding tab/LF/CRLF) before committing, so the issue does not resurface in the next review cycle.
**BEGIN IMMEDIATE serializes within a single connection; JS event-loop serializes across async calls from the same connection.** For a synchronous library like better-sqlite3, Promise.all() in the same process doesn't create true concurrency — each mutate() call runs to completion before the JS engine yields. The transaction wrapper enforces that READ + fn + WRITE happen atomically within one mutate() call; it plays no role in ordering ACROSS calls from the same JS thread. BEGIN IMMEDIATE matters only when two separate Database handles (different connections, possibly different processes) compete for the write lock. Getting this distinction wrong in comments misleads future readers about WHERE the safety boundary is.


## Learnings (2026-06-05 — M8 Slice C: SqliteFactStore + FTS5 BM25)

**Branch:** `eureka/m8-slice-c-factstore`

**BM25 sign convention is the primary footgun.** `bm25(facts_fts)` returns NEGATIVE values where more-negative = better match. Using it directly in ASC ORDER BY sorts best matches LAST. The fix is `ORDER BY (-bm25(facts_fts)) * trust DESC`. The FS-4 contract test (higher-frequency term fact ranks first) is the regression lock. Every SQLite FTS5 implementation must own this pattern or it will silently break ordering on first write.

**Per-page min-max normalization is the right call for v1.** Normalizing `relevance` to [0,1] via min-max across the result page is simple and correct for single-page recall (RANKER_OVERFETCH_FACTOR × k). Cross-page normalization (where page-1 and page-2 relevances are comparable) requires two queries or a separate max-score fetch — deferred until cross-session pagination needs it. Document the choice so the next person doesn't re-derive it.

**Interface reconciliation (wrapped return) is a mechanical but real change to merged code.** The `recall.ts` change from `Promise<RecallResult[]>` to `Promise<{ results: RecallResult[]; nextCursor? }>` required updating 10 mock sites in `recall.test.ts`. Each was `mockResolvedValue([...])` → `mockResolvedValue({ results: [...] })`. The pattern is mechanical but if you miss one the test will FAIL — destructuring `{ results }` from a bare array returns `undefined`, and the first downstream use of `results` (like `results.filter(...)`) throws a noisy TypeError rather than a clean assertion failure. That TypeError will be confusing to diagnose because it points at the consumer, not the stale mock. Grep for `mockResolvedValue` in the test file before declaring done — it catches all stale mocks in one pass.

**Offset cursors are pragmatic for v1 FTS5 pagination.** Rowid+rank keyset cursors require stable rank values — BM25 floats are session-stable but not write-stable. For v1 single-page recall, offset is deterministic. Encode as base64 JSON `{ offset }` so the format can be extended (add `sessionId`, `queryHash`, etc.) without a breaking cursor change. Document the choice; the next person will want to understand why you didn't use a keyset cursor.

**Schema gaps (attentionTier, importance, lastAccessed) default gracefully.** None of these fields are in the `facts` table yet. `attentionTier='warm'` (identity multiplier 1.0), `importance` omitted (FR-2 uses 0), `lastAccessed` omitted (recency floor 0.1). The composite scorer still runs — results are just conservative. A future migration `002-fact-fields.ts` can add the columns without breaking Slice C's implementation (it SELECTs only content, trust, bm25_score).

**The `*.contract.helper.ts` naming + non-`.test.ts` rule extends naturally to FS.** `fact-store-contract.helper.ts` follows the exact same pattern as `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts`. The wiring test in `fact-store.contract.test.ts` imports from the helper. Vitest ignores the helper file (not `.test.ts`). The pattern is now consistent across all three storage seams.


## Learnings (2026-06-05 — M8 Slice C follow-ups FSE-1 + FSE-4)

**Branch:** `eureka/m8-slice-c-factstore` (follow-up commits on same branch, PR #48)

**FTS5 error messages don't always contain "fts5".** The intuitive narrowing check `/fts5/i.test(err.message)` fails for `"unterminated string"` (unclosed quote) and other tokenizer-level errors. SQLite's FTS5 query parser errors all carry `code === 'SQLITE_ERROR'` (numeric 1). Non-parse errors use distinct codes: SQLITE_CORRUPT=11, SQLITE_IOERR=10, SQLITE_BUSY=5. Narrowing on code alone is the correct approach for this call site because we're inside a method that ONLY runs FTS5 queries — a false SQLITE_ERROR from a non-FTS cause would require schema corruption or an impossible misuse of the prepared statement. Don't over-narrow on message text for FTS5 errors; narrow on the error code instead.

**[Correction 2026-06-05]:** The shipped FSE-1 catch narrows on `code === 'SQLITE_ERROR'` AND a message regex `/fts5|unterminated|syntax error|malformed MATCH/i`, rethrowing non-FTS SQLITE_ERROR (missing-table/schema). Code-only narrowing would over-swallow missing-table errors (e.g., `"no such table: facts_fts"`) which are also `SQLITE_ERROR`. The message pattern distinguishes FTS5 parse errors from missing-table errors, preventing silent corruption of the schema-error signal.

**Laura's edge test locking the broken behavior (FS-SE-11) is the right pattern.** She wrote the test asserting the rejected Promise BEFORE the fix, which made the finding machine-verifiable. Updating the test to the new contract (resolves to `{ results: [] }`) makes the fix machine-verifiable too. This is the correct audit → fix → relock cycle. The `[FINDING FSE-1]` annotation in the old test title is a useful trail even after the fix; the new title says `(FSE-1 fix)` so the arc is traceable.

**Per-page relevance normalization needs documentation at two levels.** The JSDoc on `RecallResult.relevance` (the field) AND on `FactStore.search` (the return type) should both call out that relevance is per-page only. Documenting it only at one level leaves the other as a trap for future consumers who read the type definition but miss the field comment (or vice versa). Both are load-bearing: consumers of the interface read the return type; consumers of results read the field.


## Learnings (2026-06-05 — M8 Slice C code-panel F1–F7 findings)

**Branch:** `eureka/m8-slice-c-factstore` (F1–F7 fixes on same branch, PR #48)

**F1: relevance ≠ sort order is a design, not a defect.** The `compositeScore` consumer weights relevance, trust, importance, and recency as four independent orthogonal signals (each with its own coefficient). Baking trust into `relevance` via composite normalization (`-bm25 × trust`) would double-count trust — it already has a 0.20 weight in the scorer. So: `relevance` = pure `-bm25` normalized; ORDER = composite. When trust varies, a high-trust/low-BM25 fact can sort first while carrying lower relevance. FS-SE-1b is the regression lock for this design. The FS-4 equal-trust lock is still valuable because it verifies the BM25 footgun (negation) under controlled conditions.

**Narrow FTS5 catch with message pattern in addition to error code.** After consulting actual SQLite error messages for missing tables vs FTS5 parse errors: a dropped `facts_fts` table produces a `SQLITE_ERROR` with message `"no such table: facts_fts"` — it does NOT match the FTS5 parse pattern. This is good news for the narrowing: `code === 'SQLITE_ERROR' && /fts5|unterminated|syntax error|malformed MATCH/i` correctly lets the missing-table error propagate. The earlier code-only check (no message filter) was too broad — it would have swallowed the missing-table error. Always verify the message against real SQLite output before deciding on pattern breadth.

**F3 tie-breaker: `f.id ASC` is cheap and correct.** `f.id` is autoincrement INTEGER PRIMARY KEY — guaranteed unique and monotonically increasing (insertion order within a session). Adding `f.id ASC` as secondary sort on the `ORDER BY` clause costs nothing at query time (BTree INTEGER PK) and makes OFFSET pagination deterministic across tied composite scores. The InMemory reference impl should mirror this with `a.factId.localeCompare(b.factId)` since factIds are insertion-order strings in the harness.

**[Correction 2026-06-05]:** The shipped InMemory implementation uses an explicit `insertionOrder` counter (incremented on each `seed()` call) to tie-break results, which correctly mirrors SQLite's AUTOINCREMENT id semantics. `localeCompare` on factId would produce different insertion-order ties when factIds are inserted in non-alphabetical order, so it was not used in the final implementation. See FS-7 test design: seeded `tie-c`, `tie-a`, `tie-b` in non-lexicographic order to distinguish the two approaches.

**F4 limit validation prevents infinite pagination loops.** `limit=0` produces OFFSET 0, LIMIT 0, returns 0 results, `nextCursor` defined, next call produces the same state — infinite loop for any consumer that auto-paginates. `limit=-1` makes SQLite treat it as unlimited (implementation quirk). Both are bugs, not edge cases. `TypeError` is the right signal because `limit` is a misuse of the API contract, not a data error. Apply at both SqliteFactStore AND the InMemory reference impl so the contract test catches both.

**F5 cursor versioning is Slice D work.** The v1 offset cursor is NOT bound to query params, session, minTrust, or limit. Cross-parameter reuse is undefined behavior (silently returns wrong page). The right fix (scope fingerprint: hash of query+sessionId+minTrust+limit) is deferred to Slice D when we add cursor validation. Document with code comments NOW so the next author doesn't have to rediscover the gap.


## Learnings (2026-06-06 — M8 Slice C cycle-2 C2-A/B/C/D/E)

**Branch:** `eureka/m8-slice-c-factstore` (final fix pass, PR #48)

**Insertion-order tie-break must be explicit, not coincidental.** `localeCompare` on factId produces a different order than `f.id ASC` (autoincrement) whenever factIds are inserted in non-alphabetical order. The two impls were only "equivalent" because the test data happened to align. The fix: add an explicit `insertionOrder` counter to `StoredFact`, increment on each `seed()` call, sort ties by `a.insertionOrder - b.insertionOrder`. Then seed FS-7 in non-lexicographic order (`tie-c`, `tie-a`, `tie-b`) so the test would fail under `localeCompare` semantics. Cross-impl contract tests must use data that DISTINGUISHES the implementations they're testing — otherwise they miss the divergence they exist to prevent.

**Duplicates need distinguishable content.** A tie-breaking test that seeds identical content and only asserts `length === 3` would pass even if the impl returned the same row twice (three identical items would still have length 3 and Set.size 1 vs expected 3 — but only if you check the Set). FS-7's fix: seed content `'tiebreak pagination fact-c/a/b'` and assert `new Set(all.map(r => r.content)).size === 3`. A no-dup assertion requires uniquely-identifiable results.

**FTS5 error-message regex is a v1 tradeoff.** The `/fts5|unterminated|syntax error|malformed MATCH/i` pattern was verified against real SQLite errors on 2026-06-05. The conservative failure mode (miss → real error propagates, not swallowed) is acceptable for v1. Slice D should version-anchor the test or look for a more structured FTS5 error signal from better-sqlite3. Noted in decision drop §C2-E.
---


## Learnings (PR #45 Cycle 3 -- 2026-06-05)

**Keep mock return values matching the interface contract even when the value is ignored.** insertSession is typed Promise<void>, so mocks should resolve undefined, not a stray string like 'child-id'. Resolving a wrong type can mask future misuse where code incorrectly reads the return value -- the interface contract is the source of truth, not what production code happens to ignore today.

**Keep minimal-interface comments honest about used-vs-retained members.** If a port interface intentionally includes members not currently called by the primary consumer (e.g., queryEvents on DB), say so explicitly -- state which methods are used now vs retained for future needs. A comment that says 'only the operations X actually needs' becomes misleading the moment the interface contains anything beyond that scope.


## 2026-06-07 — M8 Slice D Complete

**Slice:** M8 Slice D — SQLite Production Deps Factory (Roger, Laura, Graham)  
**Status:** ✅ COMPLETE (147/147 tests, factory-on-subpath, Graham ACCEPT-WITH-FOLLOWUPS, SD-F1 ledger amendment applied)

**Summary:** Roger shipped factory functions (createSqliteRecallDeps, createSqliteFeedbackDeps) on @akubly/eureka/sqlite, preserving Slice A isolation. Laura added +2 smoke tests (SD-1, SD-2). Graham's architectural review: boundary integrity verified, composition root clean, spec tension resolved correctly. Scribe merged decisions inbox + applied SD-F1 ledger amendment.

**Key artifacts:**
- packages/eureka/src/sqlite/deps.ts — factory implementations
- packages/eureka/src/activities/__tests__/recall-sqlite-smoke.test.ts — SD-1, SD-2 smoke tests
- .squad/decisions.md — M8 Slice D as-built section (Graham SD-F1)

📌 **Slice D review-cycle complete + PR #54 opened** (2026-06-07T06:03Z): 5-persona Code Panel review → 0 blocking, 2 important + 3 minor fixed, 2 sound rejects + 1 false-positive cleared; 148/148 tests passing; Copilot review requested. — Scribe

---


## Learnings (Refactor 3 Review Cycle 1 — 2026-06-06)

**Production deps vs devDeps: if a module is exported from the production barrel, its native dependency belongs in `dependencies`, not `devDependencies`.** `createSQLiteDB` is exported from `crucible-core/src/index.ts`, so `better-sqlite3` must be a production dependency of that package. Leaving it in devDeps means any consumer that installs the published package without devDeps would get a runtime crash.

**Single-source schema DDL; never restate it in fixtures or tests.** Creating a canonical `SCHEMA_V1_SQL` export in core and having the fixture call `createSQLiteDB` directly eliminates the drift risk. A fixture that independently restates CREATE TABLE statements will silently diverge from production schema as the schema evolves.

**Error message parity between adapters is a contract, not a courtesy.** When the in-memory oracle throws a specific, diagnosable message (`pushEvent: session '<id>' not found`), the SQLite adapter must throw the exact same message — not a foreign-key constraint error. Tests that assert on error messages will fail at the FK layer with a confusing message; more importantly, callers that pattern-match on errors get inconsistent behavior depending on which adapter is in use.

**Interface JSDoc must describe the cross-impl contract, not the implementation detail of one adapter.** The "mutable reference" wording on `getOwnEvents` was truthful for in-memory but false for SQLite. When an interface has two implementations, the JSDoc on the interface must state what ALL implementors commit to — in this case, a snapshot, not a live reference.

**Header comments on transitional code should name its transitional nature.** Calling the SQLite adapter a "real SQLite adapter" biases future readers toward treating it as canonical. A one-clause note that names the Sprint-0 / compatibility-substrate framing prevents architectural drift.

---


## Learnings (Cycle 2 Remediation — 2026-06-06)

**Verify direct imports before removing a devDependency.** The safe pattern is: grep src/ for `import.*from 'pkg'`; if the only hits are in comments or JSDoc, the dependency is genuinely unused. Trusting that it "should" be gone without grepping first risks removing a still-needed dep (or, conversely, leaving a truly redundant one and failing review). In this case, `better-sqlite3` and `@types/better-sqlite3` appeared only in comments — test-db.ts had already been refactored to import solely from `@akubly/crucible-core`. Safe to drop.

**Transitive dependency satisfaction is enough for test code.** Once `better-sqlite3` lives in `crucible-core`'s `dependencies`, any workspace package that declares `@akubly/crucible-core` as a dependency gets the native module transitively. A devDependency on the same package in the consumer is pure noise and a source of version-skew risk.

---


## Learnings (PR #51 Review — 2026-06-06)

**Return a copy from snapshot methods, not the live internal collection.** `getOwnEvents()` was documented as returning a snapshot where modifications are not persisted, but returned the raw `ownEvents` array. The spread `[...array]` (or `.slice()`) is the minimal correct fix. Notably, the SQLite adapter already honored this contract (`.map()` creates a new array) — the in-memory adapter was the outlier. Whenever two adapters implement the same interface, verify BOTH sides match the JSDoc contract, not just one.

**Lazy-load native modules that are not needed by all consumers.** Placing `import Database from 'better-sqlite3'` at module top level causes the native `.node` binary to be loaded the moment the barrel is `import`-ed — even by callers that only use the in-memory adapter. The fix: `import type Database from 'better-sqlite3'` (type-only, erased at compile time) at top level, and `createRequire(import.meta.url)('better-sqlite3') as typeof Database` inside the factory function. The import graph then only reaches the native module when `createSQLiteDB` is actually called. This matches the pattern in `packages/eureka/src/db/openDatabase.ts`.

**`typeof ImportedType` is the correct cast for a `createRequire` call that returns a constructor.** `typeof import('better-sqlite3').default` fails when the package uses `export =` style declarations (TypeScript reports "Namespace has no exported member 'default'"). Use the locally imported type name directly: `as typeof Database`, where `Database` is bound via `import type Database from 'better-sqlite3'`.
---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**


## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.


## Learnings (2026-06-09 — Code Panel cycle 1 remediation, cursor-versioning review)

**Branch:** `squad/slice-dplus-cursor-versioning` (commit d75349b, 187/187 tests)

**Summary:** Addressed 7 accepted findings from the 6-persona Code Panel review.

**JSON.stringify as scope canonical form beats newline-delimited strings.**
The original `query=${q}\nsessionId=...` format is vulnerable to scope collisions when the query contains the literal substring `\nsessionId=`. `JSON.stringify({ query, sessionId, minTrust, limit })` is unambiguous — each field is a proper JSON value, properly escaped. No two distinct (query, sessionId, minTrust, limit) tuples produce the same JSON string. This is the correct baseline for any multi-field key canonicalization.

**"Present-but-invalid v" is a contract violation, not garbage.**
The original dispatch table had a gap: `v:0` passed the `typeof v !== 'number' || !Number.isInteger(v) || v < 0` guard and fell through to the v1 path. Non-integer strings/floats silently returned offset:0. The correct model: `v` absent/null → v0 (legacy); `v` present and exactly 1 → v1; `v` present and anything else → throw CursorVersionUnsupportedError. A cursor that contains a `v` field came from a versioned system — treating it as garbage is wrong.

**Empty-query short-circuit must come after cursor decode, not before.**
If the empty-query guard fires first, an invalid cursor version silently returns empty results instead of throwing. Since the cursor contract (version validation) is independent of the query, decode first — throw for bad versions — then apply the query-level short-circuits. This ordering applies to both SQLite and InMemory impls: the cursor is an input invariant, the query is a search-shape input.

**Diagnostic fields on error classes are worth the 2-line cost.**
`CursorScopeMismatchError` gained `readonly cursorScope` and `readonly currentScope` fields. No test can reasonably assert on error message text (too brittle), but structured fields let callers log the two fingerprints for debugging without string-parsing. The pattern mirrors `CursorVersionUnsupportedError.version`. Apply this consistently: any error that signals a mismatch should carry both sides.

**Isolated unit tests for pure utility modules catch bugs contract tests miss.**
The new `cursor.test.ts` caught that v:0 wasn't throwing (contract tests only call `search()` which re-throws at a higher level — the path through `decodeCursor` with v:0 was never hit by a focused test). Pure unit tests for pure functions are cheap and should be added any time a utility module handles non-trivial dispatch logic.

---


## Learnings (2026-06-09 — Code Panel cycle 2 remediations, cursor-versioning Fix H/I/J)

**Branch:** `squad/slice-dplus-cursor-versioning` (commit 9b145e8, 187/187 tests)

**Key: absent v key ≠ null v key — use `'v' in payload`, not `v != null`.**
`v !== undefined && v !== null` silently treats `{v: null, offset: 3}` as a legacy v0 cursor. But that payload HAS a v key — it came from a system that serialized something (e.g., NaN → null via JSON.stringify). The contract is: ABSENT key → v0; PRESENT key with value ≠ 1 → throw. The correct guard is `'v' in raw` (after confirming payload is a non-null object). This is the standard JavaScript idiom for key-presence vs value-check.

**Pair RED-test changes with the code change, not after.**
The cycle-2 review caught that CU-3f was asserting the wrong behavior (version===0 for v:null) and CU-1b was in the wrong describe block. The correct workflow: update the test to reflect desired behavior (RED against current code), verify it actually fails, then implement. A test that passes because the code does the wrong thing is harder to detect than a compile error.

**Lazy fingerprinting pattern: compute only when consumed.**
Use a `computedScope: string | undefined` variable initialized to undefined. Compute the scope inside the v1 cursor branch (if-present-and-v1) and reuse it for nextCursor emission via `computedScope ?? scopeFingerprint(...)`. This avoids hashing on empty-query short-circuit paths, no-cursor paths with no next page, and v0-cursor paths with no next page — all while preserving the Fix E decode-before-short-circuit ordering. The `??` fallback is the correct operator here (not `||`) since a valid fingerprint is always a non-empty string.

---


## Learnings (2026-06-09 — Cycle-3 cleanup)

**Object.hasOwn(raw, 'v') improves robustness over 'v' in raw.** Both are functionally identical for well-formed JSON payloads, but Object.hasOwn avoids prototype-chain lookups if the object ever inherits non-standard prototypes — a good defensive practice for untrusted input even when we don't expect it.

---


## 2026-06-10: WAL/CAS Correctness Fixes #57/#60/#68 (S1)

📌 **Roger:** Landed three WAL/CAS correctness fixes in one coherent branch (squad/crucible-wal-correctness-s1). London-school TDD: RED→GREEN×3.

**#57 (verdict encoding):** Introduced `hookResultToVerdictByte(verdict, hookId)` in `wal/types.ts`. When `hookId === null && verdict === 'COMMIT'`, encodes as 0xFF (NO_MATCH/no predicate matched); otherwise `VERDICT_TO_WAL[verdict]`. Both backends updated. New CL-8 (no-match vs explicit-continue bytes) and CL-10 (FS reopen durability) contract tests. CL-3/CL-6 updated to use `hookId: 'test-hook-a'` for COMMIT rows. Persona-review follow-up fixed `PreCommitHookBus.fire()` to preserve a matched hook id on explicit COMMIT so ledger-driven WAL appends also persist 0x00 correctly; acceptance test `hook-continue-wal.test.ts` pins the integration.

**#60 (canonical CBOR):** Created `wal/cbor.ts` using `cborg` library (pure-TS, ESM-compatible, no native compilation). Canonical encoding via `sortKeys()` (recursive lexicographic key sort) before `cborg.encode()`. Both backends now compute `payloadHash`/`readSetHash` as BLAKE3(CBOR(data)) and store `envelopeCbor` as CBOR-encoded string (not raw UTF-8). Replay updated to CBOR-decode. New CBOR-1 (key-order stability) and CBOR-2 (genuine CBOR envelope) tests. `writeCorruptSession` test helper updated to use CBOR.

**#68 (CAS atomic write):** `FileSystemCas.put()` now always writes to `<hash>.cbor.tmp` (no existsSync skip); `syncAll()` fsyncs the .tmp then `fs.renameSync` to `<hash>.cbor` (atomic replace — libuv uses `MoveFileExW MOVEFILE_REPLACE_EXISTING` on Windows). Final CAS file is always either absent or complete — no torn-blob dedup vulnerability. CAS-F6 expectation updated (no longer skip-dedup optimization). TORN-1 test simulates a torn blob and asserts recovery.

**Key paths:** `wal/types.ts`, `wal/cbor.ts` (new), `wal/cas-fs.ts`, `wal-backend-in-memory.ts`, `wal-backend-fs.ts`.

**Final:** 136 tests, all green. Build clean.

---


## 2026-06-11: Crucible S1 — CAS atomic-write detail (#68)

**#68 (CAS atomic write):** FileSystemCas.put() now always writes to <hash>.cbor.tmp (no existsSync skip); syncAll() fsyncs the .tmp then fs.renameSync to <hash>.cbor (atomic replace — libuv uses MoveFileExW MOVEFILE_REPLACE_EXISTING on Windows). Final CAS file is always either absent or complete — no torn-blob dedup vulnerability. CAS-F6 expectation updated; TORN-1 test simulates a torn blob and asserts recovery.

**Key paths:** wal/types.ts, wal/cbor.ts (new), wal/cas-fs.ts, wal-backend-in-memory.ts, wal-backend-fs.ts.

---


## 2026-06-11: Crucible WAL Correctness S1 — Cycle-2 Panel Remediation

**Context:** The 5-persona Code Panel on squad/crucible-wal-correctness-s1 (commit 8af65c4) found
design-depth gaps after the S1 batch (issues #57, #60, #68) landed GREEN at 136 tests. Aaron
dispositioned the two blockers (B1, B2) and I addressed all 10 findings (B1, B2, I1–I8) plus M1, M2.

**Commit:** d74242b on squad/crucible-wal-correctness-s1

**Key changes and learnings:**

**B2 (RFC 8949 canonical CBOR):** The manual sortKeys pre-pass was both wrong and redundant.
Wrong: it used JS lexicographic sort, not RFC 8949 bytewise ordering (though cborg's own mapSorter
corrected this anyway). Redundant: cborg re-sorts regardless of object key insertion order.
The real problem was relying on cborg's implicit defaults rather than fc8949EncodeOptions.
Fix: remove sortKeys, call ncode(data, rfc8949EncodeOptions), add ssertJsonLike() type guard.

**Learning: fc8949EncodeOptions is a function-typed export.** JSON.stringify(rfc8949EncodeOptions)
shows only { float64: true } because functions don't serialize. The object also carries
mapSorter: rfc8949MapSorter and quickEncodeToken. Always inspect with Object.keys() or source.

**B1 (schemaVersion validation):** The backstop is a single equality check at manifest load time.
WAL1/CBOR is the inaugural shipped format; no migration is owed. The CURRENT_SCHEMA_VERSION = 1
constant makes the check self-documenting and easy to update when WAL2 arrives.

**I1 (CAS temp name uniqueness):** Fixed temp suffix → <hash>-<pid>-<counter>.cbor.tmp.
Also: treating EEXIST on rename as success is the correct pattern for content-addressed storage —
the concurrent winner has identical bytes. This prevents an ENOENT when the temp file disappears
after a concurrent rename.

**I3 (shard dir fsync):** Easy to overlook: enameSync() only makes the inode durable, not the
directory entry. On Linux ext4 ordered mode, the dir entry needs an explicit fsync too.
The process.platform !== 'win32' guard is the correct idiom — NTFS is synchronous on rename.

**I4 (clear pendingSync on abort):** catch { pendingSync.clear(); throw; } is a one-liner fix
with outsized correctness impact. Without it, a failed batch's stale temp entries corrupt the
next batch's sync-call counts and create orphan blob races.

**I5/I6 (VerdictByte + precondition):** Type narrowing (	ype VerdictByte = 0xFF|0x00|0x01|0x02)
caught nothing at compile time because s VerdictByte is always accepted by TypeScript.
The real value is the runtime precondition throw in hookResultToVerdictByte and the
eadUInt8() as VerdictByte cast comment on the decode path. Existing tests that used
commit('OBSERVE') / commit('PAUSE') with hookId: null needed updating — they had been
inadvertently testing the now-invalid (hookId=null, non-COMMIT) path.

**I2 (shared materialize helper):** The shared helper is not about performance (hashing twice
is negligible) but about preventing silent drift. CAS.put() and materializeRow() both hash,
but the helper's value is that it's the authoritative source — backends use its hashes, not
cas.put()'s return value. The CL-9 contract tests enforce this at CI time.

**I7 (TORN-1 exact assertion):** 	oBeGreaterThan(2) was a lazy assertion that passed even if
the content was [0xDE, 0xAD, 0x00] (3 bytes of garbage). The correct pattern is to compute
ncodeCbor(expectedPayload) and compare the exact hex — this is also self-documenting.

**Golden vector tests:** Computing exact CBOR bytes requires running cborg in the Node REPL.
Always include the input, the expected hex, and a brief decode annotation as a comment in the test.

**Test count:** 156 total (up from 136). 20 new tests across 4 test files.
**Build:** 
pm run build clean (exit 0). **Lint:** 
pm run lint --workspace @akubly/crucible-core clean.

— Roger

---


## 2026-06-11 — Cycle-3 Remediation: A1–A5

**Branch:** squad/crucible-wal-correctness-s1 (follow-up to commits d74242b / 07a4955)

### Summary

Addressed cycle-3 advisory findings from the second panel review. All behavior preserved;
hashes and bytes unchanged; 2 new tests added, 1 benchmark added.

### A1 — Float profile docs (fixed)
- Updated wal/cbor.ts file header and ncodeCbor JSDoc: replaced "RFC 8949 §4.2.1
  deterministic encoding" with the precise "Crucible canonical CBOR profile" definition
  (RFC 8949 §4.2.1 map-key ordering + shortest integers + forced IEEE-754 binary64 for all
  non-integer numbers — explicitly noting the deviation from §4.2.1 shortest-float rule).
- Updated CTD §3.2 to add an "CBOR encoding profile" block with the exact profile definition
  and also corrected the temp-file name example (was <hash>.cbor.tmp, now <hash>-<pid>-<n>.cbor.tmp).
- Added CBOR-9 golden vector test: encodeCbor(1.5) → fb3ff8000000000000 + BLAKE3 pinned.
- Updated canonical-cbor-hashing skill to v3.0 with the forced-float64 note and the
  "do NOT call this pure §4.2.1" warning.

### A2 — Perf double-work (fixed)
- Replaced the ssertJsonLike pre-pass (separate tree traversal) with cborg 	ypeEncoders
  embedded in crucibleEncodeOptions. Now a single traversal handles both type validation and
  encoding. Object, Date, Map, Set, bigint, undefined, and non-finite number typeEncoders throw
  UnsupportedCborTypeError; all other types pass through to cborg's default handlers.
- Eliminated double-hashing: InMemoryCas.put() and FileSystemCas.put() now accept an optional
  precomputedHash parameter. Both backends pass mat.payloadHash / mat.readSetHash from
  materializeRow, so hashBytes() is called exactly once per blob per row (in materializeRow).
- Added PERF-1 micro-benchmark test: 2000 iterations of encodeCbor+hashBytes over a 4-key nested
  payload, logging µs/op to stdout. Baseline on this machine: ~15.50 µs/op. Hard sanity bound: < 500 µs/op.

### A3 — BLAKE3 in golden vectors (fixed)
- Added hashBytes() assertions alongside CBOR bytes in CBOR-4, CBOR-5, CBOR-6, CBOR-7.
  CBOR-9 also includes BLAKE3. Cross-impl reproduction now covers both encoding AND hashing.

### A4 — Abort/durability contract doc (fixed)
- Extended syncAll() JSDoc in cas-fs.ts: "a rejected commit is NOT durable; caller must retry.
  pendingSync is cleared on abort so a later batch never re-syncs orphaned temp blobs."
- Extended executeFlush catch block comment in wal-backend-fs.ts with the same durability note.

### A5 — Re-export WAL errors from index.ts (fixed)
- Added to public API surface: CorruptSegmentError, CasMissError, UnsupportedSchemaVersionError,
  UnsupportedCborTypeError, InvalidMagicError, InvalidRecordLengthError.
- These were previously defined and exported from their source files but not re-exported from
  the package root, making type-based catch() impossible for external consumers.

### Learnings
- cborg 	ypeEncoders ARE called recursively for nested values — verified empirically. This
  makes the fold approach viable without any custom recursion on our side.
- cborg's quickEncodeToken in rfc8949EncodeOptions does NOT bypass 	ypeEncoders — number
  typeEncoders still fire even when quickEncodeToken is present. Good: the NaN/Infinity guard works.
- fc8949EncodeOptions has NO 	ypeEncoders key — safe to spread and add our own without conflict.
- BigInt silently encodes as integer in cborg without a typeEncoder guard. CRITICAL: always add a
  bigint typeEncoder when restricting to JSON-like values.
- The UnsupportedCborTypeError constructor path parameter was only useful for the assertJsonLike
  pre-pass. With the typeEncoders fold, path info is lost. No existing test checked for path
  in the error message, so the change is backward-compatible for all current callers.

**Tests:** 158/158 green (+2 new tests: CBOR-9, PERF-1).
**Build:** npm run build clean (exit 0).
**Lint:** npm run lint --workspace @akubly/crucible-core clean.
**Benchmark:** PERF-1 encodeCbor+hashBytes ×2000: ~31ms / ~15.50µs per op.

— Roger

---


## 2026-06-12 — PR #73 Cloud Review Fixes (commit fdffd0d)

**Branch:** squad/crucible-wal-correctness-s1 (follow-up to cycle-3 commit a899d03)

### T1 — CAS duplicate-hash put() orphan temp files (fixed)
When the same hash was put() twice in one flush batch, pendingSync.set(finalPath, tmpPath) silently
overwrote the prior tmpPath entry, orphaning the earlier *.cbor.tmp on disk (write amplification + leak).
Fix: check pendingSync.has(finalPath) before writing a new temp — if already pending, skip and return
the hash. Content-addressed bytes are guaranteed identical so the existing entry covers the put.
New test: CAS-T1 — asserts no orphan temp files AND correct sync count of 1 (not 2) after dedup.

### T2 — CAS abort does not unlink temp files (fixed)
The syncAll() catch block cleared pendingSync but never unlinked the on-disk *.cbor.tmp files for entries
that were never renamed. Since the map was cleared, no future syncAll() would ever clean them up. Repeated
failures accumulated garbage indefinitely.
Fix: iterate pendingSync.values() before clearing, best-effort unlink each tmpPath.
New test: CAS-T2 — injects a sync failure, asserts zero *.cbor.tmp files remain on disk after abort.

### T3/T4/T5 — Remove gitignored files (removed)
Three files committed in e17d306 under .squad/orchestration-log/ and .squad/log/ were gitignored but
force-committed. No content was lost (decisions already in .squad/decisions.md). Removed via git rm.

### T6 — hookVerdict byte validation in codec.ts (fixed)
decodeRecord() cast the on-disk byte to VerdictByte without validating it. A corrupted segment with verdict
byte 0x03 would produce a SegmentRecord with hookVerdict typed VerdictByte but value outside the union —
unsound. Added VALID_VERDICT_BYTES set ({0xFF,0x00,0x01,0x02}) and validation before the cast; throws new
InvalidVerdictByteError (added to codec.ts, re-exported from index.ts) for any other value.
New tests: T6a (all 4 valid bytes round-trip), T6b (0x03 rejected with typed error + hex message),
T6c (0xFE rejected).

### T7/T8 — Stale test comments (fixed)
Removed 'RED PHASE' header and 'Currently FAILS' / 'JSON.stringify is key-order-sensitive' framing from
wal-cbor.test.ts. The suite is committed green code; comments now describe passing behaviour.

### Learnings
- The dedup-by-finalPath approach (skip second write entirely) is simpler than unlink-then-replace: no
  unlink race, no extra filesystem call. Content-addressing makes dedup trivially correct.
- Aborting without unlink is a classic cleanup gap: clearing a map removes bookkeeping but NOT disk state.
  Always iterate and cleanup BEFORE clearing.
- TypeScript type unions (VerdictByte = 0xFF|0x00|0x01|0x02) do not enforce runtime values — external
  data (file I/O, network) requires explicit validation before casting.
- The OFF_HOOK_VERDICT offset (25) must be a magic constant in tests when patching encoded buffers. Cross-
  check with the codec constants to avoid offset drift.

**New tests:** CAS-T1, CAS-T2, T6a, T6b, T6c (5 new).
**Total tests:** 163/163 green.
**Build:** npm run build clean (exit 0).
**Lint:** npm run lint --workspace @akubly/crucible-core clean.
**Commit:** fdffd0d

— Roger

2026-06-12 — cloud cycle 2 — made forced-float64 explicit in crucibleEncodeOptions (was implicitly inherited from cborg rfc8949 preset); Copilot's float16 bug claim was empirically false but explicit-is-better hardening applied. (commit 32a49c9)

2026-06-12 — cloud cycle 3 — T-A: dir-entry fsync in cas-fs.ts now calls fs.fsyncSync directly (not syncFn); syncFn is data-file barrier only, dir durability is always-real. T-B: types.ts payloadHash/readSetHash comments updated to 'Crucible canonical CBOR profile' wording. (commit ceee9eb)

2026-06-12 — cloud cycle 4 — 04-hook-bus.md prose corrected (all-hooks evaluated, no kind-indexed dispatch in this slice; 0xFF only when hooks.size===0); both SKILL.md inbox-refs replaced with committed decisions.md entries; atomic-cas-write fsync snippet updated to fs.fsyncSync. (commit b73a321)

## 2026-05-26: Eureka ↔ Crucible Data Layer Overlap Analysis

**Context:** Aaron preparing simultaneous Eureka + Crucible implementation in this repo (`D:\git\harness`). Task was to map data-layer overlaps between Eureka's PRD (from sibling `D:\git\mem` repo) and Crucible's L1 substrate (A.3 hybrid append-log, per-row content-addressed WAL, group-commit).

**Verdict: FORK storage entirely.** Eureka and Crucible are architectural siblings with non-overlapping persistence needs. Full analysis written to `.squad/decisions/inbox/roger-eureka-crucible-data-overlap.md`.

**Eureka's data shape (from PRD v5-final):**
- Three independent SQLite DBs (via `better-sqlite3`): `~/.copilot/eureka/agent.db` (v1), `~/.copilot/eureka/user.db` (v1.5+), `<repo>/.eureka/project.db` (v1.5+). Only agent-tier fully wired in v1.
- Schema per-tier: `facts` table (CRUD, not append-only) with FTS5 for BM25 lexical recall, `relations` table (graph edges), `bridge_ledger` (append-only cross-system reconciliation log). No FKs to Cairn/Forge; **no cross-DB ATTACH at runtime** (FR-7.2).
- Write pattern: fact CRUD + FTS5 triggers + sweep-driven Tier 2 edge population. No group-commit, no per-row pre-fsync hooks.
- Query pattern: BM25 recall (keyword-scoped), composite ranker (0.5·relevance + 0.2·importance + 0.2·trust + 0.1·recency) × attention multiplier, trust floor exclusion (< 0.15), sequential fan-out (agent → user → project), edge traversal via `relations`.
- Lifecycle: SQLite WAL mode, opportunistic sweep (end-of-session, first-query-of-day), no content-addressed row hashing. Session identity shared with Cairn via `SessionId` brand from `@akubly/types` (type-level construct, no runtime FK — Eureka PRD §FR-13 v5-final R8).

**Share-vs-fork recommendations (8 substrate concerns evaluated):**
- **Event log / WAL:** FORK — Eureka's CRUD + FTS5 vs Crucible's append-only + group-commit are incompatible write patterns. Forcing convergence would mean Eureka pays append-only cost for no gain, or Crucible compromises replay determinism.
- **Session model:** FORK tables, SHARE identifier only — both use `SessionId` brand from `@akubly/types`; no runtime FK. Cairn owns lifecycle (`sessions` table), Eureka owns epistemology (`kind='session'` facts). Offline correlation only.
- **Config / KV / Graph / FTS / Snapshot:** FORK on all — no semantic overlap. Eureka's graph is epistemological (facts linked by `derived_from`, `contradicts` edges); Crucible's read-set is causal (event A read output of event B). DBOM Merkle chain (audit tamper-detection) vs Eureka facts (trust-weighted retrieval) serve different purposes.
- **Migrations:** FORK numbering — Crucible v100+ OR prefixed naming (`crucible-001-*.ts`) OR separate DB file (`~/.cairn/crucible.db` instead of sharing `~/.cairn/knowledge.db`). Recommendation: **separate DB file** for clean migration independence and backup story.

**Schema / path / port collisions: NONE.** Separate DB files (Cairn `~/.cairn/knowledge.db`, Eureka `~/.copilot/eureka/*.db`, Crucible TBD). Only shared construct is `SessionId` brand (type-level, no runtime coupling). No HTTP/IPC surfaces in v1 (Eureka library-only, Crucible is substrate layer, Cairn CLI-only). CLI namespaces distinct (`eureka` vs `cairn` vs hypothetical `crucible`).

**One load-bearing question for Aaron:** Does Crucible's L1 WAL (v14 `wal_records` table + v15-v18 tables) live in the same `~/.cairn/knowledge.db` as Cairn, or fork to `~/.cairn/crucible.db`? Trade-offs documented in analysis §6 OQ #1. My recommendation: **fork to `~/.cairn/crucible.db`** — independent migration numbering, preserves A.3 hybrid design freedom (custom append-only WAL file in pure TS for L1, keep `better-sqlite3` for other tables), avoids same-DB migration collision risk.

**Additional open questions for Aaron:**
- OQ #2: Does Crucible v1 still follow A.3 hybrid (my Round 5 spike recommendation), or has design shifted to full-SQLite transaction-batched semantics?
- OQ #3: Does Crucible L1 WAL rows carry `session_id` column? If yes, should import shared `SessionId` brand from `@akubly/types` to match Cairn + Eureka (type-level only, no runtime FK).

**Backup story:** Three stateful directories once both ship: `~/.cairn/` (Cairn + possibly Crucible), `~/.copilot/eureka/` (Eureka agent/user DBs), `<repo>/.eureka/` (Eureka project DB v1.5+). Operator guidance: back up all three for full state recovery. No cross-DB runtime dependencies; correlation is offline-only via `eureka reconcile` CLI (reads Cairn DB read-only) and (future) `crucible reconcile`.

**Anti-anchoring check honored:** Considered the "share event log" alternative seriously (Eureka could project facts into an append-only log, Crucible could index facts for keyword recall) and rejected on the evidence that the two write patterns (CRUD+FTS5 vs append-only+group-commit) and query patterns (BM25 recall vs seq-ordered replay) do not align. Sharing would force premature convergence on a primitive that neither system needs in its pure form.


## 2026-05-25 Round 7: v1-tier triage of all Roger-authored stories

Triaged every user story I authored across the deliberation against Aaron's locked v1 framing ("Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible"). Written to `decisions/inbox/roger-triage-2026-05-25T0200Z.md`. Headline cut: **8 substrate items go T1, 1 story (R-4) is enabled-for-free, everything else falls to T2–T5 or splits.**

T1 set: WAL with read-set hash + hook bus (Round 3 locked), `withShadowEvent` discipline + replay invariant (Open #4), CBOR-dcbor + BLAKE3 (Open #5), CAS + observation capture (Ro-NEW-2 — gates hermetic replay, this is the keystone), minimum-viable snapshot (Ro-NEW-1 T1 slice), branch/ref metadata schema (Ro-NEW-3 T1 slice), replay harness + linear `cairn fork --at` (R-3 T1 slice), drift ProposalGenerator (R-4, free). Plus `tenant_id` cheap-insurance migration (R-6 enabling) — hours now, weeks later.

Splits: **R-3** (replay+linear-fork T1, graph ops T3), **Ro-NEW-1** (min-viable snapshot T1, cadence/compaction T5), **Ro-NEW-3** (schema T1, fsck/GC T5). Cuts to T4/T5: R-1 (pattern mining graph-walks), R-2 (GitHub plugin), R-6 (federation), R-7 (code review plugin), R-8 (export productionization), R-9 (templates, gated on R-3), Ro-NEW-4 (quotas — dedup floor is already free). R-5 to T2 (one-hop provenance already exists; transitive walk is investigation-depth, not bootstrap).

Storage-criticality rule I'm enforcing: anything that touches WAL row layout, L1→L2 projection contract, or the determinism conformance suite is T1 regardless of how aggressive I'm trying to be elsewhere. That rule is what kept Ro-NEW-2 from being demoted on "data volume" grounds — without observation capture, the bootstrap loop's falsifiability claim is theatre.

Seven open questions for Cassima: rolling-buffer bound for capture store, `change_vectors` promotion to general post-commit outcome attachment (Roger+Laura), `tenant_id` cheap-insurance confirmation, snapshot-CLI scope at T1, R-9 tier check with Aaron, acknowledgement-stories for inherited Cairn surfaces (`topology_cache`, `execution_profiles`, `skillLinter`), and whether the WASM predicate-compilation ABI seam ships at T1 or T2. None of those change my T1 set; they each refine one edge of it.


## 2026-05-25 Round 6: Phase B Opens #4 and #5 resolved

Closed both substrate-owned Phase B contradictions in one inbox file (`decisions/inbox/roger-opens-4-and-5-2026-05-25T0130Z.md`). For #4 (7-tables UPDATE vs. backward causal slice): enumerated all seven tables from `packages/cairn/src/db/` and `agents/`, classified 6 as derived projections of `event_log` (`sessions`, `insights`, `prescriptions`, `prescriber_state`, `curator_state`, `optimization_hints`) and 1 as external filesystem mirror (`managed_artifacts.current_checksum`). Recommended killing `prescriber_state.pending_count` entirely (replace with a SQL view), wrapping all other lifecycle UPDATEs in a `withShadowEvent()` repository helper, banning raw `UPDATE` outside `db/` via a custom ESLint rule with cursor/mirror allow-list, and locking the discipline in CI with a snapshot→truncate→replay→deep-equal invariant test. Rejected SQLite triggers (would couple us to a substrate primitive in violation of v1 commitment #10) and rejected the "move everything to append-only" alternative on the evidence that the source of truth is already the event log. ~14 hours of work for Alexander in the first Crucible sprint.

For #5 (canonical serialization): picked **CBOR-dcbor + BLAKE3** (`cbor2` + `@noble/hashes/blake3`) for the new L1 read-set hash — matches Phase A's existing `blake3` columns, ~5-7µs per hash (well inside the 80µs hook-bus envelope I told Gabriel about), pure-JS so no native binding requirement. **Left DBOM on SHA-256 + JSON** — different audit consumer, committed artifacts already in production, migration not worth it. Established the per-column rule: hash algorithm fixed at column creation, never migrated; new columns BLAKE3; named legacy SHA-256 columns frozen. Specified all canonicalization edge cases (forbid bignums/tags/indefinite-length/NaN/non-NFC, definite-length only, bytewise-encoded key sort). ~9 hours of work, with Laura's A3 conformance assertion now writable without further design. Anti-anchoring rule honored on both — considered and explicitly rejected the obvious alternative for each.


## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to .squad/decisions.md. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

Ready for Wave 2 implementation (computation + ranking only; runtime wiring follows in Wave 3).


## Learnings (2026-05-23 — W3-1 skillsmith-runtime scaffold)

- `packages/skillsmith-runtime/` follows the repo's standard library package shape: package.json + composite tsconfig + `src/index.ts` + `src/__tests__/` with tests excluded from TypeScript build output.
- Root workspace registration needed only a `tsconfig.json` project reference because the repo already uses the broad `packages/*` workspaces glob. `npm install` then linked the new package into `package-lock.json` automatically.
- This environment's npm rejected `workspace:*` dependency specifiers (`EUNSUPPORTEDPROTOCOL`), so the new package uses the repo's established `"*"` workspace dependency pattern instead.
- W3-1 intentionally leaves `createPrescriberOrchestrationConfig()` and `runForgePrescribe()` as throwing stubs. W3-5 will wire Cairn + Forge composition; W3-2 will make `runtime-cli` delegate into this package.


## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Unblocks all Wave 3 work items. Roger owns composition root and runtime-cli packaging.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool for manual prescriber invocation in Wave 3. Curator hook is autonomous surface; existing `forge-prescribe` CLI is manual surface. Re-open MCP tool only when concrete operator need materializes.
- **W3-D4: Curator Hook → Always-On** — Automatic invocation enabled; no opt-in flag in v1. Safety margins verified via Wave 2 E2E tests. Profile selection trigger-driven only; global fallback deferred to Wave 4.


## Learnings (2026-05-23 — Wave 3 Composition Root Audit)

- **Five composition root options evaluated** for Wave 3. Current architecture: Cairn and Forge have zero direct coupling (acyclic, port-based). Only `packages/runtime-cli/` bridges them (Wave 2 stepping stone). Audit document: `docs/wave3-composition-root-audit.md`.
- **Recommendation: Option B** (separate `@akubly/runtime` library + thin `runtime-cli` wrapper). Reasoning: Best test isolation, zero build risks, Phase 5-ready architecture. Library stays portable; CLI stays thin.
- **Do not use Option C** (inject Forge into Cairn hooks) — test coupling and build-order dependencies are unacceptable. Create a package instead.
- **Known unknowns deferred to Graham's ADR:** Profile selection strategy (all vs. only-with-vectors), hint persistence ownership, MCP tool shape for prescriber optimization, fail-open semantics on Forge failure during Curator.


## Learnings (2026-05-22 — Wave 2 W2-9 manual CLI surface)

- Wave 2's explicit composition root now lives in `packages/runtime-cli/` with bin name `forge-prescribe`; it's the one package allowed to import both `@akubly/cairn` and `@akubly/forge` without violating the package boundary.
- Local invocation pattern from the repo root is `npx forge-prescribe --skill <id> [--db <path>]`; the root workspace keeps `@akubly/runtime-cli` as a dev dependency so the bin is linked into the local toolchain after `npm install`.
- Profile loading is deterministic: try the canonical per-skill aggregate first (`granularity='per-skill', granularity_key='global'`), then fall back to a skill-scoped `global/global` profile before failing with a clean no-profile result.
- Exit semantics are simple: 0 on successful orchestration (including zero generated hints or dedup skips), 1 when no execution profile exists, and 2 for argument, database, or persistence failures.


## Learnings (2026-05-22 — Wave 2 W2-1 shared change-vector contract)

- Canonical Wave 2 change-vector contracts now live in packages/types/src/index.ts: ChangeVectorSummary, ChangeVectorProvider, NEGATIVE_IMPACT_AUTO_APPLY_GATE, and shared OptimizationCategory.
- Reconciled the two ChangeVectorSummary duplicates by taking Forge's stricter OptimizationCategory union instead of Cairn's plain string. Added autoApplyEligible?: boolean as the additive v3.1 field on the shared contract.
- Verification: root npm run build and root npm test passed before and after the change (1153-test baseline green).


## Learnings (2026-05-23 — W3-2 thin runtime-cli)

- Picked **Option A** for W3-2: `packages/skillsmith-runtime/src/index.ts` now owns the existing `runForgePrescribe()` composition flow (profile load, `SqliteChangeVectorProvider`, Forge prescribers, dedup + persistence) and `packages/runtime-cli/src/index.ts` is just a re-export facade.
- The thinnest stable CLI refactor here is **function re-export + unchanged CLI formatter**. That preserved operator-visible behavior and let the new delegation test assert identity (`runtime-cli` export === `@akubly/skillsmith-runtime` export) without introducing fragile ESM mocking around the bin entry.
- Alexander no longer needs to move manual CLI composition into `skillsmith-runtime` for W3-5; that surface is already live. W3-5 can stay focused on `createPrescriberOrchestrationConfig()` and Curator-facing factory wiring.
- After this refactor, remember to build before package tests that import `@akubly/skillsmith-runtime` by package name; those tests resolve the built workspace export (`dist/`), not the source file directly.


## Learnings (2026-05-23 — W3-6 hook injection bootstrap)

- Picked **R-Hook-A (injection)** for Curator session-start wiring: `packages/cairn/src/hooks/sessionStart.ts` now accepts an optional `PrescriberOrchestrationConfig` and forwards it to `curate()`; Cairn itself still does not import `@akubly/skillsmith-runtime`.
- The production always-on bootstrap now lives in `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, and `.github/hooks/cairn/curate.ps1` resolves that compiled script first. Laura's W3-7 integration test should enter through that skillsmith-runtime hook path, not the bare Cairn hook, so the real orchestration config is present.
- Keeping the script-level composition in the runtime package preserves W3-D1's boundary: Cairn owns hook mechanics, skillsmith-runtime owns cross-package wiring, and the PowerShell wrapper chooses the composition entrypoint.


## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Runtime-CLI: 5/5 passing
- Skillsmith-Runtime: 6/6 passing

**W3-1 & W3-2 shipped:** Scaffolding + thin CLI done.  
**W3-6 shipped:** Hook wiring complete — always-on bootstrap via injected config. Composition boundary preserved (cairn ↔ skillsmith-runtime acyclic).  

Wave 3 implementation delivered autonomous Curator-driven orchestration. Composition root (R2: `@akubly/skillsmith-runtime`) is the only place importing both `@akubly/cairn` and `@akubly/forge`. Phase 5-ready architecture in place.

---


## Session N: Skillsmith Harness Big-Think User Stories

**Lens:** Data, scale, integration, persistence.

### 9 Delivered Stories

**US-R-1: Cairn Pattern Mining Across Session Boundaries**  
As Aaron, query Cairn ledger to surface recurring Decision patterns, code-smell-to-fix chains, and decision reversals across 100+ sessions for Curator tuning and Forge heuristic calibration.  
*Ambition:* Accumulated telemetry becomes self-tuning feedback loop; harness learns from its own history.  
*Chambers:* Crucible, Cairn, Forge, Mirror  
*Data implication:* Append-only versioning + efficient graph traversal across millions of Primitives.

**US-R-2: GitHub Issue Auto-Coupling via Curator**  
Curator detects when a session solves/relates to open GitHub issues, auto-proposes linking (never auto-approves), leaving Mirror-check gate.  
*Ambition:* Break silo between coding-agent telemetry and project tracking; external systems as first-class signal inputs.  
*Chambers:* Crucible, Cairn, Curator, Mirror  
*Data implication:* Bidirectional webhooks + GitHub API polling; Cairn stores sync state + proposal backpressure.

**US-R-3: Cairn Replay & Variant Branching**  
Export session (or sub-chain) and replay with Alchemist variants—different model, decision tree, tool choices—to compare outcomes without reracking work.  
*Ambition:* Replay-as-first-class-primitive; harness becomes experimentation platform. Replay + variant = A/B testing coding decisions.  
*Chambers:* Cairn, Alchemist, Crucible  
*Data implication:* Portable serialization (JSON-LD/SQLite) with deterministic replay semantics + seeded RNG injection.

**US-R-4: Long-Session Drift Detection & Prescribing**  
Forge detects token-budget creep, context-window saturation, decision-reversal clustering in sessions >2hr; auto-proposes checkpoint/reset patterns.  
*Ambition:* Make invisible resource constraints visible before degrading session quality; Forge as canary.  
*Chambers:* Forge, Crucible, Cairn, Mirror  
*Data implication:* Granular token/context-window/latency tracking per turn; time-series queries on Cairn.

**US-R-5: Mirror-Backed Cross-Session Provenance**  
Mirror surfaces decision chain (why that tool chosen, which prior session influenced heuristic) across boundaries, building legible accountability for harness autonomy.  
*Ambition:* Epistemic trust-building—audit *reasoning* behind Curator proposals, not just outputs.  
*Chambers:* Mirror, Cairn, Curator  
*Data implication:* Rich metadata linking each Primitive to prior-session provenance (parent Decisions, Forge signals, Curator confidence).

**US-R-6: Scalable MCP Ecosystem as Forge Input**  
Federate tool success/failure/latency across Aaron's entire MCP ecosystem; Forge ranks tool choices; share anonymized insights with Skillsmith community.  
*Ambition:* Harness becomes collective learning engine; aggregate signal from thousands of tool invocations into shared optimization surface.  
*Chambers:* Forge, Cairn, Curator, Crucible  
*Data implication:* Multi-tenant telemetry ingestion + differential-privacy aggregation; Forge ranking scoped to cohort.

**US-R-7: Curator-Driven Code Review Automation**  
Curator detects mutations of core APIs or high-fan-out subsystems; auto-proposes async code review (MCP agents or GitHub PR); track review-to-ship latency in Cairn.  
*Ambition:* Blur autonomy and accountability; let them coexist.  
*Chambers:* Curator, Cairn, Crucible, Mirror  
*Data implication:* Parse Artifact diffs, compute module-graph impact, integrate GitHub PR API + MCP code-review servers.

**US-R-8: Multi-Tenant Cairn Export & Legal Hold**  
Export filtered Cairn views (by project, time window, Primitive type) as immutable ledger snapshots for compliance, legal hold, or sharing—without exposing private sessions.  
*Ambition:* Audit-ready from day one; data residency + portability as core, not bolted-on.  
*Chambers:* Cairn, Mirror, Crucible  
*Data implication:* Column-level access control, zero-knowledge proof of ledger integrity, deterministic export fingerprinting.

**US-R-9: Sessions as Reusable Templates**  
Mature Crucible sessions packaged as reusable templates—decision trees, tool chains, Curator tunings—spin up new projects with pre-tuned harness behavior.  
*Ambition:* Session-as-code; codify best practices by capturing harness *state itself*.  
*Chambers:* Cairn, Crucible, Alchemist, Forge  
*Data implication:* Session versioning, MCP tool dependency resolution, semantic diffing of Cairn ledgers.

---

**Older learnings archived to history-archive.md**
📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe


## Learnings (2026-06-05 — M8 Slice B cycle-2 persona-review fixes)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 730327f (helper extract), 8bb739f (I2/M1/M6), a1002d4 (M2), cd82681 (I1), b9404e7 (I5/M4/M5)

**Helper extraction was right.** Moving `runTrustUpdaterContract` into a `.ts` (non-`.test.ts`) helper file resolves the vitest double-registration problem cleanly AND makes the helper importable without triggering test execution. The naming convention `*.contract.helper.ts` is now the pattern for all future exported contract helpers in this package.

**Async harness future-proofing costs almost nothing.** Making `getTrust` return `number | undefined | Promise<number | undefined>` and awaiting it in tests adds one `await` per assertion. The cost is negligible; the payoff is that future I/O-backed harnesses (e.g., a remote DB or async file I/O) can implement `getTrust` asynchronously without changing the test code. Same for `makeHarness: () => ... | Promise<...>` and `cleanup: () => void | Promise<void>`.

**`.bind(harness)` was gratuitous.** The InMemory harness methods don't use `this` at all (they close over `store` and `locks`). The SQLite harness methods also don't use `this` (they close over `db`/statements). Plain assignment is correct and matches FactReader precedent.

**Named params ($name) enforce a style contract.** The SqliteFactReader (Slice A) already used `$fact_id` / `$session_id` with object-form `.get({ ... })`. Keeping SqliteTrustUpdater on positional `?` params was a style divergence that would silently invite parameter-order bugs as SQL evolves. The persona caught it correctly.

**C-3b (out-of-range) is a materially distinct invariant.** C-3 covers NaN (non-finite); C-3b covers finite-but-out-of-range (1.5, -0.1). These exercise different branches of the validation check (`!Number.isFinite(newTrust)` vs the `< 0 || > 1` guard). A single parameterized test over `[NaN, 1.5, -0.1]` would have worked too, but the current C-3 + C-3b split is clear and avoids a for-loop test that hides which case failed on first failure.

**WAL + busy_timeout are implicit contracts on `SqliteTrustUpdater` constructors.** The class doesn't set these itself — it inherits them from the injected `db` handle. Without documenting this, a future consumer who passes a raw `new Database(path)` handle would get subtly broken concurrency behaviour (SQLITE_BUSY failures instead of retries). The pragma assumption section in JSDoc is the right place to make this explicit.


## Learnings (2026-06-05 — M8 Slice B cycle-3 polish + Slice A retrofit)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af8b596 (N1+N2), 8f48e2f (N3+N4), 1cec460 (N5)

**`it.each` is the correct tool for boundary parameterization.** A `for` loop inside `it()` masks first-failure: if `1.5` fails, `-0.1` never runs. `it.each([1.5, -0.1])` creates two independent test cases so each bound is independently reported. The pattern applies to any test that checks multiple values of the same invariant — particularly validation boundaries. Count impact: +2 tests per wiring × 2 wirings = +4 total (95 → 97 after Commit 1 in this cycle, then 97 steady through cycles 2 and 3).

**The `*.contract.helper.ts` naming convention is now load-bearing for Slice C.** Both `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts` follow the same non-`.test.ts` pattern. Slice C's `runFactStoreContract` should land in `fact-store-contract.helper.ts`. The SKILL forward-pointer (N5) documents this explicitly so the Slice C author doesn't have to re-derive it.

**Slice A retrofit was low-risk but high-value.** The FactReader contract file had been stable since Slice A merged (~5 days), making the diff visible and reviewable. The actual change was small (extract helper + wiring-only test file + typed prepare), but it brings both contract suites to the same structural pattern before Slice C inherits them. Retrofitting AFTER Slice C would be harder (more files to touch, possibly conflicting edits). The lesson: harmonize sibling patterns at end-of-slice, not end-of-milestone.

**`ReturnType<Database.Database['prepare']>` is the wrong field type for typed statements.** The broad type forces a runtime `as FactRow | undefined` cast on every `.get()` call. `db.prepare<BP, R>()` returns `Database.Statement<BP, R>` where `.get()` is typed as `R | undefined`. Using the typed generic form eliminates the cast, narrows errors at compile time, and documents the expected bind-parameter shape at the call site. This is the pattern SqliteTrustUpdater already used; the Slice A retrofit applied it retroactively to SqliteFactReader. Future SQLite implementations (SqliteFactStore) should use typed generics from the start.


## Learnings (2026-06-05 — M8 Slice B cloud review cycle 1)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 0cdf205 (T1+T2), 418c146 (T3), 2ab52f3 (T4), 4ffdb73 (T5)

**Docstring counts go stale when test-generation changes.** The `it.each` conversion in cycle-2 changed C-3b from 1 test to 2 per wiring, but the JSDoc on `runTrustUpdaterContract` (and the SKILL reference) still said 8. Copilot's review caught it. Fix: update docstrings in the same commit that changes the test structure, not after. The count is part of the contract surface — if it's wrong, it misleads the next person wiring a new impl.

**The N2 comment pattern was TrustUpdater-specific.** The "InMemory impl lives inline here, test-only" comment is correct for TrustUpdater (the impl is literally defined in the wiring file, not imported). It's wrong for FactReader (which imports `InMemoryFactReader` from a production module). Copying patterns across similar-looking files without checking whether the premise still holds is how stale comments happen. Read before copy.

**Append-not-rewrite is the right policy for decision logs.** The tombstone decision (Decision 2 in decisions.md) described a choice that was later reversed. Editing the original entry would erase the context for WHY we initially tombstoned (vitest 3.x no-empty-file requirement). The append-update preserves both the original reasoning and the reversal rationale. Future readers can follow the full arc. Applied this consistently.

**CRLF in non-code files happens silently.** Rosella's history.md had 7 carriage-returns (CRLF sequences at 3 line endings). These come from editors or CI runners that don't respect `.gitattributes`. The fix is `ReadAllText / -replace / WriteAllText` in PowerShell — more reliable than `sed` on Windows. The git warning "LF will be replaced by CRLF" on commit is a `.gitattributes` artifact (text=auto); the file was cleanly committed as LF.


## Learnings (2026-06-05 — M8 Slice B cloud review cycle 2)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af390ba (T6), ccdf994 (T7)

**`UTF8Encoding(false)` is the correct PowerShell pattern for BOM-free writes.** `[System.IO.File]::WriteAllText(path, content)` uses the system default encoding (BOM on Windows). `[System.Text.Encoding]::UTF8` and `[System.Text.UTF8Encoding]::new($true)` both include BOM. Only `[System.Text.UTF8Encoding]::new($false)` suppresses it. When fixing encoding issues in non-code files, always write explicitly with `UTF8Encoding($false)` to avoid the T3 → T6 two-step. The lesson is to use it the first time rather than discovering the BOM in a follow-up review.

**3. Mirror scope creep.** Resolved — Mirror = derived view over (proposal queue ∪ ledger tail ∪ capture metadata). I stop listing it as a chamber in any of my stories.

**4. Heavyweight ops vs solo user.** Strip federation, legal hold, multi-tenant export, MCP federation, GitHub webhooks-as-infra from v1. **Keep** snapshot/compaction/capture/branching/integrity-hash — those aren't "ops," they're load-bearing for the agentic-debugger vision and they're cheaper to build now than to retrofit.

**5. Crucible vs Copilot CLI parent-child.** Crucible spawns Copilot CLI as a sub-agent; sub-agent IO must flow through the observation-capture store or replay/branching breaks at the agent boundary. This is non-negotiable from the data lens — an un-captured sub-call is a non-deterministic hole in every downstream fork.

**NEW Tension 6 — Capture cost vs throughput vs privacy.** Observation capture multiplies write volume and will eventually capture secrets (env vars, API keys in tool args). Need: (a) capture compression + dedup (content-addressing already gives us this), (b) a redaction ProposalGenerator that runs *before* commit, (c) a clear policy on whether replay across a key rotation is allowed. Flagging now so it's not a Phase-5 surprise.

### Section 4 — Cross-references

1. **Erasmus US-E-1 (Ledger Bisect) + my US-R-4 (Drift Detection)** → same engine. Bisect is "binary search over snapshots for the first bad Decision"; drift is "rolling-window anomaly over the same snapshot index." Build the snapshot index once (Ro-NEW-1) and both fall out. **Strengthens both.**
2. **Aaron Insight #1 (branching first-class) + Graham US-G-7 + Alexander US-A-3 + Valanice US-V-1 + Gabriel US-5 + Erasmus US-E-2 + my US-R-3** → six lenses converging on the same primitive. This is the consensus headline. Roger owns the substrate; others own surfaces.
3. **Erasmus US-E-7 (model-swap replay)** → **invalidates** any approach where model identity isn't in the observation-capture key. Forces my capture-store schema to include `(provider, model, version, sampling_params)` in the call hash. Good catch — would have been a v1 bug.
4. **Laura US-L-7 (lazy outcome finalization)** → strengthens Ro-NEW-1: snapshots must be append-extensible (outcomes arrive later and attach to past Decisions). Means snapshot = "ledger prefix + late-binding outcome side-table," not a frozen blob.
5. **Rosella US-Ro-5 (Alchemist skill evolution)** → demands the same fitness/outcome substrate Laura needs and the same branching substrate R-3 provides. If we don't build branching + capture, *neither* Alchemist nor Laura's eval loop is honest — they'd be measuring against non-replayable runs. **Strengthens Ro-NEW-2 doubly.**

— Roger



## 2026-05-24 Round 3: Read-set verdict (Sonny US-S-3)

# Roger — Verdict on Sonny US-S-3 (causal read-set on L1 append)

**Date:** 2026-05-24T22:33Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Whether the L1 append-record contract (v1 commitment #8) must carry a `causalReadSet` for every primitive write, as Sonny argues in US-S-3.
**Verdict (TL;DR):** **LOCK — with surgical split on population.**

I read Sonny's nine stories. US-S-3 is the one that actually touches my floor, so I'll only answer for that. Not re-litigating L1-vs-L2 or the 4-layer stack.

---


## 1. Is retrofit structurally impossible later?

Mostly yes. Two paths to retrofit and both are bad:

- **(a) Replay-and-instrument.** Re-run every historical session under a wrapper that records what each generator consulted. Requires hermetic replay to be 100% deterministic in practice (it won't be — plugin code drifts, model versions retire, content-addressed blobs may be GC'd before we ever ask the question). And it costs N× compute per "why?" query. Theoretically possible, operationally a tax we'd pay forever.
- **(b) Forked storage format.** Pre-v2 ledgers permanently lack causal slicing; v2 ledgers have it. We'd ship a debugger that quietly degrades on old sessions, which is exactly the trust-eroding lying-debugger UX Sonny rails against in US-S-5.

The forward-compatible "capture in a derived L2 projection instead" path that I went looking for **does not exist for the data Sonny actually wants**. L2 can derive structure *from what L1 recorded*; it can't synthesize edges L1 never wrote. The read-set is a property of the *write*, not of the ledger prefix.

So Sonny is right on the retrofit point. Not religiously — operationally.


## 2. What "read-set" means for the 5 primitives

There is one coherent **schema** and five primitive-specific **population rules**:

| Primitive | What the read-set captures | Source in v1 |
|---|---|---|
| **Request** | Parent Decision/Question that triggered it; prior Observations the planner saw; system-context refs | Best-effort (planner emits) |
| **Artifact** | Source primitives consulted (prior Artifacts, Observations); plugin version refs | Best-effort (generator emits) |
| **Observation** | The external-IO capture key `(call_hash, inputs_hash)`; pinned plugin version | **Already captured** by Ro-NEW-2 capture store — zero new work |
| **Decision** | Proposal IDs considered; projection refs consulted; prior Decisions cited | **Required** — Decisions are the bisect/branch anchors |
| **Question** | The trigger Decision or halt condition; minimal | Best-effort |

Common shape — typed list of `(kind, target_id, target_hash, role)` tuples. Different *who-populates-what* per primitive. One schema, primitive-specific completeness rules.


## 3. Cost analysis (I own the WAL group-commit path)

Sonny says "cheap now." I verified. He's right, given one structural choice:

**Per-append cost if the read-set is inlined in the WAL row:** ~200–800 bytes for a typical 5–20 entry set. Blows my ≤256-byte typical-row budget by 2–3×. Bad.

**Per-append cost if the read-set body is spilled to the CAS blob store and the WAL row carries only a 32-byte Merkle root:** **+32 bytes per WAL row, zero added fsync latency** (the blob write rides the same batched fsync window, no extra round-trip). Fan-out: read-set bodies are content-addressed and intern naturally — a parent Decision referenced by 200 children stores its hash 200 times in WAL rows but the *body* mentioning it dedupes in CAS.

Net verdict: with the spill design, cost is **+32 bytes/row, latency-neutral, dedup-friendly**. Cheap is correct. Inlined would be a non-starter; spilled is free.

This is the same pattern I already committed to for large payloads in my round-2 deliberation (commitment #8 sub-point 1). Read-sets are just another spilled field on the same path.


## 4. Compatibility with commitments #6 (snapshot+compaction) and #2 (hermetic replay)

- **Snapshot + compaction (#6):** No conflict. Snapshots are Merkle-rooted over WAL rows; read-set hashes are WAL row fields, so they're already in the root. Compaction folds the hash into columnar storage like any other field. Bonus: causal queries (`why?`, `who-cited-this?`) become indexable columnar scans, which is exactly the shape Cairn-bisect (US-S-6) and drift detection (US-R-4) want.
- **Hermetic replay (#2):** Subtle but clean. The read-set is an **output** of generation, not a replay input. Replay re-feeds Observations deterministically; the generator re-derives its read-set on re-execution. So replay does **not** re-feed read-sets — but the determinism conformance suite (commitment #4) gets a new assertion: *re-derived read-set must match recorded read-set*. That's a free correctness check Laura will probably want.
- **One edge case worth naming:** if a read-set entry refers to an L2 projection value (per US-S-4 retroactive projections), the entry must carry the projection-**version** ID, not just the query result, or replay will assert against a moving target. Cheap to specify now.


## 5. The 8th proposal-schema field (`causalReadSet`) — Laura's field vs. my contract

**Same data, two capture points.** Not two concepts, one concept on a pipeline:

1. **L3 ProposalGenerator declares** `causalReadSet` in its proposal (Laura's schema field).
2. **L4 approval router validates** the declaration (do the referenced primitives exist? are projection-version IDs resolvable?). Validation is a precondition for approval; a malformed read-set is a rejected proposal, not a committed garbage row.
3. **L1 commits** the validated read-set into the WAL row alongside the primitive payload (my contract). Body spills to CAS; hash goes in the WAL row.

Integration argument: Laura's field is the **producer contract** ("generators must declare what they read"); my field is the **storage contract** ("committed rows must carry the declaration's hash"). They are the same bytes, captured once at L3, validated at L4, durably committed at L1. Anyone trying to make them diverge is wrong.

For primitives that don't flow through a generator (raw Observation writes from the capture store), L1 synthesizes the read-set directly from the capture row — same schema, different population site.


## 6. Verdict: **LOCK with surgical scope split**

### Lock now (v1):
- **Schema slot.** Every WAL row has a nullable `causal_read_set_hash: blake3?` field. Reserved, named, in the row layout.
- **Body format.** Versioned CAS blob, typed entry list as in §2. Frozen for v1.
- **Wiring.** L3 proposal schema carries `causalReadSet`; L4 validates it; L1 commits the hash. End-to-end path exists day one.

### Split on population (v1 → v2):
- **REQUIRED + populated in v1:** Observation (free — already in capture store), Decision (the bisect/branch/why? targets).
- **BEST-EFFORT in v1, REQUIRED in v2:** Request, Artifact, Question. Slot exists, format is canonical, generators populate when they can. L1 accepts `NULL` without complaint in v1 and rejects `NULL` in v2.
- **`cairn fsck` (Ro-NEW-3) gains a new check:** report read-set completeness per primitive kind. Migration to v2 is "raise the bar from warn to error per kind" — no ledger rewrite, no schema migration, just a config flip.

### Why split rather than full-lock or full-defer:

- Sonny's load-bearing concern is **"structurally impossible to retrofit."** The schema slot, format, and wiring address that fully. Once the slot exists and the bytes are addressable, "fill it in for kind X" is a generator-side change, not a ledger rewrite.
- Full-lock-all-kinds-populated would block v1 on every generator implementing exhaustive read-set tracking, which is real work and adds bug surface across L3 right when L3 is still settling. We'd ship late for a property we can adopt incrementally.
- Full-defer is the failure mode Sonny correctly identifies — the slot never gets added, the contract calcifies without it, and v2 is a fork.

### Append-record schema, v1 (revised):

```
WalRecord {
  seq:                  u64,
  ts_ns:                u64,
  parent_seq:           u64,
  primitive_kind:       u8,        // Request|Artifact|Observation|Decision|Question
  primitive_id:         ULID,
  payload_hash:         blake3,    // body in CAS
  causal_read_set_hash: blake3?,   // NEW — body in CAS, schema below
  proposal_id:          ULID?,     // L3 proposal that produced this (if any)
  approval_id:          ULID?,     // L4 verdict (if any)
  prev_root:            blake3,    // chain
}

ReadSetBody (CAS blob, content-addressed, v1):
{
  version: 1,
  entries: [
    {
      kind:        PrimRef | ProjectionRef | ObservationRef | PluginRef,
      target_id:   ULID | ProjectionVersionId | CaptureKey | PluginVersionId,
      target_hash: blake3,
      role:        Input | Context | Trigger | Constraint
    },
    ...
  ]
}
```

Row-cost delta: **+32 bytes/row** when populated, **0 bytes** when NULL (use an optional/varlen encoding so unpopulated kinds don't pay). Fsync neutral. Compaction-friendly (single columnar field, hash-typed, intern-friendly). Snapshot-Merkle-compatible (it's just another row field).

### What I need from the team to land this:
- **Laura:** add `causalReadSet?: ReadSetEntry[]` to the proposal schema; required for Observation/Decision proposals, optional for the other three in v1. The entry shape above is the canonical form.
- **Stelios (L2):** projection identity must include a stable **version** ID so a `ProjectionRef` entry survives projection-definition edits. Already a US-S-2/US-S-4 ask; this just makes it load-bearing.
- **Alexander (L4):** approval validation step rejects proposals whose declared read-set references unknown/unresolvable IDs. Small extension to the pre-commit hook he already needs for US-S-1 (predicate-eval breakpoints).
- **Erasmus:** add a determinism-suite assertion: re-derived read-set on replay must equal recorded read-set for primitive kinds where it's populated. Free correctness signal.

I'll own the WAL row layout, the CAS spill path, and the `cairn fsck` read-set-completeness check. None of this changes my round-2 commitments on snapshot cadence or compaction; it just adds one nullable hash column and one CAS blob kind.

---


## Plain-text summary for the coordinator

**Verdict: LOCK, with a surgical split on population.**

Sonny is right that the read-set is structurally impossible to retrofit cleanly — the only retrofit paths are replay-and-instrument (forever-tax on compute and on perfect determinism) or a forked v2 storage format (silently-degraded debugger on old ledgers). He's also right that it's cheap now: with the body spilled to the content-addressed blob store and only a 32-byte hash in the WAL row, the per-append cost is +32 bytes and zero added fsync latency. Lock the schema slot, the body format, and the L3→L4→L1 wiring in v1; require population for Observation (already free via Ro-NEW-2 capture) and Decision (the bisect/why? anchors); leave Request/Artifact/Question as best-effort in v1 and promote to required in v2 via a `cairn fsck` config flip — no ledger rewrite. The proposal-schema field Laura owns and the append-contract field I own are the **same bytes** captured at different points on one pipeline; L3 declares, L4 validates, L1 commits the hash. Endorsed.


## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.


## 2026-05-24 Round 3 (continued): Pre-commit hook bus — L1 verdict

# Roger — Verdict on Alexander's pre-commit hook bus (re US-S-1 / US-S-4 / US-S-9)

**Date:** 2026-05-24T23:00Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Where the shared pre-commit hook bus sits relative to WAL group-commit, what pause does to a batch, whether the verdict is recorded, predicate cost on the hot path, interaction with `causal_read_set_hash`.
**Verdict (TL;DR):** **ENDORSE with refinements.** The bus belongs *inside* the group-commit window but *outside* the fsync barrier, runs per-row over the staged batch, and is itself a recorded WAL field. Predicates must be pre-registered/compiled. Read-set predicates are fine — and actually the killer feature.

The read-set verdict from earlier today is locked, not re-opened. This is only about the hook bus and how it touches my floor.

---


## 1. Where the bus sits relative to group-commit

There are four candidate insertion points. Three of them are wrong. Walking through them so the choice is on the record:

| Option | What it means | Verdict |
|---|---|---|
| (a) Before the row is staged into the batch | L3 emits → bus runs → row joins batch or doesn't | **Wrong.** Predicates can't see batch siblings or the committed read-set; pause loses ordering with concurrent emitters. |
| (b) Per-row, *inside* the batch staging loop, *before* the fsync barrier | Each candidate row is appended to the in-memory batch, hook bus evaluates against the row + its `causal_read_set_hash`, verdict is recorded on the row, then we either fsync or split | **Right.** This is what I'm endorsing. |
| (c) Once per batch, after staging, before fsync | One bus call sees the whole batch | **Wrong.** Pause semantics get fuzzy ("which row paused us?"), and predicate authors lose per-row identity. |
| (d) After fsync, before ack | Bus runs on durable rows | **Wrong.** Pause-after-durable is not a pre-commit hook, it's a post-commit notifier. Different primitive. Useful, but not what Alexander asked for. |

**The contract: option (b), per-row, pre-fsync, inside the group-commit window.**

Concretely the group-commit path becomes:

```
for row in candidate_batch:
    row.causal_read_set_hash = compute_read_set(row)    # already locked
    verdict = hook_bus.evaluate(row, read_set_view)     # NEW
    row.hook_verdict = verdict                          # recorded on the row
    if verdict == pause:
        seal_batch_through(row.seq)                     # see §2
        break
fsync(sealed_batch)
ack(sealed_batch)
if paused: hand control to L4 router
```

**Throughput claim.** Group-commit throughput is dominated by fsync, not by the per-row in-memory work. The bus runs in the same memory window where I'm already computing read-set hashes and chaining `prev_root`. Adding a dispatch per row, with predicates indexed by `primitive_kind` so non-matching kinds cost one hashmap lookup, is **noise on the fsync-bound path**. I am not giving up throughput for this, provided §4 holds.

What I am **not** doing is serializing the bus across batches. Multiple writers stage into multiple batches concurrently today; the bus is per-batch-local because predicates only see the row + its read-set view, not other in-flight batches. Cross-batch invariants are not the bus's job — that's L4 / L2.

---


## 2. Pause mid-batch — the transactional contract (owns commitment #8)

The scenario: 100-row batch, row 5 trips a `pause` verdict. Three plausible behaviors, only one of which doesn't lie:

- **Roll back rows 1–5.** Nope. Rows 1–4 already passed their verdicts (`continue` or `observe`). Rolling them back means a `continue` verdict didn't actually mean continue. That breaks predicate-author trust forever. Also breaks Sonny's US-S-4 logpoints — they fire on `observe`, expecting durability.
- **Commit through row 5, then pause.** Yes. This is the contract.
- **Commit the whole batch, then pause.** No. Defeats the purpose; rows 6–100 would commit despite a known pause condition having fired upstream of them.

**Contract: seal-and-split.**

1. When a row's verdict is `pause`, the batch is **sealed through that row inclusive**. Rows 1..N (where N is the pausing row) fsync as a normal group-commit batch. They are durable. Their acks fire.
2. Rows N+1..end of the candidate batch are **returned to the staging queue**, not dropped. They will be re-evaluated by the bus in the *next* batch (their read-sets may have changed because row N is now committed; predicates may verdict differently). Replay sees them in their eventual-commit order, not the original-staging order — and that's fine, because replay deterministically follows recorded `seq`.
3. The pausing row's `hook_verdict = pause` is durable in the WAL before L4 is invoked. L4 cannot be asked to make a decision about a row that isn't on disk yet. This matters for crash safety: if Crucible dies between L1 ack and L4 invocation, recovery sees a paused row with no L4 verdict and re-enqueues it for L4. No double-decision, no lost pause.
4. L4's eventual verdict (per Alexander's extensible enum, per US-S-9) is recorded as a **subsequent WAL row** referencing the paused row's `seq`. Same pattern as approval today, just with the pause anchor durable first.

This costs throughput on pause (one extra fsync barrier per pause, by definition). It does not cost throughput on `continue` or `observe`, which is the 99.9% case. Pause is the slow path on purpose — that's what "stop and ask the human" means.

**Edge case worth naming:** two rows in the same batch both verdict `pause`. The first one wins; the batch seals through it; the second goes back to the queue and re-pauses next batch. No "batch pause set" — one pause per commit cycle keeps L4's mental model honest.

---


## 3. Recording the verdict — yes, in the WAL row

If the verdict isn't durable, hermetic replay can't reproduce pause behavior, and the post-mortem investigator REPL (Sonny's US-S-5) lies. Both are non-negotiable. So the verdict goes in the WAL row.

**Schema slot — extend the row, do not sidecar.** Two new fields on `WalRecord`:

```
WalRecord {
  ...                                          // as locked in read-set verdict
  causal_read_set_hash:   blake3?,             // already locked
  hook_verdict:           u8?,                 // NEW: 0=continue, 1=observe, 2=pause; NULL if no predicate matched
  hook_verdict_witness:   blake3?,             // NEW: CAS hash of {predicate_ids_fired, predicate_outputs}; NULL if verdict=continue
  ...
}
```

Cost: **+1 byte for the verdict tag, +32 bytes when a non-continue verdict fires**, zero when no predicate matched (same optional encoding as `causal_read_set_hash`). The witness body in CAS lets US-S-5 reconstruct *why* the verdict fired without bloating WAL rows. Verdict-only-no-witness is invalid; either both NULL or both populated.

**Sidecar log was tempting, rejected.** A separate log of "pauses that happened" would force replay to join two streams in `seq` order, and `cairn fsck` would have to cross-check them. One row, two columns is simpler and snapshot-Merkle-clean (both fields are already row fields, so they're in the root for free).

**`cairn fsck` gains a check (extension of Ro-NEW-3):** for every row with `hook_verdict != continue`, the witness blob must resolve in CAS, and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC and registry-drift bugs.

---


## 4. Predicate cost — the hot-path SLA

Alexander flagged this and he's right to. My append SLA is unchanged from round 2: **p99 commit-to-ack ≤ 5ms at 10k writes/sec sustained, p99 row-stage cost ≤ 80µs in-memory.** The bus has to fit inside the 80µs in-memory budget.

**The break-point.** A naive interpreted match-spec predicate (ETS-style `{'==', '$1', secret}` interpreted recursively) costs ~5–20µs depending on read-set size. Ten such predicates registered against the same primitive_kind = 50–200µs. **That breaks the SLA at ~5 simultaneously-registered interpreted predicates on a hot kind.** Not acceptable.

**Required mitigation — pre-registration with compilation:**

1. **Register, don't pass.** Predicates are registered with L1's hook bus by ID, returning a handle. You cannot pass a fresh AST per commit. This is non-negotiable for the hot path. (It also fits Alexander's "predicate lifecycle across forks" point — handles have explicit lifetimes.)
2. **Compile at registration time.** Registration runs the predicate AST through a compiler that emits either (a) a native function pointer (for shapes we recognize: equality on field, range on field, set membership on field) or (b) a bytecode interpreter as fallback. Sonny's match-spec subset must be expressive enough to compile to (a) for the common cases; otherwise we fall back to (b) and the predicate author gets a soft warning that they're on the slow path.
3. **Index by primitive_kind.** Predicates declare which kinds they care about at registration. Rows of unmatched kinds cost one hashmap lookup and a no-op return. This is Alexander's point #1 from his "anything you missed" and I am taking it as load-bearing.
4. **Cache against read-set hash.** If the same predicate fires twice against rows with identical `(primitive_kind, causal_read_set_hash, key_fields_hash)`, the verdict is memoized for that batch. Stelios's Salsa engine in L2 can extend this across batches if it wants; I'm not promising cross-batch cache from L1.

**SLA-safe envelope with mitigations in place:** up to ~50 registered predicates per primitive_kind, compiled, with read-set ≤ 32 entries, stays inside 80µs. Beyond that, registration starts soft-failing with an SLA-budget warning. This is a knob, not a wall — but it's a knob the runtime owns, not predicate authors.

**Where it irrevocably breaks:** Turing-complete predicates. If someone tries to register a predicate that calls back into L2 to evaluate a projection, that projection might be invalidated, recompute on the fly, and the commit path now waits on Stelios's engine. **No.** Predicates may *reference* projection-version IDs (those are stable hashes) but may not *call* projections at evaluate time. If you need projection state, snapshot it into the predicate's closure at registration and re-register when the projection-version ID changes. Same discipline as US-S-4 retroactive projections.

---


## 5. Interaction with `causal_read_set_hash` — yes, this is the feature

Both run pre-commit. Both are computed on the same row in the same window. The bus must see the read-set; that's most of the value.

**Contract: the bus receives `(row, read_set_view)` where `read_set_view` is a typed reader over the row's freshly-computed read-set entries** (not the hash — the *resolved* entries, because predicates need to ask questions like "did this Decision read any Observation tagged secret"). The read-set is computed *before* the bus is called; the bus is called *before* the hash is sealed into the row; predicates may read the entries but may not mutate them.

**Yes, predicates can be on read-set contents.** This is exactly Sonny's US-S-1 "pause if this Decision read any Observation tagged secret" example, and it falls out for free from this ordering. Example shapes I'm committing to support:

- `read_set.any(kind=ObservationRef, where=target.tags ∋ 'secret')` — set/tag membership over read-set entries.
- `read_set.contains(role=Trigger, target_id=$known_id)` — direct lookup.
- `read_set.count(kind=PrimRef) > N` — cardinality.
- `read_set.entries[*].target_hash ∈ $watch_set` — hash-set membership against a registered watch list.

**What I'm NOT supporting in v1:** transitive queries ("did anything in my read-set transitively read X"). That requires walking the causal DAG, which is L2's job, not the hot-path bus. If you want that, materialize it as a projection and reference the projection-version ID in your predicate at registration time. Same discipline as §4.

**This integration makes the bus strictly more valuable than the read-set alone**, because the bus is where read-set policy becomes *enforceable* rather than merely *recorded*. Tag-leak prevention, secret-egress detection, citation-required policies — all expressible as bus predicates against read-set entries. That's not a bonus; that's why the two features should be designed together.

---


## 6. Verdict: **ENDORSE with refinements**

Alexander's split (one shared pre-commit bus, three verdict outcomes, pause unified through L4) is correct. The refinements I'm imposing are:

### L1-side contract (locked):

**Ordering & throughput:**
- Bus runs **per-row, inside the group-commit window, before the fsync barrier**, after the row's `causal_read_set_hash` is computed but before the row is sealed.
- Bus is **not** serialized across concurrent batches.
- `continue` is the zero-cost default; matched-kind dispatch costs ~1µs; compiled predicate eval costs ≤ 80µs total per row under stated envelope.

**Pause transaction (commitment #8 extension):**
- On `pause` verdict, batch **seals through the pausing row inclusive**, fsyncs, acks. Remainder of batch returns to staging queue for re-evaluation in the next batch.
- Pausing row's `hook_verdict = pause` is **durable before L4 is invoked**. Crash recovery re-enqueues paused rows with no L4 verdict to the router. No double-decision.
- L4's eventual verdict (extensible enum per US-S-9) commits as a **subsequent WAL row** referencing the paused row's `seq`.
- One pause per commit cycle; second pause in same candidate batch goes to next batch.

**Recording (commitment #8 extension):**
- Two new nullable fields on `WalRecord`: `hook_verdict: u8?` (0=continue, 1=observe, 2=pause) and `hook_verdict_witness: blake3?` (CAS body: `{predicate_ids_fired, predicate_outputs}`).
- Either both NULL (no predicate matched) or both populated. `continue` verdicts with witnesses are valid (useful for "yes this predicate ran and said continue" audit trails) but optional — registrants choose at registration time whether to witness `continue`.
- Per-row cost: +1 byte tag always, +32 bytes when verdict ≠ continue OR witness requested. Zero when no predicate matched.


## Learnings (2026-06-02 — M8 Slice A: SqliteFactReader + Eureka migrations bootstrap)

**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** M8 Slice A (graham-m8-scope-proposal.md approved, Q1/Q2/Q3 locked by Aaron)

**What shipped:**
- `packages/eureka/src/db/`: `schema.ts` (applyMigrations verbatim on Cairn pattern), `migrations/001-facts.ts` (facts + FTS5 + triggers + trust_history scaffold), `openDatabase.ts`, `index.ts` barrel.
- `packages/eureka/src/storage/fact-reader-sqlite.ts`: SqliteFactReader implementing FactReader; db handle injected per Cairn convention.
- `packages/eureka/src/storage/index.ts`: storage barrel (InMemoryFactReader + SqliteFactReader re-exported).
- Contract wiring: `runFactReaderContract('SqliteFactReader', makeHarness)` at end of fact-reader.contract.test.ts; +5 contract tests.
- Test count: 74 → 79 (+5). All 79 pass. No regressions in cairn/forge/skillsmith-runtime.

**NaN decision:** trust column is NULLABLE (not `NOT NULL`) despite Graham's sketch showing `REAL NOT NULL DEFAULT 0.5`. CL-4 requires {trust: NaN} round-trip. SQLite has no NaN literal; `NOT NULL` coerces NaN to 0.0 at INSERT. Nullable column + JS-layer `NULL ↔ NaN` is the only compliant path. Schema deviation documented in roger-m8-slice-a.md decision drop.

**DB path:** `~/.eureka/eureka.db` per Aaron Q3 approval. `openDatabase` uses `os.homedir()`.

**Cairn DB-layer helper convention confirmed:** constructor takes `db: Database.Database` (caller-injected); `openDatabase` creates and migrates; SqliteFactReader never opens or closes the handle.

**Better-sqlite3 named params:** `Statement.get()` TypeScript types give "expected 1 argument" when passing two positional `?` values even though the runtime accepts them. Use `$name` named parameters and pass an object — single-argument signature, same runtime behavior. Adopted throughout.

**trust_history table:** scaffolded in migration 001 per Aaron Q1 approval; no writes in Slice A. Slice B will add the mutate writes.

**Predicate registration (new L1 ABI):**
- Predicates are **registered by ID**, not passed per-row. Registration returns a handle with explicit lifetime (per Alexander's fork-isolation point: child-fork registrations do not back-propagate to parent).
- Registration **compiles** predicates to native ops where possible, bytecode fallback otherwise.
- Registration **indexes by `primitive_kind`** for O(1) dispatch on non-matching kinds.
- Predicates **may read** the row's resolved read-set entries; **may not call** L2 projections at evaluate time (snapshot projection-version IDs at registration instead).
- SLA envelope: ≤ ~50 compiled predicates per primitive_kind, read-set ≤ 32 entries, stays inside 80µs per row.

**Read-set integration:**
- Bus receives `(row, read_set_view)`; read-set entries are evaluated before bus runs, hash is sealed after.
- Predicates on read-set contents (set/tag/role/cardinality/hash-set) are first-class in v1.
- Transitive read-set queries are **out of scope for the hot-path bus** — materialize as a projection if needed.

**`cairn fsck` extension:**
- For every row with non-NULL verdict witness, the CAS witness blob must resolve and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC, registry drift, and re-registration races.

### What I need from the team to land this:

- **Alexander:** the predicate registration ABI (signatures, handle lifecycle, compile target) is yours to define; I'll implement the L1-side dispatch and the recording. Confirm fork-isolation lifecycle matches your "anything you missed" point #2.
- **Sonny:** US-S-1 match-spec subset has to be expressive enough that "common case" predicates compile to native ops rather than fallback bytecode. Worth a focused conversation on the subset shape before freeze.
- **Stelios:** projection-version IDs must be **stable hashes** that predicates can snapshot at registration time. Restating the US-S-2/US-S-4 ask; this just makes it load-bearing for the bus.
- **Laura:** when L3 generators want bus-enforceable read-set policy (tag predicates, citation requirements), the predicate registration site is L4 startup, not the proposal schema. The proposal schema field stays as-is; policy is a separate registration.
- **Erasmus:** determinism conformance suite needs one more assertion — *re-evaluated hook_verdict on replay must equal recorded hook_verdict*. Same shape as the read-set assertion. Free correctness signal.

None of this changes my round-2 commitments on snapshot cadence, compaction, or CAS spill. It adds two nullable row fields, one CAS blob kind, one ABI for predicate registration, and one new `cairn fsck` check.

The bus is endorsed. The pause path is unified through L4 per US-S-9. The observe path is unified through L2. Pre-commit hook bus is the substrate — and as a side benefit, putting it on the same row that carries the read-set hash makes the substrate genuinely composable rather than three independent mechanisms pretending to cooperate.

If it compiles and fsyncs cleanly, that's a win.

---


## Plain-text summary for the coordinator

**Verdict: ENDORSE with refinements.** The pre-commit hook bus belongs *per-row, inside the group-commit window, before the fsync barrier* — after `causal_read_set_hash` is computed, before the row is sealed. Pause mid-batch is handled by **seal-and-split**: the batch fsyncs through the pausing row inclusive (so already-verdicted rows stay durable), the pausing row's `hook_verdict=pause` is on disk *before* L4 is invoked (crash-safe), and the remainder of the batch returns to staging. The verdict is recorded in the WAL row via two new nullable fields (`hook_verdict: u8?`, `hook_verdict_witness: blake3?`) — costs +1 byte always, +32 bytes only when a non-continue verdict fires; replay re-derives and asserts equality. Predicate cost stays inside my 80µs row-stage budget **only with pre-registration + compilation + kind-indexed dispatch + no L2 callbacks at evaluate time**; this is a hard ABI requirement, not a recommendation. Read-set predicates ("pause if this Decision read any Observation tagged secret") are first-class and arguably the killer feature — the bus is where read-set policy becomes *enforceable* rather than merely *recorded*, which makes the two features properly co-designed rather than coincidentally adjacent.



## 2026-05-24 Round 4: Phase B reconciliation against `D:\git\stunning-adventure`
Full audit inbox: `.squad/decisions/inbox/roger-reconciliation-2026-05-24T2330Z.md`.

**Headline:** Cairn already ships a working append log (SQLite `event_log`), a real 8-state proposal/approval lifecycle (`prescriptions` + `optimization_hints` with 8 statuses each, partial UNIQUE index dedup as built-in backpressure via migration 013), pluggable ProposalGenerators (Forge `promptOptimizer`/`tokenOptimizer` emitting `OptimizationHint`), a Merkle-like hash chain over Decision events (`dbom_artifacts`/`dbom_decisions` + `spike/dbom-generator.ts`), per-skill PGO-style derived rollups (`execution_profiles`), an outcome-learning loop (`change_vectors` Phase 4.6), drift signal substrate (`signal_samples` + `forge/telemetry/drift`), pre-persist secret redaction (`agents/secretScrubber.ts`), and a 5-vector x 3-tier validator surface (`skillLinter`/`skillValidator`) -- so US-R-4 and US-Ro-NEW-4 are essentially ALREADY-EXISTS and US-R-1/2/7/8/9 plus US-Ro-NEW-3 are PARTIALLY-EXISTS. What's pure greenfield: US-R-3 (fork/replay/branch metadata over ledger positions), US-R-5 (transitive provenance -- falls out of R-3), US-R-6 (federation), US-Ro-NEW-1 (snapshot+compaction), US-Ro-NEW-2 (observation capture/CAS), and both round-3 lock items (`causal_read_set_hash` on WAL rows; per-row pre-commit hook bus with 80us envelope). The last two also **CONTRADICT-EXISTING** because Cairn rides `better-sqlite3` (SQLite's built-in WAL journal-mode -- no app-exposed group-commit window, no per-row pre-fsync hook insertion point, no 80us-row-stage budget to honor). Migration path is friendly (linear, integer-versioned, transaction-wrapped, currently at v13): v14 introduces `wal_records` alongside legacy `event_log`, v15 stands up a CAS blob store, v16 snapshots+refs, v17 observation_capture, v18 tenant namespacing -- all additive.

**One load-bearing question for Aaron, not unilaterally resolved:** does Crucible v1 ride Cairn's SQLite store (in which case I re-baseline the round-3 WAL/hook-bus contract to transaction-batched semantics -- bus runs on an app-owned staging buffer before `db.transaction().immediate()`, same logical verdicts and seal-and-split, different physical layer) or stand up a custom storage engine (round-3 verdict stands as-locked, 80us/row envelope is achievable)? Flagging because it changes what `causal_read_set_hash` and `hook_verdict` cost to land. Full per-story classifications, evidence file:line cites, gap list of Cairn capabilities not yet storied, and the v14-v18 migration spec are in the inbox.

-- Roger



## 2026-05-25 Round 5: SPIKE fork (a) — port Cairn to a custom storage engine
Full spike inbox: .squad/decisions/inbox/roger-spike-fork-a-port-2026-05-25T0030Z.md.

**Executive summary.** Surveyed the existing Cairn SQLite surface (87 src files, 31 in db/, 13 linear migrations, 16 tables, 188 prepared/transaction call sites, 80 join/groupby query sites, 478-ish tests, one load-bearing partial UNIQUE index for backpressure, zero use of FTS/virtual-tables/triggers/UDFs/triggers — relational but shallow) and three engine candidates: A.1 pure-Rust redb via NAPI-RS (12-16 weeks, ~100% SQL-ergonomics loss, strongest correctness story, adds a Rust toolchain to a Node monorepo), A.2 Kris Zyp's lmdb Node binding with its beforeCommit hook (8-12 weeks, ~100% SQL loss, 80us-budget at risk under JS dispatch), and A.3 hybrid — custom append-only WAL file in pure TS for L1 only, keep better-sqlite3 for the other 15 tables and all derived views (5-9 weeks, ~5-10% SQL loss, forward-compatible migration). **Verdict: REJECT A.1, ENDORSE-WITH-CAVEATS A.3, A.2 only as fallback if the JS predicate budget fails in integration.** Phase A's hard contracts bind only L1; rewriting the other six tiers to honor a contract that does not bind them is over-correction. Anti-anchoring alternative reading: if Crucible is heading toward regulatory determinism, 10^9+ rows, or WASM-runtime distribution, A.1's "one substrate, contracts enforced by construction" wins despite the cost — I'd flip if any of those three become true. Tagged Alexander (fork (b) is a contract-amendment, not a contract-honor — sqlite3_update_hook fires post-write not pre-fsync) and Gabriel (fork (c) breaks causal_read_set_hash globality the moment you shard across multiple SQLite files — contract (4) needs amendment).

-- Roger



## Learnings (2026-05-28 — CTD Phase 1 Lane 1: §3 L1 WAL + §4 Hook Bus authored)

WAL design patterns and invariant-enforcement mechanisms locked in §3 + §4 that
I'll want when authoring §10 (Session Model) and §15 (Compaction/Snapshots) in
Phase 2:

- **One fsync per group-commit, CAS-before-WAL ordering.** The rule that lets
  the WAL row safely reference a `payloadHash`/`readSetHash`/
  `hookVerdictWitness`/`contextWindowCommitment` is that the CAS body is
  fsync'd *before* the WAL record is written. §15 compaction must preserve
  this ordering on snapshot-spill: snapshot blob durable in CAS before the
  snapshot pointer row lands in the WAL.

- **Self-audit by chain alone.** `prevRoot[i] = selfRoot[i-1]` plus per-row
  `selfRoot = BLAKE3(CBOR(row \ selfRoot))` plus a per-session
  `manifest.lastSelfRoot` makes `cairn fsck` a single linear scan with O(1)
  state. `index.idx` is advisory and rebuildable; never trust it for
  correctness, only for seek-speed. Carry this same discipline into §15 —
  snapshots are advisory acceleration, never authoritative.

- **Hybrid resolver as a named seam.** `ContextWindowResolver` honoring R2-1
  is a tiny pure function but giving it a name (instead of inlining the
  if-declared-else-prefix branch into `AppendProtocol.append`) makes the
  Bootstrap-Capture-Completeness violation path testable in isolation and
  keeps replay's reconstruction code symmetric with commit's hash code.
  Pattern: every "tagged hybrid" gets its own resolver seam, never inlined.

- **Verdicts as null vs continue.** `hookVerdict: HookVerdict | null` with
  `null` meaning "no predicate matched" and `continue` meaning "a predicate
  fired and said continue" is the cheapest way to preserve P5 (continue
  zero-cost) while keeping the closed-enum invariant (P3) honest. The
  binary layout encodes both as zero-witness; the bookkeeping distinguishes
  them only for replay determinism. §10 should not invent a third sentinel
  — null is the absence sentinel.

- **Exactly-once-pause via WAL-first durability.** Pause verdict durable on
  the WAL row *before* L1Subscriber broadcasts to the Router means a crash
  between seal and broadcast replays the broadcast from disk on next boot.
  The bus has no separate Router channel; the broadcast on the paused row
  *is* the Router's pause inbound. §10's session-reopen protocol must
  re-broadcast pending pause rows whose Router-ack Observation is missing.

- **Bootstrap atomicity = single group-commit.** §3.8 bootstrap-batch writes
  the entire `BootstrapPayload` as one atomic group-commit at offset 0. §10
  must never spread session bootstrap across multiple `append()` calls —


## Learnings (Slice D persona-review polish — 2026-06-06)

**JSDoc type positions should name types, not values.** When doc prose describes a return shape, use the declared type name (`ClockProvider`) not the module-private value (`systemClock`). Readers scan the JSDoc expecting types, not implementation identifiers.

**Tighten doc titles to the declared return type; call out structural compatibility separately.** A JSDoc title that says "ApplyFeedbackDeps / ApplyFeedbackByIdDeps" overpromises when the return type is `ApplyFeedbackDeps`. The correct pattern: title names the declared type, a one-liner notes structural satisfaction of related types. Keeps the contract honest without losing useful information.

**Reject exporting trivial private values when the public surface cost > benefit.** `systemClock` is `{ now: () => Date.now() }` — no unique behavior. Callers needing a custom clock supply their own `ClockProvider`. Exporting it for "observability" just anchors external code to an internal detail. The right call: reject.

**Reject guard clauses on stated preconditions unless the error UX materially improves.** The JSDoc already says `openDatabase()` is required. A runtime check adds complexity without meaningfully improving the failure signal (SQLite itself reports missing tables clearly). Over-engineering stated preconditions is noise.
  the all-or-nothing property is what lets replay refuse to advance past
  offset 0 on bootstrap-manifest mismatch (TDD §6.8).

- **Fork = sibling directory + synthetic offset-0 row + cross-session chain
  edge.** No CAS body copy; CAS dedup is implicit by hash. `cairn fsck
  --with-parent` is the cross-edge walker. §10's fork API surface should
  expose these as three orthogonal capabilities (create dir, emit
  fork_origin Observation, link prevRoot) rather than one opaque
  `fork(parent, offset)` call — composability over economy.

- **Monotonic timestamps are advisory; offsets are structural.** Replay
  equality excludes `timestampNs` via `normalizeTimestamps()`; the `+1`
  floor absorbs wall-clock regressions; violations are recorded as
  Observation rows, never suppressed. Any future invariant I add in §10/§15
  should follow the same pattern: distinguish advisory metadata (excluded
  from replay equality, recorded as observable rows on violation) from
  structural data (byte-compared in replay).

- **Seam map as deliverable.** §3.14's table mapping internals to test tier
  + Laura collaborator + test double class is the load-bearing artifact for
  London-school component testing. I'll replicate this in §10 and §15 —
  every public collaborator gets a row, every internal pure function gets a
  row, every file-backed integration gets a row.

- **Per-tool-call primitive scale is intra-batch.** §3.6 enforces "one
  primitive per (toolCallId, phase)" within a batch only; cross-batch
  pairing of `invoke` → closing Artifact is Aperture's job, not L1's. §10
  session-config carries the pairing-window deadline so different session
  types (debug, prod, replay) can tune it.
📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe


## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.


## 2026-05-30: Pass A CLI Edits — §13.1 verb registration + §9.9 coordination

**Context:** Picked up two owed Pass A triage items after session silence. Aaron requested CLI documentation edits: (1) register crucible perf [top] [--json] in §13.1 verb table, (2) coordinate crucible defer --help text with Valanice's parallel §9.9 edit.

**Decision 1: crucible perf Registration**
- **Choice:** Added as standalone verb (like status, fsck), NOT as saved query
- **Rationale:** §17 explicitly documents [top] sub-variant (dispatch-latency sort) which is verb-specific, not query-driven. Consistency with diagnostic-verb family. Verb placement: between status and config in §13.1
- **Placement:** §13.1 line 44 (new row between diagnostic verbs and config)

**Decision 2: defer Help Text Coordination**
- **Original:** "Local snooze; no L1 write (§9.9)."
- **Updated:** "Local snooze; no L1 write. Re-renders entry with \deferred\ annotation."
- **Rationale:** Embedded Valanice's expected substring from §9.9 line 318 ("no L1 write; re-renders entry with deferred annotation"). Removes redundant cross-ref; text is now self-contained for CLI --help stability.
- **Coordination:** Valanice now has locked help text to reference in §9.9 edits; no ping-pong on text consistency.

**Files modified:** docs/crucible-technical-design/13-crucible-cli-shell.md (§13.1 two rows edited)

### Learnings

**`createRequire` is the correct ESM pattern for optional CJS native addons.** With `type: "module"` in package.json, static `import` of an optional module fails at load time with no opportunity to provide a better error message. `createRequire(import.meta.url)` + try/catch inside the consuming function gives clean degraded-mode semantics: the module loads fine without the addon; only `openDatabase()` callers pay for the dependency. `import type` keeps full TypeScript typing without the runtime binding.

**Subpath exports + optionalDependencies is the right isolation boundary for native addons.** Moving `better-sqlite3` to `optionalDependencies` and gating it behind `./sqlite` subpath means in-memory consumers see zero native-module cost. The core `@akubly/eureka` surface stays portable. This pattern will recur anywhere native addons are "heavy but optional" (e.g., a hypothetical `./leveldb` subpath for production key-value tier in Slice D).

**BEGIN IMMEDIATE is the migration race fix, not IF NOT EXISTS alone.** `IF NOT EXISTS` is defense-in-depth for crash recovery (partially-applied DDL); it does not serialize two simultaneous first-opens. IMMEDIATE lock ensures only one process applies migrations; the other reads `schema_version = 1` and skips cleanly. The two mechanisms solve different failure modes and should both be present.
**Documentation ownership boundary:** CLI descriptions should be stable w.r.t. what the CLI actually does. If a section's description references the CLI, treat the CLI text as the authoritative surface and work backward to the design doc, not the other way around. §17 references crucible perf; the CLI text in §13.1 is now the contract both §17 and the binary promise to fulfill.
# Roger — History

**Harness cleanup belongs in the contract helper, not implementation-specific blocks.** Making `cleanup?: () => void` optional on `FactReaderHarness` keeps the InMemoryFactReader harness backward-compatible (no native handles to close) while ensuring all native-backed implementations can register teardown. The `afterEach(() => harness?.cleanup?.())` pattern in `runFactReaderContract` guarantees cleanup fires even if a test throws. Pattern applies to any future harness that wraps a native resource (file, socket, worker thread).
- 2026-06-05 📌 M3: Forge prescriber wired to HintDispositionProvider seam for disposition consumption (dismissed→suppress, resolved→boost). See .squad/decisions/inbox/graham-forge-m3-disposition-consumer.md.
- 2026-06-06 📌 M3: HintDispositionProvider seam finalized on squad/42-forge-m3-disposition (3 commits, 1563 tests green, READY TO SHIP). Disposition vocabulary shared via hintStateTransitionConstants.ts; constants flow: emit → payload → SQL. Seam interface locked, no breaking changes pending.

---


## Archive Summary

Earlier entries (966 lines) archived to history-archive.md on 2026-06-05.

---

### Shared serializer pattern (N3)

For tool families with a list (summary) + get (full) shape, extract a private `buildXxxSummary()` helper in server.ts. The get builder spreads summary and adds full-detail fields. Location: private (non-exported) function above the exported builder pair in server.ts. This prevents list/get field drift. Document intentional omissions (e.g., raw confidence float) with a one-line JSDoc on the summary helper.


## Learnings (2026-05-31 — M1 Cycle-1 Findings: Issue #39)

### Schema co-evolution: two migrations in one PR (017 + 018)

Adding migration 018 to the same PR as 017 was fine — the runner is purely sequential, both migrations are guarded against missing tables, and each is idempotent. The only cost was updating the "MAX(version)" assertions in 4 test files a second time. If the two columns had been logically coupled from the start I'd prefer one migration, but when review feedback drives the change, a second migration is the right call — it keeps the migration history honest (017 = what shipped, 018 = what review demanded) and makes rollback surgical.

### Handler-layer testability pattern (extracted pure functions)

The cleanest approach: extract each handler body into an exported pure function that takes `db: Database.Database` + params and returns the raw JSON payload object. The MCP handler wraps the result in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Tests import the pure function directly from `server.ts` (safe because the `if (isScript)` guard prevents the MCP server from starting on import). Benefits:
- Tests operate on plain objects, not MCP content wrappers
- No MCP harness needed
- Functions are also useful in non-MCP contexts (e.g., CLI tools, tests in other packages)
Pattern: `buildListHintsResult(db, params)`, `buildResolveHintResult(db, params)`, `buildGetHintResult(db, params)`.

### Persona finding initially disagreed with, then came around

**F6 (active_count misleading when status filter present):** My first reaction was "the consumer knows what status they asked for, active_count is just extra info." But after implementing it I understood the Craft persona's point: if you ask for `status=rejected` and get `active_count: 0`, an LLM consumer might interpret that as "nothing is active" when really active hints exist — they just weren't in scope. Omitting the field when it can only be misleading is the cleaner contract. The comment in the code documents this intent for the next engineer.

**F11 (event payload missing resolution intent):** Also came around on this. The initial emit recorded `from_state → rejected` which is sufficient for lifecycle tracking. But Aaron's stated dogfood loop requires forge to distinguish user-dismissed hints from system-expired ones. Without `source: 'mcp'` + `resolution_disposition` in the event, forge can't learn from Copilot's disposition signal. The fix was low-cost; the signal is high-value.


## Learnings (2026-05-31 — Issue #39 M1: Hint Consumption MCP Tools)

### Partial-schema test DB gotcha with ALTER TABLE migrations
- Tests like `migration015.test.ts` and `worktreeSessions.test.ts` create a bare SQLite DB with `schema_version` seeded at a specific version (e.g., 14 or 15) then call `applyMigrations()`. They only include the tables they need (e.g., `sessions`). If your new migration uses `ALTER TABLE <table>` and that table was created by an earlier migration (that was skipped), it will fail with "no such table: X".
- Fix pattern: guard the migration with a `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='my_table'` check. Return early if table doesn't exist. Also add an idempotency guard with `PRAGMA table_info(my_table)` to check if the column already exists before `ALTER TABLE`.

### cairn MCP tool registration pattern
- All cairn tools live in `packages/cairn/src/mcp/server.ts` via `server.registerTool(name, schema, handler)`.
- Follow the exact pattern: `{ title, description, inputSchema: { ... zod fields }, annotations: { readOnlyHint } }`.
- Handlers always call `ensureDb()` first, wrap everything in try/catch, return `{ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }`.
- Error path: `return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true }`.
- `confidenceToWords()` is already exported from server.ts for high/medium/emerging labels.
- For read-only tools: `annotations: { readOnlyHint: true }`. For mutating tools: `annotations: { readOnlyHint: false }`.

### Never use `git add .` after manual file work
Never use `git add .` after manual file work — explicit per-file staging avoids sweeping untracked artifacts into commits.

### Idempotent resolution with status machine
- `optimization_hints` has a strict state machine (STATUS_TRANSITIONS). User-facing "resolve" actions should use `force: true` semantics or bypass the machine directly via SQL UPDATE.
- Terminal statuses: `applied, rejected, expired, suppressed, failed`. Check these before transitioning so the resolve tool can be idempotent.
- Both "resolved" and "dismissed" user dispositions map to `rejected` status — the distinction is preserved in `resolution_note` and the returned `resolution` field.


## Learnings (2026-05-27 — Issue #11 WI-A: workdir-aware sessions)

### Migration wire-up pattern
- Import the new migration in `schema.ts` alongside previous ones; append to the `migrations` array. The runner applies them in order using `MAX(version)`. No other file needs touching.
- Any pre-existing test that asserts `MAX(version) = N` or `COUNT(*) from schema_version = N` will break when a new migration lands — update those assertions (they're "track the latest version" tests, not migration-specific tests).
- Partial index on an active-status predicate (`WHERE status = 'active'`) is the right pattern for session lookup indexes — keeps the index small and covers the hot query path.

### NULL-IS query semantics for workdir
- SQLite's `IS` operator handles NULL comparison correctly: `col IS NULL` matches NULLs; `col IS 'value'` matches the literal. Use `IS` (not `=`) in WHERE clauses that need to match NULL as a distinct identity value.
- In better-sqlite3, `stmt.get(repoKey, null)` passes SQL NULL correctly — no need for IS NULL string injection.
- Keep two separate inner helpers: one without a workdir filter (for MCP fallback that needs any session) and one that always applies `workdir IS ?` (for worktree-scoped lookups). Don't try to collapse them into one with a conditional clause when the semantics diverge.

### `getActiveSession` backcompat semantic (reconciled with Laura)
- When `workdir` is omitted: NO workdir filter — returns most recent active session regardless of workdir. This is the correct backcompat path because old callers expect to find the session they created (which may have had a workdir set by new code).
- When `workdir` is provided: `AND workdir IS ?` — exact worktree match. String value matches that workdir; `null` passed explicitly matches NULL rows.
- The spec said "fall back to `WHERE repo_key = ?`" — that means truly no filter, not "filter for NULL." The "preserve backcompat" language refers to old callers still working, not to NULL-only matching.

### Concurrent test authorship — live file changes
- Laura's test file (`worktreeSessions.test.ts`) was written concurrently in the same worktree. I read one version, implemented to its expectations, then the file changed before I re-ran tests. The failing test name changed between runs — that's a signal the file was updated, not that my implementation broke.
- When a test file changes mid-flight, re-read it before diagnosing a "new" failure. Don't chase the old test contract.

### New API threading pattern for optional context params
- When adding an optional context param (like `workdir`) to a function with multiple optional callback params after it (like `afterCurate`), add the new param as the LAST optional so existing callers don't break by positional shift. Exception: if the new param is semantically earlier, introduce an options object instead.
- In archivist.ts, `getDb()` at the agent level is fine — the DB injection rule applies to `packages/cairn/src/db/*.ts` helpers, not to agent-level orchestration code.



## Session: 2026-05-28 Wave 6 Tail — WI-A Implementation Complete

**Status:** Complete

- Implemented migration 015 (workdir column + partial index)
- Updated DB API: createSession, getActiveSession, listActiveSessionsForRepo
- New export: getWorkdir() for git integration
- Threaded workdir through archivist, sessionStart, postToolUse, types
- MCP breaking change: get_status flat array, get_session identity lookup
- Semantic correction applied (turn 2): getActiveSession no-arg → \AND workdir IS NULL\
- Validation: Build clean, 647/647 tests passing

**Commits:** 2613c78 + ea9ab58

**Decision files:** roger-issue-11-implementation.md + roger-issue-11-api.md → merged to decisions.md

**Next:** Branch ready for merge. WI-B (Gabriel) queued.


### 2026-05-02: Phase 4.5 Telemetry Learnings & Persona Review Fixes

**Event:** Telemetry module hardening post-persona review.

**Key fixes:**
- F1: Weighted mean aggregation (prevent overwrite of prior history)
- F2: Convergence floor (fire on first success signal, not end-of-session)
- F4: Event contract alignment (COLLECTOR_BRIDGE_EVENTS constant + contract test)
- F5: Streaming percentile sketch (100-bucket histogram for [0,1] drift range)
- F6a: Per-signal component means on ExecutionProfile.signals
- F7: Silent error logging in sink
- F11: typeof guards on payloads (toolName string, numeric guards)

**Architecture patterns learned:**
- Shared symbol enums for cross-module contracts (bridge ↔ collectors)
- Streaming quantile sketches for bounded metrics
- weightedMean() helper prevents deflation-toward-zero failure mode
- Fail-open principle: telemetry must never block session execution

**Files touched:** 7 core files + 3 test files. Tests: +24 new. Build: 1012 passing (cairn 478 + forge 534).

**Key lesson:** When collector contract spans modules, enumerate shared symbols + enforce via contract test. Type-level coupling insufficient for JSON boundaries.


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.


## Session: 2026-06-01 — Crucible Sprint 0 First GREEN

**Status:** Complete

### What was done
- Scaffolded `packages/crucible-core/` (package.json, tsconfig.json, README.md, vitest.config.ts)
- Implemented 6-stub public surface: `PrimitiveKind`, `PrimitiveInput`, `Primitive`, `SessionMetadata`, `Session`, `createSession`, `fork`
- Wired `packages/crucible-cli/src/index.ts` to re-export `createSession`/`fork` from `@akubly/crucible-core`
- Updated crucible-cli package.json, tsconfig.json, and root tsconfig.json references
- All 4 A1 invariants GREEN in Laura's acceptance test

### Learnings

#### GREEN-phase pattern: simplest real impl behind the acceptance API
When an acceptance test directly calls `createSession`/`fork` (no injected collaborators), the GREEN step is a real in-memory implementation — not a mock. London-school descent (introduce Ledger mock) happens in the next RED cycle. Don't jump to abstractions in GREEN.

#### query() range convention: inclusive-inclusive [a, b]
`query({ range: [a, b] })` returns b − a + 1 primitives when all offsets are present. Derived from the test: `query({ range: [0, 46] }) → length 47`. Document this as a comment in the implementation; it's easy to misread as exclusive-end.

#### In-memory parent-registry approach for fork
Module-level `Map<sessionId, Primitive[]>` holds each session's **own events only**. Child sessions store zero events at fork time; their `query` for offsets ≤ `forkPointEventId` delegates to the parent's registry entry. No physical copy is made. Parent remains unmodified. This satisfies the A1 "parent unmodified" invariant with minimal code.

Child offset assignment:
```ts
const baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1;
const offset = baseOffset + ownEvents.length;
```
This works for both root sessions (null → base 0) and child sessions (fork at N → base N+1).

#### Deferred: Ledger abstraction
No Ledger class, WAL interface, or Cairn integration introduced. That is the REFACTOR step of the next TDD cycle. Keeping GREEN minimal is discipline, not laziness.



## Session: 2026-06-01 — Crucible Sprint 0 REFACTOR Phase

**Status:** Complete

### What was done
- Extracted ForkLineage value object at packages/crucible-core/src/ledger/fork-lineage.ts
- Introduced DB interface (db.ts) and SessionManager class (session-manager.ts)
- Created createInMemoryDB() adapter (in-memory-db.ts) wrapping the old registry
- Refactored session.ts to compose against singleton InMemoryDB + SessionManager
- Updated barrel index.ts to export all new public surface
- Decision inbox: roger-crucible-refactor-session-manager.md
- Skill: london-tdd-refactor-extract-collaborator/SKILL.md written

### Test results
- crucible-core unit (4/4 GREEN): rejects fork-beyond-size, rejects negative offset, inherits transitive dep graph, records lineage
- crucible-cli acceptance (1/1 GREEN): no regression
- Full monorepo build: exit 0


## Learnings

### REFACTOR pattern: extract value object + collaborator interface + adapter

When the GREEN step has a flat module with module-level state, REFACTOR follows this sequence:
1. **Value object**: extract the invariant holder as a class (ForkLineage). Pure data + validation, no I/O.
2. **Collaborator interface**: define the narrowest possible DB interface — exactly the methods the new class needs. This is the seam the unit tests mock.
3. **Service class**: create the collaborator-using class (SessionManager) that accepts DB in its constructor. All invariant checks live here.
4. **Adapter**: implement the interface against existing in-memory state (createInMemoryDB). Internal helpers (not in the DB interface) are exposed via an extended InMemoryDB interface used only by the composition layer.
5. **Wire**: update the public-facing module-level functions to compose new pieces without changing signatures.

### DB interface contract (locked for unit test compatibility)

```ts
export interface DB {
  getSession(id: string): Promise<{ id: string; ledgerSize: number; pluginVersions?: Record<string, string> } | null>;
  insertSession(session: { id: string; parentSessionId: string | null; forkPointEventId: number | null; pluginVersions?: Record<string, string>; createdAt: number }): Promise<void>;
  queryEvents(id: string, opts: { range: [number, number] }): Promise<unknown[]>;
}
```
This shape is locked because Laura's unit test mocks mirror it exactly. Any shape change here requires updating session-manager.test.ts in tandem.

### In-memory adapter: extend DB for internal helpers

The DB interface is the minimal mock contract. The real adapter needs extra methods (insertRootSession, pushEvent, getOwnEvents, getMetadata) that the service class should not see. Pattern: define InMemoryDB extends DB in in-memory-db.ts, return it from createInMemoryDB(). Import InMemoryDB in session.ts for the singleton; import only DB in SessionManager. Clean separation.

### ledgerSize computation for in-memory adapter

- Root session: ownEvents.length
- Child session: forkPointEventId + 1 + ownEvents.length

This mirrors the offset assignment in buildSession: baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1.

### ForkLineage.parentSessionId: string | null (not just string)

The strategy doc snippet declared parentSessionId: string, but root() needs to pass null. Accept string | null. Document with a comment in the file. This is a common pattern: the strategy snippet covers the happy-path shape; the sentinel case reveals the fuller type.


## Learnings (2026-06-02 — Crucible Sprint 0 Cycle 1 fixes)

**M3 decision — keep range:[a,b] tuple (Option B):**
Chose Option B (JSDoc reinforcement) over Option A (rename to named-field API). The rename would cascade to the acceptance test and session.ts query internals with no Sprint 0 correctness benefit. The tuple is already documented as inclusive-inclusive; adding explicit startOffset/endOffset position labelling in the JSDoc and a deferred-to-future-sprint note is enough signal for consumers. Key rule: don't burn API-churn budget in Cycle 1 on ergonomics when the semantics are already correct and documented.

**I1 reset hook pattern — clear() on the InMemoryDB interface:**
Test isolation for a module-level singleton requires a seam that test code can reach without constructing a private DB. The right pattern: add clear() to the interface (not a backdoor cast), implement as store.clear() on the factory closure, and export a thin resetInMemoryDb() wrapper from the module that calls db.clear(). The function name is fixed by the Laura contract — name it exactly right the first time. This pattern scales: any future DB adapter (SQLite) will implement clear() as a DELETE FROM ... sweep, keeping the test seam consistent.

**I3 silent-drop fix rationale:**
The optional-chain pattern store.get(id)?.ownEvents.push(event) is a silent data-loss footgun: a missing session produces no error and no diagnostic. The rule is: **throw at the storage boundary, not at the consumer**. The caller (session.ts append) can only make forward progress if the push succeeded; letting it silently no-op would corrupt the offset sequence without any observable signal until a later query returned wrong data. Explicit guard + throw surfaces the bug at the earliest possible point.

- 2026-06-05 ✅ persona-review-cycle 2 complete: Crucible Sprint 0 Walkthrough A ready to ship (Cycle 1: 11 findings, 10 fixed; Cycle 2: 3 advisory, 2 fixed, 1 deferred)
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---


## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.

### Learnings

**`createRequire` is the correct ESM pattern for optional CJS native addons.** With `type: "module"` in package.json, static `import` of an optional module fails at load time with no opportunity to provide a better error message. `createRequire(import.meta.url)` + try/catch inside the consuming function gives clean degraded-mode semantics: the module loads fine without the addon; only `openDatabase()` callers pay for the dependency. `import type` keeps full TypeScript typing without the runtime binding.

**Subpath exports + optionalDependencies is the right isolation boundary for native addons.** Moving `better-sqlite3` to `optionalDependencies` and gating it behind `./sqlite` subpath means in-memory consumers see zero native-module cost. The core `@akubly/eureka` surface stays portable. This pattern will recur anywhere native addons are "heavy but optional" (e.g., a hypothetical `./leveldb` subpath for production key-value tier in Slice D).

**BEGIN IMMEDIATE is the migration race fix, not IF NOT EXISTS alone.** `IF NOT EXISTS` is defense-in-depth for crash recovery (partially-applied DDL); it does not serialize two simultaneous first-opens. IMMEDIATE lock ensures only one process applies migrations; the other reads `schema_version = 1` and skips cleanly. The two mechanisms solve different failure modes and should both be present.

**Harness cleanup belongs in the contract helper, not implementation-specific blocks.** Making `cleanup?: () => void` optional on `FactReaderHarness` keeps the InMemoryFactReader harness backward-compatible (no native handles to close) while ensuring all native-backed implementations can register teardown. The `afterEach(() => harness?.cleanup?.())` pattern in `runFactReaderContract` guarantees cleanup fires even if a test throws. Pattern applies to any future harness that wraps a native resource (file, socket, worker thread).


## 2026-06-05: PR #45 Copilot Review — Comment Accuracy + Docs Fixes

**Context:** Copilot's cloud review on PR #45 flagged doc/comment accuracy issues in crucible-core and crucible-cli. All five fixes are comment/doc-only — no logic changes.

### Learnings

**RED-phase scaffolding comments are review debt that must be cleared when impl lands.** When TDD RED-phase tests go GREEN, header comments saying "MUST FAIL" / "does not exist yet" become false documentation. Pattern: update test-file headers at the same commit that ships the implementation, or log a doc-cleanup follow-up. Leaving RED-phase framing in a GREEN test misleads reviewers and tools.

**Package READMEs are two levels below the repo root.** Packages live at packages/<name>/, so packages/<name>/README.md is two directory levels deep. A relative path to docs/ at the repo root must use ../../docs/, not ../docs/ (which resolves to the non-existent packages/docs/). Rule: when writing relative links from a package README, the root is always ../../.


## 2026-06-05: PR #45 Copilot Review Cycle 2 — Control-Char Full-File Sweep + README Accuracy

**Context:** Cycle 2 review flagged a bare-CR artifact in the line-726 region of history.md plus an inaccurate crucible-cli README. Fixed four control-char artifacts total (bare CR on lines 726 and 1071, ESC on line 1068, BEL on line 1074) and rewrote crucible-cli/README.md to describe the package as the Sprint 0 acceptance-test facade.

### Learnings

**When cleaning control-character artifacts, sweep the WHOLE file, not just the flagged region.** Reviewers sample; a spot fix that only patches the cited lines leaves other artifacts alive. After any control-char remediation, run a full-file scan (e.g., byte-level check for bytes <0x20 excluding tab/LF/CRLF) before committing, so the issue does not resurface in the next review cycle.
**BEGIN IMMEDIATE serializes within a single connection; JS event-loop serializes across async calls from the same connection.** For a synchronous library like better-sqlite3, Promise.all() in the same process doesn't create true concurrency — each mutate() call runs to completion before the JS engine yields. The transaction wrapper enforces that READ + fn + WRITE happen atomically within one mutate() call; it plays no role in ordering ACROSS calls from the same JS thread. BEGIN IMMEDIATE matters only when two separate Database handles (different connections, possibly different processes) compete for the write lock. Getting this distinction wrong in comments misleads future readers about WHERE the safety boundary is.


## Learnings (2026-06-05 — M8 Slice C: SqliteFactStore + FTS5 BM25)

**Branch:** `eureka/m8-slice-c-factstore`

**BM25 sign convention is the primary footgun.** `bm25(facts_fts)` returns NEGATIVE values where more-negative = better match. Using it directly in ASC ORDER BY sorts best matches LAST. The fix is `ORDER BY (-bm25(facts_fts)) * trust DESC`. The FS-4 contract test (higher-frequency term fact ranks first) is the regression lock. Every SQLite FTS5 implementation must own this pattern or it will silently break ordering on first write.

**Per-page min-max normalization is the right call for v1.** Normalizing `relevance` to [0,1] via min-max across the result page is simple and correct for single-page recall (RANKER_OVERFETCH_FACTOR × k). Cross-page normalization (where page-1 and page-2 relevances are comparable) requires two queries or a separate max-score fetch — deferred until cross-session pagination needs it. Document the choice so the next person doesn't re-derive it.

**Interface reconciliation (wrapped return) is a mechanical but real change to merged code.** The `recall.ts` change from `Promise<RecallResult[]>` to `Promise<{ results: RecallResult[]; nextCursor? }>` required updating 10 mock sites in `recall.test.ts`. Each was `mockResolvedValue([...])` → `mockResolvedValue({ results: [...] })`. The pattern is mechanical but if you miss one the test will FAIL — destructuring `{ results }` from a bare array returns `undefined`, and the first downstream use of `results` (like `results.filter(...)`) throws a noisy TypeError rather than a clean assertion failure. That TypeError will be confusing to diagnose because it points at the consumer, not the stale mock. Grep for `mockResolvedValue` in the test file before declaring done — it catches all stale mocks in one pass.

**Offset cursors are pragmatic for v1 FTS5 pagination.** Rowid+rank keyset cursors require stable rank values — BM25 floats are session-stable but not write-stable. For v1 single-page recall, offset is deterministic. Encode as base64 JSON `{ offset }` so the format can be extended (add `sessionId`, `queryHash`, etc.) without a breaking cursor change. Document the choice; the next person will want to understand why you didn't use a keyset cursor.

**Schema gaps (attentionTier, importance, lastAccessed) default gracefully.** None of these fields are in the `facts` table yet. `attentionTier='warm'` (identity multiplier 1.0), `importance` omitted (FR-2 uses 0), `lastAccessed` omitted (recency floor 0.1). The composite scorer still runs — results are just conservative. A future migration `002-fact-fields.ts` can add the columns without breaking Slice C's implementation (it SELECTs only content, trust, bm25_score).

**The `*.contract.helper.ts` naming + non-`.test.ts` rule extends naturally to FS.** `fact-store-contract.helper.ts` follows the exact same pattern as `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts`. The wiring test in `fact-store.contract.test.ts` imports from the helper. Vitest ignores the helper file (not `.test.ts`). The pattern is now consistent across all three storage seams.


## Learnings (2026-06-05 — M8 Slice C follow-ups FSE-1 + FSE-4)

**Branch:** `eureka/m8-slice-c-factstore` (follow-up commits on same branch, PR #48)

**FTS5 error messages don't always contain "fts5".** The intuitive narrowing check `/fts5/i.test(err.message)` fails for `"unterminated string"` (unclosed quote) and other tokenizer-level errors. SQLite's FTS5 query parser errors all carry `code === 'SQLITE_ERROR'` (numeric 1). Non-parse errors use distinct codes: SQLITE_CORRUPT=11, SQLITE_IOERR=10, SQLITE_BUSY=5. Narrowing on code alone is the correct approach for this call site because we're inside a method that ONLY runs FTS5 queries — a false SQLITE_ERROR from a non-FTS cause would require schema corruption or an impossible misuse of the prepared statement. Don't over-narrow on message text for FTS5 errors; narrow on the error code instead.

**[Correction 2026-06-05]:** The shipped FSE-1 catch narrows on `code === 'SQLITE_ERROR'` AND a message regex `/fts5|unterminated|syntax error|malformed MATCH/i`, rethrowing non-FTS SQLITE_ERROR (missing-table/schema). Code-only narrowing would over-swallow missing-table errors (e.g., `"no such table: facts_fts"`) which are also `SQLITE_ERROR`. The message pattern distinguishes FTS5 parse errors from missing-table errors, preventing silent corruption of the schema-error signal.

**Laura's edge test locking the broken behavior (FS-SE-11) is the right pattern.** She wrote the test asserting the rejected Promise BEFORE the fix, which made the finding machine-verifiable. Updating the test to the new contract (resolves to `{ results: [] }`) makes the fix machine-verifiable too. This is the correct audit → fix → relock cycle. The `[FINDING FSE-1]` annotation in the old test title is a useful trail even after the fix; the new title says `(FSE-1 fix)` so the arc is traceable.

**Per-page relevance normalization needs documentation at two levels.** The JSDoc on `RecallResult.relevance` (the field) AND on `FactStore.search` (the return type) should both call out that relevance is per-page only. Documenting it only at one level leaves the other as a trap for future consumers who read the type definition but miss the field comment (or vice versa). Both are load-bearing: consumers of the interface read the return type; consumers of results read the field.


## Learnings (2026-06-05 — M8 Slice C code-panel F1–F7 findings)

**Branch:** `eureka/m8-slice-c-factstore` (F1–F7 fixes on same branch, PR #48)

**F1: relevance ≠ sort order is a design, not a defect.** The `compositeScore` consumer weights relevance, trust, importance, and recency as four independent orthogonal signals (each with its own coefficient). Baking trust into `relevance` via composite normalization (`-bm25 × trust`) would double-count trust — it already has a 0.20 weight in the scorer. So: `relevance` = pure `-bm25` normalized; ORDER = composite. When trust varies, a high-trust/low-BM25 fact can sort first while carrying lower relevance. FS-SE-1b is the regression lock for this design. The FS-4 equal-trust lock is still valuable because it verifies the BM25 footgun (negation) under controlled conditions.

**Narrow FTS5 catch with message pattern in addition to error code.** After consulting actual SQLite error messages for missing tables vs FTS5 parse errors: a dropped `facts_fts` table produces a `SQLITE_ERROR` with message `"no such table: facts_fts"` — it does NOT match the FTS5 parse pattern. This is good news for the narrowing: `code === 'SQLITE_ERROR' && /fts5|unterminated|syntax error|malformed MATCH/i` correctly lets the missing-table error propagate. The earlier code-only check (no message filter) was too broad — it would have swallowed the missing-table error. Always verify the message against real SQLite output before deciding on pattern breadth.

**F3 tie-breaker: `f.id ASC` is cheap and correct.** `f.id` is autoincrement INTEGER PRIMARY KEY — guaranteed unique and monotonically increasing (insertion order within a session). Adding `f.id ASC` as secondary sort on the `ORDER BY` clause costs nothing at query time (BTree INTEGER PK) and makes OFFSET pagination deterministic across tied composite scores. The InMemory reference impl should mirror this with `a.factId.localeCompare(b.factId)` since factIds are insertion-order strings in the harness.

**[Correction 2026-06-05]:** The shipped InMemory implementation uses an explicit `insertionOrder` counter (incremented on each `seed()` call) to tie-break results, which correctly mirrors SQLite's AUTOINCREMENT id semantics. `localeCompare` on factId would produce different insertion-order ties when factIds are inserted in non-alphabetical order, so it was not used in the final implementation. See FS-7 test design: seeded `tie-c`, `tie-a`, `tie-b` in non-lexicographic order to distinguish the two approaches.

**F4 limit validation prevents infinite pagination loops.** `limit=0` produces OFFSET 0, LIMIT 0, returns 0 results, `nextCursor` defined, next call produces the same state — infinite loop for any consumer that auto-paginates. `limit=-1` makes SQLite treat it as unlimited (implementation quirk). Both are bugs, not edge cases. `TypeError` is the right signal because `limit` is a misuse of the API contract, not a data error. Apply at both SqliteFactStore AND the InMemory reference impl so the contract test catches both.

**F5 cursor versioning is Slice D work.** The v1 offset cursor is NOT bound to query params, session, minTrust, or limit. Cross-parameter reuse is undefined behavior (silently returns wrong page). The right fix (scope fingerprint: hash of query+sessionId+minTrust+limit) is deferred to Slice D when we add cursor validation. Document with code comments NOW so the next author doesn't have to rediscover the gap.


## Learnings (2026-06-06 — M8 Slice C cycle-2 C2-A/B/C/D/E)

**Branch:** `eureka/m8-slice-c-factstore` (final fix pass, PR #48)

**Insertion-order tie-break must be explicit, not coincidental.** `localeCompare` on factId produces a different order than `f.id ASC` (autoincrement) whenever factIds are inserted in non-alphabetical order. The two impls were only "equivalent" because the test data happened to align. The fix: add an explicit `insertionOrder` counter to `StoredFact`, increment on each `seed()` call, sort ties by `a.insertionOrder - b.insertionOrder`. Then seed FS-7 in non-lexicographic order (`tie-c`, `tie-a`, `tie-b`) so the test would fail under `localeCompare` semantics. Cross-impl contract tests must use data that DISTINGUISHES the implementations they're testing — otherwise they miss the divergence they exist to prevent.

**Duplicates need distinguishable content.** A tie-breaking test that seeds identical content and only asserts `length === 3` would pass even if the impl returned the same row twice (three identical items would still have length 3 and Set.size 1 vs expected 3 — but only if you check the Set). FS-7's fix: seed content `'tiebreak pagination fact-c/a/b'` and assert `new Set(all.map(r => r.content)).size === 3`. A no-dup assertion requires uniquely-identifiable results.

**FTS5 error-message regex is a v1 tradeoff.** The `/fts5|unterminated|syntax error|malformed MATCH/i` pattern was verified against real SQLite errors on 2026-06-05. The conservative failure mode (miss → real error propagates, not swallowed) is acceptable for v1. Slice D should version-anchor the test or look for a more structured FTS5 error signal from better-sqlite3. Noted in decision drop §C2-E.
---


## Learnings (PR #45 Cycle 3 -- 2026-06-05)

**Keep mock return values matching the interface contract even when the value is ignored.** insertSession is typed Promise<void>, so mocks should resolve undefined, not a stray string like 'child-id'. Resolving a wrong type can mask future misuse where code incorrectly reads the return value -- the interface contract is the source of truth, not what production code happens to ignore today.

**Keep minimal-interface comments honest about used-vs-retained members.** If a port interface intentionally includes members not currently called by the primary consumer (e.g., queryEvents on DB), say so explicitly -- state which methods are used now vs retained for future needs. A comment that says 'only the operations X actually needs' becomes misleading the moment the interface contains anything beyond that scope.


## 2026-06-07 — M8 Slice D Complete

**Slice:** M8 Slice D — SQLite Production Deps Factory (Roger, Laura, Graham)  
**Status:** ✅ COMPLETE (147/147 tests, factory-on-subpath, Graham ACCEPT-WITH-FOLLOWUPS, SD-F1 ledger amendment applied)

**Summary:** Roger shipped factory functions (createSqliteRecallDeps, createSqliteFeedbackDeps) on @akubly/eureka/sqlite, preserving Slice A isolation. Laura added +2 smoke tests (SD-1, SD-2). Graham's architectural review: boundary integrity verified, composition root clean, spec tension resolved correctly. Scribe merged decisions inbox + applied SD-F1 ledger amendment.

**Key artifacts:**
- packages/eureka/src/sqlite/deps.ts — factory implementations
- packages/eureka/src/activities/__tests__/recall-sqlite-smoke.test.ts — SD-1, SD-2 smoke tests
- .squad/decisions.md — M8 Slice D as-built section (Graham SD-F1)

📌 **Slice D review-cycle complete + PR #54 opened** (2026-06-07T06:03Z): 5-persona Code Panel review → 0 blocking, 2 important + 3 minor fixed, 2 sound rejects + 1 false-positive cleared; 148/148 tests passing; Copilot review requested. — Scribe

---


## Learnings (Refactor 3 Review Cycle 1 — 2026-06-06)

**Production deps vs devDeps: if a module is exported from the production barrel, its native dependency belongs in `dependencies`, not `devDependencies`.** `createSQLiteDB` is exported from `crucible-core/src/index.ts`, so `better-sqlite3` must be a production dependency of that package. Leaving it in devDeps means any consumer that installs the published package without devDeps would get a runtime crash.

**Single-source schema DDL; never restate it in fixtures or tests.** Creating a canonical `SCHEMA_V1_SQL` export in core and having the fixture call `createSQLiteDB` directly eliminates the drift risk. A fixture that independently restates CREATE TABLE statements will silently diverge from production schema as the schema evolves.

**Error message parity between adapters is a contract, not a courtesy.** When the in-memory oracle throws a specific, diagnosable message (`pushEvent: session '<id>' not found`), the SQLite adapter must throw the exact same message — not a foreign-key constraint error. Tests that assert on error messages will fail at the FK layer with a confusing message; more importantly, callers that pattern-match on errors get inconsistent behavior depending on which adapter is in use.

**Interface JSDoc must describe the cross-impl contract, not the implementation detail of one adapter.** The "mutable reference" wording on `getOwnEvents` was truthful for in-memory but false for SQLite. When an interface has two implementations, the JSDoc on the interface must state what ALL implementors commit to — in this case, a snapshot, not a live reference.

**Header comments on transitional code should name its transitional nature.** Calling the SQLite adapter a "real SQLite adapter" biases future readers toward treating it as canonical. A one-clause note that names the Sprint-0 / compatibility-substrate framing prevents architectural drift.

---


## Learnings (Cycle 2 Remediation — 2026-06-06)

**Verify direct imports before removing a devDependency.** The safe pattern is: grep src/ for `import.*from 'pkg'`; if the only hits are in comments or JSDoc, the dependency is genuinely unused. Trusting that it "should" be gone without grepping first risks removing a still-needed dep (or, conversely, leaving a truly redundant one and failing review). In this case, `better-sqlite3` and `@types/better-sqlite3` appeared only in comments — test-db.ts had already been refactored to import solely from `@akubly/crucible-core`. Safe to drop.

**Transitive dependency satisfaction is enough for test code.** Once `better-sqlite3` lives in `crucible-core`'s `dependencies`, any workspace package that declares `@akubly/crucible-core` as a dependency gets the native module transitively. A devDependency on the same package in the consumer is pure noise and a source of version-skew risk.

---


## Learnings (PR #51 Review — 2026-06-06)

**Return a copy from snapshot methods, not the live internal collection.** `getOwnEvents()` was documented as returning a snapshot where modifications are not persisted, but returned the raw `ownEvents` array. The spread `[...array]` (or `.slice()`) is the minimal correct fix. Notably, the SQLite adapter already honored this contract (`.map()` creates a new array) — the in-memory adapter was the outlier. Whenever two adapters implement the same interface, verify BOTH sides match the JSDoc contract, not just one.

**Lazy-load native modules that are not needed by all consumers.** Placing `import Database from 'better-sqlite3'` at module top level causes the native `.node` binary to be loaded the moment the barrel is `import`-ed — even by callers that only use the in-memory adapter. The fix: `import type Database from 'better-sqlite3'` (type-only, erased at compile time) at top level, and `createRequire(import.meta.url)('better-sqlite3') as typeof Database` inside the factory function. The import graph then only reaches the native module when `createSQLiteDB` is actually called. This matches the pattern in `packages/eureka/src/db/openDatabase.ts`.

**`typeof ImportedType` is the correct cast for a `createRequire` call that returns a constructor.** `typeof import('better-sqlite3').default` fails when the package uses `export =` style declarations (TypeScript reports "Namespace has no exported member 'default'"). Use the locally imported type name directly: `as typeof Database`, where `Database` is bound via `import type Database from 'better-sqlite3'`.
---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**


## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.


## Learnings (2026-06-09 — Code Panel cycle 1 remediation, cursor-versioning review)

**Branch:** `squad/slice-dplus-cursor-versioning` (commit d75349b, 187/187 tests)

**Summary:** Addressed 7 accepted findings from the 6-persona Code Panel review.

**JSON.stringify as scope canonical form beats newline-delimited strings.**
The original `query=${q}\nsessionId=...` format is vulnerable to scope collisions when the query contains the literal substring `\nsessionId=`. `JSON.stringify({ query, sessionId, minTrust, limit })` is unambiguous — each field is a proper JSON value, properly escaped. No two distinct (query, sessionId, minTrust, limit) tuples produce the same JSON string. This is the correct baseline for any multi-field key canonicalization.

**"Present-but-invalid v" is a contract violation, not garbage.**
The original dispatch table had a gap: `v:0` passed the `typeof v !== 'number' || !Number.isInteger(v) || v < 0` guard and fell through to the v1 path. Non-integer strings/floats silently returned offset:0. The correct model: `v` absent/null → v0 (legacy); `v` present and exactly 1 → v1; `v` present and anything else → throw CursorVersionUnsupportedError. A cursor that contains a `v` field came from a versioned system — treating it as garbage is wrong.

**Empty-query short-circuit must come after cursor decode, not before.**
If the empty-query guard fires first, an invalid cursor version silently returns empty results instead of throwing. Since the cursor contract (version validation) is independent of the query, decode first — throw for bad versions — then apply the query-level short-circuits. This ordering applies to both SQLite and InMemory impls: the cursor is an input invariant, the query is a search-shape input.

**Diagnostic fields on error classes are worth the 2-line cost.**
`CursorScopeMismatchError` gained `readonly cursorScope` and `readonly currentScope` fields. No test can reasonably assert on error message text (too brittle), but structured fields let callers log the two fingerprints for debugging without string-parsing. The pattern mirrors `CursorVersionUnsupportedError.version`. Apply this consistently: any error that signals a mismatch should carry both sides.

**Isolated unit tests for pure utility modules catch bugs contract tests miss.**
The new `cursor.test.ts` caught that v:0 wasn't throwing (contract tests only call `search()` which re-throws at a higher level — the path through `decodeCursor` with v:0 was never hit by a focused test). Pure unit tests for pure functions are cheap and should be added any time a utility module handles non-trivial dispatch logic.

---


## Learnings (2026-06-09 — Code Panel cycle 2 remediations, cursor-versioning Fix H/I/J)

**Branch:** `squad/slice-dplus-cursor-versioning` (commit 9b145e8, 187/187 tests)

**Key: absent v key ≠ null v key — use `'v' in payload`, not `v != null`.**
`v !== undefined && v !== null` silently treats `{v: null, offset: 3}` as a legacy v0 cursor. But that payload HAS a v key — it came from a system that serialized something (e.g., NaN → null via JSON.stringify). The contract is: ABSENT key → v0; PRESENT key with value ≠ 1 → throw. The correct guard is `'v' in raw` (after confirming payload is a non-null object). This is the standard JavaScript idiom for key-presence vs value-check.

**Pair RED-test changes with the code change, not after.**
The cycle-2 review caught that CU-3f was asserting the wrong behavior (version===0 for v:null) and CU-1b was in the wrong describe block. The correct workflow: update the test to reflect desired behavior (RED against current code), verify it actually fails, then implement. A test that passes because the code does the wrong thing is harder to detect than a compile error.

**Lazy fingerprinting pattern: compute only when consumed.**
Use a `computedScope: string | undefined` variable initialized to undefined. Compute the scope inside the v1 cursor branch (if-present-and-v1) and reuse it for nextCursor emission via `computedScope ?? scopeFingerprint(...)`. This avoids hashing on empty-query short-circuit paths, no-cursor paths with no next page, and v0-cursor paths with no next page — all while preserving the Fix E decode-before-short-circuit ordering. The `??` fallback is the correct operator here (not `||`) since a valid fingerprint is always a non-empty string.

---


## Learnings (2026-06-09 — Cycle-3 cleanup)

**Object.hasOwn(raw, 'v') improves robustness over 'v' in raw.** Both are functionally identical for well-formed JSON payloads, but Object.hasOwn avoids prototype-chain lookups if the object ever inherits non-standard prototypes — a good defensive practice for untrusted input even when we don't expect it.

---


## Learnings (2026-06-10 — D++ keyset migration doc sweep)

**Comment drift is a blind spot in code review:** Genesta's keyset-migration audit caught 4 stale offset-pagination references in comments/JSDoc that logic changes didn't touch. All 199 tests pass post-fix, confirming comment-only corrections don't break behavior—but doctrine should be updated during refactoring, not after.

---


## 2026-06-10: M8 Slice D++ Shipped to Branch

**Session:** M8 Slice D++ keyset pagination. **Branch:** eureka/m8-slice-dpp-keyset. **Status:** SHIPPED

Genesta locked three interlocked decisions (D1 mutate cursor v1 to keyset; D2 importance/lastAccessed NOT in SQL sort key; D3 per-page normalization). Laura wrote 22 RED tests, Crispin implemented migration 002 + keyset GREEN + persona fixes, Roger did the N1-N4 doc sweep. FSE-2 corrected: INSERT-safe only (not trust-mutation-safe).

**Note:** Re-appended at file end during PR #72 cloud review to honor the Append-Only History Rule (Scribe summarization had reordered prior entries).

---


## Learnings (2026-06-13 — Crucible S2: #69 subscriber error hook + #67 WAL metadata envelope)

**Branch:** `squad/crucible-s2`. **Tests:** 179/179 ✅. Build ✅. Lint ✅.

### Issue #69: Subscriber error observability hook

**Seam shape chosen: `onSubscriberError?` callback on `LedgerFactoryOptions`.**
Factory options is the right injection point (mirrors `walBackend`, `onPause`). The
callback is typed as `(offset, event, error, subscriber) => void`. Passing `subscriber`
as the fourth argument enables callers to map `LedgerSubscriber` instance → error count
without parsing error messages. The seam is optional and additive — zero behavioral change
for callers that don't inject it.

**Ruled out explicitly:** `console.error` (test pollution), rethrow (breaks durability),
counter on `Ledger` interface (couples observability to the public contract),
adding to the `Ledger` interface itself (heavier, breaks all interface implementors).

**Key files:** `ledger.ts` (LedgerFactoryOptions), `ledger-impl.ts` (SubscriberErrorHook alias,
LedgerImpl constructor, catch block, createLedger factory).
**Test file:** `src/__tests__/unit/ledger-subscriber-error-hook.test.ts` (7 tests: SE-1…SE-6, SE-1b).

### Issue #67: WAL metadata envelope layout

**Envelope layout decision (D-ENV-1):**
Before: `envelopeCbor = encodeCbor(primitiveKind)` — bare CBOR text string.
After: `envelopeCbor = encodeCbor({k: primitiveKind, m?: metadata})` — CBOR map.
Key "k" sorts before "m" under RFC 8949 §4.2.1 bytewise ordering (0x6b < 0x6d),
so no explicit sort is needed — the canonical profile handles it.

**Backward compat:** Decode site (`replayFromSegments`) checks CBOR major type of
first byte. Major type 3 (text string, 0x60..0x7b) → old bare-string format, decode
primitiveKind only, metadata=undefined. Major type 5 (map, 0xa0..0xbf) → new format,
extract `k` and optional `m`. This lets pre-#67 segment files replay without error
after upgrade — `metadata` comes back as undefined, which is the same as before.

**Golden vector change:** CBOR-2 test updated deliberately. Old: `envelopeCbor[0]===0x6b,
length===12`. New: `envelopeCbor[0]===0xa1` (CBOR map(1)), `length===15`. The change
in envelopeCbor bytes also changes `selfRoot` for any newly-written row (since
`hash-chain.ts` includes `envelopeCbor` in the selfRoot input). This is correct and
intentional — the richer envelope changes the chain hash. All other CBOR golden
vectors (CBOR-4 through CBOR-9) are unaffected (they test `encodeCbor` with generic
values, not the envelope path).

**Key files:** `wal/materialize.ts` (envelope build + new EventMetadata import),
`wal-backend-fs.ts` (import EventMetadata, replayFromSegments decode + push site).
**Test file:** `src/__tests__/unit/wal-metadata-envelope.test.ts` (7 tests: META-1…META-6, META-3b).

### Gotcha: inline `import('...')` in let declarations works in TS but prefer named imports
The first draft used `let metadata: import('../types.js').EventMetadata | undefined` —
valid TypeScript but noisy. Replaced with a proper `import type { EventMetadata }` at the
top of the file. Always check existing imports before reaching for inline type imports.

### Gotcha: in-memory backend already had metadata (spread of PrimitiveInput)
`InMemoryWalBackend.commitRow` does `this.events.push({ ...input, offset })` which
already spreads `metadata` from `PrimitiveInput`. No change needed there. Only the
FS backend's **replay path** needed fixing — it explicitly constructed a new object
without metadata.



