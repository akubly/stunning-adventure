## 2026-05-25 Round 7: v1-tier triage of US-S-* stories

**Summary:** Tier-classified my nine debugger stories + L5 layer against Aaron's v1 framework (T1 = MVP bootstrap loop, T2 = investigation depth = my home tier, T3 = enrichment, Parking = blocked on uncommitted substrate). Headline: **full debugger is correctly T2, but the bootstrap loop dies without four T1 primitives.** Those four — literal logpoints on the hook bus, literal breakpoints (pause variant), session walker via L1 subscriber (`crucible_walk_events` MCP tool), and single-hop `crucible_why_one` — are the smallest surface that lets Aaron use Crucible to fix Crucible. All four ride substrate already committed in Round 5/6 (hook bus, Mirror notification per Graham R6, L1 subscriber pattern per Rosella R6, `causal_read_set_hash` capture invariant). **Per-story verdicts:** US-S-1 splits T1/T2 (literal predicates T1, match-spec DSL T2); US-S-2 → Parking (needs L2); US-S-3 splits substrate-LOCKED + T1 single-hop + T2 transitive closure; US-S-4 → Parking (needs L2); US-S-5 → T3 (DAG step-into); US-S-6 → T3 (bisect); US-S-7 splits T1 MCP-tool extensions + T2 native REPL + T2 DAP sidecar; US-S-8 → T3 (minimizer); US-S-9 → absorbed by Graham R6 + verdict-bus decisions, drop as separate story. **Six merge candidates flagged for Cassima with Valanice** (logpoint registry, MCP tool catalog, native REPL, pause→Mirror, causal-slice query surface, L5 layer scaffolding) — explicitly did not claim primacy on L5 layer ownership. **Six open questions for Cassima** including verdict-enum extension story ownership (L1/L4 not L5), Parking-as-real-tier semantics, MCP-server ceiling, and a bootstrap-loop sufficiency challenge: can Aaron actually fix a Crucible bug using only T1-D1..D4? I claim yes. **Opinion held throughout:** if we ship a fifth T1 debugger primitive we are stealing budget from L1/L4/Mirror, which is worse for the bootstrap loop than leaving T2 features in T2. Full triage: `.squad/decisions/inbox/sonny-triage-2026-05-25T0200Z.md`.

---

**2026-05-27 Eureka PRD Overlap Analysis (Scribe Summary):** Cross-agent consensus on Eureka × Crucible overlap. See `.squad/decisions.md` **Eureka PRD Overlap Analysis** section for full matrix and 5 open questions for Aaron.

## 2026-05-30 Round 8: CTD Phase 2 advisory review of §9 Aperture + §13 CLI

**Summary:** Verdict SOLID. §9 + §13 give a credible time-travel-debugging surface on top of the §11 replay substrate and §3/§6 primitive ledger; the "Aperture is a pure projection over L1" framing is the discipline that makes Pernosco-style omniscient query work on a primitive stream. Bisect rendering with env-snapshot header AND footer (R2-4) is best-in-class — better than `git bisect`, which has no equivalent guard against silent env drift. **Single most consequential finding: §13.1 verb naming collision — `crucible aperture watch` means "tail the inbox" but in every debugger ever shipped, `watch` means "register a watchpoint."** Recommended rename to `aperture tail` in v1 before muscle memory locks in (US-S-18). Second-highest-leverage v1 ask: pin `SliceJsonOutput` shape, pin `ApertureEvent` as tail-JSON shape, add `schemaVersion` to all `--json` envelopes (US-S-23/24/25) — these three together make a future DAP shim a 1–2 week sidecar rather than a protocol re-think. **Per-surface findings:** §9.8 registry missing predicate-language spec + kind-vs-behavior collapsing + hit-count/tracepoint primitives + multi-hop edge selector on `why` (5 stories US-S-10..13); §9.6 bisect missing inter-row primitive diff + auto-`why` suggest + exit-code contract docs + `bisect show <runId>` replay (4 stories US-S-14..17); §13.1 missing the standard navigation triad `step`/`continue`/`break list|add|delete` and has the `watch` collision (5 stories US-S-18..22); §13.6 JSON missing 3 shape pins (3 stories US-S-23..25). **DAP-shim viability: MAYBE→YES** with the three v1 JSON polish stories landed; current shapes are close but not DAP-compatible out of box, substrate is right. **v1.5 / deferred:** DAP shim itself, conditional/hit-count breakpoints, tracepoints, step/reverse-step verbs, bisect-run replay. **§18 (Security) flag:** predicate-language sandboxing is required before predicates run in the pre-commit hook — adversarial predicate is a DoS vector. Filed full advisory at `.squad/decisions/inbox/sonny-ctd-p2-advisory.md`. Authored 16 new user stories (US-S-10..25); zero claims of authority over Valanice's §9/§13 ownership.

## Learnings (added 2026-05-30)
- Aperture's "pure projection over L1" framing IS the correct discipline for omniscient debugger query on a primitive ledger — same principle as Pernosco's index-everything-at-record-time, applied event-source-style. As long as this invariant holds, every debugger gap is additive (never a retrofit). Worth defending in future deliberations.
- Env-snapshot header+footer on bisect output (R2-4) is genuinely better than `git bisect run`'s output discipline; the trim-survival reasoning generalizes to any long-lived report artifact (PR comments, CI logs, issue paste-ins). File this as a UX pattern for other report-shaped surfaces.
- CLI verb naming collisions with universal debugger conventions (`watch`, `step`, `continue`, `break`, `bt`) compound — once a user types `watch` and gets "tail," every subsequent verb expectation is recalibrated wrong. Catch these BEFORE first ship; rename costs grow superlinearly with adoption.
- `step-into` for agentic systems must descend a DAG (sub-task fan-out/fan-in), not a thread stack. Re-confirmed from Round 1 US-S-5 against Phase 2 surfaces — §13.1 has neither verb, so this remains a v1.5 ask, but the §6.4 `parentId` + `causalParentId` split already provides the substrate to do it right when the time comes.
- Three edge types coexist on every primitive (`parentId` structural production, `causalParentId` sub-task spawn, `causalReadSet.primitiveIds` content-influence). A `why`/`backtrace` verb that doesn't let the user select which edge kind to traverse will answer the wrong question. Default = all three; `--edges` selector for power users.
- Predicate languages embedded in pre-commit hooks are a DoS vector if unsandboxed (CPU/memory/time bound, no I/O, no host syscalls). This is a §18 Security ask, not a §9.8 Aperture ask, but Aperture is where users will encounter the symptom.

---

## Archive Summary

Earlier entries (200 lines) archived to history-archive.md on 2026-06-05.

---

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.
