# SUMMARY — Last Updated 2026-06-07T06:03Z (Size: 140604 bytes → see history-archive.md for entries before 2026-06-01)


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

