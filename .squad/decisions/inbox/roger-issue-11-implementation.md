# WI-A Implementation Log — Issue #11: Worktree-aware sessions

**Author:** Roger (Platform Dev)  
**Branch:** `squad/11-worktree-aware-sessions`  
**Worktree:** `D:\git\stunning-adventure-11`  
**Status:** Cloud review cycle 5 applied — ready for push

---

## Cloud Review Cycle 1 Fixes (commits 8537f48, 13080af)

### F1 — `get_session` error message clarity (commit 8537f48)

Old message: `'Provide either session_id or repo_key (with optional workdir).'`
was misleading because `workdir` is required (not optional) when using `repo_key`.

Changed to: `'Provide either session_id, or both repo_key and workdir.'`

`workdir` inputSchema description was already correct from cycle 2:
`'Required when using repo_key. Optional when using session_id.'`

Updated `worktreeMcp.test.ts` assertion to match the new message.

### F2 — Rejected (no change)

Reviewer suggested collapsing the `repo_key`-without-`workdir` branch into the
no-input branch. Decision: keep the two branches separate — they represent
distinct caller mistakes (no input vs. partial input) and deserve distinct,
actionable error messages.

### F3 — Atomic `startSession` + UNIQUE partial index (commit 13080af)

**F3a — Immediate transaction in `archivist.startSession()`:**

The find-or-create sequence (`getActiveSession → claimLegacyActiveSession →
createSession`) is now wrapped in `db.transaction(fn).immediate()`. Using
`IMMEDIATE` acquires the write lock at transaction start, preventing two
concurrent callers from both observing "no active session" and both INSERTing
a new row.

Note: `fn.immediate()` calls the function and returns its result directly.
A draft with `fn.immediate()()` would have tried to call the return value
as a function — corrected before committing.

**F3b — Migration 016: dedup + UNIQUE partial index:**

New migration `016-active-session-unique.ts`:

1. **Dedup pass**: For each `(repo_key, workdir)` group with >1 active user
   session, keep the most-recently started row, complete the rest. Runs
   before index creation to avoid constraint violation on pre-existing data.

2. **UNIQUE partial index**:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir
     ON sessions (repo_key, workdir)
     WHERE status = 'active' AND session_kind = 'user';
   ```
   Partial index covers only active user sessions; completed/system sessions
   are unaffected.

Schema version bumped to 16. Version assertions in `db.test.ts`,
`migration012.test.ts`, `prescriptions.test.ts`, and `discovery.test.ts`
updated 15 → 16. `migration015.test.ts` assertions changed to check
`WHERE version = 15` (presence) rather than `MAX(version)` so they remain
stable as more migrations are added.

---

## Cloud Review Cycle 2 Fix (commit cd47409)

### G1 — `normalizeWorkdir` applies transforms to untrimmed input

`normalizeWorkdir` checked `input.trim()` for emptiness but then passed the
original (untrimmed) `input` to all subsequent transforms. A path like `' /'`
would slip past the empty guard and produce `' '` (a whitespace-only string)
instead of `'/'`.

Fix: assign `const trimmed = input.trim()` first, return `undefined` if it is
empty, then base all path transforms on `trimmed`.

Regression tests added:
- `normalizeWorkdir(' /')` → `'/'`
- `normalizeWorkdir('  D:/proj  ')` → `'D:/proj'`
- `normalizeWorkdir('\t')` → `undefined`

---

## Cloud Review Cycle 3 Fixes (commit e4002c1)

### H1 — Migration 016 UNIQUE index doesn't cover NULL-workdir case

SQLite UNIQUE indexes treat each NULL as distinct — a single index on
`(repo_key, workdir)` allows multiple rows with `workdir = NULL` to coexist
for the same `repo_key`. The original migration 016 index was therefore
ineffective at preventing duplicate active NULL-workdir sessions.

Fix: Replace the single index with two separate partial indexes:

```sql
-- Non-NULL workdir: unique per (repo_key, workdir) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_nonnull
  ON sessions (repo_key, workdir)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NOT NULL;

-- NULL workdir: at most one legacy active session per repo_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_null
  ON sessions (repo_key)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NULL;
