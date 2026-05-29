# §0 — Phase 4 Synthesis Review (Interface Coherence — FINAL CTD GATE)

**Status:** FINAL. CTD close-out gate.
**Owner:** Graham (Lead / Architect; reviewer rights, strict lockout).
**Date:** Phase 4 close, 2026-05-28.
**Scope:** Phase 4 surface — §1 (Graham), §6 (Graham), §3 (Roger), §10 (Roger),
§5 + §5.A (Gabriel), §11.10 (Laura), §16.5 streaming + §16.7a layering
(Laura), §17 scheduler catalog (Gabriel), §19 ADR index ADR-0019 + ADR-0024
(Graham). Total CTD now **377,794 bytes across 21 files** (19 numbered
sections + Phase 1 + Phase 2 synthesis reviews; this Phase 4 review brings
the count to 22 once landed).
**Methodology:** 8-check coherence matrix per task spec, applied in the
same shape as the Phase 1 (12-check) and Phase 2 (10-check) synthesis
gates. Two minor errata resolved inline per task authority.
**Verdict:** **GREEN-FINAL.** CTD is complete. No structural mismatches.
Two errata applied (InvocationId canonical-derivation lock in §3.3.4;
§7.D supersede-contract amendment requiring `parentId` lineage on
replacement proposals). No Phase 5 spawn required. No new open question
requires Aaron triage before post-CTD authoring.

## Newly-surfaced open questions for Aaron

**None.** All eight coherence checks resolve CLEAN; both errata are
applied; the CTD stands on locked decisions plus the two Phase 4
framing-amendment ADRs (0019, 0024) and the four Phase 4 lane outputs.

---

## 0.1 Coherence-Check Results Table

