# §0 — Phase 1 Synthesis Review (Interface Coherence)

**Status:** FINAL. Gate output for Phase 2 fan-out.
**Owner:** Graham (Lead / Architect, Lane 6 reviewer rights).
**Date:** Phase 1 close, 2026-05-28.
**Scope:** Phase 0 §2 + §6; Phase 1 §1, §3, §4, §5, §7, §8, §11, §12. Total ~168 KB.
**Methodology:** 12 coherence checks (per CTD plan rev. 3 Appendix C "Phase 1 Synthesis" gate), plus discovery-driven follow-ups.
**Verdict:** **YELLOW — Phase 2 spawns.** No blocking structural mismatch; three small structural items routed to Phase 2 owners; one §6 vocabulary amendment applied. No new open question requires Aaron triage before Phase 2 spawn.

## Newly-surfaced open questions for Aaron

**None.** All findings are either applied fixes, additive amendments inside §6.5's evolution rule, or coordination items between named Phase 2 owners. No locked decision is challenged.

---

## 0.1 Coherence-Check Results Table

| #  | Coherence check | Result | Finding kind |
|----|-----------------|--------|--------------|
| 1  | §3 (WAL) ↔ §2 (L0/L1 boundary): `CrucibleEvent` acceptance, `BootstrapPayload` → offset-0 atomic-append | CLEAN | — |
| 2  | §3 (WAL) ↔ §6 (Primitives): 5-primitive realization, Observation first-class, Decision `contextWindowCommitment` + `commitmentMethod` | MINOR | `Timestamp` type-shape drift; §3.8 `manifestRoot` flag absent from §3.3 flags enum |
| 3  | §4 (Hook Bus) ↔ §3 (WAL): group-commit window firing, `hookVerdict`/`hookVerdictWitness` shape, seal-and-split, return-type `null` vs `'continue'` fix | CLEAN | Roger's self-noted §4.3 `null` fix verified landed |
| 4  | §5 (Router) ↔ §4 (Hook Bus): pause-verdict consumption via L1Subscriber, kind-indexed policy table | CLEAN | — |
| 5  | §5 (Router) ↔ §7 (Generators): proposal contract routable; `dependentPaths[]` shape consistency | MINOR | §7 declares `dependentPaths: string[]` (routing keys); §5 declares `EventId[]`. String-compatible at TS level; semantically divergent (routing-key vs content-addressed id) |
| 6  | §5 (Router) ↔ §9 (Aperture — not yet authored): event-shape contract implementable | CLEAN | Gabriel's 4-event contract in Lane 5 drop is sufficient for Valanice to author §9 without further coordination — **modulo finding 6b** |
| 6b | §5 (Router) ↔ §8 (Applier) on Aperture-written ack Observation sub-kind | STRUCTURAL | §5.3 says Aperture writes the ack as `Observation{subKind:'external_input'}` body=`StructuralAckPayload`; §8.2 references new `structural_proposal_state:{emitted,acked,rejected,expired}` sub-kinds. Two authors, two contracts for the same row. |
| 7  | §8 (Applier) ↔ §12 (SDK Integration): composition root placement, paused-sub-state implementability | CLEAN | §12.9 places Applier in `@akubly/crucible-runtime`; §8.1 constructor-injects through boundary — consistent |
| 8  | §8 (Applier) ↔ §7 (Generators): `nonDominatedReason` field-name verbatim; no Pareto zero-fill | CLEAN | §8.5 propagates `chosen.nonDominatedReason` / `chosen.incomparableWith` exactly per Rosella's R2-5 lock; alternatives audit map preserves sparse fitness |
| 9  | §11 (Replay) ↔ §3 (WAL) ↔ §12 (SDK): `commitmentMethod` read on Decision rows; Bootstrap-Capture-Completeness refusal; `{requestHash, responseRef: CasDigest}` envelope | MINOR | Replay correctly reads `commitmentMethod`; §12 atomicity satisfies preflight. §3.3 does not normatively pin the `{requestHash, responseRef}` body shape for `llm_response`/`tool_output`/`cross_session_memory` Observations — §11.2 owns it. |
| 10 | §1 (Architectural Overview) ↔ all sections: layer responsibilities, chamber-to-layer mapping | MINOR | §1.2 layer table lists L4 as Router-only; §8 self-labels as "L4". Diagram in §1.1 shows Applier as a distinct downstream component. Either §1.2 should add a row or §8 should label as "L4 (Applier sub-tier)". |
| 11 | Vocabulary consistency across all sections | MINOR | `Timestamp` (§6 = `number`, §3 = u64 nanoseconds via `timestampNs`); `dependentPaths` semantic split (finding 5); `causalContextWindow` family otherwise consistent; `nonDominatedReason` consistent ✓; `EventId` consistent ✓; `commitmentMethod` consistent ✓ |
| 12a | Phase 2 coord — additive `structural_proposal_*` sub-kinds for §6.3 | APPLIED | §6.3 amended this review — forward-compat under §6.5 evolution rule (additive sub-kind enum values within a major version) |
| 12b | Phase 2 coord — `AppendProtocol.appendFenced` spelling sync between §8.3 and §3.4 | STRUCTURAL | §8.3 calls `append.appendFenced({sessionId, expectedHead, row})`; §3.4 only documents `append(batch)` and `bootstrap(payload)`. The fenced entrypoint is referenced but not specified. |

