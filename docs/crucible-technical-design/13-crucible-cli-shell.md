# §13 — Crucible CLI Shell

**Status:** FINAL (Phase 2). Authoritative; do not re-litigate locked decisions.
**Owner:** Valanice (UX / Human Factors).
**Cross-refs:** §5 (Router event shape), §7 (`PrescriptionResult`), §8
(Applier + DecisionGate), §9 (Aperture surface), §12 (Copilot SDK runtime
composition), §15 (Package boundaries).
**Depth budget:** ≤3 pages.
**Consultant:** Sonny (advisory review after draft — debugger-verb vocabulary).

The CLI shell is the **only L0-position UI** Aaron drives in v1. It is a
thin REPL over `@akubly/crucible-runtime` (§12.9): every verb is a
constructor-injected runtime call, every render is a read from the L2
projection set (Aperture §9). The shell adds no state and no policy; it
shapes attention and friction so a tired, distracted, impatient operator
can do the right thing without ceremony.

## 13.1 Command Vocabulary

| Verb                                       | Args                                                | Description |
|--------------------------------------------|-----------------------------------------------------|-------------|
| `crucible session start`                   | `[--provider <id>] [--skill <name>]`                | Bootstrap a new session via `runtime.startSession()` (§12.4). |
| `crucible session list`                    | `[--all]`                                           | List sessions from the on-disk session catalog. |
| `crucible session show <sid>`              |                                                     | Render session header + last N inbox events. |
| `crucible session delete <sid> [--purge]`  |                                                     | Delete a session's WAL segments + CAS blobs. Default tombstones for 7-day retention-window grace (allows accidental-delete recovery); `--purge` removes immediately. Remediation primitive when secrets leak (§18.4.1). |
| `crucible fork <sid> --at <offset>`        | `[--new | --resume] [--no-interactive] [--label <text>]` | §10 fork; pins lockfile + bootstrap manifest verbatim. Collision handling (ADR-0019): if child exists at `(sid, offset)` with `status='aborted'`, prompts user (TTY) or requires explicit flag (non-TTY). `--new` creates fresh session (timestamp-variant preimage). `--resume` continues aborted session (appends `fork_resume` Observation). `--no-interactive` suppresses prompt, requires flag. |
| `crucible session resume <sid>`            |                                                     | Resume an aborted session by session ID. Appends `fork_resume` Observation to session ledger. Error if `status != 'aborted'`. Alternative to `crucible fork --resume` for discovered aborted sessions (via `crucible session list --status=aborted`). Idempotent. |
| `crucible aperture witness`                |                                                     | Stream unresolved `attention` rows (§9.3). "Bear witness" — `watch` reserved for future debugger watchpoints (per Sonny advisory; ADR-0020). |
| `crucible aperture show`                   | `[<eventId>]`                                       | Open `@inbox` or a single event with one-hop causal slice. |
| `crucible aperture approve <proposalId>`   | `[--note <text>]`                                   | §9.5: write `structural_proposal_acked` Observation. |
| `crucible aperture reject <proposalId>`    | `[--reason <text>]`                                 | §9.5: write `structural_proposal_rejected` Observation. |
| `crucible aperture defer <proposalId>`     |                                                     | Local snooze; no L1 write. Re-renders entry with `deferred` annotation. |
| `crucible aperture why <eventId>`          | `[--hops N=1]`                                      | Backward causal slice (§9.8). |
| `crucible aperture bisect`                 | `--good <offset> --bad <offset> --probe <cmd>`      | §9.6; env-snapshot captured at start. |
| `crucible decide approve <proposalId>`     |                                                     | Wraps `Applier.onRouterDecision` for data-tier proposals needing manual gate (§8). |
| `crucible decide reject <proposalId>`      | `--reason <text>`                                   | Wraps `Applier` reject path. |
| `crucible decide defer <proposalId>`       |                                                     | **⚠️ Local-only snooze — no L1 write, no resolution.** Parallel to `aperture defer` for data-tier proposals. The row remains unresolved on L1 and will reappear on next boot unless you take a durable action (approve/reject). |
| `crucible revert <decisionId>`             | `--reason <text>`                                   | Wraps `Applier.revert` — compensating Decision (§8.7). |
| `crucible query <view>`                    | `[--json]`                                          | Run a saved query (§13.4) and render. |
| `crucible query save <name>`               | `--from <view>`                                     | Persist a saved query into the session catalog. |
| `crucible replay <sid>`                    | `[--until <offset>] [--strict]`                     | §11 hermetic replay. |
| `crucible fsck [<sessionId>]`              |                                                     | Verify hash-chain continuity, CAS-body completeness, bootstrap-manifest consistency, and monotonic-timestamp invariant. Output: per-check pass/fail + first failure offset on error. (§3.13–3.17.) |
| `crucible gc [--dry-run]`                  |                                                     | Garbage-collect unreferenced CAS blobs and archive old sessions. Mark-and-sweep on closed sessions only (§3.2.1); active sessions excluded. `--dry-run` reports reclaimable bytes without deleting. Unblocks session creation when §17.3.1 hard-limit hit. |
| `crucible status`                          |                                                     | Status-line one-liner: `⊙N  ◆M  ⌚session-uptime`. |
| `crucible perf [top]`                      | `[--json]`                                          | Scheduler performance counters (§17.1 catalog). `top` variant sorts by dispatch latency. |
| `crucible config`                          |                                                     | Edit `~/.copilot/preferences.json` (Crucible + Eureka shared). |

