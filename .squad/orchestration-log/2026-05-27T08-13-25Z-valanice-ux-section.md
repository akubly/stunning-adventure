# Orchestration Log: valanice-ux-section

**Agent:** Valanice (UX / Human Factors Specialist)  
**Model:** claude-sonnet-4.5  
**Mode:** Parallel (Round 1)  
**Session:** Eureka v0.1 Technical Design — Round 1  
**Date:** 2026-05-27 08:13:25Z  

## Files Produced

| File | Status | Size (KB) | Purpose |
|------|--------|-----------|---------|
| `docs/eureka/sections/60-ux-human-factors.md` | ✅ Created | 24.1 | §60: CLI interaction patterns, prompt friction levels, attention budget, v1.5 friction gates |
| `.squad/decisions.md` § "Friction-Level UX Decisions — Gated by v1 Dogfood Evidence" (2026-05-27) | ✅ Merged | 18.3 | Four friction-level decisions gated by v1 dogfood evidence (commit approval, tier-switching observability, empty-state actionability, contemplate verbosity) |

**Total authorship:** ~42.4KB (section + decision memo)

## Key Outcomes

1. **CLI interaction model defined** — §60 specifies:
   - **v1 attention budget:** ~1 blocking prompt per session (commit approval only)
   - **Recall interaction:** Silent by default (results printed, no "Searched: [tiers]" unless multi-tier results)
   - **Empty-state handling:** Factual messaging ("No results found") with optional suggestions (show suggestions by default, suppress with `--quiet`)
   - **Contemplation visibility (v1.5):** Silent by default, opt-in via `--verbose` (pending friction evidence)

2. **Friction-level decision framework** — §60 + memo specify:
   - **Decision 1: Commit approval frequency** — Gate: `eureka_commit_invocations_total` counter + rejection rate telemetry
     - Threshold: If >10 commits/session OR rejection rate <10%, flip to auto-approve with opt-in review
     - Evidence required: 10+ dogfood sessions (Aaron)
   - **Decision 2: Tier-switching observability** — Gate: `eureka_recall_multi_tier_results_total` counter + qualitative feedback
     - Threshold: If >5% of queries ask "which tier?", show "Searched: [tiers]" on every recall
     - Evidence required: 10+ dogfood sessions + post-session interview
   - **Decision 3: Empty-state actionability** — Gate: Log-based analysis (follow-up query rate, remediation success, ignored suggestions)
     - Threshold: If remediation_success_rate >70%, keep suggestions; otherwise drop to factual-only
     - Evidence required: Log analysis post-dogfood
   - **Decision 4: Contemplate verbosity** — Gate: Post-contemplate confusion + summary action-upon rate
     - Threshold: If >10% ask "did Eureka run contemplate?", default to summary; otherwise silent
     - Evidence required: 10+ v1.5 dogfood sessions

3. **19 CLI touchpoints mapped** — §60 documents:
   - **Recall family:** `recall`, `recall --tier`, `recall --min-trust`, `recall --verbose`, `recall --quiet`
   - **Integration family:** `ingest-decisions`, `ingest-decisions --session`
   - **Lifecycle:** `commit`, `retire` (v1.5+), `evict` (v1.5+)
   - **Observability:** `stats`, `reconcile` (v1.5+), `contemplate` (v1.5+)
   - **Configuration:** `config`, `preferences`

4. **Accessibility considerations noted** — §60 flags:
   - Color coding (search results, trust levels) must support color-blind users (accessibility alternative: symbols/text)
   - Long output (multi-tier results, verbose mode) should support paging (`--no-pager` override)
   - Latency feedback (slow recalls >500ms should show progress indicator)

## Tensions Raised

1. **Attention budget tension: 1 prompt/session is optimistic** — §60 proposes:
   - **v1 blocking prompt:** Commit approval only (~1/session target)
   - **Reality risk:** If `integrate` is called frequently (e.g., processing multiple docs in one session), user sees many commit decisions
   - **Valanice's friction gate:** Decision 1 gates commit approval frequency on dogfood evidence. If >10 commits/session observed, flip to auto-approve
   - **Recommendation:** Prepare auto-approve fallback (metadata flag `auto_approved: true` for audit); ship v1 with approval gate, adjust post-dogfood

2. **Empty-state messaging: "try a broader query" is one signal, not all** — §60 notes:
   - **Current design:** Show suggestions ("Try a broader query", "Check your tier scope")
   - **Evidence gate:** Decision 3 measures whether suggestions are actually followed and successful
   - **Risk:** If user's remediation strategy diverges from suggestions, suggestions become noise
   - **Recommendation:** v1 ships with suggestions; Valanice's friction gate collects evidence; v1.5 decision to keep or drop suggestions

3. **Contemplation visibility deferred to v1.5+ friction gate** — §60 specifies:
   - **v1:** Contemplation activity is stubbed (not in M2 scope, deferred to M3+)
   - **v1.5:** Contemplation ships; visibility decision is gated by evidence (Decision 4)
   - **Risk:** Visibility choice is deferred to v1.5 design, not v1 commitment. Must instrument contemplation properly to gate the decision.
   - **Recommendation:** Ensure contemplation telemetry is ready before v1.5 implementation begins

4. **Tier-switching observability tension: Noise vs transparency** — §60 notes:
   - **Current design:** Silent (only show "Searched: [tiers]" if multi-tier results)
   - **Evidence gate:** Decision 2 collects data on whether users want visibility
   - **Risk:** If tier-source is rarely asked (multi-tier results <10% of queries), "Searched: [tiers]" on every recall is clutter
   - **Valanice's proposal:** Keep silent by default; show only in `--verbose` mode or if multi-tier results
   - **Recommendation:** v1 ships silent; v1.5 friction gate collects evidence; locked decision post-dogfood

## Cross-Section Dependencies

- Depends on: 
  - **All sections (§00–§70)** for CLI touchpoints (integrated from all functional areas)
  - **Edgar (§30)** for contemplate activity scope (v1.5 timing)
  - **Laura (§50)** for test harness implementation (needed for interaction testing)

- Enables:
  - **Graham (assembly phase)** — friction-level decision framework can inform v1.5 planning
  - **Aaron (dogfood planning)** — instrumentation requirements clear; evidence collection protocol documented

- Blocks: None (ready for team feedback)

## Liaison Notes

- **Attention budget: ~1 prompt/session (commit approval only)** — aggressive, gated by dogfood evidence
- **Four friction-level decisions defined:** All gated by specific telemetry + qualitative evidence (10+ sessions minimum)
- **19 CLI touchpoints mapped:** Comprehensive interaction inventory
- **Accessibility flagged:** Color-blind support, paging, latency feedback
- **Evidence collection protocol documented:** Telemetry counters (already in v1 scope), log-based metrics, post-session interviews
- **v1.5 lock gate defined:** Four friction decisions cannot be locked until dogfood evidence is collected and analyzed

---

**Signed:** Valanice  
**Confidence:** HIGH on §60 design; MEDIUM on attention budget (aggressive 1 prompt/session); MEDIUM on friction-level evidence thresholds (need empirical validation)  
**Next step:** Round 2 assembly (parallel) + coordinate with Aaron on dogfood instrumentation (telemetry counters + interview protocol) + finalize evidence collection plan