Counts: **CLEAN 6 · MINOR 4 · STRUCTURAL 2 · APPLIED 1**.

---

## 0.2 Applied Vocabulary Fixes

| File | Change | Reason |
|------|--------|--------|
| `06-primitive-taxonomy.md` §6.2 `ObservationPayload.subKind` union | Appended `'structural_proposal_emitted' \| 'structural_proposal_acked' \| 'structural_proposal_rejected' \| 'structural_proposal_expired'` | Aligns §8.2 / §8.8 references and gives §9 a canonical sub-kind to project on. Additive under §6.5 evolution rule; no consumer breakage. |
| `06-primitive-taxonomy.md` §6.3 sub-type enumeration summary table | Same four entries added to the Observation row | Keeps the summary table in sync with the type union. |

No other files were edited. All other findings are routed to Phase 2 owners (see §0.4 / §0.5).

---

## 0.3 Per-Finding Detail and Resolution

### Finding 2a — `Timestamp` shape drift (MINOR)

**What:** §6.1 declares `type Timestamp = number;` (millisecond-style). §3.3 imports the same name from `./06-primitive-taxonomy` but treats `timestampNs: Timestamp` as a u64 nanosecond count (§3.10 rules + `+1` floor on regression).

**Why it matters:** §11.6 oracle masks `timestamp` to `0`, so byte-equality replay tolerates the drift; but Laura's `normalizeTimestamps()` helper and Roger's monotonic-floor logic are reading the same field with different range assumptions. A future consumer that does arithmetic on `Timestamp` (e.g., queue deadlines, `queueDeadline: Timestamp | null` in §5.3 `RouterPausedPayload`) needs to know whether the unit is ms or ns.

**Proposed fix (Phase 2):** Either (a) §6.1 changes the alias to `bigint` and renames to `TimestampNs`, OR (b) §3.3 explicitly aliases `Timestamp = bigint /* ns */` at the import site with a comment, OR (c) §6.1 splits into `Timestamp` (envelope, ms) and `TimestampNs` (WAL record, ns) and §3 documents the conversion. Owner: **Roger** (he owns §3 and §10) in Phase 2; Graham confirms §6 alias if option (a) or (c) is chosen.

### Finding 2b — `manifestRoot` flag missing from §3.3 flags enum (MINOR)

