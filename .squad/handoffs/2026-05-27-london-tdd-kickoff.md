# Handoff — London-school TDD kickoff

**From:** session ending 2026-05-27 ~10:47 PT (Aaron + Squad coordinator)
**To:** next session
**Owner of next session:** Squad coordinator → Laura (Tester) leads, with Genesta + Edgar as reviewers
**Status of this handoff:** ready — start here

---

## What just happened

- The full Eureka cast (Graham, Genesta, Crispin, Edgar, Roger, Laura, Valanice, Cassima) co-authored the **Eureka v0.1 technical design**.
- Assembled at `docs/eureka/technical-design.md` (read this first), with section files under `docs/eureka/sections/` and ADRs under `docs/eureka/adrs/`.
- Committed in **`4a8235b`** — "Eureka v0.1 technical design — team-authored". 31 files, +6,327 lines.
- Decisions inbox merged; `.squad/decisions.md` updated.

## New directive captured at end of session

> **All implementation work uses London-school (mockist / outside-in) red/green TDD.** Red first (failing test that drives the next collaborator), green next (minimal pass), then refactor. Mock collaborators at the boundary of the unit under test; test interactions, not just state. Applies to all packages — cairn, forge, types, and Eureka going forward.

Captured in `.squad/decisions/inbox/copilot-directive-2026-05-27T17-44Z-london-tdd.md` (will be merged into `decisions.md` on next Scribe pass).

## Why this matters

- Laura's existing **`docs/eureka/sections/50-testability.md`** leans contract-first + property-based. That's fine as a complementary layer, but it is **not** outside-in London-school as a spine. The section needs a revision or a sibling.
- Outside-in tests drive interface shapes via mocks. If the substrate is unstable, the mocks drift. → **OQ-1 (substrate ownership) gets promoted from "important" to "should-resolve-before-first-red-test."**

---

## Open blockers from v0.1 (Aaron must decide)

See `docs/eureka/technical-design.md` → "Open Decisions for Aaron" and ADR `0002-shared-substrate-ownership.md`.

