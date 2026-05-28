# WI-A Implementation Summary — Issue #11

**Author:** Roger  
**Date:** 2026-05-27  
**Branch:** `squad/11-worktree-aware-sessions`  
**Status:** Complete — build green, 647/647 tests passing

## What Shipped

### Migration

**Number:** 015 (as locked by Graham — issue body is stale at "005")  
**File:** `packages/cairn/src/db/migrations/015-workdir-sessions.ts`  
**Changes:**
- Adds `workdir TEXT` column to `sessions` table (NULL-tolerant, no DEFAULT needed)  
- Creates partial index `idx_sessions_repo_workdir ON sessions (repo_key, workdir) WHERE status = 'active'` to support `getActiveSession` and `listActiveSessionsForRepo` efficiently
- Wired into `packages/cairn/src/db/schema.ts` alongside migration014

**Schema version:** 14 → 15

### DB API (`packages/cairn/src/db/sessions.ts`)

```typescript
createSession(db, repoKey, branch?, workdir?)  // workdir 4th optional arg
getActiveSession(db, repoKey, workdir?)         // updated: when workdir provided, adds `AND workdir IS ?`
listActiveSessionsForRepo(db, repoKey)          // NEW: all active user sessions for repo
```

**`getActiveSession` semantics (final — Aaron-confirmed Q1 locked decision):**
- No workdir arg → `AND workdir IS NULL` → only NULL-workdir rows (backcompat; old callers cannot pick up worktree sessions)
- Workdir string arg → `AND workdir IS workdir` → exact worktree match  

> **Correction applied 2026-05-27:** The initial WI-A commit used "no filter" for the no-arg path (per Laura's reconciled test). Aaron confirmed the correct semantic per the locked Q1 decision is `AND workdir IS NULL`. Fixed in commit `ea9ab58` — `getActiveSession` now delegates to `getActiveSessionByWorkdir(db, repoKey, null)` when workdir is `undefined`. `worktreeSessions.test.ts` updated accordingly (18 tests all green).

Internal helper `getActiveSessionByWorkdir(db, repoKey, workdir: string | null)` added for explicit IS-NULL matching.

`listActiveSessionsForRepo` returns only `session_kind = 'user'` sessions ordered by `started_at DESC`.

### `getWorkdir()` (`packages/cairn/src/hooks/gitContext.ts`)

New export — `git rev-parse --show-toplevel` via execSync, same stdio/timeout pattern as `getRepoKey()`. Returns `undefined` on failure (non-git dirs, bare repos, git not on PATH).

### Workdir Threading

- **`archivist.ts`**: `startSession(remote, branch?, workdir?)` + `catchUpPreviousSession(repoKey, workdir?)` + `recordToolUse(sessionId, tool, args?, result?, workdir?)`
- `session_start` event payload: includes `workdir` field (null when unknown)
- `session_resume` event payload: includes `workdir` field
- `tool_use` event payload: includes `workdir` field
- **`postToolUse.ts`**: resolves workdir via `getWorkdir(hookData.cwd)`, threads through
- **`sessionStart.ts`**: `runSessionStart(repoKey, config?, afterCurate?, workdir?)` — workdir is 4th optional param so existing callers pass unchanged

### Types

`Session.workdir?: string` added to `packages/cairn/src/types/index.ts`  
`SessionSummary.workdir?: string` added to `packages/cairn/src/agents/sessionState.ts`  
`getSessionSummary` queries `workdir` from sessions table

### MCP (`packages/cairn/src/mcp/server.ts`)

**`get_status` (BREAKING — Aaron-approved):**
- Old: `{ session: Session | null, curator: ... }`
- New: `{ sessions: Session[], curator: ... }` — flat array always
- New input: `workdir?: string` added alongside `repo_key`
- With workdir: filters to single worktree session (still in array)
- Without workdir: `listActiveSessionsForRepo` — all active user sessions
- `readOnlyHint: true` preserved

**`get_session`:**
- Old: `{ session_id: string }` (required)
- New: `{ session_id?: string, repo_key?: string, workdir?: string }`
- Either `session_id` OR `repo_key` must be provided; error if neither
- Workdir-based lookup via `getActiveSession(db, repo_key, workdir)`
- `readOnlyHint: true` preserved

**stdio rule compliance:** No `console.log/info/debug` in any code reachable from `get_status` or `get_session` handlers.

### Test Updates (existing tests broken by v15)

Updated schema version assertions from 14 → 15 in:
- `src/__tests__/db.test.ts` (3 assertions)
- `src/__tests__/discovery.test.ts` (1 assertion)
- `src/__tests__/migration012.test.ts` (2 assertions)
- `src/__tests__/prescriptions.test.ts` (1 assertion)

## Validation

- `npm run build --workspace=@akubly/cairn`: ✅ clean  
- `npm test --workspace=@akubly/cairn` (direct vitest run): ✅ 647/647 passed  
- `@akubly/types` untouched (no shared types changed; `Session` is cairn-internal)

## Coordination

- API shapes summary written to `.squad/decisions/inbox/roger-issue-11-api.md` for Laura
- WI-B (Gabriel, coordinator dispatch policy) holds until this branch merges
