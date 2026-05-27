# UX & Human Factors — Eureka v1

**Status:** v1 (Aaron R8 session-identity unification)  
**Author:** Valanice (UX / Human Factors)  
**Date:** 2026-05-26  
**Audience:** Implementers, agent authors, human operators  

---

## Purpose

This document catalogs every human-facing surface in Eureka, quantifies the attention budget, and establishes friction points where **benefit must justify cost**. Eureka is primarily a **runtime brain** consumed by agents, but humans read outputs, approve commits, adjust trust, interpret failure states, and reconcile divergence. Each interaction either compounds learning or trains humans to skip it.

Ground rule: **No interaction design survives contact with a tired, distracted, impatient human** unless it's silent, instantly valuable, or undoable.

---

## 1. Human Touchpoint Inventory

### 1.1 Review / Approval Touchpoints

These block agent progress until a human responds.

| Touchpoint | Trigger | User Sees | Action Required | Skippable? | v1 Status |
|---|---|---|---|---|---|
| **Commit approval** (`commit`) | Agent calls `commit(fact)` to hot-pin a fact for guaranteed surfacing | Fact content, provenance (`sources[]`), trust score, tier | Approve / Reject / Defer | Yes — defer = no-op, agent continues | **v1** |
| **Tier promotion (future)** | Agent wants to promote an agent-tier fact to user/project tier | Fact content, current tier, proposed tier, reason | Approve / Reject | Yes — rejection leaves fact in current tier | **v1.5** (user/project tiers deferred) |
| **Cross-tier PII warning** | Agent attempts to write user-PII-like content to project tier | Flagged content, allowlist violation | Approve override / Reject write | No — blocks write pending human decision | **v1.5** (PII scanning deferred) |

**Attention budget:** v1 = **~1 approval prompt per session** (commit only; tier promotion deferred). Approval friction is acceptable *because* the alternative is silent auto-commit that trains agents to overpromise. Humans must see what gets pinned.

---

### 1.2 Query / Pull Touchpoints

These are human-initiated; the system responds on demand.

| Touchpoint | Invocation | Output | Typical Frequency | v1 Status |
|---|---|---|---|---|
| **Recall query** (`recall`) | Agent or human calls `recall(query, opts?)` | Lightweight handles (id, kind, summary, score, trust); full content on demand via `getFact(id)` | Per-task (agents); rare (humans) | **v1** |
| **Commitment list** | Human calls `list_active_commitments(scope)` | All `committed=true` facts in a tier, sorted by importance | Weekly (operators); rare (agents) | **v1.5** |
| **Session continuity summary** | Agent resumes a session, calls `recall` with session context | 3-bullet summary of "where I left off" (US-2) | Every multi-session task | **v1** |
| **Trust inspection** | Human inspects a fact's `trust` score and `time_since_last_verification` | Scalar 0..1, last-verified timestamp, `stale_trust` flag | On-demand debugging only | **v1** |
| **Bridge ledger audit** | Human calls `eureka reconcile --against <cairn-db-path>` | Diff report: {emit succeeded but sink missing, sink present but no ledger entry, consistent} | Monthly (operators); never (agents) | **v1** |
| **Decision provenance** | Human asks "why did the agent choose X?" | `DecisionPayload` with options, rationales, `input_trust_min`, `reasoning_confidence`, superseded-by chain | Post-incident only | **v1** |

**Attention budget:** v1 = **zero proactive prompts** from these surfaces. All pull-based. A human operator might invoke `reconcile` once a month; agents never do. Recall is the only high-frequency pull surface, and it's progressive disclosure (handles first, content on demand).

---

### 1.3 Plasticity / Mutation Touchpoints

These notify the human when memory is about to change or has changed.

| Touchpoint | Trigger | User Sees | UX Pattern | v1 Status |
|---|---|---|---|---|
| **Trust adjustment** | Agent calls `updateTrust(factId, event)` where event = verification / contradiction / contemplate outcome | New trust value, event type, principal who triggered it | **Silent** — logged, not prompted | **v1** |
| **Tier demotion** | Sweep demotes a fact from hot → warm or warm → cold per session-count hysteresis | (Nothing — sweep is background) | **Silent** — no human notification | **v1** |
| **Edge creation** | Sweep or eager write populates Tier 2 edges (`similar_to`, `co_accessed_with`) | (Nothing) | **Silent** | **v1** |
| **Stale flag emission** | Sweep emits `stale_trust` or `stale_aspiration` flag on a fact | Flag visible on next recall/inspection | **Passive indicator** — no prompt, surfaces in UI/CLI only when human queries the fact | **v1** |
| **Retire confirmation** | Human explicitly calls `retire(factId)` to release a commitment | Fact content, current importance/trust | **Explicit only** — no auto-retire in v1 | **v1** |
| **Evict confirmation** | Human explicitly calls `evict(factId)` to hard-delete a fact | Fact content, all edges referencing it | **Explicit only** — no auto-eviction in v1 | **v1** |

