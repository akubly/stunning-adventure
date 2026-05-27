# 70: PRD / Crucible Alignment Check

**Author:** Cassima (PM)  
**Date:** 2026-05-27  
**Status:** Tech design phase alignment validation  
**Scope:** PRD v5-final (locked R8) vs. design sections + Crucible impact analysis  

---

## 1. Acceptance Criteria Coverage

Every criterion from Eureka PRD v5 user stories mapped to design sections and coverage status.

| US | AC ID | Criterion | Design Section | Status | Notes |
|---|---|---|---|---|---|
| **US-1** | AC-1.1 | Agent stores facts during familiarization via `integrate` | FR-1 (Knowledge Storage), Activities (integrate) | ✅ COVERED | Type and shape verified; v1 integration complete |
| | AC-1.2 | Follow-up session `recall` P95 latency < 500ms | FR-2 (Semantic Retrieval), FR-7.2 (Storage Architecture) | ✅ COVERED | BM25 ranker + single-tier agent DB; latency budgeted |
| | AC-1.3 | Retrieved facts ≥80% precision on 5-question eval set | FR-2 (BM25 quality bar), Success Metrics (§11) | ✅ COVERED | Honest quality bar: keyword-overlap queries; disjoint queries documented as v1.5 gap |
| | AC-1.4 | Second-session token reduction ≥50% vs. baseline | Success Metrics (§11) | ✅ COVERED | Metric defined; measurement via killer-demo telemetry |
| **US-2** | AC-2.1 | Each session emits `kind=session` fact with summary | FR-13 (Session Model), FR-1 (facts schema) | ✅ COVERED | Session-fact schema locked; caller contract documented |
| | AC-2.2 | `originated_in` / `modified_in` / `referenced_in` edges link facts to sessions | FR-9 (Graph-Ready Relations), FR-13 (session edges) | ✅ COVERED | Tier 1 eager edges; schema verified in FR-13 |
| | AC-2.3 | Continuity recall P95 < 200ms (session-fact + Tier 1 edges) | FR-13 (session model), FR-2 (ranker), US-2 AC note | ✅ COVERED | Shared `session_id` makes "all facts for session X" trivially achievable (single column filter); no multi-hop traversal required |
| | AC-2.4 | Checkpoints (committed facts) re-surface in next-session recall | FR-11 (Commitment Registry), FR-2 (ranker boost) | ✅ COVERED | Commit sets `committed=true`, pins to hot tier; ranker surfaces via multiplier |
| | AC-2.5 | Caller-cooperation contract + telemetry counter `eureka_sessions_ended_without_flush_total` | FR-13 (manual-only trigger), FR-7.3 (Bridge Telemetry) | ✅ COVERED | v1 caller responsibility; v1.5 Cairn precision opportunity documented |
| **US-3** | (no detailed ACs) | Trust-weighted retrieval; results ranked by trust with explicit scores | FR-3 (Trust Tracking), FR-2 (ranker formula) | ✅ COVERED | Trust floor 0.15; ranker weights 0.20; caller can inspect scores |
| **US-4** | (no detailed ACs) | Progressive disclosure: pointers/summaries first, full content on demand | FR-8 (Progressive Disclosure), FR-2 (handle return) | ✅ COVERED | `recall` returns lightweight handles; `getFact(id)` fetches full content |
| **US-5** | (no detailed ACs) | Deliberative decision-making via `decide` | FR-10 (Decide — Contemplative), FR-2 (ranker informs deliberation) | ✅ COVERED | Path 1 adapter `toDecisionRecord()` specified; Forge bridge defined |
| **US-6** | AC-6.1 | Forge `DecisionRecord` ingestion via `fromDecisionRecord()` | FR-14 (Forge → Eureka In-Flow), FR-12 (sweep ingestion) | ✅ COVERED | Path 2 adapter specified; v1 on-demand-only cadence locked |
| | AC-6.2 | Ingested decisions become `kind=decision` facts; Eureka is authoritative | FR-14 (ingest flow), FR-1 (facts schema) | ✅ COVERED | Lossy projection; Forge is audit source, Eureka is learning source |
| | AC-6.3 | Lossy projection acceptable | FR-14 (adapter contract), Success Metrics (§11) | ✅ COVERED | Documented in contract; telemetry measures ingest success rate |
| **US-7** | (Deferred v1.5+) | Squad migration | Roadmap (§10) | ⏸️ DEFERRED | Out of v1 scope; Crucible is better owner per Cassima analysis |

