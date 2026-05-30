# PA-B4: Ancestry/Replay Divergence — Options Analysis

**Status:** DRAFT — awaiting Aaron ruling  
**Finding:** Pass A review identified divergence between §7 ancestry-aware reads and §10/§11 replay semantics  
**Owner:** Rosella  
**Date:** 2026-05-30

---

## Background

The CTD currently surfaces two distinct APIs for reading parent-session data in forked sessions:

1. **§7 Generator context** — `ReadSetBuilder` exposes ancestry-aware reads through L3 adapters, but §7.3 doesn't specify whether generators see parent history automatically or must explicitly request it.

2. **§10.4 Cross-session reads** — `LedgerWindowReader.readPrefix(childSid, 0, n)` returns *only* child rows; parent prefix requires explicit `readAncestry(childSid, includeParents=true)` call.

3. **§11 Hermetic replay** — Uses the *stitched* view (parent + child) to replay forked sessions: "Replay (§11) uses the stitched view; live runtime reads do not unless explicitly requested" (§10.4).

This creates a **replay correctness hazard**: if a generator reads parent history during live runtime but the read is NOT captured in `causalReadSet`, replay will diverge because §11 re-feeds from stitched history but the generator's read-set won't hash-match.

---

## Option A: Unify Ancestry-Aware Reads Under One API

**What it means:**  
Modify §7.3 `ReadSetBuilder` to expose a single unified `ancestry(ancestorSid, includeTransitiveParents)` method that mirrors `readAncestry()` from §10.4. Generators explicitly declare when they need parent history; `ReadSetBuilder.build()` captures these ancestry reads in the `ReadSetRef`. During replay, §11 uses the same stitched view that live generators saw, keyed by the read-set hash.

**Surface area changed:**
- §7.3: Add `ReadSetBuilder.ancestry(ancestorSid: SessionId, includeTransitiveParents: boolean): this` method
- §7.3: Document that `primitive(id)` and `projection(key)` are *child-session-scoped* unless ancestry is explicitly requested
- §10.4: No change — `readAncestry()` remains the L1 primitive
- §11.4: Clarify that replay re-feeds ancestry reads via the same stitched-view logic

**Replay correctness:**  
✅ **Preserved.** Ancestry reads are captured in `causalReadSet`; replay oracle compares stitched views consistently.

**Plugin author ergonomics:**  
⚠️ **Moderate friction.** Authors must understand fork semantics and explicitly opt into parent reads. Generators that forget to call `.ancestry()` will produce incomplete prescriptions when invoked in forked sessions, but the failure mode is visible (missing data, not silent divergence).

**Conformance test impact:**  
§7.A C-6 (`causalReadSet` completeness) already tests read-set completeness. Add one new property: **C-6b (ancestry-read completeness)** — for any generator invoked in a forked session that emits a proposal citing an `EventId` from a parent session, that parent session MUST appear in `causalReadSet.ancestryRefs[]` (new field).

**Migration cost:**  
✅ **Low.** Forge v1 is `kind:'data'` only and doesn't fork. Curator (§7.C) doesn't fork. Eureka v1.5 adapter (§7.F) will be the first external generator that might need ancestry reads; document the requirement in §7.F.

**Recommendation rationale:**  
Explicit is better than implicit for a security-sensitive boundary (parent history is mutable until the parent closes). Generators that need parent context are rare in v1 (only Eureka v1.5 might), so the ergonomic cost is isolated.

---

## Option B: Split APIs Cleanly with Documented Divergence

**What it means:**  
Keep §7 and §10 APIs separate. Generators get *child-only* reads through `ReadSetBuilder` (no ancestry access); replay uses stitched view *only* when replaying bootstrap rows or parent-citing `Decision` primitives. Accept that live runtime and replay see different ledger slices, but enforce that *no generator output may cite parent EventIds* unless the generator explicitly requests ancestry via a Router-mediated escalation (new `kind:'ancestry-dependent'` proposal category).

**Surface area changed:**
- §7.1: Add new `ProposalCategory` value: `'ancestry-dependent'`
- §7.3: Document that `ReadSetBuilder` is *child-session-scoped*; no ancestry access
- §5 Router: Add escalation path for `ancestry-dependent` proposals — Router pauses, queries parent ledger, re-invokes generator with extended context
- §10.4: No change
- §11.4: Clarify replay scope — stitched view for bootstrap + Decisions citing parent, child-only for generator `Request` rows

