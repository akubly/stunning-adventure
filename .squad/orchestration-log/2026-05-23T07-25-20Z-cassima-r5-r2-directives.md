# Orchestration Log — Eureka R5 Round 2: Directive Arbitration

**Timestamp:** 2026-05-23T07:25:20Z
**Requested by:** Aaron Kubly
**Mode:** Coordinator-led directive capture (no agent spawn)
**Round:** Eureka R5, Round 2

## Context

Cassima's PRD v1 (committed last round as 808a07f, file `cassima-requirements-r5-v1.md`) surfaced 8 PRD-blocking open questions requiring product/scope arbitration before a v2 PRD could be drafted. The coordinator walked Aaron through each question one at a time, capturing his arbitration as a directive in `.squad/decisions/inbox/`.

## Outcome

**8 of 8 blocking questions resolved.** Each resolution is preserved as a separate directive file in `.squad/decisions/inbox/`. Aaron will personally review the inbox; the standard Scribe inbox-merge step was SKIPPED by hard rule.

## Directives captured (in order of walkthrough)

1. **Q3 — Killer demo for v1** → `copilot-directive-r5-q3-killer-demo.md`
   - v1 demo = codebase familiarization + cross-session continuity.
   - The Squad-migration demo is deferred (too ambitious for v1).

2. **Q9 — Sharing topology** → `copilot-directive-r5-q9-sharing-topology.md`
   - Local-first. v1 ships nothing for cross-machine sharing.
   - Each persistence tier gets its own storage path.
   - Sharing/sync to be stress-tested in R6/R7 designs.

3. **Q4 — Importance vs trust** → `copilot-directive-r5-q4-importance-vs-trust.md`
   - Keep them as separate columns. Confirms Cassima's PRD v1 recommendation.

4. **Q5 — Importance: stored or computed** → `copilot-directive-r5-q5-importance-stored.md`
   - Stored column. Updated by an opportunistic-sweep process (not on every access).

5. **Q6 — Scope vs temperature** → `copilot-directive-r5-q6-scope-vs-temperature.md`
   - Two columns: `persistence_tier` + `attention_tier`. Orthogonal concerns.
   - R6 must define transition rules between tiers.

6. **Q7 — Community detection** → `copilot-directive-r5-q7-community-detection.md`
   - Defer algorithm choice to v2.
   - v1 schema must be graph-ready (6 edge types enumerated).
   - Team should brainstorm more edge types before locking schema.

7. **Q8 — Pray / rerank / contemplate semantics** → `copilot-directive-r5-q8-pray-rerank-contemplate.md`
   - Split the overloaded `pray` verb into three distinct verbs: `rerank`, `contemplate`, `pray`.
   - R6 must mandate a clear boundary between `contemplate` and `meditate` (otherwise they collapse together).

8. **Q8b — Decide vs pray** → `copilot-directive-r5-q8b-decide-vs-pray.md`
   - Add `decide` as a fourth distinct verb. Composable with `pray`.
   - `decide` is the deliberation/arbitration step; `pray` is the appeal-to-source step.

## Aaron's reasoning highlights

- **Bias toward shipping** — every deferred-or-now decision went "defer to v2" when v1 wasn't blocked on it (community detection algorithm, sharing topology, Squad migration demo).
- **Schema-first, algorithm-second** — v1 must commit to schema shape so v2 can swap algorithms without migrations (graph-readiness, separate columns for importance/trust, separate tiers for persistence/attention).
- **Vocabulary precision matters** — Aaron pushed back on overloaded verbs (`pray`) and demanded clean separation (`rerank` / `contemplate` / `pray` / `decide`). Naming = thinking.
- **Local-first, not local-only** — v1 ships local; the cloud-sync story is acknowledged as real but stress-tested later, not designed now.

## Next step

Spawn Cassima (round 2) to update the PRD to v2, incorporating all 8 directives. Specifically she must:
- Update R4 arbitration table to reflect Aaron's resolutions (no longer her recommendations).
- Close the 8 questions in the open-questions register.
- Surface any new questions exposed by the resolutions (e.g., R6 transition rules, `contemplate` vs `meditate` boundary, the 6 edge types brainstorm).
- Lock the v1 schema shape per Q6/Q7 guidance.
