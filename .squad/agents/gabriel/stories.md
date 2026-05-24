# Skillsmith Harness: User Stories (Ops Lens)

## US-Ga-1: Silent Variant Experiments Without Context Bleed
**Story:** As Aaron, I want Alchemist to run N experiment variants in background sub-processes while I work in the active Crucible session, so that I can explore parallel code paths without interruption or token leakage into my main context.

**Ambition:** Alchemist queue persists across cold starts; experiments fail/succeed/queue silently; Mirror surfaces summaries on demand, never blocking. The harness treats active work and background work as separate computational streams with independent sandboxes.

**Chambers touched:** Alchemist, Curator (proposal-only), Mirror, Crucible lifecycle

**Ops/runtime implication:** Runtime must isolate sub-agent process trees, enforce separate token budgets per experiment, and buffer Cairn writes to avoid lock contention with active work.

---

## US-Ga-2: Reconstruct Harness State After Sub-Agent Crash
**Story:** As Aaron, I want to recover my current decision/artifact state after a sub-agent crashes mid-turn, so that I can retry the exact turn or fork into a fresh sub-agent without losing context or repeating prior choices.

**Ambition:** Cairn checkpoint-on-entry means the harness knows the exact *before* state; Mirror holds uncommitted Artifacts; on crash, Crucible replays the turn, offers to retry with a fresh sub-agent or skip that step. No manual state archaeology required.

**Chambers touched:** Cairn (checkpoint durability), Crucible (replay logic), Mirror (uncommitted tracking)

**Ops/runtime implication:** Runtime must Write-Ahead-Log all decision boundaries and maintain a recent artifact buffer; sub-agent crashes must not cascade into ledger corruption.

---

## US-Ga-3: Policy-Enforced Secrets Rotation with Attestation
**Story:** As Aaron, I want the harness to rotate API keys/credentials mid-session when Curator detects a stale or compromised policy, and to verify that all sub-agents see the new credential *before* proceeding, so that I have provable guarantee no leaky secret was passed downstream.

**Ambition:** Secrets are not files—they're versioned Cairn primitives. Curator watches policy events; on rotation, Crucible pauses work, broadcasts new credential to all live sub-agents, collects attestation acks, logs the chain. If any sub-agent refuses or times out, work stays gated.

**Chambers touched:** Cairn (credential versioning), Curator (policy watch), Crucible (gate enforcement), Mirror (audit log)

**Ops/runtime implication:** Runtime must implement a credential injection subsystem with version tracking and sub-agent ack protocol; credentials must never be baked into process env vars.

---

## US-Ga-4: Live Resource & Model Spend Dashboard
**Story:** As Aaron, I want to see real-time CPU, memory, token usage per sub-agent, cumulative spend against a budget, and a forecast of when I'll hit limits, so that I can make go/no-go calls before the harness starves.

**Ambition:** Mirror publishes a live dashboard (push to terminal, web pull option); each Crucible turn logs resource snapshots to Cairn; Forge pre-flight-checks proposed turns against current burn rate. Spend data is queryable, not just loggable.

**Chambers touched:** Mirror, Cairn (metrics ledger), Forge (forecasting), all runtime lifecycle hooks

**Ops/runtime implication:** Runtime must emit structured resource events at turn boundaries and sub-process spawn; metrics collection must not add perceptible latency to decision loops.

---

## US-Ga-5: Replay Session or Variant from Cairn Log
**Story:** As Aaron, I want to replay an entire session or a single Alchemist experiment variant from the Cairn ledger, with the option to branch at any Decision node and re-run downstream with a different choice, so that I can debug harness behavior, audit decisions, or explore counterfactuals.

**Ambition:** Cairn is the single source of truth for replay. Crucible has a `--replay` mode; given a session hash and optional branch-at node, it reconstructs sub-agent prompts, model calls, and Observations verbatim. Branches fork new Cairn logs, not mutations.

**Chambers touched:** Cairn (immutable log + branching), Crucible (replay engine), Alchemist (variant branching)

**Ops/runtime implication:** Runtime must make sub-agent calls idempotent when replayed (same prompt + seed = same output); Cairn must support efficient log slicing for large sessions.

---

## US-Ga-6: Autonomous Rollback of Expensive Bad Decisions
**Story:** As Aaron, I want Curator to detect when a Decision likely produced wasted spend or harmless failure (based on Observation feedback), and to **propose** a rollback—reverting to a checkpoint and re-routing around that choice—so that I can approve and re-run in seconds, not hours.

**Ambition:** This is genuinely aspirational. Curator watches Observations for cost/quality anomalies; if a 50-token question led to a 10k-token dead-end sub-agent task, Curator proposes: "Rewind to [Decision X], skip [sub-agent Y], retry with Forge optimization?" Aaron approves; harness replays checkpoint, takes new path. Learning is captured in Mirror audit.

**Chambers touched:** Curator (anomaly detection), Cairn (checkpoint tree), Mirror (proposal visibility), Forge (reroute scoring)

