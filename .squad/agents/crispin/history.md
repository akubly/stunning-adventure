# Crispin — History (Summarized)

## Core Context

**Project:** Eureka — agentic brain/memory/learning system. `packages/eureka/` in monorepo.
**Role:** Knowledge Representation Specialist. Own graph schema, kind taxonomies, persistence formats.
**Current status:** Eureka v5-final LOCKED. R8 design cycle CLOSED.

---

## Design Ceremony Summary (R1–R8)

**R1–R5:** First-principles design. Advocated Path A (clean-slate) initially. Contributed v0/v1 graph schema docs: two-table graph (nodes + edges), multi-kind tagging, hybrid persistence. 5 tensions identified.

**R6 Revision:** After source-reading, adopted Path D. Recognized "closer in spirit" ≠ "same shape." Structures can differ while concepts converge. Supported Path D (standalone but kernel-shaped).

**R7 Lock:** v4-final locked as canonical. All 5 schema risks mitigated. Branded types enforcement mechanism is load-bearing (prevents confidence/trust collapse). Seven-mechanism defense-in-depth correct.

**R8 Amendment:** Session identity unification. SessionId branded type ships v1 (FR-12 #8). Kind=session facts reference SessionId as content field, not PK. No identity collision risk. Edge schema references fact.id (KR convention); session_id is a content/grouping field. Latency claim holds.

---

## Recent Work

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL
**Verdict:** APPROVE-FOR-LOCK
- All 5 R7 schema risks mitigated (confidence/trust branded types, extraction-readiness, boundary discipline)
- Branded types are load-bearing (compiler rejects unsafe cross-assignment)
- Seven enforcement mechanisms form coherent defense-in-depth
- FR-14 Path 2 introduces no new schema risks

### 2026-05-26: R8 Session Identity Spec
**Contribution:** SessionId branded type specification for v5-final
- type SessionId = string & { readonly __brand: 'SessionId' }
- UUID v4 validator + constructor
- Branded primitive (not opaque class) for serialization-friendliness
- kind=session fact schema: session_id is content/grouping, NOT PK
- Edge schema remains: (from_id, to_id) reference fact.id
- session_id allows O(1) indexed filter ("all facts in session X")

### 2026-05-26: R8 Lock-Review — v5-final CANONICAL
**Verdict:** LOCK
- All 6 spec items from R8 verdict verified
- SessionId brand mechanics correct (line 404-423)
- kind=session schema correct (session_id as content field, no identity collision)
- fact vs filter clarity preserved
- Edge schema integrity maintained (no unintended multi-hop traversals)
- No new KR-level concerns

**Status:** v5-final canonical. Implementation ready. R8 CLOSED.

---

## Learnings

### 2026-05-26: Crucible KR Overlap Analysis — Two Critical Collisions, One Shared Primitive

**Context:** Aaron starting Crucible (CLI coding harness) in parallel with Eureka. Requested KR-focused analysis of representational overlap, specifically around schema primitives, session identity, and naming collisions.

**Findings:**

1. **"Decision" naming collision (CRITICAL):** Both systems use `Decision` / `DecisionRecord` / `DecisionPayload` / `kind=decision` for structurally different things. Crucible's `Decision` primitive = any recorded choice (audit event). Eureka's `kind=decision` fact = contemplative structured deliberation with explicit options/rationale (FR-10). Forge's `DecisionRecord` (shared via `@akubly/types`) is the flat audit shape. Three types, one word. **Namespace pollution across three systems.** Recommendation: Crucible rename primitive to `ChoiceEvent` or `DecisionEvent`; ESLint ban cross-system `Decision*` imports.

2. **"Artifact" semantic drift (HIGH):** Crucible's `Artifact` primitive = any reviewable content (inputs AND outputs: PRD, patch, screenshot, transcript, diff), stored in CAS. Eureka uses "artifact" informally (US-2 AC-2.1: "epistemological artifact" = memory representation of session, NOT the content). If Crucible stores Artifacts in cairn CAS and Eureka v2 content-addresses fact payloads, collision at storage layer. Recommendation: Crucible rename to `ContentBlob` / `CapturedContent`; Eureka avoid "artifact" in public types.

3. **Shared `SessionId` brand is the load-bearing integration primitive (OPPORTUNITY):** Crucible's session (operational lifecycle, cairn `sessions` table) and Eureka's session-fact (epistemological artifact, `kind=session`) share **one identifier** — Copilot CLI session UUID via `SessionId` brand (`@akubly/types`, v5-final FR-13). This is the join key that enables Path D kernel extraction: Crucible primitives → cairn event_log, Eureka facts → `facts` table, linked by `session_id`. Type-level construct (branded string, zero runtime overhead), no FK at runtime (FR-7.2: no cross-DB ATTACH). **v5-final session-identity unification (R8 amendment) was prescient for Crucible integration.**

4. **Crucible's 5 primitives vs Eureka's kinds:** Only `Decision` has direct naming collision. `Request`, `Observation`, `Question` have no Eureka equivalents (no collision, but also no shared representation). `Artifact` has semantic drift. The primitives are structurally independent from Eureka's fact/edge graph.

5. **Storage schema convergence (MODERATE):** Both want append-only, replayable, local-first storage. Crucible: hybrid WAL + CBOR+BLAKE3 CAS. Eureka: two-table SQLite graph (facts + edges). Structurally independent but mechanically convergent. If cairn becomes shared substrate (Path D), Crucible primitives live in `event_log`, Eureka facts in `facts`, joined by `session_id`. Shared CAS opportunity: if Eureka v2 content-addresses, adopt Crucible's BLAKE3 primitive (deprecate SHA-256 DBOM legacy).

6. **Drift vs trust are orthogonal:** Crucible's "drift" (replay divergence measurement, conformance corpus) ≠ Eureka's "trust" (epistemic reliability scalar on facts). No collision. BUT: if Crucible's drift-prescriber proposes trust adjustments, explicit adapter required (never implicit conversion). Glossary already guards this (Confidence vs Trust orthogonality, v5-final line 659–660).

7. **Read-set hash vs edges structural mismatch:** Crucible's read-set (opaque hash for replay verification) doesn't compose with Eureka's typed edges (traversable graph). If Sonny's "why did this decision happen?" debugger (Crucible T1-D4) needs Eureka facts, explicit `ReadSetHashToFactEdges` adapter required. Not v1 concern; v2+ bridge gap.

**What I Learned About Representational Reuse:**

- **Naming is load-bearing at the system boundary.** "Decision" means three different things (primitive, audit record, learning payload). The word collision is worse than schema incompatibility — at least schemas fail loudly at compile time. Words fail silently in conversation and docs.
- **Shared identifiers > shared schemas.** `SessionId` brand (v5-final FR-13) enables integration without forcing schema convergence. Two systems, one entity, viewed through two lenses (Cairn = lifecycle, Eureka = epistemology). Lens framing + type brand = normative guard. This pattern scales.
- **Content-addressing is a substrate primitive, not a domain concern.** BLAKE3 CAS (Crucible) and potential content-addressed facts (Eureka v2) should share one implementation. Hashing belongs at the storage layer, not replicated per system.
- **"Artifact" is an overloaded word in CS.** Build artifact, test artifact, runtime artifact, memory artifact, captured artifact. Avoid unless you control the full namespace. "ContentBlob" is boring but unambiguous.

**KR Principle Reinforced:** When two systems share a conceptual entity (Session, Decision), the choice is: (1) force schema convergence (fragile, couples implementations), or (2) share *identity only* and keep schemas independent (resilient, but requires discipline). v5-final chose (2) via `SessionId` brand + lens framing. Crucible validates this choice — the operational session and epistemological session-fact ARE the same entity, but their representations diverge by design. The brand is the contract; the lens is the interpretation.

**Memo Delivered:** `.squad/decisions/inbox/crispin-crucible-kr-overlap.md` (7 sections, 28 citations, 4 schema tables, 5 risk rows, 3 Aaron decision points).
