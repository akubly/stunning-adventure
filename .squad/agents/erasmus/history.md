  for deterministic-workflow rules that Crucible's L3 generators may
  eventually need to adopt.
- **Erlang/OTP `gen_server` callbacks** as evidence that a 5-primitive
  taxonomy can stay 5 for 30 years if you start it disciplined. Good
  precedent for §6's restraint.

**Most consequential single finding:** The L3 generator contract is the
abstraction being asked to do the most work, and prior art (Eclipse
plugins, vscode `contributes.*`, every long-lived extension API)
consistently shows that the contract that is easy in v1 is the contract
you can't change in v3. Recommended an explicit Scheduler tier (US-E-13)
between L3 and L4 to keep the generator contract small.

**Prior-art system Aaron should personally study urgently:** **Pernosco.**
It is the single best worked example of the UX layer over a replay
substrate that Aperture is implicitly trying to be. Two hours of using it
will reshape Aperture's verb surface more than any spec round.

**Output:** `D:\git\harness\.squad\decisions\inbox\erasmus-ctd-p2-architectural-review.md`

---

## Archive Summary

Earlier entries (244 lines) archived to history-archive.md on 2026-06-05.

---

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.