| # | Coherence check | Result | Finding kind |
|---|-----------------|--------|--------------|
| 1 | §1 ↔ §5 ↔ §17 — §1.2 L3.5 row vs §5.A spec vs §17 catalog (sub-kind family matches Roger's §3 acceptance) | CLEAN | — |
| 2 | §3 ↔ §6 — CALL/RET body fields added via §3.3.4 vs §6 primitive taxonomy | CLEAN | §6.3 unchanged by design (sub-kind enum stable; new fields are body extensions under §6.5); §3.3.4 cross-refs §6.5 evolution rule cleanly |
| 3 | §3 ↔ §10 — `task_start.body` (`invocationId, parentInvocationId, callDepth`) matches §10.6.1 `ReconstructInvocationStack` reads | CLEAN | Field names verbatim across both sections (`body.invocationId`, `body.parentInvocationId`, `body.callDepth`); `body.returnTo` on `task_end` matches §10.6.1 pop validation |
| 4 | §5 ↔ §3 — Gabriel's `scheduler_*` Decision sub-kinds vs §3.3.5 "WAL accepts scheduler-emitted Decisions" | CLEAN | §3.3.5 declares substrate acceptance regardless of emitter; §5.A.2 owns the four `scheduler_*` body shapes; both honor the `contextWindowCommitment` + `commitmentMethod` contract |
| 5 | §11 ↔ §16 — trace-vs-behavioral distinction (§11.10 vs §16.7a) vocabulary consistency | CLEAN | Vocabulary verbatim across both sections (`trace reproducibility`, `behavioral reproducibility`, "the LLM IS the I/O subsystem"); §16.7a explicitly cross-refs §11.10 as the honesty clause it operationalizes |
| 6 | §16 ↔ §3 — streaming `stream_open/delta/close` Observation sub-kinds; additive per §6.5; sub-kind names registered | CLEAN-with-followup | §16.5 declares the three sub-kinds; §3 acceptance via §3.3.1 sub-kind index handles them as additive Observation sub-kinds per §6.5 evolution rule. §6.3 enumeration table does NOT yet list `stream_open / stream_delta / stream_close` — this is the correct boundary (Laura authors the sub-kinds in §16; §6.3 enum updates land at the post-CTD §6.3 housekeeping pass once streaming policy is enabled, exactly per §6.5 additive rule). No blocking issue; flagged as informational for the §6.3 sync pass. |
| 7 | §19 ADR index — ADR-0019 (typed trace algebra reframing) + ADR-0024 (L3.5 Scheduler) accurate one-liners | CLEAN | Both rows present, one-line decisions match the §1/§6/§5 substantive text verbatim; lifecycle note about numbering gaps (0019/0024) present in §19.3 |
| 8 | Cross-section vocabulary — `invocationId`, `parentInvocationId`, `returnTo`, `scheduler_dispatched`, `dispatched_pending`, `trace reproducibility`, `behavioral reproducibility`, `stream_open/delta/close` | CLEAN | Spot-checked all eight terms across the modified files: §3.3.4 / §10.6 / §10.6.1 use identical CALL/RET vocabulary; §5.A / §5.2 / §17.1 / §3.3.5 use identical `scheduler_*` vocabulary; §11.10 / §16.7a use identical reproducibility vocabulary; §16.5 owns the streaming vocabulary, §11.10 references "I/O subsystem" identically |

**Counts: CLEAN 8 · MINOR 0 · STRUCTURAL 0 · APPLIED 2 (errata A + B
below).**

This is the cleanest synthesis gate of the three (Phase 1 was 6/4/2/1,
Phase 2 was 7/2/0/1, Phase 4 is 8/0/0/2). The four parallel lanes
delivered against fully-locked seams; the pre-emption discipline Graham
laid out in `graham-ctd-phase4-framing.md` (framing surfaces commit only
to existence of the tier + sub-kind governance discipline, never to
field-shape pre-emption) paid off — Roger, Gabriel, and Laura had no
overlapping authoring surfaces to coordinate, and the §1/§6/§19 framing
amendments composed with their lane outputs without contention.

---

## 0.2 Errata Resolutions (Applied Inline)

### Erratum A — InvocationId derivation locked CANONICAL (Graham authority)

**Site:** `03-l1-wal-substrate.md` §3.3.4 (Roger's Phase 4 amendment).

**What was open:** Roger declared `InvocationId` derivation as
"**recommended** BLAKE3(sessionId || taskId || commitOffset)" and
deferred the canonical-vs-degree-of-freedom call to Graham (his Phase 4
drop §5).

**Decision: LOCK CANONICAL.** Edit applied to §3.3.4:

1. The `InvocationId` type comment changed from "recommended" to
   "CANONICAL derivation".
2. New normative bullet inserted under the LOCK semantics block:
   "**InvocationId derivation is canonical (Phase 4 synthesis LOCK,
   Graham).** L0 MUST compute `invocationId = BLAKE3(sessionId || taskId
   || commitOffset)` ... Mis-derivation is a `monotonic_violation`-class
   durable failure ..."

**Rationale.** Aaron's hermetic-replay invariant (§11.6 byte-equivalence;
ADR-0008) is non-negotiable; the §10.6.1 stack-frame reconstruction keys
off `invocationId`. A non-canonical L0 implementation would let two L0
adapters emit different `invocationId`s for the same logical CALL,
defeating replay byte-equality at the CALL/RET seam. The
structural-compute cost in L0 is one BLAKE3 over three small inputs at
TaskStart-emit time — cheap, deterministic, and replay-safe. L0
flexibility on this field had no compelling driver against an invariant
this load-bearing.

**Ripple check.** §10.6.1 `ReconstructInvocationStack` is unaffected (it
reads `body.invocationId` and validates pop-match by `invocationId`
equality — the canonical hash either matches or it doesn't, and the
mismatch path is the same durable-fail surfacing the prior text
described). §11.6 oracle is unaffected (it asserts byte-equality on the
row body, which now includes a determined-by-input field rather than an
L0-chosen field — strictly stronger). No other section touched.

### Erratum B — `scheduler_cancelled{reason:'superseded'}` requires `parentId` lineage on replacement (Graham authority, §7 amendment)

**Site:** `07-generators-l3.md` §7.D (`StructuralProposalGenerator`
Emission Contract); cross-referenced from `05-router-design.md` §5.A.2
`scheduler_cancelled` row.

**What was open:** Gabriel's Phase 4 drop flagged that
`scheduler_cancelled{reason: 'superseded'}` implicitly assumes
generators MAY emit a replacement proposal obsoleting an in-flight one;
§7 generator contract neither required nor forbade this. The
`scheduler_cancelled.body.supersededBy: EventId | null` field already
existed in §5.A.2; the generator-side contract needed the matching
lineage edge.

**Decision: AMEND §7.D.** New clause 6 added to §7.D
`StructuralProposalGenerator` emission contract:

- A generator MAY emit a replacement proposal obsoleting an in-flight one
  (typically because newer L2 state invalidates the prior recommendation).
- When it does, the replacement's `envelope.parentId` MUST be set to the
  `EventId` of the obsoleted proposal.