**Ops/runtime implication:** Runtime must track decision→outcome causality (which Decision fed which Artifact into which sub-agent failure); checkpoints must be cheap enough to keep many.

---

## US-Ga-7: Cross-Harness Artifact Ledger (Squad Collaboration)
**Story:** As Aaron, I want Alchemist variants running in parallel harnesses (e.g., on separate machines or contexts) to share a common Cairn ledger so I can compare results, deduplicate work, and build collective knowledge across squad experiments.

**Ambition:** Cairn becomes a multi-writer log (with versioning and conflict resolution); Mirror aggregates across harnesses. Squad sub-agents in different Crucibles can propose artifacts to a shared ledger and reference prior Observations. Foundation for truly collaborative agentic work.

**Chambers touched:** Cairn (distributed log), Mirror (federation), Alchemist (cross-harness scheduling), Curator (conflict resolution)

**Ops/runtime implication:** Runtime must implement append-only ledger sync (git-like merge semantics for Decision chains); network failures must not corrupt local Cairn snapshots.

---

## US-Ga-8: Cairn Self-Audit via Hash Chaining
**Story:** As Aaron, I want Cairn primitives to be hash-linked (chain of Observation→Decision→Request cryptographic hash) so I can independently verify that my session log has not been tampered with or silently lost, and to quickly detect corruption.

**Ambition:** Lightweight accountability. No Byzantine fault tolerance needed, but Aaron can spot drift. Each Primitive includes a hash of its upstream parent; Mirror can compute and display a "Cairn integrity" checksum. If a log file is corrupted or a sub-agent injects false Observations, hash breaks cleanly.

**Chambers touched:** Cairn (hash structure), Mirror (integrity dashboard)

**Ops/runtime implication:** Runtime must ensure atomicity of Primitive writes with hash computation; hash collisions must never hide data loss (use salting).

---

## US-Ga-9: Credential Leak Detection & Automated Notification
**Story:** As Aaron, I want the harness to scan all Observations and Artifacts for credential-shaped patterns (API keys, tokens, PII), fail hard on detection, and to alert me with the exact context so I can decide whether to rotate or ignore, so that a careless sub-agent output doesn't silently leak secrets.

**Ambition:** Curator runs a passive regex/ML detector on every Observation; on match, work stops, Mirror highlights the leak with line numbers, and Crucible prompts Aaron for action (rotate, log, suppress-and-continue). Zero tolerance for silent leaks.

**Chambers touched:** Curator (detector), Mirror (alert + context), Crucible (gate), Cairn (incident logging)

**Ops/runtime implication:** Runtime must scan before committing to Cairn and before sub-agent dispatch; scanner must not introduce false positives that block legitimate work.

---

## US-Ga-10: Forecast Harness Capability Gaps Before Task Assignment
**Story:** As Aaron, I want Forge to analyze an incoming task Request and forecast whether current sub-agents, models, and credential scopes can complete it, and to surface gaps *before* I assign the work, so that I can prepare missing pieces or choose a different approach upfront.

**Ambition:** Forge becomes a pre-flight advisory. Given a Request, Forge simulates likely decision trees (without running them), estimates token/time/credential requirements, and reports: "This needs Claude 3.5 + GitHub API token. You have Claude 3.0 + no token. Recommendation: skip or prep." Honest about limits, not hype.

**Chambers touched:** Forge, Curator (policy check), Cairn (capability registry), Mirror (forecast display)

**Ops/runtime implication:** Runtime must maintain capability/model/policy registries queryable by Forge; forecasts must complete in <5s or they gum up the Crucible loop.

---

## Summary

**Coverage Checklist:**
- ✅ Background experiment isolation without disruption (US-1)
- ✅ Failure recovery with state reconstruction (US-2)
- ✅ Credentials with policy guardrails + attestation (US-3)
- ✅ Observability: resource/spend dashboard (US-4)
- ✅ Reproducibility: replay + branch (US-5)
- ✅ Aspirational: autonomous rollback (US-6)
- ✅ Squad collaboration via shared ledger (US-7)
- ✅ Audit trail via hash linking (US-8)
- ✅ Credentials with leak detection (US-9)
- ✅ Capability forecasting (US-10)

**Key Themes:**
- Isolation of active vs. background work
- Auditability: Cairn as source of truth
- Recovery: WAL + checkpoints + replay
- Policy binding: secrets as versioned Cairn primitives, never env vars
- Transparency: spend/resource/decision visibility, Mirror never gates

**Phasing Recommendation:**
1. **Immediate (US-2, US-4, US-3):** Recovery, observability, secrets—unlock confidence and safe multi-credential scenarios.
2. **Q2 (US-5, US-1):** Replay debugging force multiplier + Alchemist isolation foundation.
3. **Q3+ (US-6, US-7, US-8, US-10):** Long-horizon innovations—anomaly detection, federation, audit, forecasting.
