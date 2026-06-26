# SUMMARY (as of 2026-06-06)

File size: 34712 bytes. See history-archive.md for earlier entries.

---

# Graham — History

📌 **Role:** Lead / Architect (Overall vision, cross-system integration, tiebreak arbitration)  
📌 **Last update:** 2026-06-06

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
- `.squad/decisions.md` — policy decision recorded in `.squad/decisions.md` (S2c Append-Only History Rule section).


## 2026-06-14T06:10:36Z — Crucible S2 Shipped

✓ Issue #62: Verdict table TypeScript-name column in CTD §4.1  
✓ Issue #71: Append-Only History Rule governance (dropped size management)

---

## 2026-06-23T06:34:41Z — Forge Slice 2 Persona-Review Disposition

**Panel verdict:** Persona panel (Correctness, Skeptic, Craft, Compliance, Architect)
reviewed Slice 2A (DBOM) and Slice 2D (busy_timeout). Two critical findings arose:

1. **dbomRootHash null ambiguity:** Graham's original DBOM contract used `null` for both
   "no certification events" and "generation failed." This conflation created risk of
   silent data loss on error.

2. **Fail-fast vs. best-effort:** Graham's initial recommendation was fail-fast semantics
   (throw on DBOM generation error, fail the session runner). Persona panel recommended
   overriding this in favor of best-effort (try/catch, surface error in result type,
   never throw).

**Disposition (Aaron approved):** Sentinel + best-effort design. Empty-session returns
deterministic `e3b0c44…` (SHA-256 of empty string); generation/persistence errors set
`dbomPersistError` field and log warning, never throw. Mirrors existing disconnect
best-effort pattern. This keeps DBOM failures from breaking slice-1's exit-code contract
and makes the success/failure distinction explicit.

**Outcome:** PR #84 shipped with best-effort semantics. Graham's fail-fast call was
overridden by the panel's architectural judgment and Aaron's approval.

**Learning:** Best-effort patterns require discipline to propagate consistently.
The DBOM block's try/catch mirrors the disconnect try/catch pattern, establishing
a consistency precedent for session-runner error handling.

---
✓ squad.agent.md Scribe template updated (HISTORY APPEND-ONLY GUARD)  
✓ Decisions merged into decisions.md  
✓ Branch: squad/crucible-s2, commit 49a0371
📌 2026-06-13: **Crucible S2 persona-review-cycle COMPLETE** — 2-cycle Code Panel review completed on squad/crucible-s2. Cycle 1: Architect findings (design consistency, API contracts) reviewed and triaged by Aaron. Cycle 2: Design decisions re-verified correct across all fixes. F3 envelope versioning deferred to ship-gate (GitHub issue #76). S2 architecture APPROVED and ready to merge. — Scribe (session 2026-06-14T06:51:39Z)

## Learnings — 2026-06-16: Cairn/Forge Near-Term Roadmap Read

Cairn is currently the durable local nervous system: SQLite event/profile/hint/DBOM storage, Curator, MCP tools, skill parsing/linting/testing, and GitHub artifact discovery are shipped in `@akubly/cairn` 0.3.0. The package CLI remains a placeholder, while the MCP server is the real interface.

Forge is the deterministic runtime/optimizer package: bridge, hooks, decision gates, DBOM/export, telemetry, prescribers, applier, and feedback-loop plumbing are implemented in `@akubly/forge` 0.1.0. The explicit dogfood gap is that no production session runner yet drives live Copilot sessions through `ForgeClient`/`ForgeSession`, so profiles require seeding until that integration lands.

Near-term roadmap split: Cairn's active external-facing path is the GitHub Automations epic (#8) with brainstorm/design still open (#5/#6); Forge's highest-leverage path is dogfood hardening and runner integration before Phase 5 cloud PGO/GP work.

---

## Learnings — 2026-06-22: Forge Slice 2 Scoping

**Key files for Forge runner integration:**
- Composition root: `packages/skillsmith-runtime/src/forgeSessionRunner.ts`
- CLI: `packages/runtime-cli/src/forge-run-session.ts`
- DBOM generator (pure fn): `packages/forge/src/dbom/index.ts` — `generateDBOM()`
- DBOM persistence: `packages/cairn/src/db/dbomArtifacts.ts` — `upsertDBOM()`/`loadDBOMArtifact()`
- DB open: `packages/cairn/src/db/` (getDb)
- Session start hook: `packages/skillsmith-runtime/src/hooks/sessionStart.ts`

**Slice decision:** Recommended A (DBOM in runner) + D (SQLITE_BUSY policy) as slice 2. Trade-off: chose contained provenance completion over always-on platform wiring (higher risk, needs own ADR) or batch runner (quality-of-life, not unblocking). Always-on (B) is the clear slice 3 but requires permission-model design and the busy_timeout from D.

**No open issues track Forge runner follow-ups** — the backlog lives in decisions.md deferred notes and the dogfooding guide Known Limitations section.

---

## Learnings — 2026-06-23: Forge Slice 2 Review

**Review Verdict:** APPROVE

**Key Findings:**
1. **DBOM Wiring (2A):** Correctly implemented in `forgeSessionRunner.ts`. `generateDBOM` and `upsertDBOM` execute with the DB open and accurately handle the null-DBOM path based on `totalDecisions > 0`. Persistence errors bubble up appropriately, which is the correct fail-fast behavior.
2. **busy_timeout (2D):** The SQLITE_BUSY policy is correctly applied in the `getDb()` singleton (`PRAGMA busy_timeout = 5000`). The WAL pragma remains intact (no regressions). The concurrent-worker tests in `busyTimeout.test.ts` explicitly validate the lock-retry mechanism using a real file-backed DB and proper thread isolation.
3. **Scope:** Clean execution. Changes strictly bounded to Slice 2A and 2D. No cloud scope drift or extraneous refactoring.
4. **Pre-existing Failures:** Confirmed Roger's report regarding the 3 `curator.test.ts` failures. The current diff does not touch curator logic, confirming these are baseline regressions. A tracking issue should be filed for the failing `curator` tests.
5. **Acceptance Criteria:** Met. DBOM is generated and persisted for certification-tier events, the `dbomRootHash` surfaces correctly, and the 5-second SQLITE_BUSY retry prevents immediate lock contention failures. All targeted test suites are green.

- 2026-06-26T12:31:20-07:00 📌 Correction/supersession: the fail-fast recommendation in finding 1 above (line 168: "Persistence errors bubble up appropriately, which is the correct fail-fast behavior") was OVERRIDDEN during persona review — shipped behavior is best-effort (DBOM errors caught + surfaced via RunForgeInstrumentedSessionResult.dbomPersistError; the run still succeeds). See decisions.md slice-2 entry.