# W5-2 DB Explicit-DB Hard Cut — Roger Drop

**Author:** Roger Wilco  
**Date:** 2026-05-25  
**Work item:** Phase 4.6 Wave 5 W5-2

## Refactor approach

- Hard-cut public Cairn DB helpers to take `db: Database.Database` explicitly as the first parameter.
- Removed singleton fallback overloads instead of preserving compatibility shims.
- Let TypeScript identify consumers, then threaded db through Cairn agents/hooks/MCP, Forge integration tests, runtime-cli tests, and skillsmith-runtime tests.

## Before / after signature example

Before:

```ts
export function getPreference(key: string, sessionId?: string): string | undefined {
  const db = getDb();
  // ...
}
```

After:

```ts
export function getPreference(
  db: Database.Database,
  key: string,
  sessionId?: string,
): string | undefined {
  // ...
}
```

## Helpers killed

- Removed `logEventWithDefaultDb()`.
- Removed deprecated `logEvent(sessionId, ...)` overload.
- Collapsed `getExecutionProfileWithDb()` into `getExecutionProfile(db, ...)`.
- Removed deprecated/default fallback overload from `ensureSystemSession()`.

## Structural changes

- `curate()` now captures one db handle and passes it into detector helpers.
- `runSessionStart()` passes db into stale-session checks and DB counters.
- MCP server initialization stores the explicit db handle after `ensureDb()`.
- Tests now keep explicit per-test db handles instead of relying on ambient singleton reads. Persona review also tightened prescriber/curator/session-state helper threading and restored the `logEvent` payload guard.

## Deferred follow-ups

- `getDb()` remains as the connection factory for process entry points and test setup; this work only removed singleton fallback from public DB helpers.
- Some tests still use the singleton factory to create the database, then pass the returned handle explicitly.
- Root `npm test` stalls under this shared CLI TTY when npm wraps Vitest, although direct workspace Vitest commands pass; no product code follow-up needed unless CI reproduces it.