Conventions: `--json` is universally supported on read verbs (§13.6). All
write verbs are idempotent on `proposalId` / `decisionId` (a second
`approve` against an already-acked proposal is a no-op + structured
warning, not an error).

## 13.2 REPL Interaction Model

Thick turns, progressive disclosure. One user keystroke ⇒ one "turn" in
the REPL log; turns are not collapsed across renders so scrollback is
auditable.

```
crucible › aperture witness
⊙2 attention · ◆0 notice
─────────────────────────────────────────────────────────────────────
[attn] structural-proposal-pending  prop_01HQB...  trust:external
       summary: install plugin @community/forge-rust@0.4.1
       blocks 3 paths · queue deadline: 2026-05-29T10:00:00Z
       → `crucible aperture approve prop_01HQB...` to apply
[attn] apply-failed  dec_01HQA...  trust:builtin
       error: fence-violation after 3 retries
       → `crucible aperture show dec_01HQA...` for slice
─────────────────────────────────────────────────────────────────────
(tailing; ^C to exit)
```

**Disclosure tiers per row:**

1. **Headline** — one line; kind, source id (truncated), trust tier.
2. **Body** — 1–3 lines; structured payload summary.
3. **Next-step suggestion** — exactly one suggested verb.

`crucible aperture show <id>` opens the same row at tier 4 (full body) +
tier 5 (one-hop causal slice via §9.8 `why`). The user never has to guess
the next verb; the next-step line is mechanically generated from
`ApertureEvent.kind`.

**No animations, no spinners.** Long-running verbs (replay, bisect)
print a progress row per offset milestone; render is line-oriented so
output pipes cleanly into `grep`, `tee`, and CI logs.

## 13.3 Composition with `@akubly/crucible-runtime`

The CLI binary is `@akubly/crucible-cli` (per §15). Composition root:

```ts
// @akubly/crucible-cli/src/main.ts
import { createRuntime } from '@akubly/crucible-runtime';
import { registerCopilotProvider } from '@akubly/crucible-l0-copilot';
import { renderInbox, renderQueueEntry, renderBisect, renderLeaderboard } from './renderers';

const runtime = createRuntime({
  providers: [registerCopilotProvider],          // §12.3 registry
  sessionStoreDir: process.env.CRUCIBLE_HOME ?? '~/.copilot/crucible',
});

// Every verb is a runtime call + a renderer.
async function apertureApprove(proposalId: string, note?: string) {
  const result = await runtime.aperture.approve({ proposalId, note });
  return renderQueueEntry(result.entry);        // entry.resolved === true on success
}
```

