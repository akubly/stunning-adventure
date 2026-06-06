- M6-B2: FactReader returns null → must throw; TrustUpdater not called. RED: same.

**Final counts:** 29 tests total. 26 pass (18 M1–M4 + 8 M6-A pass/regression-lock). 3 fail RED: M6-A5 + M6-B1 + M6-B2.

**New pattern learned:** Contract-after-implementation regression-lock. When implementation arrives before contract tests, the correct response is: write the tests anyway (they lock the contract), document the §55 deviation in comments, and ensure at least one test in the beat is genuinely RED (drives undefined behavior). Mechanical passing tests still have value as regression guards.

**Read-seam shape decision:** New function (`applyFeedbackById`) over extending existing (`applyFeedback`) because: (a) `applyFeedback` has a stable M5 contract, (b) orchestration (read + compute + write) is a different responsibility from pure compute + write, (c) keeps `applyFeedback` unit-testable without storage deps.

**Next owner:** Edgar — M6 GREEN. See `.squad/decisions.md` for the merged decision trail.

### 2026-05-30: PR #34 Review — RED-beat skill, scope clock dep to recency activities

**Three Copilot threads resolved (all same theme — stale `clock` references in SKILL.md):**

- **Activity signature example (~line 56):** Removed `clock: ClockProvider` from the deps block; replaced with a comment scoping it to recency activities only (`recall()` / `recallWithScores()`, per §55 §1.2 / §30 §2.3).
- **Design decision bullet (~line 62):** Rewrote "clock is always in deps" bullet to state the actual rule: `clock` belongs in deps only when the activity reads time; feedback mutation omits it; required-but-unused deps are an anti-pattern that pollute tests with phantom injections.
- **Checklist item (~line 135):** Updated to conditional — "only if the activity calls recall APIs" — aligns with shipped `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` (no clock).

**Validation:** 40/40 tests green. No code or test files touched — documentation only. Commit: `4d4378b`.

**Pattern reinforced:** Skill documentation is a contract. When the shipped implementation deviates from a required-but-unused dep pattern, update the skill immediately so future RED beats aren't taught the wrong interface shape.