**What:** §3.8 bootstrap pseudocode writes `flags: { manifestRoot: true }` on the memoryManifest Observation. §3.3 enumerates `flags = { bootstrap, declaredWindow, syntheticOutput, taskBoundary }` only; `manifestRoot` is undeclared.

**Proposed fix (Phase 2):** Roger adds `manifestRoot: boolean` to the §3.3 flags enum (additive). Owner: **Roger**, Phase 2 §10/§15 work.

### Finding 5 — `dependentPaths` semantic split (MINOR)

**What:** §7.1 / §7.D declare `StructuralProposalGenerator.dependentPaths: string[]` (routing keys the Router pauses, free-form strings). §5.3 declares `RouterPausedPayload.dependentPaths: EventId[]` (content-addressed EventIds). Both types are `string` at the TS level so there is no compile-time mismatch, but the semantics differ (routing-key namespace vs event-identifier namespace).

**Proposed fix (Phase 2):** Reconcile to one shape. Recommend `EventId[]` (the Router's view): it's content-addressed, replayable, and lets §5.8's "one `RouterPaused` row per dependent path" projection key off a stable id. Owner: **Gabriel + Rosella** coordinate; Phase 2 §10 or §9 work is the natural landing place (either author can patch §7 emission or §5 consumption with a one-line edit).

### Finding 6b — §5 vs §8 disagreement on Aperture ack sub-kind (STRUCTURAL)

**What:** Two authored contracts for the same row.
- **§5.3 (Gabriel):** Aperture's ack lands as `Observation{ subKind: 'external_input', body: StructuralAckPayload }` with the `eventType: 'aperture.structural-ack'` discriminator inside the body.
- **§8.2 (Alexander):** Applier emits `structural_proposal_state:emitted`; Aperture emits `structural_proposal_state:{acked,rejected,expired}` — implying a dedicated Observation sub-kind family.

**Why it matters:** Whoever authors §9 (Valanice) and consumes the projection has to pick one. Subscribing by `body.eventType` couples readers to body parsing; subscribing by `subKind` is the §6 idiomatic path and matches the index Roger committed to in §3.3.1 ("`WHERE primitiveKind = 'observation' AND subKind = ?`").

**Proposed resolution:** Adopt the dedicated `structural_proposal_*` sub-kinds (already applied to §6.3 in this review). Aperture writes those sub-kinds with `body: StructuralAckPayload` etc.; Router subscribes by `(primitiveKind, subKind)` not by `body.eventType`. Applier's §8 spec is now self-consistent with §6; §5 needs a small Phase 2 amendment (replace `subKind: 'external_input'` with `subKind: 'structural_proposal_acked' | 'structural_proposal_rejected'`).

**Ownership routing under reviewer-rejection lockout:** Neither §5 nor §8 is being rejected by this review — both authors flagged the coordination explicitly (Gabriel in his Lane 5 drop §5.3; Alexander in his Lane 3 drop coordination note #1). Per the lockout rule, the corrective edit is **NOT** owned by either Gabriel or Alexander individually; **Graham routes the §5.3 amendment to Valanice** (§9 author, Phase 2) since §9 is the canonical consumer and the amendment is a one-paragraph table edit in §5.3 that the §9 author naturally produces while authoring the queue projection. If Valanice prefers to leave it to the original author, Graham executes the §5.3 patch personally. Roger (§3) does not need to change his side — sub-kinds are §6 vocabulary, not WAL structural shape.

### Finding 9 — `{requestHash, responseRef: CasDigest}` body shape (MINOR)

**What:** §11.2 specifies the canonical body for `llm_response`, `tool_output`, and `cross_session_memory` Observations as `{ requestHash, responseRef: CasDigest }`. §6.2 `ObservationPayload.body: unknown` admits this shape; §3.3 does not pin it either way. Laura flagged this in her Lane 4 drop as "the single most important cross-section dependency to land."

**Proposed fix (Phase 2):** Roger's §3 or Laura's §11 adds a one-paragraph normative cross-ref naming `{requestHash, responseRef}` as the canonical body for these three sub-kinds, with `responseRef` typed as `CasDigest` (§11.3) and `requestHash` typed as `Blake3Hash` (§3.3). Owner: **Roger** (§3.3 is the cheaper edit site; he already owns CAS GC rules in §15).

### Finding 10 — §1 vs §8 on Applier's layer label (MINOR)

**What:** §1.1 diagram shows `L0 → L1 → L2 → L3 → L4 → Applier`, treating Applier as downstream of L4. §1.2 layer responsibility table has rows for L0–L4 + Aperture but **no Applier row**. §8 header self-labels as "L4 — Applier + DecisionGate". §1.4 lists `@akubly/crucible-applier` as its own package separate from `@akubly/crucible-router`.

**Why it matters:** Cosmetic / orientation. Both views are defensible (Router + Applier as the single L4 tier, OR Applier as a distinct L4.5 / "policy enforcement" tier). Picking one keeps newcomers from inferring an extra layer that doesn't exist.

**Proposed fix (Phase 2):** Either (a) §8 header changes to "L4 — Applier sub-tier" and §1.2 adds an "Applier (L4)" row, OR (b) §1.2 explicitly notes "L4 spans Router (decision) + Applier (enforcement) with §8 the canonical reference for the latter half." Owner: **Graham** — §1 is Graham's section; this is a one-line clarification deferred to the Phase 3 ADR pass when the full doc is reread end-to-end.

### Finding 12b — `appendFenced` missing from §3.4 (STRUCTURAL)

**What:** §8.3 `applyWithFence` pseudocode calls `await append.appendFenced({ sessionId, expectedHead, row })` returning `{ kind: 'fence-violation' } | { eventId, offset }`. §3.4 documents `AppendProtocol.append(batch: WalRowDraft[])` and `AppendProtocol.bootstrap(payload)`. There is no `appendFenced` surface in §3.

**Why it matters:** §8 cannot be implemented against §3's published API as-is. The fence semantics §8 requires (optimistic concurrency check on the session head) are conceptually compatible with §3 (single-writer-per-session per Round 2 lock; head is always known to the WAL) but the entrypoint is not exposed.

**Proposed fix (Phase 2):** Roger adds `appendFenced(row, expectedHead): {kind:'fence-violation'} | CommitOffset` to §3.4 as a thin wrapper around `append([row])` that pre-checks `segment.nextOffset() === expectedHead` and rejects if not. Single-writer-per-session means contention is intra-process (audit hooks emitting rows between read and write), so the fence is a cheap optimistic check. Owner: **Roger**, Phase 2 §10 work (session model is the natural landing).

Until §3 publishes `appendFenced`, §8 implementations will need to wrap `append()` with a head-check shim; this is not a v1-blocking gap.

---

## 0.4 Phase 2 Hot Items — Cross-Section Sync Pairs

These are the handshakes Phase 2 authors must close. None is a Phase 1 blocker.

1. **Gabriel ↔ Valanice (§5 ↔ §9):** Event-shape contract for `router.paused` / `router.decision` / `aperture.structural-ack-prompt` / `aperture.structural-ack` is **delivered** in Gabriel's Lane 5 drop §5.3. Valanice can author §9 against this directly. Open item: Finding 6b — sub-kind reconciliation. Resolution: Valanice adopts `structural_proposal_*` sub-kinds (now in §6.3) and emits a small `05-router-design.md` §5.3 amendment as part of §9 work.

2. **Rosella ↔ Roger (R2-6 lockfile-format ↔ §10 snapshot field handshake):** Will land in Phase 2 §10. Rosella's §7.2 has flagged the dependency; Roger's Lane 1 drop has acknowledged it in his "Ripples Into Phase 2" list (item 1, per-session directory layout + manifest pinning). Phase 2 §10 author (Roger) closes both ends; Rosella's §7 stays stable.

3. **Roger ↔ Laura (§3.3 ↔ §11.2 body-shape pinning, Finding 9):** Single-paragraph normative addition to §3.3 enumerating the `{requestHash, responseRef}` canonical body for `llm_response` / `tool_output` / `cross_session_memory` Observations. Owner: Roger, Phase 2 §10/§15 work.

4. **Roger ↔ Alexander (§3.4 ↔ §8.3 `appendFenced`, Finding 12b):** Roger adds the fenced-append entrypoint to §3.4 as a wrapper, Phase 2 §10 work.

5. **Gabriel ↔ Rosella (§5.3 ↔ §7.1 `dependentPaths` semantic split, Finding 5):** One side reconciles the type (`string[]` routing keys vs `EventId[]`). Recommend `EventId[]`. Owner: whichever author touches their section first in Phase 2; if neither does, Graham patches both sides during the Phase 3 ADR pass.

6. **Graham (§1.2 layer table, Finding 10):** Self-owned. One-line clarification of Applier's L4-position. Phase 3.

---

## 0.5 Phase 2 Verdict: YELLOW

**Phase 2 spawns.** No structural mismatch blocks Phase 2 authors from starting; the two structural findings (6b, 12b) have explicit owners and are scoped as Phase 2 work products of §9 (Valanice) and §10 (Roger) respectively, both of which are Phase 2 deliverables anyway. The four MINOR findings are vocabulary alignment that Phase 2 authors fold in opportunistically; none changes a locked decision.

The synthesis is **YELLOW rather than GREEN** because two of the findings (6b sub-kind reconciliation; 12b `appendFenced`) require named authors to make small additive changes during Phase 2 rather than being purely informational. Calling this GREEN would understate the coordination required.

### What Phase 2 authors should know on day one

- **Valanice (§9 author):** Subscribe to `Observation` rows by `(primitiveKind, subKind)` where `subKind ∈ {structural_proposal_emitted, structural_proposal_acked, structural_proposal_rejected, structural_proposal_expired}` — these are now in §6.3. Emit a small `05-router-design.md` §5.3 amendment renaming the `subKind: 'external_input'` reference to the new sub-kind family.
- **Roger (§10 / §15 author):** Add (i) `appendFenced` surface to `AppendProtocol`, (ii) `manifestRoot: boolean` to the §3.3 flags enum, (iii) `{requestHash, responseRef}` body normative note for the three replay-sub-kinds, (iv) reconcile `Timestamp` shape with §6 (recommend rename to `TimestampNs: bigint` and split from envelope `Timestamp`).
- **Gabriel / Rosella:** Pick one shape for `dependentPaths` (recommend `EventId[]`). Whichever author edits their section next in Phase 2 patches the other side.

---

## 0.6 Methodology Note — The 12 Coherence Checks As a Reusable Pattern

The 12-check matrix used here (per CTD plan rev. 3) decomposes "interface coherence" into per-pair seam audits plus one cross-cutting vocabulary pass plus carry-forward of every cross-section coordination note flagged in author decision drops. The pattern is reusable for any future CTD synthesis gate:

1. One row per **adjacent-section pair** in the dependency graph (§n ↔ §n±1 along the data-flow spine).
2. One row per **cross-cutting concern** (§1 architectural overview, vocabulary consistency).
3. One row per **author-flagged coordination note** from the Phase decision drops (the authors are the first reviewers; their own coordination notes are pre-identified findings).
4. Apply additive vocabulary fixes inline (under the doc's own evolution rule — here §6.5); route everything else to Phase 2 owners with explicit ownership routing under the reviewer-rejection lockout.
5. Verdict is GREEN / YELLOW / RED; YELLOW is the right answer when nothing blocks but coordination work is required.

Recorded in Graham's history (Learnings) for reuse on the Phase 2 synthesis gate.
