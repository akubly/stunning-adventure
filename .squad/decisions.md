# Alexander: Forge run-session composition root

Date: 2026-06-16T23:25:32-07:00

## Decision

Slice 1 implements the opt-in `forge-run-session` command as a thin operator
surface in `packages/runtime-cli`, but the reusable session wiring lives in
`packages/skillsmith-runtime/src/forgeSessionRunner.ts`.

The runtime helper owns the composition:

`CopilotClient` / injected SDK client → `ForgeClient` → `createCairnTelemetrySink(db)` → one prompt via `ForgeSession.sendAndWait()` → disconnect/flush → `curate()` profile build.

## Rationale

`skillsmith-runtime` is already the composition root that imports both Cairn
and Forge. Keeping the SDK/Forge/Cairn wiring there avoids burying lifecycle
logic in CLI argument parsing and gives Roger a reusable function to lift into
a future platform runner.

## Permission seam

`ForgeSessionConfig` now exposes `onPermissionRequest`, passed through by
`ForgeClient.createSession()` and `resumeSession()`. Forge defaults the handler
to SDK `approveAll` for dogfood, while callers can override it for stricter
production policy.

## Scope boundary

DBOM generation is intentionally out of slice 1. Bridge events remain captured
on `ForgeSession`; the slice only proves local signal samples and execution
profile visibility.


---

# Roger — Forge runner lifecycle guidance

**Date:** 2026-06-16T22:51:06-07:00  
**Scope:** Forge #1 production runner integration; platform/lifecycle guidance for `forge-run-session`.

## Decision: graceful shutdown ordering

For `forge-run-session`, use one idempotent shutdown path for normal completion, SIGINT/Ctrl+C, and top-level errors:

1. Stop accepting new prompts / mark shutdown in progress.
2. Await `session.disconnect()`. The Forge runtime must keep SDK event subscriptions live during `sdkSession.disconnect()` because the live SDK may emit terminal lifecycle events during disconnect.
3. Flush Forge telemetry collectors/sink after `sdkSession.disconnect()` returns, so `session.shutdown` → Forge bridge `session_end` has been observed before `outcome.succeeded` is computed.
4. Call `ForgeClient.stop()` for client/transport cleanup.
5. Close the SQLite handle with `closeDb()` last.

Alexander's current runtime seam already matches this: `packages/forge/src/runtime/session.ts` keeps the subscription live, records `sdk_disconnect_start/end`, calls `sdkSession.disconnect()`, unsubscribes, then flushes telemetry (`telemetry_flush_start/end`). The runner should not add its own separate sink flush before `session.disconnect()`, and tests should assert this timing through `session.getTelemetryTimings()`.

For Forge #1's single-prompt runner, SIGINT does not need a prompt-loop shutdown flag yet. The CLI should let interruption/error unwinds reach the same `finally`; if a later runner adds a prompt loop, then add an explicit `process.on('SIGINT')` flag and return the conventional interrupt code instead of accepting more prompts.

## Decision: SQLite lifecycle contract

The runner should open Cairn's SQLite DB through `getDb(parsed.values.db)` / `getKnowledgeDbPath()` and always close with `closeDb()` in `finally`. `packages/cairn/src/db/index.ts` creates the parent directory, opens better-sqlite3, enables `journal_mode = WAL` and `foreign_keys = ON`, then applies migrations.

`knowledge.db` does not use the Crucible L1 `write.lock`; issue #55 is about the custom file-backed WAL substrate, whose current mitigation is PID + liveness reclaim. Do not graft that lock onto SQLite in this slice. SQLite WAL gives concurrent readers and serializes writers, but it does not protect higher-level session semantics. A runner and an interactive Copilot session writing the same `~/.cairn/knowledge.db` can still hit immediate `SQLITE_BUSY` failures (Cairn does not currently set `busy_timeout`) or collide on active-session identity. For CI/dev, prefer `--db <isolated path>`; for dogfood, choose one supported policy: serialize real interactive runs, or make the runner use its own session identity so it cannot resume/overwrite an interactive session's logical state.

## Decision: placement

Keep the command in `packages/runtime-cli` as `src/forge-run-session.ts` and register it in `packages/runtime-cli/package.json` `bin`, matching `forge-metrics` and `forge-seed-profile`. Keep `runtime-cli` thin: parse args, call `@akubly/skillsmith-runtime`, print JSON, close Cairn. Do not add a direct `@akubly/forge` dependency to `runtime-cli`; `packages/skillsmith-runtime/src/forgeSessionRunner.ts` is the reusable composition root that owns SDK → Forge → Cairn wiring.

Use existing runtime-cli conventions: `node:util` `parseArgs`, `--help/-h`, `--db`, and top-level `process.exitCode = code`. Return `0` when signal samples are written, `1` when the session runs but produces no signal samples, and `2` for bad input/auth/SDK availability errors.

## Decision: auth/config failure behavior

Construct the real SDK client only inside the reusable runtime composition root, not directly in the CLI entry point. `@github/copilot-sdk@0.2.2` documents `CopilotClient` options including `cliPath`, `cliArgs`, `cliUrl`, `port`, `useStdio`, `autoStart`, `githubToken`, `useLoggedInUser`, and `telemetry`; it also documents that `createSession`/`resumeSession` require `onPermissionRequest`. Forge #1's approved policy seam defaults to SDK `approveAll`, but keep that explicitly opt-in to this runner slice: do not accept tokens as positional/printed CLI args, do not echo auth details in errors, and treat `cliPath`/`cliUrl` overrides as developer-only configuration, not repo-controlled input.

If auth, CLI startup, or SDK import is unavailable, print one clear `forge-run-session: ...` error and exit `2`; do not create partial DB writes beyond already-flushed telemetry, and always run the same shutdown `finally`.

## Verification contract

Add offline tests with a faithful SDK client double that emits events in production order:

`session.start` → tool/usage/turn events → runner calls `session.disconnect()` → SDK double emits `session.shutdown` during `sdkSession.disconnect()` → telemetry flush → `ForgeClient.stop()` → `closeDb()`.

Assertions:

- persisted `signal_samples` rows include an `outcome` sample with `metadata.succeeded === true`;
- running profile build yields `sessionCount >= 1`;
- `forge-metrics --skill <id>` reports `profile.found: true`.
- `telemetryTimings` show `sdk_disconnect_end` before `telemetry_flush_start`.

Keep a tiny manual dogfood smoke behind opt-in auth, but CI should use the SDK double and an isolated `--db` path.


# Alexander — Event-driven Forge disconnect drain

**Date:** 2026-06-21T22:25:59-07:00
**Scope:** Forge production runner slice 1 Cycle 3 hardening

## Decision

ForgeSession disconnect now treats bridged `session.shutdown` / `session_end` observation as the primary terminal-event drain signal. The bounded timeout remains only as a ceiling and test seam; it is no longer a public `ForgeSessionConfig` knob.

`runForgeInstrumentedSession()` now returns `disconnect: { ok: boolean; error?: string }` so disconnect failures remain observable without changing the successful sample-written exit-code contract.

## Rationale

The SDK can emit terminal lifecycle events on a later tick after `sdkSession.disconnect()` resolves. Waiting on the actual bridged terminal event removes the fixed wall-clock heuristic while preserving bounded latency if the SDK never emits shutdown. The disconnect result preserves the current best-effort cleanup behavior while giving callers enough signal to warn, retry, or report degraded cleanup.