- The L3.5 Scheduler then emits `Decision{subKind:
  'scheduler_cancelled', body: { reason: 'superseded', supersededBy:
  <replacement EventId> }}` against the obsoleted proposal, keying off
  the `parentId` lineage edge to resolve `supersededBy` deterministically.
- A `reason='superseded'` emission with no resolvable `parentId` on the
  replacement is a contract violation; the §7.A conformance suite
  rejects it (new check **C-9** on `StructuralProposalGenerator`;
  equivalent additive check applies to `DataProposalGenerator`
  replacements when generators choose to supersede).
- Replacement chains compose (`parentId` walks back through the
  supersede graph); the v1 Scheduler does not collapse them.

**Rationale.** §6.4 `parentId` is exactly the structural-production
lineage edge — it already answers "which earlier emission did this one
supplant?" — so using it for supersede lineage is consistent vocabulary,
not new. Making it MUST rather than MAY removes the ambiguity Gabriel
flagged while keeping the §5.A.2 body shape unchanged (`supersededBy` is
the Scheduler's resolution of the generator's lineage declaration, not
an independent claim). §7.A C-9 keeps the contract testable at the
generator boundary, not at the Scheduler.

**Ripple check.** §5.A.2 unchanged (the `supersededBy` field shape and
semantics are already correct; only the upstream contract that produces
the lineage edge needed pinning). §6.4 `parentId` semantics unchanged
(supersede lineage was always within its declared scope; this just
names it). §3 unaffected. §17.1 `scheduler_cancelled` catalog row
unaffected.

---

## 0.3 Phase 4 Verdict: **GREEN-FINAL**

**CTD is complete.** All 8 coherence checks resolve CLEAN; both errata
are applied surgically inline; no structural finding requires a Phase 5
spawn; no new open question requires Aaron triage. The Phase 4 amendment
set — Graham's framing (§1, §6, §19), Roger's CALL/RET + Scheduler-WAL
acceptance (§3, §10), Gabriel's L3.5 Scheduler + Router boundary (§5,
§5.A, §17), Laura's reproducibility-honesty + streaming policy (§11.10,
§16.5, §16.7a) — composed cleanly under the framing's pre-emption
discipline. The 8/8 STRENGTHENS UIS weigh-in and rubber-duck precision
reframing have landed as durable architectural surface, not just review
commentary.

This is the **final architecture-design gate** for the CTD. Post-CTD
authoring (the nineteen ADR files under `docs/adr/`, the §13 CLI
implementation, the §16 test-strategy execution scaffolding, and the
greenfield package work under `@akubly/crucible-*`) is unblocked.

---

## 0.4 Final CTD Inventory

**Total: 377,794 bytes · 21 files (19 numbered sections + 2 prior
synthesis reviews) · 19 ADRs indexed in §19.**

| File | Bytes | Owner | Phase |
|------|------:|-------|-------|
| `00-phase1-synthesis-review.md` | 18,280 | Graham | Phase 1 close |
| `00-phase2-synthesis-review.md` | 23,708 | Graham | Phase 2 close |
| `01-architectural-overview.md` | 19,828 | Graham | Phase 1 (Phase 4 amend) |
| `02-l0-l1-boundary-contract.md` | 11,913 | Graham | Phase 0 |
| `03-l1-wal-substrate.md` | 43,189 | Roger | Phase 1 (Phase 4 amend) |
| `04-hook-bus.md` | 12,921 | Roger | Phase 1 |
| `05-router-design.md` | 22,561 | Gabriel | Phase 1 (Phase 4 §5.A) |
| `06-primitive-taxonomy.md` | 13,024 | Graham | Phase 0 (Phase 4 amend) |
| `07-generators-l3.md` | 21,540 | Rosella (Phase 4 §7.D amend by Graham) | Phase 1 |
| `08-applier-decision-gate.md` | 17,455 | Alexander | Phase 1 |
| `09-aperture.md` | 20,469 | Valanice | Phase 2 |
| `10-session-branching.md` | 22,760 | Roger | Phase 2 (Phase 4 amend) |
| `11-hermetic-replay.md` | 18,927 | Laura | Phase 1 (Phase 4 §11.10) |
| `12-copilot-sdk-integration.md` | 18,914 | Alexander | Phase 1 |
| `13-crucible-cli-shell.md` | 14,965 | Sonny | Phase 2 |
| `14-eureka-integration-surface.md` | 5,120 | Graham | Phase 2 |
| `15-coexistence-shared-types.md` | 14,970 | Roger | Phase 2 |
| `16-test-strategy-invariants.md` | 21,656 | Laura | Phase 3 (Phase 4 §16.5/§16.7a) |
| `17-observability-telemetry.md` | 12,667 | Gabriel | Phase 3 (Phase 4 catalog rows) |
| `18-security-permissions.md` | 12,048 | Erasmus | Phase 3 |
| `19-adr-set.md` | 8,783 | Graham | Phase 3 (Phase 4 ADR-0019/0024) |

