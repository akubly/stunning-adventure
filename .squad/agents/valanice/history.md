Trade-off: the SQL view recomputes on every read. For Aperture's volumes this is fine; on hot paths a materialized view with `onCommit` invalidation would be the upgrade — but it stays a projection, never a write-of-record.

### What I gave to Sonny

Both §9 and §13 flag Sonny advisory consult per Appendix C consultant rows. Specifically asking him to validate (a) §9.8 investigation tool shapes against DAP-style debugger primitives, (b) §13.1 verb vocabulary against gdb-conventional verb naming, and (c) the gdb→Aaron translation table I still owe him (open since Round 7 triage 2026-05-25).

### Outputs

- `docs/crucible-technical-design/09-aperture.md` — FINAL.
- `docs/crucible-technical-design/13-crucible-cli-shell.md` — FINAL.
- `docs/crucible-technical-design/05-router-design.md` — surgical §5.3 patch (finding 6b).
- `.squad/decisions/inbox/valanice-ctd-phase2-valanice.md` — decision drop.


📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.
**Role:** [Specialist role — see archive for details]
**Status:** Cycle 2 review included in re-review panel.
**Last update:** 2026-05-29

**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
---

## Archive Summary

Earlier entries (831 lines) archived to history-archive.md on 2026-06-05.

---

## Learnings — Crucible S3 Phase 0.5 Skeleton CLI (2026-06-16)

**Role:** T5 CLI shell lane — `status` and `replay` verbs  
**Branch:** `squad/crucible-s3-skeleton`  
**Outcome:** SK-4 + SK-5 GREEN — 6 new tests pass; all 15 CLI tests pass.

### CLI Verb Structure

- `packages/crucible-cli/src/commands/status.ts` — `runStatusCommand(session)` calls `session.status()` and renders via `renderStatus()`. Returns raw `SkeletonStatus` for programmatic callers (tests assert on values, not stdout).
- `packages/crucible-cli/src/commands/replay.ts` — `runReplayCommand(session)` calls `session.replay()` and renders via `renderReplay()`. Same programmatic-shell pattern.
- `packages/crucible-cli/src/index.ts` — added skeleton re-exports + argv dispatcher guarded by `import.meta.url` check (safe to import from tests). Hand-rolled `switch` on `process.argv[2]`; no new dependencies.
- `packages/crucible-cli/src/__tests__/acceptance/skeleton-cli.test.ts` — 6 acceptance tests: rowCount/offset assertions (SK-4), replay pass + null divergence (SK-5), plus two pure renderer unit tests that run without filesystem I/O.

### Output-Format Rationale

Status: labeled fixed-column fields (`Session ID`, `Row count`, `Last offset`) with a divider. Scans top-to-bottom for the tired engineer; Last offset is the "freshness number" — one glance tells you how much work happened.

Replay: verdict (`✓ REPLAY PASS` / `✗ REPLAY FAIL`) is the first line — hardcoded top-left, colour-independent glyph, pipe-safe. On fail, divergence offset + kind are promoted inside the same block so a scan never misses them. Duration is last (informational). Line-oriented per §13.2 (no spinners, no animations).

### Session-Reopen Gap (Phase 1 Blocker)

`createSkeletonSession()` always constructs a FRESH session. There is **no API to open an existing session by ID + rootDir** in Phase 0.5. This means `crucible status <sid>` and `crucible replay <sid>` as cross-process invocations are not yet possible. The acceptance tests work around this by running create → run → status/replay within a single process. Flagged for Roger/Graham: Phase 1 needs a `openSkeletonSession(sessionId, rootDir)` factory (or equivalent session-catalog lookup) to unlock the full CLI UX.

### Import Path Note (Flag for Graham/Roger)

`@akubly/crucible-core` has no `exports` field in `package.json`. The skeleton submodule is not exposed as a named subpath export (`@akubly/crucible-core/skeleton` does not resolve). Worked around by importing from the compiled path `@akubly/crucible-core/dist/skeleton/index.js`. This is functional but brittle. Phase 1 should add an `exports` map to `crucible-core/package.json`.


---

# SUMMARY (as of 2026-06-01)

File size: 81281 bytes. See history-archive.md for earlier entries.

---

📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): UX findings incorporated: "Fresh" → "New" naming (non-negotiable for parallel structure with "Resume"), relative time disclosure ("3 days ago") as primary recency signal for tired-engineer persona (US-4 accidental resume prevention), turn-count heuristic consideration (evaluated and documented in Resolved Questions section). Naming change + relative-time disclosure became design requirements. Skill: Cognitive boundaries (1-hour threshold = Baddeley working memory model).

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Valanice (§9 Aperture edits ×4), Gabriel (Applier/infra ×3), Roger (CLI verbs ×2), Laura (test strategy + ADR template ×2), Rosella (Generators/branching ×7 + 2 options docs), Graham (L3.5 Phase 0.5 stub). Options docs PA-B4 + childSid awaiting Aaron ruling. Orchestration logs + session log + decisions merged. — Scribe

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.
