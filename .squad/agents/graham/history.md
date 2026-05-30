# Graham — History

**Role:** Lead / Architect (Overall vision, cross-system integration, tiebreak arbitration)
**Status:** M5+M6 branch prep complete. Feature branch `eureka/m5-m6-trust-feedback` ready for review-cycle.
**Last update:** 2026-05-30

**Key contributions:**
- Phase 4.6 wave orchestration: 5 waves integrated (0-6)
- Brain system: ADR-pending (Curator-driven orchestration, composition root)
- Eureka C8: Recommended exemption for integration test validation (conservative layering concern)
- Resolution: Aaron sided with Genesta; strict eslint enforced; §40 documentation compensates

**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
**Milestone:** R6 opened — Eureka source-reading unlocked; trio (Genesta/Crispin/Edgar) reconciled v3 PRD against Cairn/Forge substrate.

**Key outcomes:**
- Genesta (B+ verdict): PRD v3 stands with v3.1 patch (4 targeted fixes)
- Crispin (Path A recommended): clean-slate Eureka over Cairn extension
- Edgar (Kernel extraction): ~70% mechanical infra exists; recommend shared learning-kernel package

**Your involvement:** Advisory roles on boundaries/UX (2-3 hrs/week contribution rate).

**Decision gates pending Aaron's direction:**
1. Vector search scope (in/out for v1)?
2. Architectural path (A clean-slate or B extension)?
3. Learning-kernel extraction (now or defer)?
4. v3 patch or v4 rewrite?

**Next:** Cassima on deck for v3.1 or v4 intake pending Aaron's architectural direction.

---

## Learnings

**2026-05-30 — Branch hygiene: rescuing dirty main → feature branch**

Pattern used for M5+M6 branch prep:

1. `git switch -c <feature>` — creates branch from current HEAD (carries Scribe's metadata commit + untracked files, but NOT tracked working-tree modifications)
2. **Critical lesson:** `git switch` carries tracked working-tree modifications with you. If you then `git reset --hard origin/main` on the source branch, those modifications are wiped from disk — not preserved on the feature branch, because they were never committed.
3. **Correct sequence** (learned the hard way): commit implementation on the feature branch BEFORE switching back to main to reset. Or stash before the reset. Never rely on working-tree state surviving a `reset --hard` on a parallel branch.
4. After reset, untracked files survive (gitignore rules aside) because `reset --hard` only touches tracked state.
5. Reconstruction was possible here because the test file (untracked — survived) fully specifies the contract, enabling faithful reimplementation from the test alone.

**Rationale for 2-commit structure vs. 1 monolith:**
- Kept Scribe's metadata commit as-is (don't rewrite what Scribe already landed cleanly)
- Commit A: implementation + tests + spec — single logical RED→GREEN deliverable; reviewers see the complete contract in one diff
- Commit B: team metadata (history, skills) — lower-signal noise that would dilute Commit A's review surface
- Trade-off: 3-commit branch (Scribe + A + B) vs. 2-commit. Accepted — Scribe commit is inert to review-cycle (no code).