| OQ | Topic | Severity for London-TDD | Recommended |
|----|-------|--------------------------|-------------|
| **OQ-1** | Shared substrate ownership (`@akubly/types` duplicated across `mem/` and `harness/`) | **CRITICAL** — interface seams must be stable before mocks land | Monorepo (Graham's rec) |
| OQ-2 | Confirm R8 shared `SessionId` brand stance | High — `SessionId` is a primary seam | Confirm shared brand |
| OQ-4 | Dogfood sequencing (Crucible-first vs Eureka-first) | Medium — affects which mocks get exercised first by real usage | Crucible-first |
| OQ-3, OQ-5, OQ-6 | Lower-priority items | Low for TDD strategy | Defer |

**Coordinator's open question to Aaron at session end** (still unanswered):
> *Should we resolve OQ-1 (substrate ownership) before Laura starts, or proceed with mock seams assuming a single resolved `@akubly/types` and revisit if you pick a non-monorepo option?*

Answering this is the first thing the next session should do.

---

## First task for the next session

**Spawn Laura (background, claude-sonnet-4.5) to author `docs/eureka/sections/55-tdd-strategy.md`.** Goals:

1. London-school red/green/refactor as the spine. Outside-in from each of the **9 activities** (7 v1: integrate, recall, rerank, decide, commit, retire, evict; 2 v1.5: meditate, contemplate).
2. Worked example: drive `recall` test-first. Show the first failing test, name the collaborators it forces into existence (representation, properties, scheduler, scorer), the mocks at each seam, and the minimal green.
3. Define the **mock contract style** — interaction tests vs sociable tests, when to allow real collaborators (value objects), when to mock (anything crossing a boundary).
4. Reconcile with `50-testability.md` — explicitly note which content from §50 stays (property-based for trust/recency invariants, edge-case checklist, integration boundary tests) and which is reframed as outside-in.
5. Map onto **PRD acceptance criteria** — for each AC, the first red test that would prove it.
6. List the seams that **depend on OQ-1 resolution** — flag any test in the worked example that would change shape based on substrate ownership.

**Reviewers (parallel background, claude-sonnet-4.5):**
- **Genesta** — verify the outside-in entry points match her activity semantics in §10.
- **Edgar** — verify the mocked collaborators match his algorithmic seams in §30.

If either reviewer rejects, lockout applies — Laura is locked out of revision; the revising agent must be different. Per Reviewer Rejection Protocol.

**Then:** Graham updates `docs/eureka/technical-design.md` TOC + status table to add §55. Scribe logs + commits.

---

## Files the next session should read first (coordinator)

1. This handoff (you're reading it)
2. `docs/eureka/technical-design.md` — canonical entry point, open-decisions register
3. `.squad/decisions.md` — for the London-TDD directive (after Scribe merges) and recent context
4. `docs/eureka/adrs/0002-shared-substrate-ownership.md` — for OQ-1 status

## What Laura should read — and what she should explicitly IGNORE

**Read (the "outside" — observable behavior):**
- The relevant slices of `.squad/decisions/eureka-prd-v5-final.md` — acceptance criteria are the test contract
- `docs/eureka/sections/10-activities-and-tiers.md` — **for the activity verb list ONLY** (the 7 v1 + 2 v1.5 entry points). Treat this as the "what the user sees." Do NOT pre-adopt Genesta's collaborator decomposition.
- `docs/eureka/sections/70-prd-alignment.md` — acceptance-criteria coverage table to cross-reference

**Explicitly IGNORE (the "inside" — would anchor her on existing collaborator design):**
- `docs/eureka/sections/20-knowledge-representation.md` (Crispin's schema)
- `docs/eureka/sections/30-learning-systems.md` (Edgar's algorithms)
- `docs/eureka/sections/40-integration.md` (Roger's package wiring)
- `docs/eureka/sections/50-testability.md` (her own prior contract-first/property-based strategy — this is being **superseded** as the spine; she may revisit at the end to mark which content carries forward as a complementary layer, but must NOT read it before drafting)

**Rationale (London-school discipline):** Outside-in TDD drives the internal collaborator shape from the tests, not the other way around. If Laura reads §20/30 before writing the first red test, she'll write tests that confirm the existing internal design rather than letting tests reveal what the collaborators actually need to be. The activity verbs (§10) are observable behavior — those are fair game. Everything internal is off-limits until the tests have spoken.

**For reviewers (Genesta, Edgar):** They read their OWN sections (§10, §30 respectively) before reviewing — that's their role's correct grounding. They verify Laura's interaction seams match the activity semantics and algorithmic seams they specified. If a seam mismatch appears, the resolution may be that the *internal design* shifts to match what outside-in tests revealed, not the other way around.

---

## Session start checklist for the next coordinator

1. Run `git config user.name` (should be "Aaron Kubly") and `git status` (should be clean on whichever branch).
2. Read this handoff first.
3. Read `docs/eureka/technical-design.md` (TOC + open decisions).
4. Ask Aaron: *"OQ-1 — resolve substrate ownership before Laura starts, or proceed with mock seams assuming a resolved shared `@akubly/types`?"*
5. Based on the answer:
   - **Resolve first:** spawn Graham (sync, opus) to author the substrate-ownership decision based on Aaron's chosen option (monorepo / submodule / npm). Then update ADR 0002 from "Proposed" to "Accepted." Then proceed to step 6.
   - **Proceed:** go directly to step 6.
6. Spawn Laura (background, sonnet-4.5) with the task above. Spawn Genesta + Edgar (background, sonnet-4.5) as parallel reviewers with input artifact = `docs/eureka/sections/55-tdd-strategy.md` (they'll wait for it; this is a soft dependency — they read §10/§30 first to anchor what they're going to review, then poll for §55).

   Actually simpler: spawn Laura first (background). When she completes, spawn Genesta + Edgar to review. That's two turns, but reviewers without an artifact to review is wasted spawn budget.
7. Standard After Agent Work flow: collect, compact summary, spawn Scribe background.

## Session end checklist for THIS session

- [x] Directive captured to inbox
- [x] Handoff written here
- [ ] Final Scribe pass to merge the directive into decisions.md and commit this handoff file (next coordinator can do this, or current session can do it before close)