The CLI does **not** import `@github/copilot-sdk`, `@akubly/crucible-l1-wal`,
or any L1+ package directly (dependency-cruiser rule §15). Only
`@akubly/crucible-runtime`, `@akubly/crucible-boundary` (types), and L0
provider factories cross the import boundary. This keeps the shell
substitutable — a future TUI or web shell wires the same runtime.

**Per-session lifecycle:** `crucible session start` constructs the runtime
once per process; subsequent verbs in the same REPL reuse it.
`runtime.shutdown(reason)` is registered as a signal handler so `^C`
flushes the WAL group-commit window before exit.

## 13.4 Saved Queries and `@lobby`

`@lobby` is the **default landing surface** when `crucible` is invoked
with no arguments (Round 2.1 vocabulary). It is a saved query — not a
new substrate — defined in the session catalog as:

```sql
-- Default @lobby definition; user can override via `crucible query save`.
SELECT id, kind, level, title, emitted_at
FROM aperture_events
WHERE session_id = :current AND resolved = 0
ORDER BY (level = 'attention') DESC, emitted_at DESC
LIMIT 20;
```

| Saved query | Default definition |
|-------------|-------------------|
| `@lobby`    | Unresolved events for the current session, attention-first. |
| `@inbox`    | All unresolved events across all live sessions, attention-first. |
| `@today`    | All events (resolved + unresolved) emitted in the last 24h. |
| `@decisions`| `WHERE source_kind = 'decision'` — applied + reverted decisions. |
| `@why:<pid>`| Parameterized: one-hop backward causal slice for `<pid>`. |

Saved queries live in `~/.copilot/crucible/queries.toml`; the file is a
normal config file (not a ledger artifact) so they survive across
sessions. Built-ins (`@lobby`, `@inbox`, `@today`, `@decisions`,
`@why:<pid>`) are seeded on first run and re-seeded if absent — users
override by saving with the same name.

Saved queries return the same `ApertureEvent` row shape (§9.1) regardless
of whether they hit `aperture_events` directly or wrap the L5 investigation
tools — this is the single read shape the CLI renderers consume.

## 13.5 UX Principles (Charter Cross-Reference)

The CLI is shaped by four principles drawn from the UX / Human Factors
charter — `~/.copilot/agents/valanice.agent.md` and the persona-review
panels in `~/.copilot/knowledge/technologies/persona-review-panels.md`.

1. **Friction calibration** — verbs are weighted by reversibility. `defer`
   is zero-friction (local-only). `approve` and `reject` write to L1 and
   require the full `proposalId` (no fuzzy matching) — the friction is
   intentional because the row is durable. `revert` requires `--reason`
   for the same audit reason.
2. **Attention management** — exactly one status-line badge token; at most
   one suggested next-step verb per row; long-running output is
   line-oriented and progress is offset-stamped, not animated. The tired
   user can scan a `watch` tail without losing their place.
3. **Progressive disclosure** — three render tiers (`watch` headline,
   `show` body, `why` slice). The user opts deeper; nothing forces a slice
   render they didn't ask for.