```

The dedup pass (`GROUP BY repo_key, workdir`) was already correct — SQLite
groups NULLs together in `GROUP BY`, so no change was needed there.

Test changes:
- Removed two `claimLegacyActiveSession` orphan-cleanup tests that relied
  on inserting duplicate NULL-workdir sessions (now DB-prevented; the scenario
  they tested is handled at migration time by the dedup pass)
- Added "UNIQUE index rejects duplicate active NULL-workdir sessions" test
- Added Area 10b: migration 016 dedup test using a synthetic pre-016 DB to
  verify the NULL-workdir dedup pass correctly keeps the most-recent row

### H2 — `@internal` helpers exported from `index.ts`

`claimLegacyActiveSession` was exported from `packages/cairn/src/index.ts`
(line 52) despite being tagged `@internal`. It is an implementation detail of
the session start hook and must not be part of the public package API.

Fix: Removed `claimLegacyActiveSession` from the `sessions.js` export block
in `index.ts`.

Audit of other `@internal` symbols: `normalizeWorkdir` and
`getSkillToolWorkdir` (both in `utils/workdir.ts`) were not exported from
`index.ts` — no change needed.

Tests use deep imports (`from '../db/sessions.js'`) throughout — no test
changes required for H2.

---

## Summary

Makes Cairn's session resolution workdir-aware so concurrent worktrees on the
same repo don't collide on a single active session.

Core mechanism: `(repo_key, workdir)` session identity pair stored in a new
`workdir TEXT` column (migration 015). NULL workdir = legacy/pre-worktree
sessions. `getActiveSession(db, repoKey, workdir?)` uses `AND workdir IS ?`
(NULL-IS semantics) so NULL is a first-class identity value.

---

## Cycle 3 Skeptic Fixes (commit 19deef2)

### Item 1a — `getSkillToolWorkdir()` helper

`normalizeWorkdir(process.env.CAIRN_WORKDIR)` was inlined at all three
skill-tool call sites in `server.ts`. Centralised into `getSkillToolWorkdir()`
in `utils/workdir.ts` — env-var name and normalisation live in one place.

### Item 1b — Multi-session ambiguity warning

`getUserSessionForMcpFallback` gained an optional `source: 'env-var' | 'explicit'`
parameter. When `source === 'env-var'` and `workdir` is absent but the repo has
multiple active sessions, a `process.stderr.write` warning is emitted. All
three skill-tool call sites pass `'env-var'`.

### Item 2 — Safe orphan cleanup with 5-minute grace window

The old Step 3 in `claimLegacyActiveSession` used a single bulk `UPDATE` to
complete all other NULL-workdir orphans. Replaced with a per-session loop:

1. Fetch orphan candidates (SELECT with id != winner).
2. For each: `getLastEventTime` (falls back to `started_at`).
3. If idle < 5 min → skip + `process.stderr.write` warning.
4. If idle ≥ 5 min → `UPDATE status = 'completed'`.

SQLite timestamps (`YYYY-MM-DD HH:MM:SS` UTC) are converted to ISO-8601 with
`'Z'` suffix before `new Date()` parsing to avoid host-timezone errors.

Test updated: orphan timestamp changed from `-2 seconds` to `-10 minutes`.
New test added: orphan within grace window is preserved.

---

## Key Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| `getActiveSession` no-arg → NULL-only | `AND workdir IS NULL` | Matches only sessions without a workdir; not "most recent regardless" |
| Orphan grace window | 5 minutes | Conservative enough to protect live concurrent archivist startups |
| UTC parsing of SQLite timestamps | `.replace(' ', 'T') + 'Z'` | SQLite `datetime()` is always UTC; JS `new Date()` needs explicit Z |
| Skill-tool env-var source tag | `'env-var'` literal | Lets sessionFallback distinguish orchestrator-injected vs caller-supplied workdirs |

| `fn.immediate()` call pattern | Call without extra `()` | `db.transaction(fn).immediate()` calls fn and returns its result; `().()` would try to call the return value |

---

## Test Coverage

- 1405/1405 tests green (60 test files)
- New Area 10 tests: race regression (two startSession calls → one session),
  UNIQUE constraint enforcement, completed-session allows new active session

---

## Cloud Review Cycle 5 Fixes (commit 469b741)

### J1 — Remove unused `randomUUID` import

`worktreeSessions.test.ts` had `import { randomUUID } from 'node:crypto'` left
over from orphan-cleanup tests removed in cycle-3 H1. Dropped the import;
ESLint `no-unused-vars` now clean.

### J2 — Tighten `claimLegacyActiveSession` CAS UPDATE predicate

The outer `UPDATE` in the CAS step only guarded `AND workdir IS NULL`, leaving
a theoretical race where a session that changed status or kind between the
SELECT and the UPDATE would still have its workdir overwritten.

Added `AND status = 'active' AND session_kind = 'user'` to the outer UPDATE so
the CAS is self-contained: the guard predicates match exactly the conditions
used to select the candidate.

Regression test added in Area 7: creates a NULL-workdir session, completes it
between selection and claim, asserts claim returns `undefined` and the row's
`status` remains `'completed'` with `workdir` still NULL.

**Status:** Cloud review cycle 5 applied — ready for push


When `workdir !== undefined` is passed but `normalizeWorkdir(workdir)` returns
`undefined` (e.g. `'   '` or `'\t'`), the old code silently fell through to
`listActiveSessionsForRepo`, returning the all-sessions list — wrong shape
and wrong semantics.

Fix: after normalization, if `nwd === undefined` return `isError` with message:
`'Invalid workdir: empty or whitespace-only string. Omit workdir to list all sessions, or provide a non-empty path.'`

Added Area 5f regression test in `worktreeMcp.test.ts` asserting the guard
and message text are present in the `get_status` handler body.

### I2 — Over-indented error payload in `get_session`

In the `!repo_key` early-return block, the `error:` line inside
`JSON.stringify({ error: '...' })` had extra indentation vs sibling blocks.
Cosmetic fix only.

### I3 — `getActiveSession` JSDoc missing user-sessions-only note

Added `@remarks` tag to the JSDoc: "Returns ONLY user sessions
(`session_kind = 'user'`). System sessions are excluded. For system-session
lookup, use a dedicated helper."
