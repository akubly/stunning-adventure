> Older entries archived to history-archive.md on 2026-06-09. This file holds recent context.

## Walkthrough C: Aperture + WAL Durability Test Suites (Recent Sessions)

**Role:** Tester (Contract-first patterns, integration testing, test architecture)

**Test Suites Added (Walkthrough C):**
- aperture-push (acceptance tests)
- aperture-projector (unit tests)
- aperture-projector-purity (projection purity)
- notification-policy (value object)
- wal-crash-durability (Issue #56: reopen crash-durability)
- wal-cas-fsync (Issue #59: CAS fsync ordering)

**Contract Audit Completed (M8 Slice A):**
- Re-validated Roger's cycle-2 drop (9 mandatory checks passed)
- Added DB-CL-6, DB-CL-7 edge cases
- SQLite semantic completeness verified
- NaN→NULL→NaN round-trip requirement documented
- 86 total contract tests passing

**Key Finding:** Wall-clock replay-determinism bug (childSid collision time-aware default MUST use logical session time, not wall-clock). Replay determinism via Decision row recording makes hybrid choice testable.

**Learnings:** Cross-persona review (Architect + Tester) surfaces correctness violations unit tests miss. Hermetic replay requires logical-time (offset), not wall-clock. Time-aware default is a replay-determinism landmine without logical-time basis.
