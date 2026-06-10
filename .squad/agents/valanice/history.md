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

---

## Learnings (2026-06-09)

**Task:** Advisory UX review of Walkthrough C Aperture push-notification projector.

**Key observations:**

1. **Tier gating is correct** — pushing on `attention` + `urgent` only is sound attention hygiene. The two-tier gate gives the badge real signal value. The risk is in *what happens after* it fires, not in whether it fires.

2. **`unreadCount` is a one-way ratchet** — `this.events.length` increments on every qualifying commit with no dismiss/ack path. Within a session, a burst of events (e.g., 20 quarantine sweeps) produces 20 sequential `push()` calls, each with an incrementing count. No coalescing. No read/seen semantics. This is the #1 desensitization risk in the design.

3. **`getPriority()` is orphaned** — `NotificationPolicy.getPriority()` computes urgent=3/attention=2/notice=1/info=0 but the push payload only carries `{ unreadCount, icon }`. Priority is never surfaced to the renderer. This means an urgent event buried under 10 attention events is invisible in the badge.

4. **ℹ️ as fallback for attention-tier is cognitively dissonant** — the info icon signals "no action needed" but an attention-tier event, by definition, requires the human to look. This is a label vs. intent mismatch.

5. **✓ for decisions is ambiguous** — a check mark reads as "resolved/approved." Decision notifications could be rejections requiring follow-up. The icon doesn't communicate whether the decision needs a human response.

6. **Emoji-only signaling has accessibility exposure** — no text label, no ARIA equivalent, no fallback for non-emoji contexts or screen-reader users.

7. **`body_markdown` from the TDD doc was dropped** — the real `ApertureEvent` interface carries only `title`, not a human-readable body. The push payload carries even less (`unreadCount + icon` only). The renderer has minimal context to display actionable information.

**Mental model stored:** "Increment on commit" is correct for projection purity but wrong for human notification UX. These are two different concerns that need explicit decoupling — the projection store can be append-only; the badge count needs read/dismiss semantics layered on top.