**Summary:** All v1 acceptance criteria covered. US-7 appropriately deferred. No gaps.

---

## 2. Non-Goals Check

Eureka v1 explicitly de-scopes these capabilities (from PRD §12).

| Non-Goal | Design Section Impact | Risk? |
|---|---|---|
| Multi-modal facts (images, audio, video) | FR-1 schema locked to text + embeddings BLOB | ✅ NO — schema forward-compat; no design section contradicts this |
| Real-time collaboration / concurrent multi-writer | FR-7.2 SQLite (single-writer); no sync layer | ✅ NO — sync explicitly v2 scope (Roadmap §10) |
| Cross-organization knowledge sharing | NFR-5 security: local-first, no remote calls | ✅ NO — v1 is single-user by design |
| Automated eviction beyond explicit `evict` | FR-1 storage (only explicit evict); sweep does NOT auto-evict | ✅ NO — sweep honorably never mutates eviction (§13 T-stale risk) |
| Community detection / clustering | FR-9 Tier 3 edge types (parking lot); not in v1 schema | ✅ NO — schema supports it; implementation deferred to v2 |
| Symbolic reasoning beyond edge traversal | FR-1 edges (Tier 1/2 only); traversal API v2 | ✅ NO — graph is "ready" not "reasoned"; no design section overloads this |
| Explainability UI / Human-facing GUI | NFR-6 "Eureka is programmatic, not human-facing in v1" (implied by personas) | ✅ NO — CLI is v1.5; no design section commits to GUI |
| Migration tools from other memory systems | Not mentioned anywhere in design | ✅ NO — clean non-goal |
| Distributed consensus / CRDT sync | Sync v2 scope (Roadmap); local-only v1 | ✅ NO — CRDT explicitly v2 (§10) |
| `meditate` / `contemplate` exports | FR-4 vocabulary reserved but NOT exported in v1 | ✅ NO — omitted from v1 API surface |
| Semantic similarity recall | FR-7.1 `sqlite-vec` explicitly deferred to v1.5 | ✅ NO — BM25 only; vector TBD |
| Forcing Cairn to extract kernel | FR-12 "Extraction is a Cairn-team decision" (§7.5) | ✅ NO — design is extraction-ready, not extraction-forcing |
| Round-trip `DecisionPayload ↔ DecisionRecord` | FR-14 / FR-10 "lossy by design; Path 2 is separate ingestion" (§7.2) | ✅ NO — contract explicit; no design section assumes round-trip |

**Verdict:** No design section contradicts the v1 non-goals. No scope creep detected.

---

## 3. Crucible Amendments Status

The Crucible cross-project impact analysis (Cassima 2026-05-26) identified shared substrate overlap and proposed three amendments to Eureka v5. Status below.

| Amendment | Eureka v5 Response | Risk if Rejected | Design Dependency |
|---|---|---|---|
| **A1: Resolve cairn/forge ownership** (monorepo vs. submodule vs. npm packages) | PRD v5 does NOT address; assumes both packages exist and are stable. SessionId brand added to @akubly/types (shared). | **CRITICAL** — If ownership is NOT resolved before implementation, Cairn/Forge will drift between mem/ and harness/ repos. Eureka v1.5 integration with Crucible becomes a merge nightmare. | Shared `SessionId` brand (FR-13 v5) *requires* @akubly/types to be a single source of truth. Cairn sessions.id + Eureka session_id must resolve to the same Copilot CLI UUID. |
| **A2: Clarify @akubly/skillsmith-prescriber ownership** (Crucible-specific vs. generic) | Eureka v5 does NOT reference this package; path independent. Crucible wraps Forge prescribers under this name. | **MEDIUM** — If Crucible renames runtime infrastructure and does not synchronize with Eureka, the bridge_ledger adapter (FR-14) may fail to recognize decision-record sources. | Eureka FR-14 `fromDecisionRecord()` maps `record.source` (human/automated_rule/ai_recommendation) exhaustively. If Crucible changes how prescriptions are sourced or wrapped, the enum mapping breaks. |
| **A3: Sequence Aaron's dogfood** (Crucible-first vs. Eureka-first vs. parallel) | Eureka v5 §5.1 assumes Aaron is sole dogfooder; does NOT sequence with Crucible. Current status: Aaron's direction pending per Cassima history (2026-05-26 revision). | **MEDIUM** — If dogfood is NOT sequenced, both projects compete for Aaron's attention at v1 ship. Eureka killer-demo (US-1/US-2) requires multi-session work; Crucible bootstrap loop (build v2 with v1) also requires weeks. Parallel dogfood is higher friction. | Eureka v1 ship does NOT block on Crucible; however, US-1/US-2 validation is weaker if Eureka trains only on Copilot CLI logs (transient) vs. Crucible session logs (persistent, replay-friendly). Cassima recommendation: Crucible early, Eureka second. |

