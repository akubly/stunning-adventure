# Eureka PRD v5-final (Canonical Specification)

**Status:** Canonical, shippable. Supersedes v4-final. **This is the v5-final pass — R8 session-identity unification integrated; FR-13 "isolated by design" relaxed to "shared `SessionId` brand; lens framing is the normative guard."**
**Author:** Cassima (Product Manager)
**Date:** 2026-05-26 (R8 reopen authored same-day as v4-final lock + Aaron R8 signal)
**Lineage:** v3 (R5 lock) → v3.1 patches (R6 synthesis) → R7 reviews (Graham, Genesta, Crispin, Edgar) → Aaron R6 signals + R7 bidirectional directive → v4-final → Aaron R7 finalization pass (FR-12 split, confidence/trust orthogonality, OQ #5 closure, DecisionPayload dual-axis) → **v4-final rev-2** (4 BLOCKERS + 9 IMPORTANT findings from Squad domain panel + persona-review Design Panel; see §15) → **v5-final** (Aaron R8 session-identity directive: shared `SessionId` brand across Cairn + Eureka; FR-13 "isolated by design" relaxation; `cairn_session_id?` → `session_id: SessionId` (required); §7.4 substrate-overlap update; §14a T-orphan reframe; Glossary; FR-12/FR-14 opportunistic precision gains; Graham ESLint guardrail).
**Reading note:** `[v4: <reason>]`, `[v4-rev2: <reason>]`, and `[v5: <reason>]` annotations mark substantive deltas from prior revisions so readers can trace lineage. Unannotated text is preserved verbatim. v5-final is intended to be read top-to-bottom as a single self-contained spec; no other document is required to implement v1.

---

## 1. Vision

Eureka is a knowledge retention and recall system for agentic systems. With Eureka, agents (GitHub Copilot coding agents and subagents primarily, but by no means exclusively) can:

- store information
- extract information from source material
- retrieve information with relevance weighting
- strengthen or weaken prior knowledge over time, in the presence of new information, through persistent access (or its absence), and through reflection and meditation
- draw connections between related information
- use the relationship between information to discover insights
- use the combination of unrelated information, or patterns therein, to ideate
- work with symbols and navigate graphs
- keep context at a minimum by opportunistically paging in only the data they need
- reason over concepts, deliberate, and make decisions based on facts, inductive reasoning, or deduction

Eureka is the **cognitive memory** layer of an agentic stack. It coexists with — but does not replace — Cairn (observability) and Forge (deterministic runtime/audit). It is designed to be **kernel-shaped**: extractable into a shared learning kernel later, but shipped standalone in v1. [v4: Path D framing, was implicit in v3]

---

## 2. Problem Statement

Agentic systems today re-read codebases, rediscover prior decisions, and discard hard-won context at session boundaries. Per-turn context budgets are spent on rediscovery rather than progress. Multi-agent teams duplicate learning across silos that cannot share durable knowledge.

Eureka exists to make knowledge **durable, addressable, and progressively disclosed**, so agents stop paying the rediscovery tax and so teams of agents (and humans) compound learning over time.

---

## 3. Conceptual Model

Eureka frames memory through a **Jungian integration** lens: knowledge is not just stored, it is *integrated* — connected, weighted, and reconciled against existing knowledge. Each activity contributes to integration:

| Activity | Contribution to integration |
|---|---|
| `integrate` | Take in new material; reconcile with existing facts |
| `recall` | Surface relevant integrated material on demand |
| `rerank` | Re-prioritize a candidate set under new context |
| `decide` | Deliberate among options, producing a structured decision |
| `commit` | Hot-pin a fact / aspiration for guaranteed surfacing |
| `retire` | Explicitly release a commitment |
| `evict` | Hard-delete a fact (explicit only) |
| `meditate` *(v1.5)* | Broad, shallow sweep-style reflection |
| `contemplate` *(v1.5)* | Narrow, deep reflection; trust refinement |

Integration is a **system property**, not a one-shot ingestion: facts strengthen and weaken over time through access, sweep, reflection, and reconciliation against new evidence.

---

## 4. Personas

- **Primary:** GitHub Copilot coding agents and subagents — programmatic consumers calling Eureka via library or MCP. They store, recall, decide, and commit in the course of normal task execution.
- **Secondary:** IDE assistants and other non-Copilot LLM agents that adopt Eureka as their memory layer.
- **Tertiary:** Humans — agent operators, squad maintainers, and (in Squad migration) team members reading shared project/user-tier knowledge. Humans rarely write directly; they read, audit, and occasionally commit/retire.

---

## 5. User Stories

### US-1: Codebase Familiarization (v1 killer demo)

As a coding agent newly assigned to a codebase, after one familiarization session I can answer follow-up questions about the codebase **without re-reading source files**, and my second session's token consumption drops ≥50% versus the first.

**Acceptance criteria:**
- AC-1.1: Agent stores facts during familiarization via `integrate`.
- AC-1.2: In a follow-up session, `recall(query)` returns relevant facts with P95 latency < 500ms.
- AC-1.3: Retrieved facts achieve ≥80% precision on a held-out evaluation set of 5 codebase questions.
- AC-1.4: Second-session token usage measured against baseline (no Eureka) shows ≥50% reduction.

### US-2: Cross-Session Continuity (v1 killer demo)

As a coding agent resuming work on a task that spans multiple sessions, I can produce a 3-bullet summary of where I left off using only `recall`, with no human-supplied context.

**Acceptance criteria:**
- AC-2.1: Each session emits a `kind=session` fact with caller-supplied summary.
- AC-2.2: `originated_in` / `modified_in` / `referenced_in` edges link facts to their sessions.
- AC-2.3: Continuity recall (session-fact + Tier 1 session edges) P95 latency < 200ms. [v5: shared `session_id` makes the common case trivially achievable — "all facts for session X" is a single indexed filter `WHERE session_id = ?`, not a multi-hop traversal. Edge traversal (`originated_in` etc.) still goes through `fact.id`, but the session-fact lookup is exact-match on the shared identifier. See FR-13 and Edgar R8 §1.]
- AC-2.4: Checkpoints (committed facts) re-surface in next-session recall.
- AC-2.5 [v4-rev2: Skeptic F1 — continuity requires caller cooperation; library cannot guarantee it unilaterally] [v5: telemetry precision improved by shared session identity — see note below]: **v1 caller-cooperation contract.** Cross-session continuity in v1 depends on the caller invoking `remember()` (explicit) and/or `eureka.session.flushHints()` (helper that extracts suggested facts from recent activity and prompts the caller to commit). v1 does **not** guarantee continuity without caller cooperation; the contract is documented and a telemetry counter `eureka_sessions_ended_without_flush_total` is emitted so v1.5 design can quantify how often the gap matters. Automatic session-close capture is a v1.5 roadmap item.

  **v1.5 precision opportunity [v5: Edgar R8 §4 — opportunistic, not a v1 commitment]:** With shared `session_id`, Cairn's session-end events become an **authoritative** signal for the counter — Eureka can ask "did I see a `flushHints()` for `session_id = X` before Cairn marked it `completed` / `crashed`?" This turns a blind counter (currently cannot distinguish "agent forgot to flush" from "agent still running") into a sharp measurement. v1 retains the existing counter; v1.5 may consume Cairn session-end events for precision. The shared identifier enables this without new cross-DB JOINs — Cairn emits an event payload that already includes `session_id`.

### US-3: Trust-Weighted Retrieval

As an agent reasoning under uncertainty, I want recall results ranked so that high-trust facts surface above speculative ones, with explicit `trust` scores I can inspect.

### US-4: Progressive Disclosure

As an agent with a constrained context budget, I want `recall` to return pointers/summaries first and full content on demand, so I never burn tokens on material I won't use.

### US-5: Deliberative Decision-Making (contemplative path)

As an agent facing a structured choice, I can call `decide` with options and rationales, receive a ranked recommendation, and have the decision persisted as both a Eureka fact AND a Forge audit record. **Forge writes the audit record** (immutable, authoritative for compliance/replay/audit trail); **Eureka writes the learning-shaped decision-fact** (mutable `trust`/`importance`/`access_count`, authoritative for recall and learning). Both share a `decision_id` that correlates them. Source of truth for compliance = Forge. Source of truth for learning = Eureka. On disagreement, reconciliation runs against `decision_id`. [v4: bidirectional adapter clarifies this is Path 1]

### US-6: Learning From In-Flow Decisions (Path 2 — in-flow ingestion) [v4: NEW — Aaron R7 directive; backed by FR-14]

As an agent that makes decisions inline during normal LLM exchange (without explicitly invoking `decide`), I want those decisions captured by Forge to **become learning material** in Eureka, so future deliberations can draw on observed history.

**Acceptance criteria:**
- AC-6.1: Forge's `DecisionRecord` stream is ingested by Eureka via `fromDecisionRecord()` (see FR-14).
- AC-6.2: Ingested decisions become `kind=decision` facts; Eureka's fact store is authoritative for downstream learning.
- AC-6.3: Lossy projection is acceptable: Eureka treats Forge as the audit source of truth and does not attempt to reconstruct full fidelity.

### US-7: Squad Migration (deferred to v1.5+)

(Deferred per R5-Q3.) The eventual replacement of charter/journal/history/decisions/inbox with Eureka. Out of v1 scope; informs schema design only.

---

## 6. Functional Requirements

### FR-1: Knowledge Storage (Core CRUD)

A unified `facts` table with `kind` discriminator. Every fact carries: `id`, `kind`, `content`, `sources[]`, `trust` (0..1), `importance` (0..1), `attention_tier` ∈ {hot, warm, cold}, `committed` (bool), `created_at`, `updated_at`, and (for `kind='session'` facts and any fact a caller chooses to scope to a session) `session_id: SessionId` (shared Copilot CLI session UUID; branded primitive from `@akubly/types`; required on session-facts, optional/nullable on other kinds). Schema includes a reserved `embedding_vector BLOB` column (nullable, unpopulated in v1) so v1→v1.5 migration adds the index without schema change. [v4: forward-compat column from Genesta] [v5: `cairn_session_id?` (opaque audit ref) renamed to `session_id` and typed as the shared `SessionId` brand per Aaron R8 directive; required on session-facts, see FR-13]

### FR-2: Semantic Retrieval (`recall`)

Composite ranker:

```
rawScore   = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
finalScore = rawScore × attentionMultiplier(tier)
```

Where `attentionMultiplier(hot)=1.20`, `(warm)=1.00`, `(cold)=0.80`. Trust floor: facts with `trust < 0.15` are excluded from results (configurable).

**v1 relevance constraint [v4: Genesta amendment]:** The `relevance` term uses **BM25 lexical similarity** (SQLite FTS5). Recall is therefore keyword-scoped, not concept-scoped: a query for "authentication patterns" will NOT recall facts about "JWT" or "bcrypt" unless those keywords appear in the fact text. This is acceptable for v1's code-convention and tool-command use cases. Semantic similarity via `sqlite-vec` is required for v1.5+ conceptual memory.

**BM25 quality bar [v4: Genesta; v4-rev2: I2 — honest failure-mode characterization]:**
- Tokenizer: `porter unicode61` (FTS5)
- Acceptance: ≥80% precision on US-1's 5-question eval set with keyword-overlap queries; documented degradation on keyword-disjoint queries.
- Eval suite ships with v1 and is run in CI.

**v1 recall failure mode (stated honestly) [v4-rev2: I2 — Skeptic + Pragmatist; the eval is rigged to BM25's strengths and we should not pretend otherwise]:** BM25 will **miss recall** when query terms are semantically related but lexically disjoint from the indexed fact text. A query for `"authentication patterns"` will not surface a fact whose content reads `"JWT bearer token validation flow"` unless one of the literal query tokens appears. The v1 quality bar is therefore **"high precision on lexically-overlapping queries; recall on disjoint queries is a known v1.5 gap addressed by the embeddings tier"** (`sqlite-vec`, deferred per FR-7.1). The eval suite explicitly partitions its question set into "overlap" and "disjoint" buckets; only the overlap bucket is gated in v1 CI. The disjoint bucket runs and reports for transparency but is not a ship gate until v1.5. Calling this out so reviewers can calibrate the bar.

**v1 recall fan-out strategy [v4-rev2: I3 — Architect F3; multi-tier fan-out underspecified]:**
- **Order:** sequential fan-out — agent → user → project. Agent tier first because it is hot, scoped, and (per FR-7.2 v1 scope) the only fully-wired tier in v1.
- **Early exit:** stop fan-out once `k` results above the trust floor have accumulated. Default `k = 10`; configurable per call.
- **Latency budget:** p95 < 50ms for typical fan-out in v1 (single tier fully wired). When v1.5 wires user/project tiers, the budget revises to p95 < 200ms for the full three-tier fan-out (still well inside the US-1 < 500ms outer envelope).
- **Result merging:** v1 uses simple concatenation (agent results ranked first by score, then user, then project, within their own tiers). **Parallel fan-out with cross-tier merge ranking is deferred to v1.5** — that requires a global score normalization across tiers, which is non-trivial.
- **Unwired tier behavior:** per FR-7.2 v1 scope, user/project tiers throw on writes but return empty result sets on reads, so fan-out degrades gracefully.

### FR-3: Trust Tracking

**Event-driven only.** No automatic trust decay in v1. Trust mutates on: `contemplate` outcomes, explicit verification, contradiction signals (Tier 1 `contradicts` edge), explicit writes. `time_since_last_verification` is a derived field (computed, not stored). Sweep emits a `stale_trust` flag but does not mutate trust itself.

### FR-4: Activity Surface (Locked Vocabulary)

`integrate, recall, rerank, decide, commit, retire, evict` in v1. `meditate, contemplate` reserved in vocabulary but **omitted from v1 exports** (no callable, no type, no stub).

### FR-5: Recency Scoring

ACT-R power-law decay applied at score time. Stored values are timestamps only; `recency ∈ [0,1]` is computed per-query.

### FR-6: Importance Scoring

`importance` is a stored column on `facts`, maintained by opportunistic sweep. Not recomputed on every access.

### FR-7: Storage Architecture

#### FR-7.1: Engine
SQLite via `better-sqlite3` (matches Cairn precedent). BM25 via FTS5 virtual table (`facts_fts`, triggers keep it in sync with `facts`). `sqlite-vec` deferred to v1.5. [v4: vector deferred per R6 Patch 2]

#### FR-7.2: Paths (Eureka-owned, federated from Cairn) [v4: Genesta operational guidance]

| Tier | Path |
|---|---|
| Agent | `~/.copilot/eureka/agent.db` (scoped to `$AGENT_NAME`) |
| User | `~/.copilot/eureka/user.db` |
| Project | `<repo>/.eureka/project.db` |

No shared FK constraints with Cairn. **No cross-database `ATTACH` queries at runtime.** Cairn's `~/.cairn/knowledge.db` remains observability-scoped and is not read by Eureka in any runtime code path. *Carveout:* an **offline reconciliation CLI** (see FR-7.4) opens both DBs read-only out-of-process for diff-style operations; this is explicitly NOT a runtime query path and is invoked only by operators.

**Operational guidance:** Both `~/.cairn/` AND `~/.copilot/eureka/` are stateful — backup both for full state recovery. Disk usage scales independently. Correlation across systems is via the shared `session_id: SessionId` brand (defined in `@akubly/types`; see FR-13). The shared identifier is a **type-level construct**, not a runtime foreign key — the no-cross-DB-ATTACH rule above is unchanged. [v5: was "via `cairn_session_id` opaque metadata only"; the identifier is no longer opaque, but the no-ATTACH rule survives unchanged — that is the load-bearing isolation, not the opacity of the link]

**v1 tier scope [v4-rev2: I5 — three tiers = YAGNI for v1 ship; schema/API preserved, surfaces deferred]:** All three tiers (agent / user / project) remain in the **schema** — `Fact.scope` and edge resolution all assume three tiers. However, the **v1 public `recall()` API signature has NO `tiers` parameter**; the internal implementation hardwires to agent tier. `Fact.scope` stays in storage for forward-compat; v1.5 will add the `tiers` parameter and federation paths when user/project tiers are wired. User and project storage adapters are **not shipped** in v1 at all (not even as `NotImplementedError` stubs). Recall fan-out in v1 operates against agent tier only. Killer demos (US-1, US-2) operate against agent-tier only; nothing in the design changes when v1.5 wires the other two. Test/implementation burden in v1 drops to one tier. Cassima accepts this deferral on the judgment that the fan-out is layered such that adding tiers is additive, not architectural. [v4-rev2]

#### FR-7.3: Bridge Telemetry [v4: Graham amendment]

Eureka emits structured logs for bridge operations:
- `bridge.ingest.decision` — Forge→Eureka decision conversion (success/failure, latency)
- `bridge.ingest.session` — Cairn→Eureka session fact creation (triggered/skipped)
- `bridge.adapter.error` — Schema mismatch or conversion failure (includes sample payload)

Counters/histograms (opt-in if `TelemetrySink` configured): `eureka_bridge_decisions_ingested_total`, `eureka_bridge_adapter_errors_total`, `eureka_bridge_ingest_latency_ms`.

#### FR-7.4: Bridge Reliability Contract [v4: Crispin amendment]

When Eureka emits to Cairn/Forge (e.g., `toDecisionRecord()` → audit stream) **and** when Eureka ingests from Forge (`fromDecisionRecord()` via FR-14), the bridge MUST:
1. Log every emit/ingest attempt (timestamp, fact id, destination/source, outcome).
2. Retry on transient failures (network timeout, DB locked).
3. Surface permanent failures (return error to caller; emit to error log).
4. **Write to the Eureka-owned bridge ledger** — see below — so reconciliation does not require cross-DB queries.

**Eureka-owned bridge ledger [v4-rev2: B3 resolution — preserves FR-7.2 no-runtime-cross-DB rule] [v5: `cairn_session_id_hint?` is REPLACED by `session_id: SessionId` (required, not a hint) — the session UUID is known and stable at bridge time; `cairn_event_id_hint` stays a hint per Crispin R8 because the Cairn event.id is an internal autoincrement that may not be known at emit time]:** An append-only table `bridge_ledger` inside each Eureka tier DB records every bridge operation:

```sql
CREATE TABLE bridge_ledger (
  id INTEGER PRIMARY KEY,
  direction TEXT NOT NULL,          -- 'emit' | 'ingest'
  eureka_fact_id TEXT,              -- nullable for failed emits
  session_id TEXT NOT NULL,         -- shared SessionId brand (@akubly/types); authoritative, not a hint
  cairn_event_id_hint TEXT,         -- best-effort identifier for event-level correlation (Cairn event.id may not be known at emit time)
  attempted_at TEXT NOT NULL,
  outcome TEXT NOT NULL,            -- 'success' | 'retry' | 'permanent_failure' | 'skipped_duplicate'
  error_msg TEXT
);
-- session_id is the shared Copilot CLI session UUID; correlates 1:1 with Cairn's sessions.id and
-- Eureka session-facts. DO NOT JOIN across databases at runtime (FR-7.2). Reconciliation is
-- offline-only via the eureka reconcile CLI.
```

The ledger is Eureka-local (no cross-DB writes), append-only, and queryable at runtime via standard Eureka APIs.

**Offline reconciliation CLI [v4-rev2: B3 — separates reconciliation from runtime] [v5: now JOINs on `session_id` (exact-match, stable on both sides) instead of correlating only on the looser `cairn_event_id_hint`]:** `eureka reconcile --against <cairn-db-path>` is a CLI tool that:
- Opens Cairn's `knowledge.db` **read-only, out-of-process** (NOT via `ATTACH` from Eureka runtime code).
- Reads Eureka's `bridge_ledger` for `direction='emit'` entries.
- Cross-references against Cairn's event_log primarily on shared `session_id` (exact match), with `cairn_event_id_hint` as a secondary event-level correlation field.
- Emits a diff report: `{ledger_says_emitted_but_cairn_missing, cairn_present_but_no_ledger_entry, both_present_consistent}`.
- Operator-invoked only; not on any runtime code path.

**Reconciliation AC [v4-rev2]:**
- AC-RC-1: `eureka reconcile` returns exit code 0 with empty `ledger_says_emitted_but_cairn_missing` set in steady state.
- AC-RC-2: Bridge ledger row count never decreases (append-only invariant).
- AC-RC-3: CLI never opens Cairn DB for write; uses `mode=ro` connection string.

**Silent divergence is prohibited.** If Eureka believes an emit succeeded but Cairn never received it, the reconciliation CLI will surface it, and that is a contract violation.

### FR-8: Progressive Disclosure

`recall` returns lightweight handles (id, kind, summary, score, trust). Full content fetched on demand via `getFact(id)`. Edge traversal is opt-in.

### FR-9: Graph-Ready Relations Schema

Three tiers of edge types stored in a `relations` table (`from_id`, `to_id`, `edge_type`, `weight`, `confidence`, `created_at`):

- **Tier 1 (eager, populated at write time):** `derived_from, references, contradicts, supersedes, part_of, instance_of, precedes, defined_in, decided_by, committed_in, originated_in, modified_in, referenced_in`
- **Tier 2 (sweep-populated):** `similar_to, co_accessed_with, recalled_in` (per-session dedup for `recalled_in`)
- **Tier 3 (parking lot, NOT in v1 schema):** `caused_by, useful_for, equivalent_to, responds_to, requires, analogous_to`

`tags` are explicitly excluded; tag-style discovery is via `kind` + edges.

### FR-10: Decide — Contemplative Path (Eureka → Forge) [v4: Aaron R7 directive disambiguates pathways]

**Purpose:** Support deliberate decision-making through structured option analysis where the agent uses Eureka's graph to reason its way to a choice.

**Schema (`DecisionPayload`, Eureka-authoritative):**
```typescript
interface DecisionPayload {
  question: string;
  options: Array<{
    id: string;
    label: string;
    rationale?: string;
    rejected_for?: string;
  }>;
  chosen: string;                         // validated ∈ options[].id
  rationale: string;
  principal_id: string;
  input_trust_min?: number;               // 0..1 — minimum `trust` value among recalled facts that informed the decision (honest summary statistic; avoids false precision of a "weighted average" we can't actually compute). Rolled up by Eureka at `decide()` time when `recalled_fact_ids` is supplied. [v4-rev2: renamed from `input_trust_avg` per Skeptic F5 — `min` reflects the actual semantic (weakest provenance link) without implying we computed a meaningful average]
  reasoning_confidence?: number;          // 0..1 — agent's self-assessed certainty in the conclusion (caller-supplied; replaces former `confidence` field) [v4: Genesta + Aaron — Path 1 needs both provenance and analytic axes]
  supersedes_decision_id?: string;        // auto-emits supersedes edge
  revisit_at?: string;                    // ISO timestamp
  context?: Record<string, unknown>;
  timestamp: string;
}
```

**Flow:**
1. Agent invokes `decide(payload)` — Eureka's ranker + trust scores inform option ordering.
2. On commit, payload is stored as `kind=decision` fact AND emitted to Forge via `toDecisionRecord()`.
3. Forge gets a flat audit record; Eureka retains the full structured form.

**Adapter `toDecisionRecord(payload, sessionContext?): DecisionRecord`** lives at `packages/eureka/src/interop/toDecisionRecord.ts`. Mapping rules:
- `payload.chosen` → `record.chosenOption`
- non-chosen options → `record.alternatives[]` (labels)
- `payload.reasoning_confidence` → `record.confidence`: ≥0.8=`high`, 0.5–0.8=`medium`, <0.5=`low` [v4: Genesta + Aaron — Path 1 needs both provenance and analytic axes]
- `payload.principal_id` → `record.source` (the actual `DecisionSource` union per `packages/types/src/index.ts:47` — `'human' | 'automated_rule' | 'ai_recommendation'`): human principal → `'human'`; agent/LLM principal → `'ai_recommendation'`; automated/system principal (cron, deterministic rule engine, policy hook) → `'automated_rule'`. The mapping is an exhaustive switch on principal kind. [v4-rev2: corrected — previous draft used non-existent `'human_decision'` and omitted `'automated_rule'`]
- `payload.rationale` → `record.evidence[0]`

**Adapter contract [v4: Crispin]:** `toDecisionRecord()` is a **lossy projection**. Discarded: `options[].rationale`, `options[].rejected_for`, numeric `reasoning_confidence` granularity, `input_trust_min` (Forge has no provenance-axis field), `context`. Eureka's fact store is the authoritative record. **Round-trip (DecisionRecord → DecisionPayload via the same adapter) is NOT supported** — use the separate ingestion path (FR-14) for that direction.

**Adapter invariants:**
1. `chosen` must reference an option present in `alternatives` (after projection).
2. `principal_id` → `source` mapping is an **exhaustive TypeScript switch** over all three `DecisionSource` values (`'human' | 'automated_rule' | 'ai_recommendation'`). Adding a new `DecisionSource` value upstream is a compile-time break here — intentional. [v4-rev2]
3. `record.timestamp` must equal the Eureka fact's `created_at`.

### FR-11: Commitment Registry

v1 = **pull-with-boost only**. Commits set `committed=true` and pin to hot tier; ranker boost surfaces them in `recall`. `retire()` is explicit-only. Sweep flags long-untouched commits with `stale_aspiration` but never auto-retires.

`list_active_commitments(scope)` deferred to v1.5. `commit_floor?` opt-in soft floor on recall deferred to v2.

Aspirations are encoded as `kind=aspiration` facts within `integrate`, with lighter surfacing and sweep-emitted staleness flagging.

### FR-12: Opportunistic Sweep + Extraction-Ready Learning Kernel

**Triggers:** end-of-session, first-query-of-day.

**v1.5 precision opportunity [v5: Edgar R8 §2 — opportunistic, not a v1 commitment]:** Currently the sweep infers "end-of-session" heuristically (caller-driven `end()` or next-query catch-up). With shared `session_id`, Cairn's session-end events (already emitted by `packages/cairn/src/hooks/sessionStart.ts` for stale-session detection) become an **authoritative** trigger — Eureka sweep can fire immediately on Cairn's `session_end` payload (which now carries the shared `session_id`) rather than guessing from activity gaps. This is a **v1.5 refinement, not a v1 blocker** — v1 sweep retains the existing trigger model. The shared identifier enables the v1.5 refinement without introducing runtime cross-DB JOINs (the trigger is event-driven, not query-driven). If a missed event occurs, the sweep falls back to the v1 cadence-based trigger per FR-7.4 reliability contract.

**Sweep operations (5 atomic phases):**
1. Importance decay (hot tier: every access; warm/cold: sweep-scheduled).
2. Tier demotions per session-count hysteresis (N/M tunable).
3. Tier 2 edge population (`similar_to`, `co_accessed_with`, `recalled_in`).
4. Stale flag emission (`stale_aspiration`, `stale_trust`).
5. Edge weight reconciliation against new evidence (no fact mutation).

(Path 2 in-flow decision ingestion via `fromDecisionRecord()` is **NOT** a sweep phase — it is its own first-class FR; see FR-14.) [v4: split from FR-12 per Aaron directive]

**Extraction-ready design [v4: converged Edgar + Genesta + Graham]:**

Sweep, ranker, and trust modules live in `packages/eureka/src/learning/` in v1. They are **designed for extraction** to `packages/learning-kernel/` in v1.5+ if/when Cairn chooses to adopt. Extraction is a Cairn-team decision; Eureka does not block on it.

The extraction-readiness contract has **seven enforcement mechanisms** (single integrated requirement; not overlapping checks):

1. **TypeScript subpath export** (`packages/eureka/package.json`):
   ```json
   { "exports": { ".": "./dist/index.js", "./learning": "./dist/learning/index.js" } }
   ```
   This is the compile-time firewall.

2. **Folder layout (enforced):**
   ```
   packages/eureka/src/
     learning/          # extraction-ready (generic; no Eureka domain types)
       index.ts         # barrel: sweep, computeRank, updateTrust
       types.ts         # shared vocabulary: Cursor<T>, Scorer<T>, RankInput, TrustEvent
       sweep.ts
       ranker.ts
       trust.ts
       __tests__/
     activities/        # Eureka-specific orchestration (calls learning/ with Fact scorers)
     facts/             # Eureka domain types (Fact, Tier, Kind)
     interop/           # toDecisionRecord, fromDecisionRecord
   ```

3. **Interfaces forbid domain types.** Public APIs in `learning/` MUST NOT reference `Fact`, `AttentionTier`, `ActivityType`, or any Eureka-specific type — directly or via generic parameter constraints. Allowed in signatures: primitives, plain data interfaces defined in `learning/types.ts`, `Database` handles.

   Reference signatures:
   ```typescript
   function sweep(db: Database, config: SweepConfig): SweepResult;
   function computeRank(input: RankInput): number;
   function updateTrust(event: TrustEvent, currentTrust: number): number;
   ```

   Eureka's learning modules MUST go through abstract data-source interfaces (e.g., `SweepDataSource`) so a future Cairn adapter implements the same interface against Cairn's tables without schema migration. [v4: Crispin extraction contract]

4. **Plain-data test pattern. [v4-rev2: deferred to v1.5 — Skeptic + Pragmatist YAGNI]** Tests in `learning/__tests__/` use plain data objects only — no Eureka fixtures, no `Fact` mocks. Tests must be copy-pastable into the future kernel package verbatim. A canary test (`kernel-isolation.test.ts`) imports the public `learning/` API and asserts zero resolved Eureka type dependencies. **Ship in v1.5** when extraction is concrete enough to drive the canary's specific assertions; v1 covers extraction-readiness via mechanisms #1, #2, #3, #5, #6.

5. **Lint + CI enforcement.** ESLint `no-restricted-imports` bans `learning/**` from importing `../facts/**`, `../activities/**`, `../storage/**`, `../tiers/**`. A CI gate runs the canary test + lint on every PR. **Failing the gate fails the build.** [v4: Genesta lint rule + Graham canary gate]

6. **`DESIGN.md` (living architectural contract) [v4: Edgar]:** `packages/eureka/DESIGN.md` documents the extraction contract, known algorithm divergences from Cairn (ranker formula, sweep mechanics), and the v1.5+ extraction checklist. It is updated alongside any change to learning module interfaces.

7. **TypeScript branded types for `Confidence` and `Trust` [v4: Crispin + Genesta — confidence/trust orthogonality; v4-rev2: deferred to v1.5 — Skeptic + Pragmatist YAGNI].** Eureka exposes `Trust` as a branded numeric type (`type Trust = number & { readonly __brand: 'Trust' }`); Cairn (or any learning-kernel adopter) exposes `Confidence` as a separately branded type. The compiler rejects accidental cross-assignment (`f.trust` cannot be passed where `Confidence` is expected, and vice versa). No implicit conversion is provided; any cross-axis composition must be explicit and documented. **Ship in v1.5** when the learning-kernel extraction is on the table and a real cross-package consumer exists. In v1, the §7.4 prose + glossary "NOT equivalent" guards + module-internal discipline carry the orthogonality contract without compiler enforcement.

**v1 vs v1.5 enforcement scope [v4-rev2: I1 — seven mechanisms = YAGNI for v1 ship] [v5: SessionId boundary added as mechanism #8, ships in v1 — see below]:** Five of the seven extraction-readiness mechanisms ship in v1 (#1 subpath export, #2 folder layout, #3 interface ban, #5 lint+CI, #6 DESIGN.md). Two ship in v1.5 (#4 plain-data tests/canary, #7 branded types) — both depend on a concrete second consumer to drive their design. The architectural vision (seven mechanisms total) is preserved; the v1 scope is the subset that pays for itself without extraction pressure. **Mechanism #8 (cross-system session-type import ban) ships in v1** because the shared `SessionId` brand creates a new import boundary that needs guarding from day one — see below.

8. **Cross-system session-type ESLint guardrail [v5: NEW — Graham R8 enforcement gate; ships in v1].** An ESLint `no-restricted-imports` rule bans Cairn code from importing Eureka session types (`SessionFact`, the `kind='session'` fact shape) and bans Eureka code from importing Cairn session types (`Session`, `SessionStatus`, etc.) — **with one exception: the shared `SessionId` brand from `@akubly/types`, which both packages MAY (and MUST) import.** This rule operationalizes Genesta R8 guardrails G2 (no runtime traversal helpers) and G3 (`SessionId` lives in `@akubly/types`, not in either domain package). Violations fail the build. Adding any new shared session structure beyond `SessionId` requires a new R-cycle design review (Graham R8 enforcement gate).

### FR-13: Session Model

Sessions are **`kind=session` facts** in Eureka's fact store. They are NOT a sibling table and NOT a field on every entry.

**Schema [v5: `cairn_session_id?` (optional, opaque) → `session_id: SessionId` (required, branded; the shared Copilot CLI session UUID); `fact.id` remains the primary key, `session_id` is a content/grouping field — one CLI session may produce many `kind=session` facts (start, mid-session checkpoints, close, multi-process observers)]:**

```typescript
{
  id: FactId,                   // internal Eureka fact ID (UUID v4); distinct from session_id; the graph-traversal handle
  kind: 'session',
  session_id: SessionId,        // REQUIRED — the shared Copilot CLI session UUID; SessionId brand from @akubly/types
  content: string,              // caller-supplied summary; REQUIRED in v1
  sources: string[],
  trust: Trust,
  importance: number,
  attention: AttentionTier,
  created_at: string            // ISO timestamp
}
```

**Session edges** (added in v3 OQ-9, retained in v4):
- Tier 1 (eager): `originated_in, modified_in, referenced_in`
- Tier 2 (sweep, per-session dedup): `recalled_in`

Edge schema: `(from_id, to_id)` reference `fact.id` (KR convention; see Crispin R8). `session_id` lives as a **content field** on session-facts, so queries like "all facts for session X" are a single filter on `session_id` (no multi-hop traversal). Edges still join facts to session-facts by `fact.id`; the shared `session_id` field is what makes the session-fact identifiable by an external (Cairn) identifier. [v5: Edgar framed continuity recall as "3-hop → 1-hop"; Crispin's KR model expresses the same gain as a single-column filter on `session_id` — both descriptions are consistent. See US-2 AC-2.3 and §14 for latency framing.]

**Shared `SessionId` brand [v5: NEW — Aaron R8 directive; relaxes v4-final "isolated by design" stance]:** Cairn's `Session` and Eureka's `kind=session` fact are **the same session entity viewed through two lenses** — Cairn the operational lifecycle lens, Eureka the epistemological artifact lens. They share **one identifier**: the Copilot CLI session UUID (e.g., `~/.copilot/session-state/{uuid}/`). To make this honest at the type level, both packages import a shared branded primitive from `@akubly/types`:

```typescript
// packages/types/src/session.ts (NEW)
/**
 * Session identifier shared across Cairn (operational lifecycle) and
 * Eureka (epistemological artifact). Represents the Copilot CLI session UUID.
 * Brand prevents accidental confusion with FactId / DecisionId / arbitrary string.
 */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** Type guard — validates UUID v4 format (permissive on case). */
export function isSessionId(value: unknown): value is SessionId {
  return typeof value === 'string'
    && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
}

/** Constructor — validates and brands; throws on invalid input. */
export function SessionId(value: string): SessionId {
  if (!isSessionId(value)) throw new TypeError(`Invalid SessionId: expected UUID v4, got "${value}"`);
  return value as SessionId;
}
```

**Why a branded primitive, not an opaque class** [v5: Crispin R8 rationale]:
- Branded primitives provide compile-time safety with zero runtime overhead; values are still strings under the hood, so they serialize naturally to SQLite TEXT, JSON, file paths, CLI args. An opaque nominal class would require `new SessionId(value)` everywhere and add serialization/deserialization boilerplate with no representational benefit.
- The same pattern is precedent for `Trust` and `Confidence` in this codebase (FR-12 enforcement mechanism #7, deferred to v1.5).
- `SessionId` ships in v1 (not v1.5) because (a) it is a **shared identifier** load-bearing across two packages from day one — unlike `Trust`/`Confidence` which were single-package internals at v1 — and (b) Aaron's R8 directive explicitly requires it.

**Why this is a shared TYPE, not a shared INTERFACE or BASE CLASS** [v5: Genesta R8 fold, guardrail G2/G3]:
- `SessionId` is a scalar identifier wrapper — a *reference*, not a session-state object. It documents that the two systems point at the same underlying entity.
- There is **no shared `SessionBase` interface**. Cairn's `Session` (`{id: SessionId, repoKey, branch, startedAt, endedAt, status, ...}`) and Eureka's session-fact (`{id: FactId, kind:'session', session_id: SessionId, content, trust, importance, ...}`) remain structurally independent.
- No runtime traversal API in v1 or v1.5: neither package exposes `Session.getEurekaFacts()` or `SessionFact.getCairnSession()`. Cross-system traversal is offline-only via `eureka reconcile` (FR-7.4).

**Namespace discipline [v4: Aaron signal (a) + Genesta amendment] [v5: revised — type isolation relaxed, lens framing remains the normative guard]:** "Session" is THE Copilot nomenclature — both Cairn and Eureka use the name on purpose. They own **different things**:

- **Cairn** owns operational sessions (`packages/cairn/src/db/sessions.ts` → `Session`, `SessionStatus`): lifecycle, repo_key, branch, started_at, ended_at, status. Answers: "What happened?"
- **Eureka** owns epistemological sessions (`packages/eureka/src/facts/types.ts` → `SessionFact`, `kind='session'`): what was learned, continuity, trust, attention. Answers: "What did I learn during session X?"

The two types share **identity only** (the `SessionId` brand); all other attributes remain system-specific. **The lens framing — Cairn = lifecycle, Eureka = epistemology — is the normative guard against coupling drift, not type isolation.** [v5: explicitly DELETES the v4-final sentence "The two type namespaces are kept **isolated by design** — there is NO shared `SessionBase` interface, no compile-time type hierarchy linking them. Correlation is runtime only, via the opaque `cairn_session_id` field." That defensive framing was Genesta's R6 amendment; Genesta R8 folded it with grace ("defensive pessimism vs honest design") — see `.squad/decisions.md` § "Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)" (2026-05-26).] [v5: Aaron R8 directive verbatim signal: emergent shared structure between the two lenses is **welcomed long-term**, not foreclosed — `SessionId` is the first such structure; future shared structures (if/when a concrete need materializes) require a new R-cycle design review per Graham R8 enforcement gate.]

**Query guidance** (documented in both codebases):
- "What sessions ran on repo X?" → query Cairn's `sessions` table.
- "What did I learn during session Y?" → query Eureka's `kind=session` facts filtered by `session_id` (single-column exact match).
- "Show me all facts (decisions, aspirations, etc.) authored during session Y" → traverse `originated_in` / `modified_in` edges from the session-fact(s) for that `session_id`.
- Eureka does NOT cross-database JOIN to Cairn at runtime. Schema comments in both stores explicitly forbid this. [v5: rule unchanged from v4-final; the shared brand is a type-level construct, not a runtime FK]

**Schema comments [v4: Crispin Risk #5 mitigation] [v5: updated wording — same enforcement, honest naming]:**
- Cairn `sessions` table: `-- Operational sessions — runtime execution scope. id is a SessionId (shared with Eureka kind=session facts, see @akubly/types). For knowledge sessions, see Eureka kind=session facts. DO NOT JOIN across databases (FR-7.2).`
- Eureka session facts: `-- Knowledge sessions — learned memory scope. session_id is the shared SessionId (same Copilot CLI session UUID as Cairn's sessions.id). DO NOT JOIN across databases at runtime; correlation is type-level only (FR-7.2). For lifecycle, query Cairn directly.`

**Cairn → Eureka session-fact trigger policy (v1) [v4: Aaron approved manual-only; closes OQ #5] [v5: unchanged by R8 — see Graham R8 §5 OQ note]:** Manual only — via explicit `remember()` call by an agent or human. No automatic promotion from Cairn sessions to Eureka session-facts. The shared `session_id: SessionId` field on Eureka facts preserves traceability and makes cross-system queries exact-match. Auto-trigger heuristics (e.g., session-shape-based promotion, Cairn session-end event subscription) are deferred to v1.5+ pending observed usage patterns. Rationale: honors Path D (no new cross-package runtime coupling in v1), respects "audit trust" framing (intentional act, not automatic), and keeps schema discipline tight.

**Multi-process / multi-perspective sessions [v5: Crispin R8 §3]:** A single Copilot CLI session can produce **many** `kind=session` facts (distinct `fact.id`, same `session_id`): a session-start fact, mid-session checkpoint facts, a session-end fact, and facts authored by separate processes (CLI agent, Forge runtime, future MCP wrapper) observing the same session. This is **a feature, not a bug** — the `session_id` is a grouping key, not a uniqueness constraint. Recall queries can surface the latest fact, concatenate all, or traverse session edges depending on caller intent.

### FR-14: Forge → Eureka In-Flow Decision Ingestion (Path 2) [v4: split from FR-12 per Aaron directive]

**Purpose:** Capture decisions made *during normal LLM exchange* — where the agent did not explicitly invoke `decide` — so Eureka can learn from observed history. This is **active decision capture (Path 2)**, conceptually distinct from FR-12's passive sweep maintenance. Path 2 is an Aaron R7 v1 requirement, not a v1.5 deferral.

**Flow:**
1. Agent makes a decision inline; Forge captures it as `DecisionRecord` (flat audit).
2. A caller (test harness, demo wiring, MCP wrapper) invokes `eureka.ingestDecisions(records)` **on-demand**, passing in a batch of `DecisionRecord`s it has read from Forge. Eureka runs each through `fromDecisionRecord(record): DecisionPayload`.
3. Ingested decision is stored as `kind=decision` fact (lossy projection — see contract).

**Invocation cadence (v1) [v4-rev2: Skeptic + Pragmatist BLOCKING — coupling/UX implications resolved] [v5: `--session <uuid>` CLI form added as v1 surface; shared `SessionId` makes session-scoped ingestion trivially correct — see Edgar R8 §3]:** Path 2 is **on-demand only** in v1. The library exposes **no background process, no scheduler, no event listener, no sweep-coupled trigger.** Callers drive ingestion explicitly. v1 CLI surface:
- `eureka ingest-decisions --since <ts>` — ingest all Forge decisions since a timestamp
- `eureka ingest-decisions --session <uuid>` [v5: NEW] — ingest all Forge decisions for a specific session, scoped by the shared `SessionId` (since Forge's audit log carries the same `session_id` as Eureka, this is a single-column filter on Forge's side; no opaque hinting or timestamp approximation)

Rationale: (1) keeps coupling unidirectional — Eureka still does not observe Forge at runtime; (2) no scheduler decisions to defend; (3) trivially testable; (4) honors Path D — no new background-process surface in v1. Sweep-driven or event-listener cadences are explicitly deferred to v1.5 pending observed usage patterns.

**Default wiring [v4-rev2: Pragmatist F7 — Path 2 wiring premature]:** The adapter code ships in v1, but **default caller wiring is opt-in**, not automatic. `skillsmith-runtime` and similar production harnesses do NOT invoke `ingestDecisions` by default; demo wiring and the MCP wrapper (v1.5) may opt in. See §7.3 for the production-vs-demo wiring policy.

**v1 scope note:** Path 2 (Forge→Eureka decision ingestion) is **deferred to v1.5 unless a v1 production consumer commits to using it**. The design (FR-14), adapters (`fromDecisionRecord()`), CLI (`eureka ingest-decisions`), and demo wiring all ship in v1 as designed above; however, no production caller is expected to wire it by default in v1. If a production consumer (e.g., `skillsmith-runtime`) opts in during v1 dogfood, the full Path 2 implementation remains as specified. If no consumer commits, v1.5 revisits scope. This note does NOT change the FR-14 spec; it clarifies production adoption expectations.

**Adapter `fromDecisionRecord(record): DecisionPayload`** lives at `packages/eureka/src/interop/fromDecisionRecord.ts`. Mapping rules:
- `record.chosenOption` → `payload.chosen`
- `record.alternatives[]` + `chosenOption` → `payload.options[]` (synthesized ids; labels preserved)
- `record.confidence` enum → `payload.reasoning_confidence` numeric (high=0.9, medium=0.6, low=0.3) [v4: Genesta + Aaron — Path 1 needs both provenance and analytic axes]
- `payload.input_trust_min` is left **undefined** — Eureka cannot recover the provenance-axis score from Forge's flat record. [v4-rev2: renamed from `input_trust_avg`]
- `record.source` → `payload.principal_id`: exhaustive switch on the `'human' | 'automated_rule' | 'ai_recommendation'` union — each maps to a principal-kind tag preserved in the Eureka fact for later audit. Unknown source values (forward-compat) fall through to a synthetic `unknown_source` principal kind plus a `bridge.adapter.error` log emission. [v4-rev2]
- `record.evidence[]` → first entry into `payload.rationale`; remainder folded into `options[].rejected_for` where derivable

**Adapter contract:** Lossy in the *opposite* direction from `toDecisionRecord()`. Acceptable: Eureka uses ingested decisions as **learning patterns**, not as authoritative reasoning chains. Forge remains the audit source of truth for retrospective records.

**Schema tolerance [v4: Graham]:** Both adapters are schema-tolerant:
- Unknown fields in `DecisionRecord` are ignored (forward-compatible).
- Missing expected fields use documented defaults (backward-compatible).
- Adapter version is logged in `fact.metadata.adapter_version` for debugging.
- Breaking schema changes in Forge: adapter fails *gracefully* (skip + log warning), never crashes.

**FR-14 adapter invariants [v4-rev2: Skeptic + Pragmatist + Architect F2 — Path 2 spec gaps]:**

1. **Idempotency.** Ingestion is keyed by `DecisionRecord.id` (stable identifier from `packages/types/src/index.ts`). Re-invoking `ingestDecisions` with a record whose `id` already exists in the local Eureka fact store as `metadata.source_record_id` is a **no-op** (does not create a duplicate, does not mutate the existing fact, does not bump `updated_at`). Returns a count of `{ingested, skipped_duplicate, errored}`.

2. **Dedup rule.** Pre-write check: `SELECT 1 FROM facts WHERE kind='decision' AND metadata->>'source_record_id' = ? LIMIT 1`. If hit, skip silently (counted under `skipped_duplicate`). FTS5 index + idx on `metadata.source_record_id` make this O(log n).

3. **Initial trust for Path-2-ingested facts.** Derived from `record.confidence` enum at ingest time: `high → 0.8`, `medium → 0.6`, `low → 0.4`. Stored as the fact's `trust` value at `created_at`; normal trust dynamics (verification, contradiction, contemplate) apply thereafter. This resolves Architect F2 (undefined initial trust). Documented as the seed value, not a permanent ceiling. [v4-rev2]

4. **Ordering / freshness SLO.** v1 makes **no ordering guarantee** beyond: the Eureka fact's `created_at` equals the ingestion timestamp (NOT `record.timestamp` — that is preserved as `metadata.source_timestamp` for audit). Callers ingesting out-of-order batches will see facts created in batch order, not record-timestamp order. v1.5 may add an `ingestionOrdering: 'by-source-timestamp' | 'by-arrival'` option.

5. **Exhaustive `DecisionSource` handling [v4-rev2: B1 reciprocal].** `record.source` mapping covers all three union members (`'human' | 'automated_rule' | 'ai_recommendation'`) via TypeScript exhaustive switch. Unknown values are routed to `unknown_source` principal kind with a `bridge.adapter.error` log. The round-trip type check (FR-10 invariant #2 + this invariant) jointly enforce coverage of all three sources.

6. **Reconciliation hook.** Every successful ingest writes to the Eureka-owned bridge ledger (see FR-7.4) so the offline reconciliation CLI can diff `{ingested in Eureka}` against `{exists in Forge}` without runtime cross-DB queries.

---

## 7. Architecture

### 7.1 Boundary Policy — Observation vs. Ownership [v4: Graham amendment 1]

Eureka and Cairn/Forge coexist as **peer systems with complementary purposes**. Path D (design kernel-shaped, ship standalone, defer Cairn refactor) is the canonical strategy. [v4: Aaron signal (d), Path D]

| Concept | Cairn/Forge role | Eureka role | Authoritative source | Bridge direction |
|---|---|---|---|---|
| **Sessions** | Operational observability (lifecycle, timing, status) | Epistemological artifact (what was learned, continuity) | Cairn for lifecycle; Eureka for knowledge | Cairn → Eureka (session-start MAY trigger fact creation); shared identity via `SessionId` brand (see FR-13) [v5] |
| **Decisions (contemplative, Path 1)** | Audit sink for Eureka-originated decisions | Source of structured deliberation | Eureka | Eureka → Forge via `toDecisionRecord()` |
| **Decisions (in-flow, Path 2)** | Source of in-flow audit records | Learning ingestor of observed history | Forge for audit; Eureka for learning patterns | Forge → Eureka via `fromDecisionRecord()` |
| **Sweep / Ranker / Trust** | Prescription-scoped (Curator/prescriber) | Knowledge-scoped (FR-2, FR-3, FR-12) | Independent implementations | No runtime bridge in v1; same *pattern* applied to different domains |

**Coexistence rules:**
1. Eureka OBSERVES Cairn/Forge events; it does NOT mutate their state.
2. Cairn/Forge do NOT read Eureka's fact store.
3. Cross-system session correlation is via the shared `session_id: SessionId` brand (see FR-13). The shared identifier is a **type-level construct**, never a runtime FK; no cross-DB JOINs or ATTACH queries at runtime (FR-7.2). [v5: was "Optional `cairn_session_id` linking is for audit correlation only, never an enforced FK." — semantic change: identity is now first-class and required on session-facts; rule prohibiting runtime cross-DB joins is unchanged]
4. On disagreement (Cairn says session ended, Eureka still sweeping), **Cairn wins for lifecycle**; Eureka continues async processing.
5. Decision pathways are **complementary, not redundant** — see §7.2.

### 7.2 The Two Decision Pathways [v4: Aaron R7 bidirectional directive — CRITICAL]

Decision-making in this stack has two distinct modes. Both are first-class.

#### Path 1 — Contemplative (Eureka → Forge)
Agent uses Eureka facts/edges to reason its way to a decision. The decision is *already* a Eureka structure (`DecisionPayload`). On commit, Eureka emits `toDecisionRecord()` to populate Forge's audit stream.

- **Verb:** `decide` (FR-10)
- **Direction:** Eureka → Forge
- **Use case:** Deliberate "let me think about this with my full knowledge graph" workflows.

#### Path 2 — In-Flow (Forge → Eureka)
Agent makes a decision during normal LLM message exchange — no explicit `decide` invocation. Forge captures the audit as `DecisionRecord`. Eureka's sweep ingests via `fromDecisionRecord()` to learn from observed history.

- **Mechanism:** In-flow ingestion (FR-14)
- **Direction:** Forge → Eureka
- **Use case:** Spontaneous "I'll decide now, reflect on the pattern later" workflows.

**Why both are needed:** A system that only supports proactive deliberation misses everything agents decide in flow. A system that only learns from in-flow records cannot help agents reason deliberately. Both pathways are load-bearing. Both adapters live in Eureka. **Forge changes nothing.** [v4: Graham blessing]

**No circular dependency:** the two adapters are inverses but operate in non-overlapping contexts — one decision starts in Eureka and flows out for audit; the other starts in execution, is captured by Forge, and flows in for learning.

### 7.3 Decision-Record Kinship Across Cairn / Forge / Eureka [v4: Aaron signal (b)]

Forge's existing `DecisionRecord` already encodes **human decisions** alongside agent and automated-rule decisions (`source: 'human' | 'automated_rule' | 'ai_recommendation'`, per `packages/types/src/index.ts:47`). This matters: it means the audit substrate is already designed to build trust across all three principal kinds, not just log agent activity. Eureka's `DecisionPayload` is "closer in spirit" to that intent than the raw structural diff suggests — both schemas exist to make reasoning chains inspectable. The adapters bridge mechanics, not meaning. [v4-rev2: prose corrected to match actual union]

**Production-vs-demo wiring policy [v4-rev2: I7 — Pragmatist F7; Path 2 wiring premature for production in v1]:** The Path 1 and Path 2 adapter **code** ships in v1. The **default caller wiring** differs by environment:
- **Production harnesses** (e.g., `skillsmith-runtime`, deployed agents): adapters are **opt-in**. Production code paths do not invoke `ingestDecisions` automatically. Opt-in is a single config flag once the production caller is ready to consume Path 2 facts.
- **Demo / development wiring** (killer-demo harness, `eureka` CLI, future MCP wrapper in v1.5): may opt-in by default to exercise the full bridge.

Rationale: Path 2 ingestion produces facts whose downstream consumption is not yet well-characterized in production; we want demos to exercise it (so we learn) without forcing every production caller to absorb the cognitive load in v1. By v1.5 the wiring decision is informed by demo data.

### 7.4 Substrate Overlap as a Feature [v4: Aaron signal (c); confidence/trust framing revised per Crispin + Genesta]

Two convergence points across the stack are intentional, not accidental:
- **Sweep:** Cairn's Curator + Eureka's opportunistic sweep — same maintenance-sweep pattern, different data models (events vs. facts).
- **Curator / Prescriber ≈ Sweep / Ranker:** Cairn's curator-then-prescriber pipeline mirrors Eureka's sweep-then-rank flow.

**Confidence vs Trust [v4: NOT substrate kin — orthogonal axes]:** Cairn's `confidence` (on prescriptions) and Eureka's `trust` (on facts) are both 0..1 event-driven scalars, but they measure **orthogonal properties**: `confidence` = epistemic strength of a derived conclusion from analysis; `trust` = provenance reliability of stored knowledge. They are NOT interchangeable. No function may accept a generic "certainty score" — signatures must explicitly specify `Confidence` or `Trust` (TypeScript branded types; see FR-12 enforcement mechanism #7). Composition (e.g., ranking that considers both) must be explicit.

**Session identity IS shared substrate [v5: Aaron R8 directive]:** In contrast to confidence/trust (which look similar but are orthogonal), Cairn's `Session.id` and Eureka session-facts' `session_id` field hold **the same value** — the Copilot CLI session UUID — typed through the shared `SessionId` brand from `@akubly/types`. This is honest substrate kinship: one entity, two lenses. The shared brand documents the kinship at the type layer; the no-runtime-cross-DB rule (FR-7.2) keeps the *implementations* independent. Emergent shared structure between the two lenses is welcomed long-term, not foreclosed — see FR-13.

These convergent designs (sweep + curator-pattern kinship, plus shared session identity) are why Path D is credible: the substrate is already kernel-shaped in pattern AND honestly named at the identifier layer. Path D bets that explicit interface design now makes the eventual shared kernel a refactor, not a rewrite. Confidence/trust, by contrast, must remain distinct in any kernel extraction.

### 7.5 Cairn Adoption Playbook (if/when) [v4: Graham amendment 4]

If/when the Cairn maintainer chooses to adopt Eureka's learning primitives:

**Phase 1 — Interface extraction (no behavior change):**
1. Extract `learning-kernel/src/interfaces.ts` (`Ranker<T>`, `SweepConfig`, `TrustTracker`, etc.).
2. Cairn's `computePriority()` stays unchanged, but `implements Ranker<Prescription>`.
3. Eureka's ranker `implements Ranker<Fact>`.

**Phase 2 — Utility sharing (optional, if overlap warrants):**
1. Extract shared decay functions (`computeRecencyWeight`) to `learning-kernel/src/decay.ts`.
2. Both packages import from `decay.ts`.

**Phase 3 — Full adoption (future, Cairn-team decision):**
1. If Cairn wants Eureka's full composite ranker, replace `computePriority()` with configurable weights.
2. No timeline pressure from Eureka.

**Non-goal:** Forcing Cairn to use Eureka's exact ranking formula. Prescription ranking ≠ knowledge ranking. The kinship is at the *pattern* layer, not the formula layer.

### 7.6 Schema Versioning Policy [v4: Graham amendment 5B]

- Unknown fields in `DecisionRecord` (or Cairn session payloads) are **ignored** by Eureka's adapters.
- Missing expected fields use documented defaults.
- Adapter version is recorded in `fact.metadata.adapter_version` for traceability.
- Breaking Forge schema changes: adapters fail gracefully — skip the record, log a warning, never crash.
- **Adapter drift detection [v4: Crispin Risk #3]:** Shared contract types live in `@akubly/types`. Forge MUST NOT make breaking changes to `DecisionRecord` without coordinating with Eureka. A CI integration test emits a sample `DecisionRecord` from Eureka and validates the shape against Forge's published types.

### 7.7 Storage Layout (consolidated)

```
~/.cairn/knowledge.db                  # Cairn (untouched by Eureka)
~/.copilot/eureka/agent.db             # Eureka agent-tier facts
~/.copilot/eureka/user.db              # Eureka user-tier facts
<repo>/.eureka/project.db              # Eureka project-tier facts
```

Each Eureka DB has its own `facts` + `relations` + `facts_fts` (FTS5 virtual) tables. No cross-database ATTACH; no FK references between Eureka tiers; tier-to-tier resolution happens in app code.

---

## 8. Non-Functional Requirements

### NFR-1: Performance
- `recall` P95 < 500ms (US-1).
- Continuity recall P95 < 200ms (US-2).
- Sweep is non-blocking; bounded by tier scope (tier 1 is small by design).

### NFR-2: Scalability
- v1 target: hundreds to low thousands of facts per tier.
- Schema scales to millions per tier (sqlite-vec at v1.5 enables semantic recall at scale).

### NFR-3: Reliability
- No data loss on crash (WAL mode).
- Bridge contracts per FR-7.4 (no silent divergence).
- Trust never silently mutated by sweep.

### NFR-4: Observability
- Structured logs per FR-7.3.
- `eureka stats` CLI surfaces fact counts per tier, sweep timings, adapter error rates.

### NFR-5: Security
- File-system permissions on tier DBs; project-tier DB owned by repo, not user account.
- No remote calls in v1 (local-first; sync deferred to v2).
- No PII handling beyond what's in `content` (caller responsibility).

### NFR-6: Operational Resilience [v4: Graham amendment 5A]

**Backup/Restore:**
- Eureka's `.db` files are independent of Cairn's — partial restore is safe (no FK constraints).
- Dangling `session_id` references are tolerated — they point to a (possibly deleted) Cairn session via the shared `SessionId` brand, but Eureka enforces no FK constraint. The session-fact's content/trust/edges retain value independently. [v5: rewording from "cairn_session_id" → "session_id"; semantics unchanged — Eureka facts remain decoupled from Cairn lifecycle per Path D]
- Full export: `eureka export --format=json` produces a self-contained fact graph (no external refs).

**Disaster Recovery:**
- If Eureka DBs are lost: rebuild from scratch (no historical knowledge, but functional).
- If Cairn DB is lost: Eureka facts retain value (knowledge persists even if events are gone).
- Cross-system consistency is NOT guaranteed — **by design** (Path D decoupling).

**Migration/Portability:**
- Eureka facts are CRDT-friendly per schema design.
- `eureka sync` (cross-machine merge) is v2 scope.

---

## 9. Glossary [v4: formalized per directive]

| Term | Definition |
|---|---|
| **Session** | A unit of agent activity. Cairn owns the operational lifecycle (`sessions` table); Eureka owns the epistemological artifact (`kind=session` facts). Same word by design; different mechanics; **same identifier** — both reference the Copilot CLI session UUID via the shared `SessionId` brand in `@akubly/types`. The two types remain structurally independent (no shared `SessionBase`, no runtime traversal API). Linked through shared identity, kept apart through the no-cross-DB-ATTACH rule (FR-7.2) and lens framing (Cairn = lifecycle, Eureka = epistemology). [v5: was "linked only via opaque `cairn_session_id`" — Aaron R8 directive] |
| **DecisionRecord** | Forge's flat, audit-shaped record of a decision. Source of truth for retrospective audit. Owned by Forge. |
| **DecisionPayload** | Eureka's structured, learning-shaped record of a decision. Source of truth for contemplative deliberation. Owned by Eureka. |
| **Path 1 (Contemplative)** | Decision pathway where the agent uses Eureka facts/edges to reason its way to a choice. Direction: Eureka → Forge via `toDecisionRecord()`. Verb: `decide`. |
| **Path 2 (In-Flow)** | Decision pathway where the agent decides during normal LLM exchange. Forge captures via `DecisionRecord`; Eureka ingests via `fromDecisionRecord()`. Direction: Forge → Eureka. Mechanism: sweep ingestion. |
| **Kernel boundary** | The compile-time + lint-time + CI-enforced boundary around `packages/eureka/src/learning/`. Inside the boundary: generic types only, no Eureka domain leakage. Outside: Eureka-specific orchestration. Enforced via subpath export, ESLint rules, canary test. |
| **Sweep (Eureka)** | Opportunistic, fact-maintenance sweep (FR-12). Triggers: end-of-session, first-query-of-day. Operations: importance decay, tier demotion, Tier 2 edge population, stale-flag emission, edge weight reconciliation. Stateless (operates on current fact state). Note: Path 2 in-flow decision ingestion is **not** a sweep phase — see FR-14. |
| **Sweep (Cairn)** | Curator/prescriber event-log sweep. Stateful cursor, time-bounded (3s soft cap), pattern-detection over events. Same *pattern* as Eureka's sweep but different data model. No runtime coupling in v1. |
| **Curator / Prescriber** | Cairn's pattern-detection-then-recommendation pipeline. Conceptual kin to Eureka's sweep-then-rank flow. Independent implementations; Cairn-team may adopt Eureka's primitives at its own pace (§7.5). |
| **Confidence** | Cairn-domain epistemic scalar (0..1) on prescriptions. Measures certainty about a derived recommendation. **NOT equivalent to Eureka's `trust`** — they are orthogonal axes. No implicit conversion allowed. Enforced via TypeScript branded types (FR-12 enforcement mechanism #7). |
| **Trust** | Eureka-domain provenance scalar (0..1) on facts. Measures reliability/factuality of stored knowledge. Floor: 0.15. Event-driven only — no automatic decay. Mutated by `contemplate`, verification, contradiction, explicit writes. **NOT equivalent to Cairn's `confidence`** — they are orthogonal axes. No implicit conversion allowed. Enforced via TypeScript branded types (FR-12 enforcement mechanism #7). |
| **Attention tier** | hot / warm / cold. Drives ranker multiplier (1.20 / 1.00 / 0.80). Transitions: default warm; `commit` → hot; `retire` → warm; sweep-aged demotion; no auto-promotion. |
| **Persistence tier** | agent / user / project. Storage scoping; orthogonal to attention tier. |
| **kind** | Discriminator column on `facts`. v1 values include `session`, `decision`, `aspiration`, and arbitrary caller-defined kinds. |
| **Bridge** | Any cross-system adapter — `toDecisionRecord`, `fromDecisionRecord`, optional Cairn-session-fact emission. Subject to FR-7.4 reliability contract. |

---

## 10. Roadmap

**M0 deliverable (before M1 — baseline eval set):** 10-question eval set (5 train + 5 held-out) against mem/ repo, ground-truthed with file paths and line numbers. Measure grep-baseline (human rediscovery tax) before any Eureka code lands. Wire held-out 5 into CI at M4 as ship-blocker if precision < 80%. Appendix A (below) lists the question set or a placeholder + commitment to land it before M1.

| Capability | v1 | v1.5 | v2 |
|---|---|---|---|
| Core CRUD, attention tiers, trust (event-driven), importance, recall (BM25), rerank, decide (Path 1), commit, retire, evict | ✅ | | |
| `fromDecisionRecord` ingestion (Path 2 — FR-14) | ✅ | | |
| Sweep (decay, Tier 2 edges, stale flags, demotions, revisit_at surfacing — FR-12) | ✅ | | |
| Sessions as facts, Tier 1 session edges, `originated_in` continuity | ✅ | | |
| Graph-ready edge schema (Tier 1/2) + Tier 3 parking lot in spec | ✅ | | |
| Extraction-ready learning kernel (subpath export, lint, canary, DESIGN.md) | ✅ | | |
| Bridge telemetry + reliability contracts | ✅ | | |
| Backup/restore guidance, schema-tolerant adapters | ✅ | | |
| `sqlite-vec` semantic similarity | | ✅ | |
| `contemplate` (narrow+deep reflection, trust refinement, contradicts population) | | ✅ | |
| `meditate` (broad+shallow sweep-style reflection) | | ✅ | |
| `list_active_commitments(scope)` | | ✅ | |
| MCP server wrapper | | ✅ | |
| Extraction of `packages/learning-kernel/` (if Cairn opts in) | | ✅ optional | |
| Squad migration (Eureka as Squad knowledge backend) | | ✅ partial | ✅ full |
| `commit_floor?` opt-in soft floor on recall | | | ✅ |
| Sync layer (CRDT, cross-machine sessions) | | | ✅ |
| Edge traversal API (graph queries) | | | ✅ |

---

## 11. Success Metrics

- **US-1 (Codebase Familiarization):** After one session, agent can answer 5 questions without re-reading; second-session token consumption drops ≥50%; retrieved facts ≥80% precision on the keyword-overlap eval set; recall P95 < 500ms.
- **US-2 (Cross-Session Continuity):** Agent produces a 3-bullet summary using only `recall`; checkpoints re-surface in next-session queries; continuity retrieval P95 < 200ms via session-fact + `originated_in` edge.
- **US-6 (In-Flow Learning):** ≥95% of Forge `DecisionRecord` events ingested by Eureka sweep within one sweep cycle; <1% adapter error rate.
- **Bridge health:** Silent-divergence incidents = 0; reconciliation query returns ∅ in steady state.
- **Extraction readiness:** Canary test green on every PR; `packages/eureka/src/learning/` is movable to `packages/learning-kernel/src/` with no source edits required.

---

## 12. Non-Goals (v1)

1. Multi-modal facts (images, audio, video).
2. Real-time collaboration / concurrent multi-writer.
3. Cross-organization knowledge sharing.
4. Automated eviction beyond explicit `evict`.
5. Community detection / clustering (deferred to v2; graph-ready schema only).
6. Symbolic reasoning beyond edge traversal.
7. Explainability UI.
8. Human-facing GUI.
9. Migration tools from other memory systems.
10. Distributed consensus / CRDT sync (v2).
11. `meditate` / `contemplate` exports (vocabulary-reserved, deferred to v1.5).
12. Semantic similarity recall (deferred to v1.5 with sqlite-vec).
13. Forcing Cairn to extract `learning-kernel` (Path D defers — see §7.5).
14. Round-tripping `DecisionPayload → DecisionRecord → DecisionPayload` (lossy by design; Path 2 is a *separate* ingestion, not a round-trip).

---

## 13. Risks & Mitigations (Schema / Architecture)

These survive v4-final and are tracked, not closed. [v4: consolidated from Crispin's 5 schema risks + Graham's operational concerns]

| Risk | Probability | Severity | Mitigation |
|---|---|---|---|
| **Silent divergence** (bridge believes emit succeeded; sink never received) | Medium | High | FR-7.4 bridge reliability contract: log every emit, retry transient, surface permanent, support reconciliation queries. |
| **Orphaned references** (`session_id` points to a Cairn session row that has been deleted or never existed locally) [v5: reframed from "`cairn_session_id` points to deleted Cairn row" — same risk profile, honest naming] | Low | Low | Treat as a tolerated lifecycle artifact; never JOIN across DBs at runtime (FR-7.2); documented in schema comments + glossary. The shared `SessionId` brand does NOT change the no-cross-DB-ATTACH rule; it is a type-level construct, not an FK. |
| **Adapter drift** (Forge changes `DecisionRecord` without coordination) | Medium | High | Shared `@akubly/types`; CI integration test validates adapter output against Forge's published shape; schema-tolerant ingestion per §7.6. |
| **Round-trip expectation** (developer assumes `toDecisionRecord` ↔ `fromDecisionRecord` is lossless) | Medium | Medium | Explicit non-goal #14; adapter contract docs in FR-10 + FR-14; Eureka fact store is source of truth for Path 1, Forge for Path 2. |
| **Session name ambiguity** (developer conflates Cairn `sessions` table with Eureka `kind=session` facts) | High | Medium | Namespace discipline (FR-13); schema comments in both stores; query-guidance docs; **shared `SessionId` brand enforces compile-time type safety on the identifier itself, but the two `Session` types remain structurally independent (no shared `SessionBase` interface, no runtime traversal API)**; ESLint guardrail (FR-12 enforcement mechanism #8) bans cross-system session-type imports except for `SessionId`. [v5: mitigation updated — type isolation relaxed to shared-brand only; lens framing remains the normative guard; ESLint guardrail added per Graham R8 enforcement gate] |
| **Extraction promise rots** (`learning/` accretes Eureka coupling over months) | Medium | High | Seven-mechanism enforcement (FR-12), **five ship in v1** (subpath export + folder layout + interface ban + lint/CI gate + DESIGN.md); two ship in v1.5 (plain-data tests, branded types) when a concrete extraction consumer exists. Build fails on violation of any shipped mechanism. |
| **Partial backup restore** (user restores Cairn but not Eureka or vice versa) | Low | Medium | NFR-6: documented; dangling refs tolerated; cross-system consistency explicitly not guaranteed. |

---

## 14. Open Questions (Remaining After v4-final)

These are out of scope for v4-final lock; they remain open for v1.5+ planning. [v4: per directive]

1. **Cairn migration timing.** When (if ever) does Cairn extract `packages/learning-kernel/`? Aaron + Cairn maintainer decision, not Eureka's to drive.
2. **BM25 threshold specifics.** The ≥80% precision target on US-1's eval set assumes a 5-question seed. The exact rank-cut threshold, idf weighting tweaks, and stopword set are tuning decisions deferred to implementation. Eval suite ships in v1; thresholds calibrated against it.
3. **Subpath export topology at scale.** v1 exposes `./learning` only. If/when `interop/` or `facts/` need external consumers (e.g., MCP server wrapper in v1.5), the subpath export topology will need expansion — design TBD.
4. **`contemplate` vs `meditate` boundary.** Vocabulary-reserved; activity semantics to be locked in v1.5 design pass. R6 hand-off note still applies.
5. **MCP server wrapper shape.** v1.5 scope; protocol surface TBD.
6. **`commit_floor?` opt-in semantics.** v2 scope; tuning curve and caller ergonomics TBD.
7. **Cross-machine sync (CRDT).** v2 scope; conflict resolution semantics for facts vs. edges TBD.

---

## 14a. Security Threat Model [v4-rev2: B4 — Compliance BLOCKING; adversary model previously absent]

§13 covers implementation/architecture risks. This section adds the **adversary model**: Eureka stores claims about code and decisions and is therefore a target for prompt-injection-style fact tampering, cross-tier data leakage, trust manipulation, and adapter replay. The v1 mitigations below are deliberately modest — Eureka is local-first in v1, single-user, no remote calls (NFR-5). Several controls are honestly deferred to v1.5/v2 when the threat surface widens.

| # | Threat | Vector | v1 Mitigation | Deferred / Future |
|---|---|---|---|---|
| T1 | **Fact tampering** | Malicious agent (or compromised LLM session) writes false high-`trust` `kind=decision` or `kind=long_term` facts that future recalls treat as authoritative. | (a) Every `integrate` call records `principal_id` + `source` provenance in `metadata`; ranker can filter by source kind. (b) Trust floor (0.15) gates retrieval. (c) New writes start at a documented default `trust` (0.6 for explicit, 0.5 for derived); callers cannot specify > 0.8 at write without a verified-source flag. (d) Bridge ledger (FR-7.4) provides audit trail. | Cryptographic provenance / signed writes → v2. Per-principal trust caps → v1.5. |
| T2 | **Cross-tier leakage** | Project-tier fact contains user-tier PII or secrets (e.g., agent captures a fact about "user's API key handling" and writes it to `<repo>/.eureka/project.db` where teammates can read it). | (a) `Fact.scope` is required at write; mismatch between `scope` and target DB rejected at the storage layer. (b) Project-tier writes pass through a documented allowlist of `kind` values (`session`, `decision`, `aspiration` — not raw caller content) in v1. (c) Schema comments warn against writing PII content into project-tier. | Automatic PII scanning at write time → v1.5. Per-field encryption at rest → v2. |
| T3 | **Trust manipulation** | Adversary (or buggy agent) repeatedly confirms its own facts to boost `trust` to the ceiling, effectively pinning false content. | (a) Trust mutations are event-driven (FR-3); each event records `principal_id`. (b) v1 cap: same-principal confirmations stop incrementing trust after N=3 events per fact (configurable). (c) Contradiction signal (Tier 1 `contradicts` edge) decrements trust regardless of source. | Confirmation-diversity rule ("requires K distinct principals") → v1.5. Reputation-weighted trust mutations → v2. |
| T4 | **Adapter replay** | A `DecisionRecord` from Forge is replayed (e.g., from a stale log) → Eureka would naively create a duplicate `kind=decision` fact, inflating apparent decision history. | Idempotency keyed by `DecisionRecord.id` (FR-14 invariant #1) + pre-write dedup (FR-14 invariant #2). Replay is a no-op counted under `skipped_duplicate`. | — (v1 mitigation considered sufficient). |
| T6 [v5: REFRAMED from v4-rev2 implicit T-orphan-via-NFR-6; T-orphan was tracked in §13 + NFR-6, not §14a — included here for adversarial completeness] | **Stale session reference** | A `kind=session` fact's `session_id` references a Cairn session that was deleted, never existed locally, or belongs to a different machine (e.g., partial backup restore, multi-machine sync gap pre-v2). | Tolerated per NFR-6 + Path D decoupling: Eureka facts retain value independently of Cairn lifecycle. Required field at write time (a session-fact cannot be authored without a `session_id`), so no NULL-induced ambiguity. The shared `SessionId` brand is a type-level construct; no runtime FK to enforce. Reconciliation CLI surfaces the divergence. [v5: severity unchanged from v4-final T-orphan tracking (LOW/LOW); wording revised — "dangling `cairn_session_id` audit ref" → "stale `session_id` reference" — same risk, honest naming per Aaron R8] | Cross-machine sync conflict resolution → v2 (CRDT layer). |

**v1 Threat Control Implementation Status:**

| Control | Implementation Status | Notes |
|---|---|---|
| T1(a) — Provenance recording | **Code-enforced** | Every `integrate` call records `principal_id` + `source` in `metadata`; storage layer rejects writes without these fields. |
| T1(b) — Trust floor (0.15) | **Code-enforced** | Default predicate in ranker; overridable per-query via `min_trust` param. |
| T1(c) — Write trust caps | **Code-enforced** | New facts cap at documented defaults (0.6 explicit, 0.5 derived); >0.8 requires verified-source flag checked at storage layer. |
| T1(d) — Bridge ledger audit trail | **Code-enforced** | FR-7.4 bridge reliability contract; every emit/ingest writes to `bridge_ledger`. |
| T2(a) — Scope mismatch rejection | **Code-enforced** | Storage adapter checks `Fact.scope` matches target DB; throws on mismatch. |
| T2(b) — Project-tier kind allowlist | **Code-enforced** | Project-tier write path allowlists `kind ∈ {session, decision, aspiration}`; rejects other kinds. |
| T2(c) — Schema PII warnings | **Policy-enforced** | Schema comments + developer docs warn against PII in project-tier; no runtime scanning in v1. |
| T3(a) — Trust mutation principal tracking | **Code-enforced** | FR-3 event-driven trust; each mutation event logs `principal_id`. |
| T3(b) — Same-principal confirmation cap | **Code-enforced** | Configurable cap (default N=3) enforced in trust mutation handler; stops incrementing after N same-principal events per fact. Telemetry counter `eureka_trust_same_principal_cap_hit_total` emits on cap hit for suspicious pattern detection. |
| T3(c) — Contradiction signal trust decrement | **Code-enforced** | Tier 1 `contradicts` edge creation triggers trust decrement regardless of source principal. |
| T4 — Adapter replay idempotency | **Code-enforced** | FR-14 invariant #1 + #2; dedup on `DecisionRecord.id` before write; replays counted under `skipped_duplicate`. |
| T6 — Stale session reference toleration | **Policy-enforced** | NFR-6 documented behavior; no runtime FK enforcement; reconciliation CLI surfaces divergence. |
| Cross-DB ATTACH ban (FR-7.2) | **Code-enforced** | ESLint `no-restricted-syntax` rule bans `ATTACH DATABASE` statements in Eureka codebase; CI gate fails build on violation. |

**v1 scope caveats:** Eureka is local-first (NFR-5). Multi-user / remote-write / cross-organization threats are out of v1 scope. This threat model will be revisited when the sync layer (v2) lands. Cassima notes that the v1 controls above mix **code-enforced** (runtime checks, schema constraints, lint rules) and **policy-enforced** (documentation, convention, manual review). The Deferred column in the threat table above tracks future enforcement. Compliance reviewer flagged the *absence* of this model as the BLOCKER; the model itself can ratchet up as the surface widens.

---

## 15. Lineage & Lock Status

- **PRD v3:** R5 canonical lock (2026-05-24). Vision, FR-1…FR-13, ranker formula, edge tiers, session-as-facts model — all preserved verbatim where unchanged.
- **v3.1 patch set (R6 synthesis):** 5 patches (sessions mechanics, vector v1.5, decide adapter, storage paths, learning kernel) — integrated inline, no longer presented as a patch list.
- **R7 reviews integrated:**
  - **Graham:** boundary policy (§7.1), extraction-readiness enforcement (FR-12), adoption playbook (§7.5), operational resilience (NFR-6), schema versioning + bridge telemetry (§7.6, FR-7.3).
  - **Genesta:** namespace discipline on sessions (FR-13), BM25 quality bar (FR-2), interface segregation + lint rules (FR-12).
  - **Crispin:** five schema risks (§13), adapter lossiness contract (FR-10), bridge reliability (FR-7.4), abstract data-source extraction contract (FR-12).
  - **Edgar:** subpath exports + folder layout + plain-data tests + DESIGN.md (FR-12).
- **Aaron R6 signals:** session naming convergence (FR-13, §7.4), decision-record kinship (§7.3), substrate overlap as feature (§7.4), Path D blessing (§7.1).
- **Aaron R7 directive (bidirectional adapter):** the two decision pathways are first-class (§7.2, FR-10, FR-14 in-flow path, US-5/US-6).
- **Aaron R7 finalization pass (2026-05-24) — four approvals integrated into this revision:**
  1. **FR-12 split.** Path 2 in-flow decision ingestion via `fromDecisionRecord()` extracted to new **FR-14** ("active decision capture"), distinct from FR-12's passive sweep maintenance. FR-12 retains the 5-phase sweep + extraction-readiness kernel; cross-refs in US-6, §7.2, glossary, §13 risks updated to point at FR-14.
  2. **Confidence vs Trust orthogonality** (Crispin + Genesta joint verdict). §7.4 "substrate kin" language dropped; replaced with orthogonal-axes framing. Glossary entries for `Confidence` and `Trust` rewritten with explicit "NOT equivalent" guard. TypeScript branded types added as FR-12 enforcement mechanism #7.
  3. **OQ #5 closure.** Cairn → Eureka session-fact trigger policy locked to **manual-only via `remember()`** in v1; closed statement added to FR-13. Subsequent open questions renumbered (#6→#5, #7→#6, #8→#7).
  4. **DecisionPayload dual-axis** (Genesta + Aaron). `confidence?` replaced with **`input_trust_min?`** (provenance side; renamed from `input_trust_avg` in rev-2 per Skeptic F5 to remove false precision) and **`reasoning_confidence?`** (analytic side). Both adapters (`toDecisionRecord`, `fromDecisionRecord`) updated; `input_trust_min` documented as discarded in the lossy contract outbound and undefined on inbound (Forge has no provenance axis).

- **Aaron R8 directive (session identity unification) [v5: NEW]:** Cairn `Session` and Eureka `kind=session` fact are the SAME session entity viewed through two lenses (Cairn = operational lifecycle, Eureka = epistemological artifact). They share **one identifier** — the Copilot CLI session UUID — typed through a new shared `SessionId` brand in `@akubly/types` (branded primitive with UUID v4 validator + constructor; ships in v1). Schema deltas: Eureka `kind=session` fact `cairn_session_id?` (optional, opaque) → `session_id: SessionId` (required, branded; content/grouping field — one CLI session may produce many `kind=session` facts); bridge_ledger `cairn_session_id_hint?` → `session_id: SessionId` (required, not a hint); `cairn_event_id_hint` stays a hint (event.id not known at emit time). FR-13 "isolated by design" sentence DELETED; replaced with shared-brand framing + Genesta R8 guardrails G1–G5 (lens framing normative, no runtime traversal helpers, brand lives in `@akubly/types`, `session_id` required, honest naming). §7.4 substrate overlap gains a "session identity IS shared substrate" bullet. §13 T-orphan row + Glossary "Session" entry rewritten — honest naming, severity unchanged. §14a gains T6 "stale session reference" row (LOW/LOW; reframed from prior implicit NFR-6 tracking). Graham R8 enforcement gate added as FR-12 mechanism #8 (ESLint cross-system session-type import ban, exception for `SessionId`). v1.5 precision opportunities documented (FR-12 sweep can consume Cairn session-end events; AC-2.5 counter precision improves; FR-14 gains `--session <uuid>` CLI form as v1 surface). Lens framing — Cairn = "what happened?", Eureka = "what did I learn?" — preserved verbatim and elevated to *normative* status. Emergent shared structure between the two lenses welcomed long-term per Aaron R8 signal, not foreclosed; any future shared structure beyond `SessionId` requires a new R-cycle design review per Graham R8 enforcement gate. Reviewers: Graham (ACCEPT w/ enforcement gates), Genesta (FOLD w/ 5 guardrails — author of v4-final amendment this R8 relaxes, folded with grace), Crispin (KR/schema mechanics — most concrete spec; lean source for brand + bridge ledger), Edgar (learning-systems precision gains).

- **FR ledger status [v5]:** FR-1…FR-14 unchanged in number. `SessionId` brand (NEW in `@akubly/types`) is shared infrastructure, not a new FR. FR-12 enforcement mechanisms grow from 7 → 8 (mechanism #8 added in v1).

- **Aaron R7 revision-2 pass (post-Squad-panel + persona-review Design Panel):** four blockers + nine important findings resolved in this pass. See per-section `[v4-rev2: <reason>]` annotations. Highlights:
  1. **B1 — `DecisionSource` type-system bug.** FR-10 + §7.3 + FR-14 corrected to the actual union `'human' | 'automated_rule' | 'ai_recommendation'` per `packages/types/src/index.ts:47`. Exhaustive switch enforced as a TypeScript-level invariant in both directions.
  2. **B2 — FR-14 Path 2 spec gaps.** v1 cadence locked to **on-demand only** (no background process / listener / sweep coupling). Idempotency, dedup-by-`record.id`, initial `trust` derivation from `record.confidence` enum, and ordering/freshness SLO all specified as FR-14 adapter invariants.
  3. **B3 — FR-7.4 ↔ FR-7.2 contradiction.** Resolved via Eureka-owned `bridge_ledger` table + offline `eureka reconcile` CLI (Option A). FR-7.2 runtime no-cross-DB rule preserved; reconciliation moved out-of-process.
  4. **B4 — Security threat model.** New §14a with five-row threat table (fact tampering, cross-tier leakage, trust manipulation, adapter replay, bridge spoofing) and explicit v1 vs v1.5/v2 mitigations.
  5. **I1 — Seven enforcement mechanisms.** Five ship in v1, two (#4 plain-data tests, #7 branded types) deferred to v1.5 — vision preserved, scope honest.
  6. **I2 — BM25 honest failure mode** added to FR-2.
  7. **I3 — Multi-tier recall fan-out** specified (sequential, early-exit at k=10, p95 < 50ms in v1).
  8. **I4 — US-2 caller-cooperation contract** added (AC-2.5) + telemetry counter for missed flushes.
  9. **I5 — Three storage tiers** kept in schema/API; user/project surfaces stubbed → v1.5. *Cassima judgment call applied per brief: fan-out is layered, deferral is additive not architectural.*
  10. **I7 — Path 2 default wiring** opt-in for production, opt-in by default for demos. *Cassima judgment call applied per brief: production callers absorb Path 2 deliberately, not by surprise.*
  11. **I8 — Citation register + decision-log pointers** added to this section (below).
  12. **I9 — `input_trust_avg` renamed to `input_trust_min`** throughout the schema and both adapters.

### Citation register [v4-rev2: I8]

| Claim / reference | Source |
|---|---|
| `SessionId = string & { __brand: 'SessionId' }` (NEW shared brand) | `packages/types/src/session.ts` (post-R8); reference shape verified against `packages/types/src/index.ts` (existing `SessionIdentity` interface uses `sessionId: string` — R8 strengthens this to a branded primitive) [v5] |
| Cairn session UUID source (Copilot CLI session state directory) | `~/.copilot/session-state/{uuid}/` (filesystem convention); Cairn's `packages/cairn/src/db/sessions.ts` reads/writes `id TEXT PRIMARY KEY` from this UUID [v5] |
| `DecisionSource = 'human' \| 'automated_rule' \| 'ai_recommendation'` | `packages/types/src/index.ts:47` |
| `DecisionRecord` shape (id, timestamp, question, chosenOption, alternatives, evidence, confidence enum, source, provenanceTier) | `packages/types/src/index.ts` (`DecisionRecord` interface) |
| Cairn `sessions` table fields (id, repo_key, branch, started_at, ended_at, status) | `packages/cairn/src/db/sessions.ts` |
| `better-sqlite3` engine choice (matches Cairn precedent) | Cairn package.json (engine dependency) |
| `sqlite-vec` deferral rationale | Cairn R6 Patch 2 discussion (see decision-log pointer below) |
| FTS5 `porter unicode61` tokenizer | SQLite FTS5 docs (https://sqlite.org/fts5.html) |
| ACT-R power-law decay (FR-5) | ACT-R cognitive architecture literature (Anderson et al.); see DESIGN.md for the specific formula reference. |
| Cairn Curator / Prescriber pipeline kinship | `packages/cairn/src/curator/` + `packages/cairn/src/prescriber/` module layout |
| `@akubly/types` shared contract package | `packages/types/package.json` |

Authors of subsequent revisions should extend this table when adding new cross-system claims.

### Decision-log pointers [v4-rev2: I8]

| Decision in v4 | Origin |
|---|---|
| Path D blessing (kernel-shaped, ship standalone) | Aaron R6 signal (d); `.squad/decisions.md` → Path D thread |
| Bidirectional adapter directive (Path 1 + Path 2 first-class) | See `.squad/decisions.md` § "Eureka v0.1 Technical Design — Assembled & Blocked on 4 Critical Decisions" (2026-05-27) |
| Session naming convergence (Cairn + Eureka both own "session") | Aaron R6 signal (a) + Genesta amendment; FR-13 thread |
| Decision-record kinship across stack | Aaron R6 signal (b); §7.3 thread |
| Substrate overlap framing | Aaron R6 signal (c); revised in rev-2 per Crispin + Genesta |
| Confidence vs Trust orthogonality | See `.squad/decisions.md` § "Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)" (2026-05-26) |
| FR-12 split into FR-12 + FR-14 | Aaron R7 finalization directive (this revision series) |
| OQ #5 closure (Cairn → Eureka session-fact triggers, manual-only) | Aaron R7 finalization directive |
| DecisionPayload dual-axis (`input_trust_min` + `reasoning_confidence`) | Genesta substrate analysis + Aaron approval; rev-2 rename per Skeptic F5 |
| §14a Security Threat Model | Persona-review Compliance panel (rev-2 BLOCKER B4) |
| FR-14 on-demand-only cadence | Persona-review Skeptic + Pragmatist + Squad Genesta/Crispin/Architect concur (rev-2 BLOCKER B2) |
| `bridge_ledger` + offline reconcile CLI | Persona-review Pragmatist BLOCKER + Skeptic important finding (rev-2 BLOCKER B3) |
| Seven-mechanism deferral (5 in v1, 2 in v1.5) | Persona-review Skeptic + Pragmatist (rev-2 I1) |
| Three-tier deferral (agent fully wired in v1) | Persona-review Pragmatist (rev-2 I5; Cassima judgment call) |
| Session identity shared brand (`SessionId` in `@akubly/types`); FR-13 "isolated by design" relaxation [v5] | See `.squad/decisions.md` § "Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)" (2026-05-26) |
| Cross-system session-type ESLint guardrail (FR-12 mechanism #8) [v5] | Graham R8 enforcement gate; operationalizes Genesta R8 guardrails G2/G3 |
| FR-14 `--session <uuid>` CLI form [v5] | Edgar R8 §3 precision gain; enabled by shared `SessionId` |
| FR-12 v1.5 sweep precision (consume Cairn session-end events) [v5] | Edgar R8 §2 opportunity — opportunistic, not a v1 commitment |

**Lock recommendation:** v5-final is ready for the R8 lighter-weight lock ceremony (Graham + the trio: Genesta/Crispin/Edgar — no full 8-reviewer panel per Aaron R8 disposition). On unanimous re-accept, supersedes v4-final and merges into `.squad/decisions.md` as canonical.

---

## Appendix A: M0 Baseline Eval Set

**Purpose:** Ground-truth question set for measuring BM25 recall precision against the mem/ repo. Measures keyword-overlap recall (v1 ship gate) and keyword-disjoint recall (tracked but not gated until v1.5).

**M0 deliverable commitment:** This appendix lands in full (with file paths, line ranges, and ground-truth expected facts) **before M1 begins**. The placeholder questions below will be replaced with actual mem/ codebase questions during the M0 eval-set authoring sprint. Grep-baseline measurement (human rediscovery time) must be recorded before any Eureka implementation code lands.

**Train set (5 questions — used for BM25 tuning):**

1. **[Keyword-overlap]** "What memory systems exist in this repo?"
   - **Ground truth:** Expected facts should reference `packages/eureka/`, Cairn observability, and the `facts` table schema.
   - **File paths:** `README.md`, `packages/eureka/DESIGN.md` (placeholder paths)
   - **Grep baseline:** TBD at M0 (measure human time to discover these 3 files starting cold)

2. **[Keyword-overlap]** "How does the session model work?"
   - **Ground truth:** Expected facts should reference `SessionId` brand, Cairn sessions table, Eureka `kind=session` facts.
   - **File paths:** `packages/types/src/session.ts`, `packages/cairn/src/db/sessions.ts` (placeholder paths)
   - **Grep baseline:** TBD at M0

3. **[Keyword-overlap]** "What is the trust scoring mechanism?"
   - **Ground truth:** Expected facts should reference event-driven trust mutation (FR-3), trust floor (0.15), initial trust values by source.
   - **File paths:** `packages/eureka/src/learning/trust.ts` (placeholder path)
   - **Grep baseline:** TBD at M0

4. **[Keyword-disjoint]** "How do I record what I learned?" (no literal 'record', 'learned', 'fact' keywords in expected source)
   - **Ground truth:** Expected facts should reference `integrate` activity, `Fact` schema, write paths.
   - **File paths:** `packages/eureka/src/activities/integrate.ts` (placeholder path)
   - **Grep baseline:** TBD at M0
   - **v1 CI gate:** NOT gated — tracked only

5. **[Keyword-overlap]** "What storage engine is used?"
   - **Ground truth:** Expected facts should reference SQLite, `better-sqlite3`, FTS5, BM25.
   - **File paths:** `packages/eureka/package.json`, FR-7.1 in PRD (self-reference acceptable for meta-question)
   - **Grep baseline:** TBD at M0

**Held-out set (5 questions — NOT used for tuning; CI ship gate at M4):**

6. **[Keyword-overlap]** "How are decisions persisted?"
   - **Ground truth:** Expected facts should reference `decide` activity, `DecisionPayload`, Forge audit record, Path 1 vs Path 2.
   - **File paths:** `packages/eureka/src/activities/decide.ts`, `packages/eureka/src/interop/toDecisionRecord.ts` (placeholder paths)
   - **CI gate:** Precision ≥ 80% required to ship v1

7. **[Keyword-overlap]** "What is the attention tier mechanism?"
   - **Ground truth:** Expected facts should reference hot/warm/cold tiers, attention multipliers (1.2/1.0/0.8), tier demotion logic.
   - **File paths:** `packages/eureka/src/learning/ranker.ts` (placeholder path)
   - **CI gate:** Precision ≥ 80% required to ship v1

8. **[Keyword-disjoint]** "What happens at the end of a work session?" (no literal 'sweep', 'flush', 'session-end' keywords in expected source)
   - **Ground truth:** Expected facts should reference sweep triggers, `flushHints()` helper, session-close capture gap.
   - **File paths:** `packages/eureka/src/learning/sweep.ts`, FR-12 in PRD (placeholder paths)
   - **CI gate:** NOT gated — tracked only

9. **[Keyword-overlap]** "How does recall ranking work?"
   - **Ground truth:** Expected facts should reference composite ranker formula (0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency), attention multiplier, trust floor.
   - **File paths:** FR-2 in PRD (self-reference), `packages/eureka/src/learning/ranker.ts` (placeholder path)
   - **CI gate:** Precision ≥ 80% required to ship v1

10. **[Keyword-overlap]** "What bridge mechanisms exist between Eureka and other systems?"
    - **Ground truth:** Expected facts should reference `bridge_ledger` table, reconciliation CLI, `toDecisionRecord` / `fromDecisionRecord` adapters.
    - **File paths:** FR-7.4, FR-10, FR-14 in PRD (self-references), `packages/eureka/src/interop/` (placeholder path)
    - **CI gate:** Precision ≥ 80% required to ship v1

**Precision measurement:**
- Recall returns top-10 facts for each question.
- Precision = (# of top-10 facts that match ground truth) / 10
- Gate: held-out keyword-overlap questions (6, 7, 9, 10) must achieve P ≥ 0.80 individually; aggregate held-out precision across all 5 ≥ 0.80.
- Keyword-disjoint questions (4, 8) are measured and reported but do NOT block ship in v1 (known v1.5 gap per FR-2 BM25 quality bar).

**Grep baseline:**
- For each question, measure time (in minutes) for a human engineer unfamiliar with mem/ to rediscover the ground-truth files using only `grep`, `find`, and `cat` (no Eureka, no IDE, no web search).
- Record baseline at M0; compare against Eureka recall latency (P95 < 500ms per US-1 AC-1.2) to quantify token-tax savings.

**Authoring commitment:**
Cassima (PM), Edgar (Learning Systems Lead), and Laura (Test Lead) will co-author the final question set during M0, replacing these placeholders with actual mem/ codebase queries and verified ground truth. The locked question list will be committed to `packages/eureka/test-data/eval-set-v1.json` before M1 begins.

---

*End of Eureka PRD v5-final.*
