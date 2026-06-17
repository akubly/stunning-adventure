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
✓ squad.agent.md Scribe template updated (HISTORY APPEND-ONLY GUARD)  
✓ Decisions merged into decisions.md  
✓ Branch: squad/crucible-s2, commit 49a0371
📌 2026-06-13: **Crucible S2 persona-review-cycle COMPLETE** — 2-cycle Code Panel review completed on squad/crucible-s2. Cycle 1: Architect findings (design consistency, API contracts) reviewed and triaged by Aaron. Cycle 2: Design decisions re-verified correct across all fixes. F3 envelope versioning deferred to ship-gate (GitHub issue #76). S2 architecture APPROVED and ready to merge. — Scribe (session 2026-06-14T06:51:39Z)

## Learnings — 2026-06-16: Crucible S3 Next-Slice Scoping

### Current Implementation State (192 tests green, crucible-core)

| CTD Lane | Status | Key Files |
|----------|--------|-----------|
| §3 WAL Substrate (L1) | ✅ DONE | wal-backend-fs.ts, wal-backend-in-memory.ts, wal/cas-fs.ts, wal/cbor.ts, wal/codec.ts, wal/hash-chain.ts, wal/seal-and-split.ts, wal/materialize.ts, wal/types.ts, wal/flags.ts, wal/hash.ts |
| §4 Hook Bus | ✅ DONE | hook-bus.ts, hook-bus-impl.ts (pre-commit verdicts COMMIT/OBSERVE/PAUSE/VETO, predicate dispatch) |
| §5 Router (L4) | ❌ NOT STARTED | No router/scheduler code exists in src/ |
| §7 Generators (L3) | ❌ NOT STARTED | No generator/proposal code |
| §8 Applier / DecisionGate | ❌ NOT STARTED | No applier code |
| §9 Aperture | 🟡 PARTIAL | projectors/aperture-projector.ts, notification-policy.ts (L2 projection done; no StructuralApprovalQueue, no Router integration) |
| §10 Session / Branching | 🟡 PARTIAL | session.ts, session-manager.ts, fork-lineage.ts, sqlite-db.ts, in-memory-db.ts, schema.ts (createSession/fork done; no bootstrap protocol, no COW snapshots) |
| §11 Hermetic Replay | ❌ NOT STARTED | WAL has replayFromSegments internally but no hermetic replay engine, no A2 conformance |
| §12 SDK Integration | ❌ NOT STARTED | No SdkProvider, no BootstrapPayload runtime |
| §13 CLI Shell | ❌ NOT STARTED | crucible-cli/src/index.ts is a bare re-export; no status/replay verbs |
| Phase 0.5 Walking Skeleton | ❌ NOT STARTED | No end-to-end vertical: L0→L1→replay chain, FifoScheduler, crucible status/replay |

### Key Observation
CTD design docs (§1–§19) are ALL written. Implementation has WAL+HookBus+Aperture(L2)+Session(basic). The walking skeleton (Phase 0.5) is the gate for Phase 1 fan-out. S1/S2 hardened the substrate — the skeleton can now proceed safely.

### Slice Options Identified (S3)
- Option A: Walking Skeleton (Phase 0.5) — vertical through L0→L1→replay
- Option B: Router/FifoScheduler stub — L3.5 tier boundary
- Option C: SDK Provider (§12) + bootstrap — L0 boundary
- Option D: Aperture features (#65/#66) — unreadCount ack, getPriority

Recommended: Option A (Walking Skeleton) — it's the defined gate. See decisions/inbox/graham-crucible-next-slice.md.

## 2026-06-16: S3 Walking Skeleton — Spawn Manifest Produced

Produced the S3 spawn manifest (6 tasks, 5 agents). Key architectural decisions:
- Single shared branch squad/crucible-s3-skeleton (no worktrees, shared checkout)
- File-collision risk mitigated: tasks touch non-overlapping paths
- Laura starts TDD in parallel (test files don't collide with impl files)
- Graham owns interfaces/types task (T1) that gates all implementation tasks
- Two parallel tracks after T1: Roger (T2 bootstrap+WAL) and Gabriel (T3 scheduler) + Alexander (T4 SDK provider)
- Valanice (T5 CLI verbs) needs T2 to read from WAL
- Laura (T6 acceptance) needs T2+T3+T4+T5 but writes RED tests from spec immediately
