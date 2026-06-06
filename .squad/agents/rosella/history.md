7. ✅ Preimage: timestamp variant for --new, reuse existing childSid for --resume
8. ✅ Observation row: ork_resume sub-kind added to §6.3
9. ✅ Keep both --resume flag AND crucible session resume verb (Roger finding: orthogonal workflows)
10. ✅ Closed-session metadata appends: clarification added to §10.1 ("closed ≠ sealed for metadata")

**Reviewer findings incorporated:**
- **Graham (Architect):** Parent-ledger Decision row is idiomatic (RFC+Decision pattern); wall-clock heuristic inappropriate (replay-instability); L3.5 Scheduler has no coupling to fork protocol; recommend offset-based heuristic or drop entirely. **Outcome:** Dropped heuristic entirely per Aaron ruling.
- **Valanice (UX):** "New" instead of "Fresh" (natural language + parallel structure); relative time ("3 days ago") critical for attention capture (US-4); 1-hour threshold is cognitive boundary but turn-count heuristic would strengthen it. **Outcome:** "New" naming adopted; relative time added to prompt spec; heuristic dropped per Aaron ruling (always-prompt with neutral presentation).
- **Laura (Tester):** All 4 user stories are testable; replay determinism requires Decision row recording (covered); time-aware nudge requires logical-time injection (hermetic replay); ork_resume sub-kind required for ledger trace. **Outcome:** All findings incorporated; 8 acceptance scenarios added to §16.9; ork_resume added to §6.3.
- **Roger (CLI):** --new/--resume flags consistent with CLI taxonomy; --disambiguator flag redundant (timestamp variant handles collision); TTY detection + exit codes required; keep both flag and verb (orthogonal use cases). **Outcome:** All findings incorporated; --disambiguator rejected; TTY/exit-code spec added to §10.4 pseudocode; both flag and verb documented in §13.1.

### Key Learnings

**Cross-persona review yields replay-bug catch:** Graham (Architect) and Laura (Tester) independently caught the same blocker — wall-clock heuristic (now() - created_at_ns > 1 hour) violates hermetic replay because replay executes weeks/years after original run, causing threshold logic to flip. This is a **genuine correctness bug** that neither Rosella's original design nor Aaron's initial "maybe give the user the option" framing surfaced. The 4-persona review panel caught it via domain expertise convergence (Graham: "offsets are structural, wall-clock is informational"; Laura: "logical-time injection required for hermetic replay"). **Skill extraction candidate:** "cross-persona-review-yields-replay-bug-catch" — disciplined multi-lens review surfaces hidden determinism violations in protocol design.

**"New" vs "Fresh" naming precision:** Valanice's "Fresh" → "New" critique is an example of CLI vocabulary precision work. "Fresh" is adjective modifying implicit noun; "New" is noun or verb (parallel with "Resume"). Both read as 3-letter words in prompt, so UX real estate unchanged. But "New session" / "Resume session" reads cleaner than "Fresh session" / "Resume session". Small precision wins compound in tired-engineer usability.

**Idiomatic Decision-row pattern recognized:** Graham's finding that parent-ledger Decision row is **idiomatic** (not a violation of append-only or closed-session invariants) is a load-bearing architectural insight. The fork-collision Question/Decision pattern is structurally identical to existing RFC (Request for Choice) patterns in Crucible. This framing makes the hybrid design cheaper — no new ADR for "closed ≠ sealed" (just a one-line clarification), no new primitive or envelope field. Reuse existing Question/Decision primitives.

**Always-prompt as training wheels:** Valanice's "interactive prompt is training wheels that teach the fork model" framing is the UX justification for dropping the heuristic. After 2-3 collisions, Aaron learns the pattern and graduates to explicit flags (--new/--resume). The prompt never blocks power users (flags bypass it) but prevents silent data loss for default case (US-2 crash recovery without prior awareness). This is the **safety-by-default** design Aaron values.

**Orthogonal flag vs verb workflows:** Roger's finding that crucible fork --resume and crucible session resume serve **orthogonal workflows** is a clean separation. Flag = "I know at fork time I want to resume"; verb = "I discovered an aborted session via crucible session list, resume it directly without forking". Both are first-class; neither is deprecated. This is better than forcing one canonical path.

**Acceptance-signal vocabulary coordination:** Laura's 8 A-Fork-* scenarios use the same acceptance-signal vocabulary as §16.9's existing A1–A13 + C-9. This is disciplined test-strategy coordination — new scenarios extend the existing acceptance tier, not create a parallel vocabulary. Conformance-tier (C-*) vs acceptance-tier (A-*) distinction is preserved.

**Options-docs-first discipline validated again:** PA-B4 (ancestry/replay) and childSid collision both used options-docs-first. Aaron's ruling on childSid came after 4-persona review of the hybrid proposal (Round 2 user stories doc). Options docs surface tradeoffs cleanly; reviews catch hidden bugs; ruling is defensible and auditable. This is the right forcing function for non-trivial design choices.

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
---

## Archive Summary

Earlier entries (413 lines) archived to history-archive.md on 2026-06-05.

---

# SUMMARY (as of 2026-06-01)

File size: 49345 bytes. See history-archive.md for earlier entries.

---

📌 **ADR-0019 LANDED** (2026-05-30T194147Z): End-to-end execution of Aaron's childSid collision hybrid ruling. All 10 design points incorporated (no deviations): dropped wall-clock heuristic, always-prompt UX, "New" naming, non-TTY exit code 2, flags (--new/--resume/--no-interactive/--label), Decision row in parent ledger, preimage rules, fork_resume Observation, both flag+verb, closed-session metadata append clarification. 7 CTD files edited (§10.4/§10.1/§6.3/§13.1/§16.9 + 2 options docs marked SUPERSEDED). 8 A-Fork-* acceptance scenarios added. Artifact: docs/adr/0019-childsid-collision-hybrid.md (14.8 KB, 315 lines, comprehensive). Skill captured: cross-persona-review yields replay-bug catch (multi-lens design surfaces correctness violations).

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Rosella (7/7 items: C-8→C-9 conformance + trust-tier persistence + Pareto budget + `alternatives[]` bounding + invocation-stack cache + 2 options docs PA-B4/childSid awaiting Aaron). Coordinate with Laura on C-9 + Gabriel on PA-B4 Option B router protocol. — Scribe

📌 Team update (2026-05-30T12:05:19Z): **PA-B4 Option A Landed + childSid Round 2 User Stories** — Aaron accepted PA-B4 Option A (ancestry-aware reads). 5 CTD edits: §7.3 ReadSetBuilder.ancestry(), §6.1 ReadSetRef.ancestryRefs[], §11.4 replay stitched-view logic, §7.A C-6b conformance, §7.F Eureka forward ref. Aaron requested childSid user stories; hybrid proposal created with 4 UX scenarios, CLI surface (`--fresh`/`--resume` flags + interactive prompt), determinism via Decision row. Recommendation: Hybrid lean, fresh-by-default. Awaiting Aaron ruling. — Scribe


---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.