### 2026-05-30: M5 RED — Trust Feedback Mutation Contract
📌 Team update (2026-05-31T07:24:22Z): **M7-A (PR #38) shipped** — Typed error classes for applyFeedback/applyFeedbackById. 5 error classes with code discriminators. All 40 existing tests GREEN (no changes required, inheritance preserved). Next: M7-B (Laura — exhaustive narrowing tests) and M7-C (Crispin/Edgar — FactReader contract + atomicity). — Scribe

---

📌 Team update (2026-06-02T06:00:00Z): **M7-B + M7-C + M7-D (PR #41) COMPLETE — Eureka M7 Shipped** — Edgar + Crispin delivered 5-cycle marathon. 22 unique Copilot findings (44 threads). Final: 74 tests green, tsc-clean, lint-clean, merged to main as ed6be2c. M7 COMPLETE: error narrowing (B) ✅ + atomicity contract (C) ✅ + session-scoped regression tests (D) ✅. New skill: `.squad/skills/refactor-grep-cleanup/SKILL.md` (grep repo for old interface names post-refactor, not across N cycles). — Scribe


---

## Forge M3 — Disposition Feedback Hardening (2026-06-05)

**Task:** Adversarial/edge-case test hardening for Graham's M3 implementation (issue #42).

### Tests Added

**`packages/forge/src/prescribers/utils.test.ts`** (NEW — 10 tests):
Pure unit coverage of `applyDispositions` in isolation. Key cases:
- Empty dispositions → no-op
- `dismissedCount=1` and `dismissedCount=2` → suppressed (permanence explicit)
- `resolvedCount=1` → confidence boosted
- `confidence=0.9` with boost → clamped to exactly 1.0 (Math.min(1,...) ceiling)
- `confidence=1.0` with boost → still 1.0 (already at ceiling)
- `dismissedCount=1, resolvedCount=1` (same category) → dismissed wins (documented precedence)
- `dismissedCount=0, resolvedCount=0` (all-zero) → strict no-op
- Category absent from dispositions → hint passes through unchanged
- Multi-category mixed effects: suppress one, boost another
- Immutability: original hint objects not mutated (pure function contract)

**`packages/forge/src/prescribers/forgePrescriberOrchestrator.test.ts`** (+4 tests):
Adversarial orchestrator tests (new describe block "M3 adversarial edge cases"):
- `dismissedCount=2` (re-dismissed) → still suppressed [Gap #1]
- `sessionCount=9` → baseline confidence 0.9 → `0.9 * 1.2 = 1.08` → clamped to 1.0 [Gap #2]
- `dismissedCount=1, resolvedCount=1` same category → dismissed wins [Gap #3]
- All-zero DispositionSummary → no-op [Gap #5]

**`packages/cairn/src/__tests__/sqliteHintDispositionProvider.test.ts`** (+3 tests):
Adversarial provider-level boundary tests:
- Absent `source` key in payload (no source field at all) → not counted
- Mixed mcp+system for same category: system dismissed + mcp resolved → dismissed_count=0, resolved_count=1
- Orphan transition event (hint_id not in optimization_hints INNER JOIN fails) → not counted

**`packages/skillsmith-runtime/src/__tests__/dispositionIntegration.test.ts`** (NEW — 4 tests):
End-to-end Cairn→runtime→forge integration tests via `executePrescriberRun`:
- Dismissed category absent from prescriber output (full chain)
- Resolved category present with boosted confidence (full chain)
- Source=system gating verified end-to-end (provider filters it, convergence not suppressed)
- Both effects in one run: dismiss convergence + resolve cache-optimization

### Test Counts

| Package | Before (Graham) | After (Laura hardening) |
|---------|----------------|------------------------|
| cairn | 725 (+9 Graham) | 728 (+3 Laura) |
| forge | 651 (+7 Graham) | 665 (+14 Laura: 10 utils + 4 orchestrator) |
| skillsmith-runtime | 49 (unchanged) | 53 (+4 Laura integration) |

**Total new tests:** 21 (net: 17 unique; 10 utils + 4 orchestrator + 3 cairn + 4 integration)

### Learnings

**Integration test design for disposition seams:**
- `executePrescriberRun` always wires `SqliteHintDispositionProvider` — there's no "dispositionless baseline" path through it. To verify a category WOULD be generated, run the prescriber BEFORE seeding any disposition events, or assert on other categories being present as a proxy.
- The seed hint and disposition event must be seeded BEFORE calling `executePrescriberRun` that should see them. Order matters critically.
- `result.hints` is set before the insertion loop — it reflects the pre-insertion hint list (post-`applyDispositions`). Deduplication in the insertion loop does NOT affect `result.hints`.

**Orphan JOIN trap (cairn provider):**
The `SqliteHintDispositionProvider` SQL uses INNER JOIN on `optimization_hints`. If you emit a `hint_state_transition` event that references a `hint_id` that doesn't exist in `optimization_hints`, the JOIN fails and the event is silently excluded. This is correct behavior (defense-in-depth) but also means tests must seed the underlying hint row or the disposition event will be invisible to the provider.

**`resolveOptimizationHint` not exported from `@akubly/cairn`:**
To emit source='mcp' disposition events in tests that can't use `resolveOptimizationHint`, use `cairn.insertHintIfNew` + `cairn.logEvent` + `cairn.ensureSystemSession` directly. This also gives more control over the event payload (useful for adversarial testing of edge cases like source=system or absent source).

**Fixture helper added:**
`emitMcpDisposition(db, skillId, hintId, disposition, note?)` — in `dispositionIntegration.test.ts`. Mirrors exactly what `resolveOptimizationHint` does for the event structure. Reusable pattern for other tests seeding disposition events.

**Seam hardness:** The `HintDispositionProvider` typed seam (forge←@akubly/types→cairn) is clean to test. The orchestrator-level tests need no real DB — a `vi.fn().mockResolvedValue([...])` mock satisfies the interface. The integration tests need a real DB for the JOIN-based SQL query. Two tiers are appropriate and complementary.

### Decision drop

`.squad/decisions/inbox/laura-forge-m3-test-hardening.md`



Earlier entries (1410 lines) archived to history-archive.md on 2026-06-05.

---

