# SUMMARY (as of 2026-06-06)

File size: 34712 bytes. See history-archive.md for earlier entries.

---

# Graham — History

📌 **Role:** Lead / Architect (Overall vision, cross-system integration, tiebreak arbitration)  
📌 **Last update:** 2026-06-06

## 2026-06-07 — M8 Slice D Complete

**Slice:** M8 Slice D — SQLite Production Deps Factory (Roger, Laura, Graham)  
**Status:** ✅ COMPLETE (147/147 tests, factory-on-subpath, Graham ACCEPT-WITH-FOLLOWUPS, SD-F1 ledger amendment applied)

**Summary:** Roger shipped factory functions (createSqliteRecallDeps, createSqliteFeedbackDeps) on @akubly/eureka/sqlite, preserving Slice A isolation. Laura added +2 smoke tests (SD-1, SD-2). Graham's architectural review: boundary integrity verified, composition root clean, spec tension resolved correctly. Scribe merged decisions inbox + applied SD-F1 ledger amendment.

**Key artifacts:**
- packages/eureka/src/sqlite/deps.ts — factory implementations
- packages/eureka/src/activities/__tests__/recall-sqlite-smoke.test.ts — SD-1, SD-2 smoke tests
- .squad/decisions.md — M8 Slice D as-built section (Graham SD-F1)

📌 **Slice D review-cycle complete + PR #54 opened** (2026-06-07T06:03Z): 5-persona Code Panel review → 0 blocking, 2 important + 3 minor fixed, 2 sound rejects + 1 false-positive cleared; 148/148 tests passing; Copilot review requested. — Scribe

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.

## Learnings — 2026-06-06: PR #53 Persona-Review Fixes (worktree fallback warnings)

### Isolation vs. consistency: the npm-install fallback is MORE isolated, not less

When the junction-link fails and we fall back to `npm install` in the worktree, the worktree gets its **own** `node_modules`. That is MORE isolated than a junction (no shared state at all). What degrades is **consistency** (versions may diverge from the main checkout) and **efficiency** (slower, more disk). The original warning said "Dependency isolation is degraded" — that was backwards. Corrected to: *"Dependencies may differ from the main checkout (slower, not shared)."*

**Rule:** isolation ≠ consistency. When writing warnings about fallback dependency strategies, distinguish the two: isolation is about whether the worktree shares state; consistency is about whether versions match.

### Dual-description completeness gap

The squad.agent.md had two descriptions of the same junction-link fallback: once in the "Worktree Lifecycle Management → Dependency management" reference section (line 676 region) and once in the Pre-Spawn step 2d error-handling block. The Pre-Spawn block had the user-visible warning; the reference section did not. An agent following only the reference section would degrade silently.

**Rule:** whenever an instruction appears in both a reference/overview section and a procedural step, both must include all safety-critical outputs (warnings, logs). Review cross-references before shipping.



## Learnings — 2026-06-06: Doc Hygiene Re-scope (PR #52, issue #46)

### Pointer vs. Policy vs. Writer-Target distinction

Five categories of `.squad/decisions/inbox/` references require different treatment in committed prose:

1. **Broken followable POINTER** (FIX): Prose that cites a specific `inbox/{slug}.md` filename as a stable reference — e.g., `**Artifact:** Merged from .squad/decisions/inbox/graham-ctd-phase4-synthesis.md`, `**Deliverable:** .squad/decisions/inbox/crispin-20-seam-audit-vs-55.md`, `From .squad/decisions/inbox/X.md`, file-inventory bullets, R8 verdict file lists. Replace with slug-preserving plain text (e.g., "decision drop: graham-ctd-phase4-synthesis (local-only)") to retain searchability. Fix any resulting malformed prose (dangling "— this file" → "— this decision entry").
2. **Gitignore-policy documentation** (KEEP): Bulleted "Explicitly prohibited (gitignored runtime state)" lists, rationale sentences ("`.squad/decisions/inbox/` is gitignored"), and policy-description lines ("Cited gitignored `.squad/decisions/inbox/` paths"). These document the policy, not broken pointers.
3. **Generic directory narration** (KEEP): Location descriptions like "directive files in `.squad/decisions/inbox/`" — accurate operational narration, not a broken pointer.
4. **Inside Before:/After: code blocks** (KEEP): Examples documenting historical changes are not live pointers.
5. **Forward writer-target paths** (NEVER TOUCH): Charters, templates, skills.