**Attention budget:** v1 = **zero proactive plasticity prompts**. All mutations are either silent (trust, tiers, edges) or explicit-only (retire, evict). Stale flags are passive indicators, not interruptions.

**Anti-pattern avoided:** "Your fact trust dropped from 0.7 to 0.65 — do you want to review it?" This trains humans to click "OK" reflexively. v1 does not prompt on drift; sweep mutations are trusted to run in the background.

---

### 1.4 Tier-Switching / Scope Touchpoints

How the human controls which tier a query fans out to.

| Touchpoint | Mechanism | User Sees | Default Behavior | v1 Status |
|---|---|---|---|---|
| **Fan-out tier control** | `recall(query, { tiers: ['agent'] })` or `{ tiers: ['agent', 'user', 'project'] }` | Results annotated with `scope` field (which tier each fact came from) | **Auto fan-out:** agent → user → project, early-exit at k=10 | **v1** (user/project stubs return empty sets) |
| **Write tier enforcement** | `integrate(fact, { scope: 'agent' \| 'user' \| 'project' })` | Write succeeds or throws `NotImplementedError('user-tier deferred to v1.5')` | Agent tier is default; user/project throws in v1 | **v1** (schema/API present, stubs only) |
| **Tier visibility toggle (future)** | CLI flag `--tier user` or config `{ default_tiers: ['agent', 'user'] }` | Recall results filtered to specified tiers | Agent tier only | **v1.5** |

**Attention budget:** v1 = **zero tier-switching prompts**. Fan-out is automatic. Humans only see tier labels in recall results when they ask. The default (agent tier only) serves 95% of v1 use cases (US-1, US-2 both agent-scoped).

**Design constraint:** Multi-tier fan-out in v1.5 must NOT prompt "which tier do you want to search?" on every query — that's a death sentence for adoption. The right pattern is **auto fan-out with tier annotation**, so humans can retrospectively filter if needed.

---

### 1.5 Activity Observability Touchpoints

When `meditate` (v1.5) or `contemplate` (v1.5) runs, does the human know?

| Activity | Visibility | Human Notification | Rationale | v1 Status |
|---|---|---|---|---|
| **Sweep** | Background, triggered end-of-session or first-query-of-day | None — silent | Maintenance activity; no value in notifying humans unless it crashes | **v1** |
| **Meditate** | Broad, shallow reflection sweep | TBD — likely silent with optional `--verbose` flag | v1.5 design pass will decide; default should be silent | **v1.5** (reserved vocab, not exported) |
| **Contemplate** | Narrow, deep reflection; trust refinement | TBD — likely surfaces a "reconsidered N facts" summary post-run | v1.5 design pass will decide; output is informational, not approval-seeking | **v1.5** (reserved vocab, not exported) |

**Attention budget:** v1 = **zero activity notifications**. Sweep is invisible. v1.5 contemplative activities (meditate, contemplate) should default to silent unless the human explicitly opts into observability (`--verbose`, debug mode).

**Anti-pattern avoided:** "Eureka is now meditating..." progress spinners that train humans to perceive the system as slow. If an activity takes >5 seconds, it should run async in the background, not block and notify.

---

## 2. Trust UX — Provenance & Override

### 2.1 How Trust is Surfaced

**Trust** is a 0..1 scalar on every fact, representing **provenance reliability** (not epistemic confidence). Humans see trust in three contexts:

1. **Recall results** — each fact handle includes `trust` field
2. **Decision payloads** — `input_trust_min` shows the weakest provenance link among recalled facts that informed the decision
3. **Inspection** — `getFact(id)` returns full metadata including trust, last-verified timestamp, `stale_trust` flag

**Indicators:**
- `trust ≥ 0.8` → high provenance reliability (verified source, multiple confirmations)
- `trust 0.5–0.8` → medium (derived or single-confirmation)
- `trust 0.15–0.5` → low (speculative, unconfirmed)
- `trust < 0.15` → **excluded from recall results** (trust floor; configurable)

