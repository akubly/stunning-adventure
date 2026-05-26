# W5-1 Session-Kind Separation — Roger Drop

**Author:** Roger Wilco  
**Date:** 2026-05-25  
**Work item:** Phase 4.6 Wave 5 W5-1

## Migration approach

- Added migration 014 with `sessions.session_kind TEXT NOT NULL DEFAULT 'user' CHECK (session_kind IN ('user', 'system'))`.
- Backfilled existing `repo_key='__system__'` rows to `session_kind='system'`.
- Left `repo_key` untouched for compatibility; the new kind column carries the user/system split.

## API chosen

- Added `getMostRecentUserSession()` and `getActiveUserSession(repoKey)` in Cairn sessions DB API.
- Kept `getMostRecentActiveSession()` and `getActiveSession(repoKey)` generic so internal/system-aware callers still work.
- Updated `ensureSystemSession()` to create/find `session_kind='system'` rows.

## MCP call sites updated

All four now use `getUserSessionForMcpFallback()` and therefore fall back only to user sessions when no repo key is available:

1. `resolve_prescription` accept/apply attribution.
2. `lint_skill` telemetry event logging.
3. `test_skill` scenario-path telemetry and result persistence.
4. `test_skill` direct validation telemetry and result persistence.

## Test counts

- Before W5-1 targeted changes: Cairn schema version expected 13; MCP fallback tests did not cover `__system__` exclusion.
- After W5-1 targeted run: `db.test.ts` + `mcp.test.ts` = 100/100 passing.
- Full Cairn: 597/597 passing.
- Skillsmith runtime: 8/8 passing.
- Wave 4 integration: 14/14 passing.
- Root build: clean.

## Deferred follow-ups

- I10 Curator system-event handling remains out of scope; this change only prevents MCP user-facing fallback pollution.
- Migration 014 can only backfill historical system sessions that used the documented `__system__` repo key; there is no safe discriminator for hypothetical legacy system rows created with arbitrary repo keys.
