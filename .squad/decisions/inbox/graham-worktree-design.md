# Decision: Worktree-Aware Session Architecture

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-04-02  
**Type:** Architecture  
**Status:** Proposed  
**Triggered by:** Aaron — "are we setting our agents up for success with the appropriate intelligence to make *use* of the power of git worktrees?"

---

## Problem

Cairn sessions are keyed by `repo_key` — a slugified git remote URL (e.g., `akubly_stunning-adventure`). All worktrees of the same repository share the same remote, producing the same `repo_key`. When multiple Copilot sessions run simultaneously in different worktrees (Squad's standard operating mode), `getActiveSession(repoKey)` returns the same session for all of them.

**Immediate symptoms:**
- Session collision — worktree B resumes worktree A's session instead of creating its own
- Event streams from different worktrees interleave in the same session
- Crash recovery (stale session detection) may close a live session in another worktree
- Curator processes mixed-context events, producing incoherent insights

**Bigger question (Aaron's push):** Beyond "don't break," can Cairn actively leverage worktrees as a platform capability? Cross-worktree intelligence, sibling awareness, panoramic views.

## Decision: `workdir` as Session Discriminator

**Session identity = `repo_key` + `workdir`**

The `workdir` is the worktree root path, obtained via `git rev-parse --show-toplevel`. It is:

- **Unique per worktree** — each `git worktree add` creates a distinct directory
- **Stable for session lifetime** — unlike branch (which can change mid-session via checkout), the worktree path doesn't move
- **Uniform** — the main checkout also has a `--show-toplevel` result, so non-worktree repos work identically
- **Informative** — a full path is human-readable and debuggable, unlike a hash

Branch remains metadata on the session (recorded, displayed, useful for context), but it's not part of the identity key.

## Alternatives Considered

| Alternative | Why Not |
|---|---|
| `repo_key + branch` as composite key | Branch can change mid-session (checkout). Two worktrees can share a branch (detached HEAD edge case). Identity should be stable. |
| `repo_key + branch + workdir` triple key | No additional uniqueness over `repo_key + workdir`. Adds complexity for no gain. |
| Hash of workdir path | Loses human readability. Debugging session collisions requires decoding hashes. |
| Separate knowledge.db per worktree | Destroys cross-worktree intelligence — the shared DB is a feature, not a bug. |

## Scope: NOW vs LATER

### NOW — Session Isolation + Context Enrichment (this issue)

1. **Migration 005:** Add `workdir TEXT` column to `sessions` table
2. **`gitContext.ts`:** Add `getWorkdir()` — `git rev-parse --show-toplevel`
3. **`sessions.ts`:** `getActiveSession(repoKey, workdir?)` — filter by workdir when provided; `createSession(repoKey, branch?, workdir?)` — store workdir
4. **`archivist.ts`:** Pass workdir through `startSession` / `catchUpPreviousSession`
5. **Hooks:** `postToolUse` and `sessionStart` resolve and pass workdir
6. **Types:** `Session` and `SessionSummary` get `workdir?: string`
7. **Event payloads:** Include workdir in `session_start`, `session_resume`, `tool_use` payloads
8. **MCP `get_status`:** Include workdir in session response; when workdir not specified, return ALL active sessions for the repo (sibling awareness)
9. **Tests:** Full coverage for worktree-aware session lookup, collision prevention, backward compatibility with NULL workdir

### NEXT — Cross-Worktree Intelligence (follow-on issue)

- **`list_sessions` MCP tool:** "What sessions are active right now across all worktrees?" Returns active sessions with branch, workdir, event counts.
- **`search_events` enhancement:** Optional `cross_worktree: true` flag to search events across sibling worktree sessions.
- **Curator cross-worktree correlation:** "Worktree B hit the same build error that worktree A hit 5 minutes ago." Insights scoped to repo_key (not session) already enable this — the tools just need to surface it.

### LATER — Worktree Lifecycle & Panoramic View

- **Worktree lifecycle hooks:** Detect `git worktree add/remove` and auto-manage sessions (close orphans when worktree removed).
- **Worktree-scoped preferences:** Some preferences (e.g., "always run tests before commit") might apply per-worktree.
- **Panoramic status:** "Show me everything happening across all my worktrees for this repo" — a compound view of sessions, active insights, recent events.
- **Worktree coordination signals:** "Worktree A is modifying src/db/sessions.ts — worktree B should know before touching the same file." (This is speculative but interesting.)

## Why This Matters

Squad creates a worktree per issue. That means Cairn's normal operating environment is multi-worktree. If sessions collide, Cairn's intelligence is corrupted at the source — every downstream capability (insights, prescriptions, MCP queries) is built on garbage data. Getting session isolation right isn't a nice-to-have; it's a correctness requirement for the entire knowledge pipeline.

The cross-worktree intelligence is the platform play: Cairn already has a shared knowledge.db. Making the MCP tools worktree-aware means an agent in worktree B can ask "what happened in worktree A?" That's intelligence that no other tool provides.

## Impact

- **Sessions table:** Schema change (migration)
- **All session lookup paths:** Must pass workdir
- **Hook entry points:** Must resolve workdir from git
- **MCP tools:** Enhanced context in responses
- **Backward compatibility:** Existing sessions with NULL workdir continue to work; new sessions always have workdir