**Provenance disclosure:**
- Every fact carries `sources[]` (file paths, URLs, prior fact IDs)
- Every fact carries `metadata.principal_id` (who wrote it)
- Every fact carries `created_at` / `updated_at` timestamps

**v1 constraint:** Trust is event-driven (FR-3). It mutates on verification, contradiction, contemplate outcomes — NOT on time decay. Time-based decay is tracked via `time_since_last_verification` (derived field) but does not automatically decrement trust.

### 2.2 When the Human Overrides

Trust overrides are **explicit-only** in v1:

- `updateTrust(factId, { event: 'manual_verification', principal_id: 'human:aaron' })` — human confirms a fact, boosts trust
- `updateTrust(factId, { event: 'manual_contradiction', principal_id: 'human:aaron' })` — human rejects a fact, drops trust
- `evict(factId)` — nuclear option, hard-delete

**No implicit overrides.** A human dismissing a recall result does NOT decrement trust automatically. Dismissal is a query-time filter, not a memory mutation.

**Anti-pattern avoided:** "This fact has low trust — delete it?" Trust below the floor is already excluded from recall; prompting to delete trains humans to click "yes" without reading. v1 never auto-suggests eviction.

---

## 3. Failure Modes — Empty States & Low Trust

### 3.1 What the Human Sees When Recall Returns Nothing

**Scenario 1: No facts match the query**

- **CLI output:** `No results found for query "authentication patterns". Try a broader query or check your tier scope.`
- **Agent-facing return:** `{ results: [], metadata: { query, tiers_searched: ['agent'], trust_floor: 0.15 } }`
- **Implication:** This is a **normal outcome** in v1 (BM25 lexical recall misses keyword-disjoint queries; see FR-2 honest failure mode). Not an error, not worth alarming the human.

**Scenario 2: All matching facts below trust floor**

- **CLI output:** `Found 3 facts matching "authentication patterns", but all have trust < 0.15 (excluded). Run with --include-low-trust to see them.`
- **Agent-facing return:** `{ results: [], metadata: { excluded_by_trust_floor: 3, trust_floor: 0.15 } }`
- **Implication:** Recall is working correctly; the facts exist but are not reliable enough to surface. Humans should NOT see this often (low-trust facts should be rare in a healthy knowledge base). If this happens frequently, it signals a trust-calibration problem (agents are writing speculative junk).

**Scenario 3: Session continuity failure (US-2)**

- **Agent resumes a session, calls `recall` with session context, gets zero results**
- **Root cause:** Prior session ended without `remember()` or `flushHints()` call (AC-2.5 caller-cooperation contract)
- **CLI output:** `No prior knowledge for session <uuid>. This session may not have been captured. See telemetry counter 'eureka_sessions_ended_without_flush_total'.`
- **Implication:** v1 does not guarantee cross-session continuity without caller cooperation. This is a **documented contract gap**, not a bug. v1.5 may add auto-capture at session-close (pending observed usage patterns).

**Anti-pattern avoided:** Surfacing empty-state messaging that blames the human ("You didn't provide enough context") or the system ("Recall failed"). v1 empty states are **factual and actionable** ("No results; try X" or "Results excluded by trust floor; flag Y to override").

### 3.2 What the Human Sees When Trust is Too Low

**Scenario:** Agent makes a decision, surfaces `input_trust_min = 0.2` (very low provenance reliability on the recalled facts).

**Expected behavior:**
- Decision payload includes `input_trust_min` field (visible in audit, in decision inspection)
- **No automatic block or warning in v1** — the agent is allowed to make decisions based on low-trust facts. Trust is a signal, not a gate.
- A human reviewing the decision post-hoc can see `input_trust_min = 0.2` and interpret accordingly.

