# Changelog

All notable changes to `@akubly/cairn` will be documented in this file.

## [0.3.0] — 2026-05-25

### Breaking

- **Explicit `db` parameter (DB layer):** DB-layer helpers (`./db/*` exports)
  and internal agent helpers now require an explicit `Database.Database` as
  the first positional parameter and no longer fall back to `getDb()`.
  Top-level agent entry points (e.g. `curate`, `startArchivistSession`)
  continue to resolve the DB internally via `getDb()`. This fixes
  module-singleton fragmentation when the same package is imported via
  different resolution paths (source vs barrel).

### Added

- `getSessionsSinceInstall(db)` — query helper previously duplicated as raw
  SQL in `skillsmith-runtime`. Now canonical and barrel-exported.
- `getUserSessionForMcpFallback` extracted to `src/mcp/sessionFallback.ts` for
  testability and reuse.

### Fixed

- MCP server stale DB handle: `ensureDb()` now always re-delegates to
  `getDb()` instead of caching with `??=`, preventing stale references after
  `closeDb()`.
- Structural test (`mcp.test.ts`) no longer depends on `process.cwd()` —
  uses `import.meta.url` for path resolution.

## [0.2.0] — 2026-05-18

Initial workspace-internal release with MCP server, execution profile CRUD,
and migration 011 (four-tier granularity).