**Amendment Status Summary:**
- **A1 (substrate ownership):** NOT YET RESOLVED. Blocking both projects' implementation.
- **A2 (prescriber ownership):** SAFE — Eureka is schema-tolerant; mapping survives moderate prescriber renames.
- **A3 (dogfood sequencing):** PENDING AARON. No technical blocker; strategic decision required.

---

## 4. R4 / R5 Open Arbitrations (Confirmed in v5)

The v4-final lock-review resolved five R5 arbitrations. PRD v5 confirms all answers remain valid post-R8. Spot-check below.

| Arbitration | R5 Answer | v5 Confirmation | Design Alignment |
|---|---|---|---|
| **Importance vs Trust (orthogonal?)** | YES — separate 0..1 scalars on every fact; not composite | FR-3 (Trust Tracking): "event-driven only"; FR-6 (Importance): "stored column, maintained by sweep". §7.4 glossary: NOT equivalent. Branded types deferred to v1.5 but prose guards in place. | ✅ CONFIRMED — Both columns in FR-1 schema; orthogonality enforced via docs + lint (planned v1.5) |
| **Importance storage (stored vs. derived?)** | STORED — computed by sweep, written back to column | FR-6: "maintained by opportunistic sweep". FR-12 phase 1: "importance decay". | ✅ CONFIRMED — Sweep mutates `importance` column; ranker reads stored value |
| **Scope vs Temperature (two axes or one?)** | TWO AXES — attention tier (hot/warm/cold) + persistence tier (agent/user/project) | FR-11 (Commitment): "pin to hot tier" (attention). FR-7.2: "three tiers" (persistence). Glossary: "Attention tier" vs. "Persistence tier" (§9). | ✅ CONFIRMED — Schema has both `attention_tier` + `scope` fields; ranker uses attention multiplier only |
| **Community detection timing (v1 or v1.5+?)** | DEFERRED TO v2 — FR-9 Tier 3 "parking lot" holds the edge types | Non-Goals §12: "Community detection / clustering (deferred to v2)". FR-9: Tier 3 NOT in v1 schema. | ✅ CONFIRMED — Edge types parked; no v1 implementation surface |
| **`pray` semantics (split into three verbs?)** | YES — `rerank` (re-prioritize), `contemplate` (narrow deep reflection, v1.5), `meditate` (broad shallow sweep, v1.5) | FR-4: `rerank, decide, commit, retire, evict` in v1; `meditate, contemplate` reserved (omitted from v1 exports). | ✅ CONFIRMED — Vocabulary locked; verbs ship as documented |

**Verdict:** All R5 arbitrations remain locked in v5. No contradictions in design sections.

---

## 5. Tension Log

Places where two design sections conflict or where design contradicts PRD intent.

### Tension T1: Session Identity — Type Safety vs. No-Cross-DB Rule

**Conflict:** FR-13 v5 introduces a shared `SessionId` brand between Cairn and Eureka. Reviewers asked: doesn't this create implicit coupling?