## 0.5 ADR Index — 19 Titles Ready for Post-CTD Authoring

The §19 index carries all nineteen rows at `Accepted (CTD-locked) —
pending authoring` status. Authors named below per the §19 ownership
column; bodies land as `docs/adr/000N-<slug>.md` per the §19.3 lifecycle
rules. Composition root predecessor is ADR-0001 (`docs/adr/0001-composition-root.md`).

| # | Title | Author |
|---|-------|--------|
| ADR-0002 | L1 WAL Substrate Selection | Roger |
| ADR-0003 | L0/L1 Boundary Hermetic Contract | Graham |
| ADR-0004 | Canonical Serialization (CBOR + BLAKE3) | Roger |
| ADR-0005 | Hook Bus Verdict Model | Roger |
| ADR-0006 | Router as Single Policy Choke-Point | Gabriel |
| ADR-0007 | Session Branching Model | Roger |
| ADR-0008 | Hermetic Replay Doctrine | Laura |
| ADR-0009 | T5 — Crucible Owns Trunk, Copilot SDK is One Provider | Graham |
| ADR-0010 | Cairn / Forge / Crucible Coexistence Stance | Roger |
| ADR-0011 | Observation as First-Class L1 Primitive + Declared Context-Window Commitment | Graham |
| ADR-0012 | BootstrapPayload Literal + Manifest | Alexander |
| ADR-0013 | Structural-Proposal Queue as L1-Derived Projection | Valanice |
| ADR-0014 | Transitive Plugin Dependency Graph Pinned at Fork | Rosella |
| ADR-0015 | Bisect Env-Snapshot Stamped at Start | Laura |
| ADR-0016 | Timestamps Informational + Monotonic-Within-Session Invariant | Laura |
| ADR-0017 | Zero-Tolerance Mock-Drift Gate (Agentic-Cost Framing) | Laura |
| ADR-0018 | Pareto-Incomparable Prescriptions Both Non-Dominated | Rosella |
| ADR-0019 | Primitives as Minimal Typed Trace Algebra (not Universal ISA) | Graham |
| ADR-0024 | Explicit L3.5 Scheduler Tier | Gabriel |

Numbering gaps (0020–0023) are preserved per §19.3 — they correspond to
reserved slots from earlier draft allocations; the Phase 4 amendments
slot in at 0019 and 0024 against the prior reserved scheme.

---

## 0.6 Methodology Note — Phase 4 Synthesis Pattern (For Future Reuse)

The Phase 4 gate compressed the Phase 1 (12-check) and Phase 2 (10-check)
matrices into an 8-check shape because the Phase 4 surface was narrower
(four parallel lanes against fully-locked seams, vs Phase 1's eight
lanes against partially-coordinated seams). The reusable pattern for any
future single-amendment synthesis gate:

1. One row per **author-pair seam** modified in the amendment set
   (§1↔§5↔§17 for Scheduler; §3↔§6 and §3↔§10 for CALL/RET; §5↔§3 for
   Scheduler WAL acceptance).
2. One row per **honesty-clause / framing-clause pair** introduced
   (§11↔§16 for reproducibility honesty).
3. One row per **additive sub-kind family** registered (§16↔§3 for
   streaming).
4. One row for the **ADR index sync** (§19).
5. One cross-cutting **vocabulary pass** covering every new term
   introduced by the amendment set.
6. Resolve errata flagged by author drops inline if reviewer-rejection
   lockout doesn't preclude (Graham authored §1/§6/§19 and the §7.D
   contract amendment is a one-paragraph additive clause; lockout
   permitted).
7. Verdict GREEN-FINAL / YELLOW (needs another spawn) / RED (structural
   problem); GREEN-FINAL is the right answer when the amendment set
   composes cleanly and no follow-up is required.

Recorded in Graham's history as the final architecture-design gate
pattern for the CTD.
