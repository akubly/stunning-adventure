# Forge Dogfooding Guide

> **Why this exists.** Aaron's 2026-05-30 [dogfood-first directive](../.squad/decisions-archive.md#2026-05-30-forge-roadmap-priority--dogfood-first-aaron-directive) made install + real-usage signal the #1 forge priority. The install steps live in the [root README](../README.md#forge-mcp-bash-shell-init-m2). This guide picks up where that section ends: how the feedback loop works once you're installed, how to inspect your own signal, and how to close the loop.

---

## What Dogfooding Forge Means

Every time you open a bash terminal, forge's session-start hook fires, analyzes your execution profiles, and writes optimization hints to `~/.cairn/knowledge.db`. Those hints surface in your Copilot conversations via the Cairn MCP tools. When you act on a hint — accepting it as resolved or dismissing it — the system records that disposition. The next time the prescriber runs for the same skill, it reads those dispositions and either suppresses hints you dismissed or boosts confidence for categories you resolved.

That is the loop. It is live end-to-end as of M3 (PR #49).

---

## Prerequisites + Install

See the **[forge-mcp: Bash Shell Init (M2)](../README.md#forge-mcp-bash-shell-init-m2)** section of the root README for the full install procedure. The short version:

```bash
# From the repo root:
bash .github/hooks/cairn/install.sh
source ~/.bashrc
forge_mcp_check          # smoke test: should print ✓
```

This guide assumes `forge_mcp_check` reports a clean install. If not, fix that first.

### MCP servers: you need both

The tools used in this guide are split across **two MCP servers**, both configured in `.github/plugin/.mcp.json`. If only one is active, the other's tools fail silently with "tool not found."

| Server | Registered as | Tools it exposes |
|--------|--------------|-----------------|
| `@akubly/skillsmith-runtime` | `forge` | `forge_prescribe` |
| `@akubly/cairn` | `cairn` | `list_optimization_hints`, `resolve_optimization_hint`, `get_optimization_hint`, `get_status`, `list_insights`, `run_curate`, `show_growth`, `search_events`, and others |

Both are auto-configured when you clone the repo and point Copilot CLI at it (the root README's "As a Copilot CLI plugin" section). If you are not using the plugin manifest, ensure both MCP servers (`cairn` and `forge`, which run the `cairn-mcp`/`forge-mcp` commands) are registered in your MCP config.

---

## What Success Looks Like

Signal builds slowly — this is normal. Here is the expected timeline:

1. **Right now:** `forge_mcp_check` passes. Both MCP servers respond. The hook fires on every new bash session but emits nothing yet (no profile data).
2. **Seed a profile to bootstrap (current gap):** The forge prescriber requires an execution profile in `~/.cairn/knowledge.db` to generate hints. The telemetry → execution_profiles pipeline is wired end-to-end as of PR #75, but no production session runner drives live agent sessions through `ForgeClient` yet — so on a stock Copilot CLI install, profiles don't auto-populate from real usage. Use `forge-seed-profile` to bootstrap:

   ```bash
   forge-seed-profile --skill <your-skill-id> --session-count 5
   ```

   This inserts synthetic signal samples and runs the real `buildProfiles` aggregation path, producing a profile that is structurally identical to one built from live telemetry. Once seeded, hints appear on the next prescriber run. See [Known Limitations](#known-limitations).
3. **After curation runs:** The Curator processes the event stream and generates insights. This happens automatically in the hook, or you can trigger it manually with `run_curate` in a Copilot chat.
4. **Hints appear:** `list_optimization_hints` returns pending hints. You act on them.
5. **On the next prescriber run:** Your dismissals suppress that category; your resolutions boost its confidence.

> **Silence ≠ broken.** If you see no hints yet, check your session count with `forge-metrics --skill <id> --format table`. The Profile section shows how many sessions have been recorded. If it is below 3, re-run `forge-seed-profile --skill <id> --session-count <n>` to raise the count — the command is re-runnable and will add sessions. Sessions will also accumulate automatically once a production runner drives agent sessions through ForgeClient, but that consumer is not present on a stock Copilot CLI install today.

---

## How to Find Your Skill ID

A **skill ID** is the identifier Cairn uses to group execution profiles and hints for a particular unit of AI-assisted work (an agent, a workflow, a recurring task type). Skill IDs are arbitrary strings (e.g. `"cairn-archivist"`, `"my-review-workflow"`).

**Discover your skill IDs once you have data:**

- In a Copilot chat, ask `list_optimization_hints`. Each hint in the response includes a `skill_id` field — that is a real skill ID with recorded data.
- Run `forge-metrics --skill <id> --format table` to confirm a specific ID has a profile.
- The `forge-prescribe` CLI prints `Skill: <id>` in its output when a profile is found.

**Cold start (no hints yet):** If you have just installed and have not yet seeded a profile, none of the above will return skill IDs — because skill IDs only surface once execution profiles exist in `~/.cairn/knowledge.db`. Use `forge-seed-profile` to bootstrap one immediately:

```bash
forge-seed-profile --skill <your-skill-id> --session-count 5
```

On a fresh install, `list_optimization_hints` returns nothing and `forge-metrics` reports `found: false` for any ID until a profile is seeded. See [Known Limitations](#known-limitations).

---

## The End-to-End Loop

### Step 1 — Hook fires on session start

When you open a new interactive bash shell, `~/.bashrc` sources `shell-init.sh`, which resolves the `sessionStart.js` entrypoint and runs it **detached in the background** — no blocking work on your prompt. The entrypoint analyzes your execution profiles, checks prior dispositions, and writes any new optimization hints to `~/.cairn/knowledge.db`.

A summary line appears on stderr only when hints are actually inserted:

```
skillsmith-runtime: prescribers (auto) processed=N inserted=N duplicated=N errors=N skipped=N
```

If you see nothing, zero new hints were inserted. This is expected until at least 3 sessions of profile data have accumulated (see [What Success Looks Like](#what-success-looks-like)).

### Step 2 — Work normally

Use Copilot as usual. Cairn's `preToolUse` hook records tool calls and errors into the event log. The forge prescriber runs when the curator has computed change vectors for a skill — which requires an execution profile to already exist (see [Known Limitations](#known-limitations) and [How to Find Your Skill ID](#how-to-find-your-skill-id)).

Once a profile is seeded, check its recorded session count any time:

```bash
forge-metrics --skill <your-skill-id> --format table
```

The **Profile → Session Count** row shows how many sessions have been recorded against that skill.

### Step 3 — See what hints surfaced

In a Copilot chat:

```text
list_optimization_hints
```

Filter to pending hints specifically (omitting `status` returns all active hints — pending, accepted, and deferred):

```text
list_optimization_hints status=pending
```

The response envelope includes `count` and a `hints[]` array. When no `status` filter is passed, it also includes `active_count` (total across pending/accepted/deferred). `active_count` is omitted when you filter by a specific status. Each hint has an `id`, `skill_id`, `category`, `recommendation`, `impact_score`, and `confidence_level` (high/medium/emerging).

For full detail on a specific hint, in a Copilot chat:

```text
get_optimization_hint hint_id=<id>
```

### Step 4 — Act on a hint

In a Copilot chat, use `resolve_optimization_hint` to close the loop:

```text
resolve_optimization_hint hint_id=<id> resolution=resolved note="applied the prompt-structure change manually"
```

```text
resolve_optimization_hint hint_id=<id> resolution=dismissed note="not relevant to this skill"
```

`resolution` must be `resolved` or `dismissed`. Both transitions move the hint to `rejected` status in the DB, but the `resolution_disposition` field preserves your intent for the feedback loop.

Resolving via `resolve_optimization_hint` records a `hint_state_transition` event tagged `source='mcp'`; only these MCP-initiated transitions influence future hint generation (dismiss → suppress that skill+category, resolve → boost its confidence). See [Appendix: Internal Event Schema](#appendix-internal-event-schema) for the full payload shape.

### Step 5 — Dispositions tune future hints (M3)

On the next prescriber run for that skill (at session start, or manually via `forge_prescribe`), the prescriber reads your prior dispositions and adjusts:

- **Dismissed** (any MCP-sourced dismiss for a `skill_id + category` pair): hints for that category are suppressed entirely for that skill going forward.
- **Resolved** (any MCP-sourced resolve for a `skill_id + category` pair): hints for that category get a confidence boost, rising in priority.

The loop is complete. The system has learned from your signal.

---

## Manually Triggering the Prescriber

You don't have to wait for a new terminal session.

### Via the `forge_prescribe` MCP tool

In a Copilot chat:

```text
forge_prescribe skill_id=<your-skill-id>
```

With force-regeneration (expires active hints and reruns):

```text
forge_prescribe skill_id=<your-skill-id> force=true
```

The tool returns `inserted`, `skipped`, `errored`, `totalHints`, and the profile tier used (`per-skill`, `per-model`, `per-user`, or `global`).

### Via the `forge-prescribe` CLI

If `@akubly/runtime-cli` is linked or available via npx:

```bash
forge-prescribe --skill <id>
forge-prescribe --skill <id> --force
forge-prescribe --skill <id> --db ~/.cairn/knowledge.db
```

The CLI prints a summary:

```
Skill: <id>
Profile: per-skill
Hints generated: 3
  Inserted:  3
  Skipped:   0 (existing active hints)
  Errored:   0
Total persisted: 3
```

---

## Inspecting Your Signal

### `forge-metrics` CLI

```bash
forge-metrics --skill <id>                    # JSON output (default)
forge-metrics --skill <id> --format table     # human-readable table
forge-metrics --skill <id> --repo-key <key>   # scope session lookup to a repo
forge-metrics --help
```

The table output sections and what they mean:

- **Profile** — whether a profile was found, which tier matched (`per-skill`, `per-model`, `per-user`, or `global`), the session count stored in the profile row, the ISO-8601 timestamp of the last profile update, and days elapsed since that update.
- **Staleness** — whether the profile is stale, the reason (`count` if > 50 sessions have been recorded since the last profile update, `age` if > 7 days have elapsed since the last profile update, `count+age` for both), and the sessions-since-last-update count.
- **Confidence** — raw confidence (always 1.0 for DB profiles), attenuated confidence (halved when stale), and whether attenuation was applied.
- **Auto-Apply** — whether attenuated confidence is above the floor (0.1) for automatic hint application.
- **Recent Prescriber Runs** (default: 10) — most recent `prescriber_run` events for the skill: timestamp, trigger, profile tier used, inserted/skipped/errored counts.

If the profile section shows `found: false`, the skill has no execution profile yet — more sessions are needed.

### Querying the Cairn MCP directly

In a Copilot chat:

```text
get_status
```

```text
list_insights
```

```text
run_curate
```

```text
show_growth
```

---

## Troubleshooting

### Hook not firing

Run `forge_mcp_check` to verify the install. If it reports `sessionStart script: NOT FOUND`, either build the local repo or install the runtime globally:

```bash
npm run build
# or
npm install -g @akubly/skillsmith-runtime
# then
forge_mcp_check
```

Check that `node` is on your bash `PATH`. In Git Bash on Windows, Node.js installed system-wide is usually on the path automatically.

### No hints appearing

**Check whether the profile exists:**

```bash
forge-metrics --skill <id> --format table
```

- `Profile: found: false` → not enough sessions yet. The prescriber requires at least 3 sessions of recorded data.
- `Profile: found: true` with `Staleness: Stale: true` → confidence is halved (0.5×); hints are generated but may be lower-priority. This triggers when > 50 sessions have been recorded since the last profile update, or > 7 days have elapsed.

**Check whether the prescriber has run:**

The "Recent Prescriber Runs" section of `forge-metrics` shows the last 10 `prescriber_run` events. If it reads `(none recorded for this skill)`, the hook has not yet run the prescriber for that skill ID.

**Check for skipped hints:**

If `Inserted: 0, Skipped: N`, the prescriber ran but all hints were duplicates of existing active hints. In a Copilot chat:

```text
list_optimization_hints status=pending
```

Or force-regenerate via the CLI:

```bash
forge-prescribe --skill <id> --force
```

### An MCP tool fails with "tool not found"

Both MCP servers must be running. `forge_prescribe` lives on the `forge` server (`@akubly/skillsmith-runtime`). All other tools used in this guide (`list_optimization_hints`, `resolve_optimization_hint`, etc.) live on the `cairn` server (`@akubly/cairn`). See [MCP servers: you need both](#mcp-servers-you-need-both).

### Dismissed category keeps resurfacing

Dismissal suppression only applies to hints resolved via `resolve_optimization_hint` (MCP). Verify in a Copilot chat:

```text
search_events session_id=<current-session> event_type=hint_state_transition
```

Look for `resolution_disposition: "dismissed"` and `source: "mcp"` in the payload. If `source` is `"system"`, that transition does not drive suppression.

### Stale data / profile not refreshing

Trigger a manual curate in a Copilot chat:

```text
run_curate
```

If the profile is old but the session count looks right, check curator health:

```text
get_status
```

### Resetting hints for a skill

In a Copilot chat:

```text
forge_prescribe skill_id=<id> force=true
```

Or via the CLI:

```bash
forge-prescribe --skill <id> --force
```

This atomically expires all existing active hints for the skill and inserts fresh ones from the current profile. Prior `hint_state_transition` events (your dismissal/resolution history) are preserved.

---

## Known Limitations

The following are explicitly deferred, per the [dogfood-first decision](../.squad/decisions-archive.md#2026-05-30-forge-roadmap-priority--dogfood-first-aaron-directive):

- **No production session runner yet:** The telemetry → execution_profiles → prescriber pipeline is built and tested (PR #75). The remaining gap is narrower: no production runner currently drives real agent sessions through `ForgeClient`/`ForgeSession`, so live sessions don't auto-populate profiles on a stock Copilot CLI install. Use `forge-seed-profile --skill <id> --session-count <n>` to bootstrap a real profile today. When a production runner lands (or when telemetry is wired into whatever drives sessions), profiles will populate automatically with no further changes required.
- **GP-tournament selection** (Phase 5 §2.4) — multi-armed bandit prescriber selection based on real signal. Deferred until dogfood signal is collected.
- **Meta-optimization** (DBOM on prescriber decisions) — self-optimizing prescriber weights. Same gate.
- **Eureka FactStore adapter + recall wiring** — episodic context (trust-scored facts) feeding the prescriber. Deferred until Eureka v1 stabilizes and the SQLite FactStore adapter is built.
- **Zsh support** — `shell-init.sh` is bash/Git Bash only. File a GitHub issue if you need first-class zsh wiring.

---

## Appendix: Internal Event Schema

For contributors and anyone debugging the feedback loop at the DB level.

When you call `resolve_optimization_hint` via MCP, Cairn emits a `hint_state_transition` event into the event log. The event payload keys (defined in `packages/cairn/src/db/hintStateTransitionConstants.ts`) are:

| Key | Type | Example |
|-----|------|---------|
| `skill_id` | string | `"cairn-archivist"` |
| `hint_id` | string | `"hint-abc123"` |
| `from_state` | string | `"pending"` |
| `to_state` | string | `"rejected"` |
| `timestamp` | string | `"2026-06-10T22:15:00.000Z"` |
| `resolution_disposition` | `"resolved"` \| `"dismissed"` | `"dismissed"` |
| `resolution_note` | string \| null | `"not relevant"` |
| `source` | string | `"mcp"` |

Only events where `source = 'mcp'` are counted by `SqliteHintDispositionProvider` — system-generated transitions use `source = 'system'` and are explicitly excluded from the feedback SQL. On the next prescriber run, `applyDispositions()` in `packages/forge/src/prescribers/utils.ts` filters out hints with any dismissed category (`dismissedCount > 0`) and boosts confidence for resolved categories by `RESOLVED_CONFIDENCE_BOOST` (1.2×).