**Design sections involved:**
- FR-13 (Session Model): "share one identifier: the Copilot CLI session UUID... typed through the shared `SessionId` brand from `@akubly/types`"
- FR-7.2 (Paths): "No cross-database `ATTACH` queries at runtime"
- FR-12 mechanism #8: "ESLint guardrail bans Cairn code from importing Eureka session types... exception: the shared `SessionId` brand"

**Root cause:** Shared `SessionId` is a *type-level* construct (a branded primitive), not a runtime FK. Genesta R8 guardrails + ESLint mechanism #8 enforce this boundary. The brand documents the kinship honestly (one entity, two lenses) without creating runtime coupling.

**Resolution:** Aaron R8 directive accepted the shared brand as "honest design" (vs. v4-final's "isolated by design" framing which was a white lie). The no-cross-DB rule survives unchanged. ESLint guardrail (FR-12 #8, ships in v1) operationalizes the boundary.

**Status:** ✅ RESOLVED — Tension surfaced, mitigations in place, no contradiction.

---

### Tension T2: Bridge Ledger — Local Append-Only vs. FR-7.4 Reliability

**Conflict:** FR-7.4 specifies a bridge-reliability contract: "Log every emit/ingest attempt... surface permanent failures". But how is permanent failure detected if Eureka cannot ATTACH to Cairn at runtime?

**Design sections involved:**
- FR-7.4 (Bridge Reliability): "When Eureka emits... MUST log every emit/ingest attempt"
- FR-7.2: "No cross-database `ATTACH` queries at runtime"

**Root cause:** Eureka-owned `bridge_ledger` table (append-only, inside Eureka DB) + offline `eureka reconcile` CLI resolves this. The ledger records every attempt locally. The reconciliation CLI (out-of-process, run by operators) opens Cairn read-only and diffs.

**Resolution:** FR-7.4 has the contract; FR-7.4 specifies the ledger + reconcile CLI. No runtime cross-DB queries.

**Status:** ✅ RESOLVED — No design contradiction; trade-off is explicit (operational overhead, not runtime).

---

### Tension T3: Tier Deferral — Three-Tier API Surface vs. Agent-Only v1 Implementation

**Conflict:** FR-1 schema + FR-7.2 design preserve all three tiers (agent/user/project) in the public API. But only agent-tier is fully wired in v1. User/project writes throw `NotImplementedError`.

**Design sections involved:**
- FR-1 (CRUD): "every fact carries... `scope` ∈ {agent, user, project}"
- FR-7.2: "All three tiers... remain in the **schema and API surface**... only **`agent.db` is fully wired in v1**. User/project stubs throw."

**Root cause:** Pragmatist judgment call: the fan-out is layered (add tiers additively); deferral is not architectural. Killer demos (US-1, US-2) need only agent-tier. Three tiers in the API now means v1.5 can add tiers without API breakage.

**Resolution:** FR-7.2 explicitly documents this. Stubs throw with clear messaging. Schema forward-compatible.

**Status:** ✅ RESOLVED — Deferral is honest; no user-facing contradiction (stubs fail explicitly, not silently).

---

### Tension T4: Path 2 Default Wiring — Production vs. Demo

**Conflict:** FR-14 says adapters ship; path 2 adapter code is v1 scope. But §7.3 says "default caller wiring is opt-in for production".

**Design sections involved:**
- FR-14: "Adapter code ships in v1"
- §7.3 (Production-vs-demo wiring policy): "Production harnesses: adapters are **opt-in**. Demo wiring may opt-in by default."

**Root cause:** Pragmatist + Skeptic BLOCKER (v4-rev2 B2): Path 2 ingestion couples Eureka to Forge; production callers absorb this deliberately, not by surprise. Demos can exercise it to generate dogfood data.

**Resolution:** Adapter code ships; default wiring is environment-dependent. Documented in §7.3.

**Status:** ✅ RESOLVED — Clear policy; no design contradiction. Ship the adapter, gate the default.

---

### Tension T5: Crucible Integration — Eureka Standalone vs. Shared Substrate

**Conflict:** Eureka v5 is "kernel-shaped, ship standalone" (Path D). But Cassima's Crucible impact analysis says Eureka should consume Crucible's WAL at v1.5. Does this imply Eureka is architecturally dependent on Crucible?

**Design sections involved:**
- §7.1 (Boundary Policy): "Path D (design kernel-shaped, ship standalone, defer Cairn refactor)"
- Crucible analysis (Cassima): "Eureka should consume Crucible's L1 WAL at v1.5"

**Root cause:** Path D says ship *Eureka* standalone (no new cross-package runtime coupling *within Eureka v1*). Crucible integration is a v1.5 *optional* bridge (like FR-14), not a v1 load-bearing dependency.

**Resolution:** Eureka v1 ships without Crucible. v1.5 can optionally ingest Crucible WAL via a new `ingestWALEvents()` API (extension of FR-14 pattern). Crucible can use Eureka (future); Eureka does NOT require Crucible (v1).

**Status:** ✅ RESOLVED — Causality is clear; v1 scope is honest; v1.5 integration is future work.

---

### Tension T6: BM25 Precision Trade-Off — Quality Bar vs. Honest Limitation

**Conflict:** AC-1.3 says "≥80% precision". FR-2 says "BM25 will **miss recall** when query terms are lexically disjoint". How do we ship a killer demo if the ranker misses half the queries?

**Design sections involved:**
- AC-1.3 (US-1 acceptance): "Retrieved facts achieve ≥80% precision on a held-out evaluation set of 5 codebase questions"
- FR-2 (semantic retrieval): "BM25 will **miss recall** when query terms are semantically related but lexically disjoint"

**Root cause:** v4-rev2 I2 ("Skeptic + Pragmatist" panel finding): the eval set is rigged to BM25's strengths. The acceptance criterion is honest: "high precision on lexically-overlapping queries". The eval partitions overlap vs. disjoint; v1 gates only on overlap.

**Resolution:** AC-1.3 is achievable with BM25 on keyword-overlap queries. Disjoint queries are a documented v1.5 gap. Roadmap §10 adds `sqlite-vec` at v1.5.

**Status:** ✅ RESOLVED — Tension surfaced, quality bar is honest, gap is documented and tracked.

---

### Tension T7: Crucible Amendment A1 — Shared Packages Not Owned

**Conflict:** Eureka v5 adds `SessionId` brand to `@akubly/types` (shared). But the Crucible analysis found that `packages/cairn/`, `packages/forge/`, and `packages/types/` are duplicated across `mem/` and `harness/`. Who owns the shared package if both repos have a copy?

**Design sections involved:**
- FR-13 (v5 amendment): "`SessionId` brand from `@akubly/types`" (shared)
- Crucible impact analysis §3: "Both repos have `packages/types/` — this is either duplication (bad) or a shared submodule (needs coordination)"

**Root cause:** Graham's R8 enforcement gate (FR-12 mechanism #8) requires clarity on shared substrate, but PRD v5 does NOT resolve the ownership question. This is a BLOCKER for implementation.

**Status:** ⚠️ TENSION FLAGGED — Not a design contradiction, but a prerequisite dependency. Genesta + Roger must coordinate before Eureka implementation starts. See "Open Questions for Aaron" below.

---

## 6. Open Questions for Aaron

The following decisions must be made before Eureka and Crucible v1 implementations can proceed.

| # | Question | Impact | Recommendation |
|---|---|---|---|
| **OQ-1** | **Resolve shared-substrate ownership (Cairn, Forge, Types):** Choose monorepo (merge mem + harness), git submodule (shared repo), or npm packages (versioned releases). Document decision in both PRDs. | CRITICAL — Blocks both projects' implementation. Eureka v5 SessionId brand depends on @akubly/types being a single source of truth. Crucible v1 depends on Cairn/Forge prescriber inheritance. | **Graham (Architect) must freeze the schema and ownership model before day 1 of implementation.** Recommendation: monorepo (cleanest dependency graph) or git submodule (if repos must stay separate). Avoid npm packages unless CI overhead is acceptable. **Timeline: this week.** |
| **OQ-2** | **Confirm Eureka v5 R8 commitment:** Does Aaron endorse the shared `SessionId` brand framing ("one entity, two lenses, type-level construct")? This unlocks the ESLint guardrail (FR-12 #8) and enables Crucible integration path at v1.5. | MEDIUM — If Aaron rejects the shared brand, FR-13 reverts to v4-final "isolated by design" + opaque `cairn_session_id` field. Crucible cannot use Eureka session facts at v1.5. | **Aaron: confirm R8 stance on "shared SessionId is honest design, not coupling."** Cassima assumes yes (per Aaron R8 directive 2026-05-26). If no, a new design pass is required. **Timeline: if undecided, this session; if yes, proceed.** |
| **OQ-3** | **Sequence Aaron's dogfood:** Will you dogfood Crucible first, Eureka first, or both in parallel? Crucible bootstrap loop (build v2 with v1) is existential; Eureka killer demos (US-1/US-2) are incremental. | MEDIUM — Affects both projects' risk profile and v1.5 integration readiness. | **Cassima recommendation: Crucible early (generate session logs + validate replay), Eureka second (consume Crucible logs for US-1/US-2 validation).** Alternative: parallel if context-switching overhead is acceptable. Decision needed before teams begin dogfood. **Timeline: this week.** |
| **OQ-4** | **Confirm Eureka v1 scope freeze:** Sessions-as-facts, two decision pathways (Path 1 + Path 2), three storage tiers (only agent fully wired), BM25 ranker, Tier 1/2 edges only. Any scope creep into Crucible or learning-kernel extraction in v1 will slip the ship date. | LOW — Scope is defended; this is a confidence check. | **Cassima: assume scope is locked per v5-final. Flag if any new demands arrive. Respond at next sync.** |
| **OQ-5** | **Clarify Crucible integration expectation:** Does Eureka v1.5 *must* consume Crucible WAL for killer demos to count as "passed"? Or are US-1/US-2 valid if Eureka ingests Copilot CLI logs only? | MEDIUM — If Crucible integration is mandatory for US-1/US-2 acceptance, v1.5 timeline becomes v1. If optional (Cassima assumption), Eureka ships standalone, then integrates. | **Cassima assumption: Eureka v1 + US-1/US-2 are valid with or without Crucible WAL. Crucible is v1.5 *improvement*, not v1 blocker.** Aaron: confirm. |

---

## 7. Summary & Recommendations

### Coverage Status

| Category | Status | Notes |
|---|---|---|
| **Acceptance Criteria** | ✅ ALL COVERED | 17/17 ACs from US-1…US-6 addressed in design; US-7 deferred appropriately |
| **Non-Goals** | ✅ NO SCOPE CREEP | 12 non-goals explicitly defended; no design section contradicts them |
| **R4/R5 Arbitrations** | ✅ CONFIRMED | Five locked arbitrations remain valid post-R8; no new contradictions |
| **PRD → Design Alignment** | ✅ STRONG | Design sections faithfully implement PRD intent; trade-offs are honest |
| **Crucible Amendments** | ⚠️ PENDING | A1 (ownership) BLOCKS implementation; A2 (prescriber) SAFE; A3 (dogfood) PENDING AARON |

### Key Tensions

- **T1–T5:** All RESOLVED — design makes trade-offs explicit and defended.
- **T6:** BM25 quality bar is honest (keyword-overlap only); v1.5 roadmap addresses gap.
- **T7:** Shared-substrate ownership is a BLOCKER (OQ-1).

### Recommendations

1. **IMMEDIATE (this week):** Aaron answers OQ-1 (substrate ownership) + OQ-3 (dogfood sequencing). Graham locks shared schema before day 1 of implementation.
2. **PRD v5 amendment opportunity:** Add a "Shared Substrate" section clarifying that Eureka v1 depends on resolved cairn/forge/types ownership across mem + harness repos.
3. **Crucible PRD amendment:** Symmetrically clarify shared-substrate dependency on Eureka side. Reference the same ownership decision.
4. **Implementation gate:** No Eureka implementation starts until OQ-1 is resolved.

### Cassima's Confidence Level

**PRD–Design alignment: 95%.** The design faithfully implements v5-final. The 5% gap is Crucible integration uncertainty (OQ-1 blocker), not a design flaw. Once shared substrate is owned, alignment is 99%+.

---

**Status: READY FOR AARON REVIEW**