**Replay correctness:**  
⚠️ **Requires discipline.** Generators that cite parent EventIds without declaring `ancestry-dependent` category will produce replay divergence. Conformance test C-6 becomes a blocking gate — any generator citing a parent EventId without `ancestry-dependent` category is rejected.

**Plugin author ergonomics:**  
✅ **Simpler for common case.** 95% of generators (Forge, Curator, simple prescribers) never need parent history; they see a clean child-only ledger. The 5% that do (Eureka v1.5 analyzing multi-fork experiments) pay the Router escalation cost but the contract is explicit.

**Conformance test impact:**  
§7.A C-6 becomes **C-6-strict**: any `EventId` cited in `evidence.citations[]` that resolves to a parent session MUST trigger a contract violation unless `category='ancestry-dependent'`. This is a *blocking* test — Router policy rejects before Applier sees the proposal.

**Migration cost:**  
⚠️ **Moderate.** Eureka v1.5 adapter (§7.F) will need Router-escalation protocol added to v1 scope if Eureka prescribers analyze cross-fork data. If Eureka v1.5 only analyzes single-session data, no migration cost.

**Recommendation rationale:**  
Cleaner separation of concerns — generators are child-scoped by default, ancestry is opt-in via Router. Replay becomes simpler (no stitched-view logic for generator reads). The downside is the Router escalation protocol is new v1 work.

---

## Tradeoffs Summary

| Dimension | Option A: Unify APIs | Option B: Split APIs |
|-----------|---------------------|---------------------|
| **Replay correctness risk** | Low — ancestry reads captured uniformly | Medium — requires C-6-strict enforcement |
| **Generator ergonomics (common case)** | Medium — must understand forks | High — child-only is default |
| **Generator ergonomics (ancestry case)** | High — explicit `.ancestry()` call | Medium — Router escalation ceremony |
| **§7/§10 coupling** | High — `ReadSetBuilder` mirrors `readAncestry()` | Low — APIs stay separate |
| **Conformance test complexity** | Low — C-6b extends C-6 | Medium — C-6-strict is blocking |
| **v1 implementation cost** | Low — wire existing primitives | Medium — Router escalation path is new |
| **Eureka v1.5 adapter impact** | Low — `ancestry()` is one method | Medium — if Eureka needs ancestry, Router protocol required |

---

## Recommendation

**Option A: Unify ancestry-aware reads under one API.**

**Reasoning:**  
1. **Replay correctness is load-bearing** — Option A's uniform capture in `causalReadSet` is more robust than Option B's discipline-based contract.
2. **v1 Eureka scope is uncertain** — we don't yet know if Eureka v1.5 will analyze cross-fork data. Option A defers the Router escalation protocol (which is v1.5+ scope) without painting into a corner.
3. **§7.A conformance suite C-6b is low-cost** — property test already instruments read tracking; extending to ancestry refs is incremental.
4. **Plugin author friction is acceptable** — the 95% case (Forge, Curator) never calls `.ancestry()`; the API is opt-in and self-documenting.

If Aaron prefers **explicit separation** (Option B philosophy), the Router escalation protocol should be scoped into v1 Phase 0.5 or Phase 1 so Eureka v1.5 isn't blocked.

---

## Next Steps (Awaiting Aaron Ruling)

1. **If Option A:**  
   - Add `ReadSetBuilder.ancestry()` to §7.3  
   - Extend `ReadSetRef` schema with `ancestryRefs: Array<{ ancestorSid: SessionId, transitiveDepth: number }>` in §6.1  
   - Add C-6b property to §7.A conformance suite  
   - Document ancestry semantics in §7.F (Eureka v1.5 forward ref)

2. **If Option B:**  
   - Add `ancestry-dependent` to `ProposalCategory` enum in §7.1  
   - Specify Router escalation protocol in §5.8 (new subsection)  
   - Upgrade C-6 to C-6-strict in §7.A  
   - Coordinate with Gabriel on Router policy chokepoint

3. **Either way:**  
   - Clarify §11.4 replay scope for ancestry reads  
   - Update §16.3 acceptance signals to cover fork-aware generators (coordinate with Laura)