**v1.5 opportunity:** Add a configurable `min_trust_gate` option to `decide()` — if `input_trust_min < threshold`, the decision is flagged for human approval before commit. This is a **domain-specific safety rail**, not a universal default (some domains tolerate low-trust decisions; others don't).

---

## 4. Personalization — Per-User Preferences

v1 does **not** ship a personalization layer. All humans see the same default behavior:

- Trust floor = 0.15
- Recall limit k = 10
- Fan-out order = agent → user → project
- Tier demotions = session-count hysteresis (N/M tunable in config, not per-user)

**v1.5 personalization surface (proposed):**

```typescript
interface UserPreferences {
  trust_floor?: number;             // override default 0.15
  recall_limit?: number;             // override default k=10
  default_tiers?: Tier[];           // override auto fan-out
  verbosity?: 'silent' | 'summary' | 'verbose';  // control activity notifications
  commit_auto_approve?: boolean;    // skip commit approval prompts (power-user mode)
}
```

Stored in `~/.copilot/eureka/user-preferences.json`. Agents can query preferences via `getUserPreferences()` to adapt their surfacing behavior.

**Rationale for deferral:** v1 has one dogfooder (Aaron). Personalization adds implementation complexity (per-user config storage, validation, merging with defaults) without observed need. v1.5 ships preferences once multiple users stress-test the defaults and identify friction points.

---

## 5. Anti-Patterns to Avoid

These patterns train humans to skip everything:

### 5.1 Over-Prompting

**Anti-pattern:** "Trust for fact X dropped from 0.7 to 0.65. Review? [Y/n]"

**Why it fails:** Humans habituate to low-value prompts and click through reflexively. Trust drift is a continuous process; prompting on every mutation is a DDoS attack on attention.

**v1 mitigation:** Trust mutations are silent. Stale flags are passive indicators, not interruptions.

---

### 5.2 Surfacing Low-Confidence Outputs Without Context

**Anti-pattern:** "Eureka found 5 facts (trust scores: 0.2, 0.3, 0.2, 0.4, 0.3). Use them?"

**Why it fails:** A list of low-trust facts without provenance disclosure is useless. The human cannot judge whether 0.2 trust is "speculative but plausible" or "hallucinated junk."

**v1 mitigation:** Every fact handle includes `sources[]`, `metadata.principal_id`, `created_at`. Recall results are **self-documenting** — a human can trace provenance without a second query.

---

### 5.3 Blocking on Non-Blocking Decisions

**Anti-pattern:** "Sweep wants to demote fact X from hot to warm. Approve? [Y/n]"

**Why it fails:** Tier demotions are reversible (access boosts a fact back to hot). Blocking on them trains humans to perceive the system as bureaucratic.

**v1 mitigation:** Tier demotions are silent. Humans can inspect tier assignments post-hoc if curious, but they're never prompted mid-sweep.

---

### 5.4 Invisible Failure Modes

**Anti-pattern:** Recall returns empty results, CLI prints nothing, agent proceeds with no knowledge base. Human has no idea why the system failed.

**Why it fails:** Silent failure trains humans to distrust the system ("Eureka randomly stops working").

**v1 mitigation:** Empty-state messaging is factual and actionable (see §3.1). If recall returns zero results, the CLI explains why (no matching facts, tier scope, trust floor) and suggests remediation.

---

## 6. Crucible UX Overlap

Eureka and Crucible (D:\git\harness) share human surfaces at **session boundaries** and **decision provenance**. This section identifies the seam without duplicating Crucible docs.

### 6.1 Session Lifecycle Seam

**Crucible owns:**
- Operational session lifecycle (start, fork, snapshot, replay)
- Session metadata (repo, branch, timing, status)
- WAL (append-only log of every tool call, prompt, response)

**Eureka owns:**
- Epistemological session artifacts (`kind=session` facts: "what I learned during session X")
- Cross-session continuity (3-bullet summary, checkpoint recall)

**Shared identifier:** `SessionId` brand from `@akubly/types` (Copilot CLI session UUID). Both systems reference the same session; no runtime cross-DB queries.

**Human touchpoint:** A human browsing Crucible's session history (`crucible list-sessions`) sees operational metadata. A human querying Eureka (`recall` with session context) sees learned knowledge. The two views are **complementary, not redundant** — Crucible answers "what happened?", Eureka answers "what did I learn?"

**UX implication:** Humans should NOT need to reconcile these manually in v1 (both systems auto-link via shared `session_id`). A future UI (v1.5+) might surface "Session X: 47 tool calls (Crucible) + 12 learned facts (Eureka)" in a unified view, but v1 keeps them separate.

---

### 6.2 Decision Provenance Seam

**Crucible (via Forge) owns:**
- Audit sink for all decisions (Path 1: Eureka → Forge via `toDecisionRecord()`; Path 2: in-flow captures)
- Flat audit records (`DecisionRecord`: question, chosenOption, alternatives, confidence enum, source, timestamp)

**Eureka owns:**
- Structured deliberation (Path 1: `decide()` with full graph reasoning)
- Learning ingestion (Path 2: `fromDecisionRecord()` consumes Forge audit as learning patterns)

**Human touchpoint:** A human asking "why did the agent choose X?" queries **Eureka** for the full `DecisionPayload` (options, rationales, trust scores, superseded-by chain). A human asking "was this decision logged in the audit trail?" queries **Crucible** (or Forge directly) for the `DecisionRecord`.

**UX implication:** These are **two lenses on the same decision**, not duplicates. Eureka is the "reasoning view" (why this option over alternatives?); Crucible is the "compliance view" (was it logged, who made it, when?). A human operator debugging a decision should check both — Eureka for reasoning depth, Crucible for audit integrity.

**Cross-reference:** See `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` §1.1 for full overlap analysis.

---

## 7. Open Questions — Friction Levels Requiring Evidence

These are UX decisions deferred to v1.5+ pending observed human behavior in v1 dogfood.

### 7.1 Commit Approval Frequency

**Question:** Is "~1 approval per session" (v1 target) the right friction level, or should commits be auto-approved by default with opt-in prompts?

**Evidence needed:**
- Telemetry: How often do agents call `commit()` per session? (If it's 10+/session, approval friction is too high.)
- Rejection rate: What % of commit prompts does Aaron reject? (If <5%, approval is friction without benefit.)
- False-positive cost: When Aaron rejects a commit, was it because the fact was wrong, or because he didn't want it pinned?

**Decision gate:** After 10 dogfood sessions (enough to measure rejection rate), revisit the default. If rejection rate <10%, flip to auto-approve with opt-in review.

---

### 7.2 Tier-Switching Observability

**Question:** When recall fans out to multiple tiers, should the CLI always show "Searched: agent, user, project" or only show it if results span multiple tiers?

**Evidence needed:**
- Cognitive load test: Does seeing "Searched: agent" on every query train humans to ignore the annotation?
- Tier-source confusion: How often does Aaron ask "which tier did this fact come from?" without checking the `scope` field?

**Decision gate:** If tier-source questions are rare (<5% of queries), annotation can be silent (only surfaced in verbose mode). If frequent, make tier source prominent.

---

### 7.3 Empty-State Actionability

**Question:** When recall returns zero results, should the CLI suggest remediation actions ("Try a broader query", "Check --tier flag") or just state the outcome?

**Evidence needed:**
- Follow-up query rate: After an empty result, does Aaron refine the query (suggesting he understood the failure mode) or give up (suggesting the message was opaque)?
- Remediation success: When Aaron follows a suggestion ("try broader query"), does the next query succeed?

**Decision gate:** If follow-up success rate <50%, the remediation suggestions are noise. If >70%, they're valuable.

---

### 7.4 Contemplative Activity Verbosity

**Question:** When `contemplate` (v1.5) runs, should it default to silent or surface a "Reconsidered N facts, updated M trust scores" summary?

**Evidence needed:**
- Post-contemplate confusion: Does Aaron ever ask "did Eureka run contemplate?" without checking logs?
- Summary value: When a summary is shown, does Aaron act on it (inspect the updated facts) or ignore it?

**Decision gate:** If summaries are ignored >80% of the time, default to silent. If acted upon >50%, default to summary.

---

## 8. Summary — Designing for Tired Humans

Eureka's human surfaces follow three principles:

1. **Silent by default.** Sweep, trust mutations, tier demotions happen in the background. Humans are notified only when their decision is required (commit approval) or when they pull (recall, reconcile).

2. **Progressive disclosure.** Recall returns lightweight handles; full content on demand. Empty states explain why, not just what.

3. **Friction must justify itself.** v1 has one approval prompt (commit). Every additional prompt in v1.5+ must pass the "rejection rate" test — if humans reject <10%, the prompt is friction without benefit.

The worst UX is one that **trains humans to skip everything**. v1 avoids this by defaulting to silent automation, surfacing only the signals that matter, and making outputs self-documenting (provenance, tier, trust) so humans can audit without a second query.

---

## Appendix A — Crucible Cross-Reference

For full Crucible ↔ Eureka overlap analysis, see:
- `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` (§1 mission overlap, §2 dependency direction, §3 shared packages)

Key takeaway: Crucible is the "what happened" system; Eureka is the "what I learned" system. The human sees both lenses, but never needs to reconcile them manually (shared `SessionId` auto-links).

---

## Appendix B — Persona Touchpoints (for v1.5 Persona Review)

When Eureka integrates with persona-review (`.squad/skills/persona-review/`), humans will see:

- **Design Panel findings** on plasticity UX (is trust adjustment too aggressive? are tier demotions observable enough?)
- **Skeptic Panel findings** on empty-state messaging (is "no results" sufficiently actionable?)
- **Pragmatist Panel findings** on approval friction (is commit approval the right gate, or should it be opt-in?)

These findings will inform v1.5 friction-level decisions (§7 open questions).
