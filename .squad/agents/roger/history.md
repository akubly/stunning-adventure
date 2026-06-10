> Older entries archived to history-archive.md on 2026-06-09. This file holds recent context.

## Walkthrough C: Aperture Push Notifications + WAL Crash-Durability Fix

**Agents:** roger, valanice (UX), graham (Architect)

**Completed in this session:**

1. **Aperture Push-Notification Projector** — Built ApertureProjector + NotificationService seam + NotificationPolicy value object. Added LedgerSubscriber seam on ledger.ts/ledger-impl.ts per docs/crucible-tdd-strategy.md §4.3. Tests: aperture-push, aperture-projector, aperture-projector-purity, notification-policy (all passing).

2. **Issue #56: WAL Reopen Crash-Durability** — Removed manifest.lastCommitOffset replay gate, now unconditional replayFromSegments for durability on unexpected WAL reopen. Test suite: wal-crash-durability.

3. **Issue #59: CAS fsync Ordering** — Batched CAS syncAll in group-commit Phase 2.5 for ordered concurrent writes. Test suite: wal-cas-fsync.

4. **Issue #64: Aperture Icon Correctness** — Tier-aware icon fallback + 📋 decision marker. Closed #64.

5. **Review Cycle 1 fixes** — F1 subscriber isolation (try/catch, regression test), F2(b) metadata-not-persisted doc + filed #67, F3 cas-fs.ts ENOENT-only null, F4 REJECT+filed #68, F5 doc alignment, F6 folded into F1, nit isQuarantine helper extracted. 128/128 green.

**Outcome:** crucible-core 128/128 tests passing, build+lint clean. Follow-up issues filed: #67 (metadata WAL persistence), #68 (torn CAS blob). Decisions filed: roger-aperture-projector.md, roger-wal-crash-durability.md, roger-cas-fsync.md.

### Key learnings from review cycle

- **Subscriber isolation is not optional**: after a durable commit, any subscriber throw that escapes `append()` will be retried by the caller, producing a duplicate committed row. Must swallow+log.
- **`catch {}` in storage code is almost always wrong**: `cas.get()` catching all errors masked permission failures as CAS misses. Always check `err.code === 'ENOENT'` specifically.
- **Docblock numbering must match inline labels**: "Phase 2.5" in code vs "step 4.5" in docblock creates confusion on first read. Pick one scheme and stick to it.
- **Cross-session CAS torn-blob gap (F4)**: `existsSync` as durability check is insufficient across process boundaries. Proper fix is temp-file + atomic rename. Filed #68.


## 2026-05-30: CLI Review — childSid Collision Hybrid Design (Round 2)

**Verdict: APPROVE-WITH-CONDITIONS.** Verb/flag shape consistent with §13.1 taxonomy. `--disambiguator` flag redundant. Critical fixes: TTY detection, `--no-interactive` flag, exit codes (0, 1, 2, 130).

**Learnings:** TTY/exit-code contract essential for automation safety. Non-TTY exit code 2 + explicit flag requirement protects automation. Substrate-readiness declarations (§3.3.5 style) decouple implementation schedules without re-negotiation.