4. **No surprises** — every write verb names the L1 sub-kind it produces
   in `--help` (e.g., `aperture approve` documents "writes
   `Observation{subKind: 'structural_proposal_acked'}`"). This is the
   contract that lets a user reason about what their keystroke will do
   to the ledger before they press enter. Defer verbs (`aperture defer`,
   `decide defer`) explicitly document their local-only behavior in
   `--help` and render deferred rows with a `⚠ local-only` badge in
   `@inbox` (§9.9).

## 13.6 JSON Output Schemas (Machine Consumers)

`--json` flips renderers from human-text to a stable line-delimited JSON
shape. Two schemas matter for the R2 locks.

**Bisect (R2-4 LOCK) — per-row `envSnapshotHash` is mandatory.**

```ts
interface BisectJsonOutput {
  runId: string;
  envSnapshotHash: string;              // full hex; abbrev rendered in UI per §9.6
  envSnapshotCapturedAt: number;        // Timestamp; bisect start
  good: number;                         // baseline good offset
  bad: number;                          // baseline bad offset
  rows: BisectJsonRow[];
}

interface BisectJsonRow {
  offset: number;
  verdict: 'good' | 'bad' | 'skip' | 'env-drift';
  probedDecisionId: string;
  envSnapshotHash: string;              // REQUIRED per row (R2-4); equals run header unless 'env-drift'
  probeExitCode: number;
  probeDurationMs: number;
  notes: string | null;
}
```

The per-row `envSnapshotHash` is **redundant on a healthy run** (every row
matches the header) and **load-bearing on a sick run** — when a row's
hash diverges, machine consumers (CI bots, dashboard scrapers) detect
env-drift without re-running the bisect. The UI badge from §9.6 reads
from `BisectJsonRow.envSnapshotHash`; one source, two surfaces.

**Leaderboard (R2-5 LOCK) — `nonDominatedReason` exposed verbatim.**

```ts
interface LeaderboardJsonOutput {
  proposalId: string;
  decisionState: 'pending' | 'chosen' | 'rejected';
  chosen: string | null;                // PrescriptionResult.prescriptionId, when state === 'chosen'
  candidates: LeaderboardJsonRow[];
}

interface LeaderboardJsonRow {
  prescriptionId: string;
  rank: number;                         // 1-based; ties allowed
  axes: string[];                       // FitnessContract.axes keys actually emitted (no zero-fill)
  fitness: Record<string, number>;      // sparse; only emitted axes
  nonDominatedReason: 'optimal' | 'incomparable';   // R2-5: verbatim from §7
  incomparableWith?: string[];          // OPTIONAL; sibling prescriptionIds — R2-5
}
```

JSON consumers see exactly what the Aperture UI badges (§9.7): a
`nonDominatedReason === 'incomparable'` row is the same row the UI marks
`[incomparable-axes]`. There is no "JSON-only" or "UI-only" field — the
CLI JSON surface is the source of truth and the renderers transform it.

## 13.7 Acceptance Signals

This spec is sufficient for:

- **Saved-query smoke test:** `crucible query @lobby --json` against a
  fresh session returns `[]`; after an `attention` event lands, the next
  invocation returns one row whose id equals the source L1 row id.
- **R2-4 (Q5 bisect env-snapshot):** `crucible aperture bisect --json`
  emits `envSnapshotHash` on every `BisectJsonRow`; an integration test
  asserts the hash is bit-equal across rows on a healthy run and that any
  divergence is rendered as `verdict: 'env-drift'`.
- **R2-5 (Q8 leaderboard incomparability):** `crucible query @decisions
  --json` against a session whose Router emitted a multi-candidate
  `RouterDecision` includes a `LeaderboardJsonOutput` payload whose
  `candidates[].nonDominatedReason` is verbatim equal to the
  `PrescriptionResult` field on §7's source. UI badge (§9.7) reads from
  the same field.
- **§8 DecisionGate cross-ref:** the `crucible decide approve|reject|defer`
  verbs are thin shells over `Applier.onRouterDecision`; the resume path
  for structural proposals goes through `aperture approve` (§9.5), not
  `decide approve` — distinct verbs preserve the "structural is async,
  data is inline" mental model.
- **§12 composition cross-ref:** `crucible session start --provider
  copilot-sdk` exercises §12.4 sequence end-to-end; the CLI binary owns
  the registry-registration call but not the provider's `bootstrap()`
  body.

No locked decisions are re-litigated. JSON schemas (§13.6) carry the R2-4
and R2-5 locks for machine consumers; the human-text renderings in §9.6
and §9.7 are derived from the same fields. Sonny consult flagged for
advisory review of §13.1 vocabulary (especially `why`, `bisect`,
`approve|reject|defer` triads) against debugger-verb conventions before
this section freezes.
