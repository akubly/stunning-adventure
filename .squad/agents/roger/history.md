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