### Append-only history files are immutable

Agent history.md and history-archive.md are append-only. No hygiene sweep — not even doc cleanup — may retroactively edit committed history entries. This mirrors the over-reach that caused PR #44 to be reverted.

### "Zero hits" acceptance criteria can be relaxed

Issue #46 originally required zero `decisions/inbox/` hits. Aaron approved relaxing this: the criterion is "zero broken followable file-path pointers," not literally zero string occurrences. Policy-list bullets legitimately retain the bare directory path.

### Merge decisions-archive.md from a current main base

When a branch is behind main and decisions-archive.md diverged significantly, reset to `origin/main` before applying pointer fixes — do not rely on auto-merge, which can produce duplicated sections.

---

## 2026-06-11: Crucible S1 WAL Correctness — S2 Impact (cross-agent note)

Impact for S2: Roger's S1 fixes (#57 verdict encoding, #60 canonical CBOR hashing, #68 CAS atomic write) harden the WAL substrate. Phase 0.5 walking skeleton can now proceed with confidence in blob atomicity and CBOR determinism.


**2026-06-12:** Crucible S1 WAL Correctness — 2-cycle persona review COMPLETE, ship-ready (Scribe).

---

## Learnings — 2026-06-13: Crucible S2 Doc/Governance Lane (Issues #62, #71)

### §4.1 verdict-casing mapping (Issue #62)

The §4.1 Hook Bus verdict tables use lowercase doc-vocabulary (continue/observe/pause/veto); the
TypeScript seam uses UPPERCASE `HookVerdict` members (COMMIT/OBSERVE/PAUSE/VETO). The mapping is:

| Doc | TypeScript `HookVerdict` |
|-----|--------------------------|
| `continue` | `COMMIT`         |
| `observe`  | `OBSERVE`        |
| `pause`    | `PAUSE`          |
| `veto`     | `VETO`           |

Source of truth: `packages/crucible-core/src/ledger/hook-bus.ts:38`.
`VETO` is structurally excluded from the WAL via `Exclude<HookVerdict,'VETO'>` on `commitRow`
(ledger.ts:230, wal-backend-fs.ts:144). Added a "TypeScript name" column to both verdict tables
in `docs/crucible-technical-design/04-hook-bus.md`.

### Append-Only History Rule — chosen size-management policy (Issue #71)

**Policy: no size management.** History files grow unbounded. Rationale: the only append-only-
compliant "archiving" mechanism (copy to history-archive.md, retain originals in history.md)
does not reduce history.md size — it duplicates content. Any mechanism that actually shrinks
history.md requires deleting committed entries, which is permanently prohibited.

**Files updated:**
- `.github/agents/squad.agent.md` — step 6 changed from "HISTORY SUMMARIZATION [HARD GATE]"
  (destructive rewrite) to "HISTORY APPEND-ONLY GUARD" (prohibition). ⚠️ Coordinator must
  restart session for updated Scribe template to take effect.
- `.squad/decisions.md` — Append-Only History Rule sections (both occurrences) extended with S2c
  enforcement record.
- `.squad/decisions/inbox/graham-crucible-s2.md` — policy decision filed.


## 2026-06-14T06:10:36Z — Crucible S2 Shipped

✓ Issue #62: Verdict table TypeScript-name column in CTD §4.1  
✓ Issue #71: Append-Only History Rule governance (dropped size management)  
✓ squad.agent.md Scribe template updated (HISTORY APPEND-ONLY GUARD)  
✓ Decisions merged into decisions.md  
✓ Branch: squad/crucible-s2, commit 49a0371