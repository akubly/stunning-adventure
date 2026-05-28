# Explicit Context Migration in TypeScript Monorepos

## When to use

Use this when a shared package has public helpers that silently read singleton context (DB, clock, config, logger) and tests or consumers need deterministic explicit ownership.

## Steps

1. Pick the hard-cut or compatibility strategy up front. For a hard cut, remove overloads and default-context helpers in the same change.
2. Change the provider package API first so TypeScript breaks every caller.
3. Thread context from composition roots and process boundaries; do not recreate singleton fallback inside lower-level helpers.
4. Keep entry points responsible for obtaining context (`getDb(path)`, config loading, etc.), then pass handles downward.
5. Update cross-package integration tests after package-local tests; they often import through barrels and catch stale public API assumptions.
6. Validate with build first, then targeted package tests, then the full workspace suite.

## Gotchas

- Regex migrations can corrupt same-named non-DB APIs (`createSession`, `logEvent`); restrict codemods to files that import the migrated API.
- Test files often use `getDb(':memory:')` only for setup. Capture the returned handle and pass it explicitly.
- Beware local `const db` declarations shadowing a shared test `let db`; either keep all-db-local or all-db-shared per file.
