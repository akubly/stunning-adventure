# ADR-0024: Explicit L3.5 Scheduler Tier

**Status:** Accepted — 2026-06-28 by Aaron
**Author:** Gabriel (Infrastructure / Router owner, §5)
**Date:** 2026-06-28
**CTD Anchor:** §5.A — Scheduler Tier Boundary (L3.5)

---

## Context

Crucible's layered architecture (L0→L1→L3→L4) processes proposals from multiple concurrent generators through the Router to the Applier. A critical question emerges: **should proposals flow directly from L3 Generators to L4 Router, or should there be an intervening dispatch stage?**

The answer determines whether proposal ordering, fairness, and instruction-trace hazards are solved uniformly or deferred. Three concurrent generators may produce proposals with data dependencies (generator A's output informs generator B's input). If both reach the Router simultaneously, their order affects proposal acceptance, determinism, and replay validity.

Aaron's ruling (Phase 4 design review) mandates the Scheduler remain in v1 — not deferred to v2. This ADR locks the rationale and graduation criteria before Router + Scheduler implementation begins.

---

## Options Considered

### Option 1: Direct L3→L4 Handoff (No Scheduler Tier)

Generators submit proposals directly to the Router. The Router handles ordering and fairness inline via a local dispatch policy.

**Advantages:**
- Simpler layer count (4 vs 5)
- No intermediate state machine
- Router owns all dispatch logic in one component

**Disadvantages:**
- Router conflates policy (what to approve) with dispatch (which proposal to evaluate first)
- Concurrent generator submissions race unsafely; ordering depends on OS thread scheduling
- Replay invariant breaks: same generator sequence may produce different dispatch order on replay (different wall-clock timing)
- No clear contract for back-pressure or fairness; Router becomes bidirectional (proposes-to-Generators)
- Instruction-trace hazards (RAW, WAR, WAW read/write conflicts across generators) invisible until proposal approval

### Option 2: Explicit L3.5 Scheduler Tier (Chosen)

Insert a dedicated Scheduler component between L3 and L4. Generators submit to the Scheduler; the Scheduler orders proposals and emits dispatch events. The Router then evaluates the ordered stream. The Scheduler is:
- **Stateful** (may buffer proposals for fairness)
- **Deterministic** (same input → same output, always)
- **Observable** (dispatch decisions are first-class events in the WAL)

**Advantages:**
- Explicit tier boundary separates concerns: dispatch ordering from policy
- Router policy is decoupled from concurrency management
- Replay invariant is restorable: replay re-submits proposals to Scheduler in recorded order; Scheduler output is byte-identical
- Back-pressure is localized (Scheduler can slow generators, not Router)
- Instruction-trace hazards are visible (causal dependencies between proposals recorded in dispatch events)
- Hardware dispatch analogy clarifies the concept (out-of-order-execution dispatch units in CPUs; same principle for agentic turns)

---

## Decision

Promote scheduler from B-revisit-deferred (Phase 2) to v1 implementation. The Scheduler is an explicit L3.5 tier between L3 Generators and L4 Router.

**v0.5 implementation:** `FifoScheduler` — immediate dispatch (no buffering), satisfies A-Sched-1 (replay-ordering determinism).

**Phase 1 graduation:** `WeightedRoundRobinScheduler` — when A-Sched-2 (back-pressure) and A-Sched-3 (fair dispatch under load) are enabled.

---

## Rationale

### 1. Dispatch Ordering is Orthogonal to Approval Policy

A proposal's admission (Router approval) is independent of its evaluation order. The Router should decide *whether* a proposal is allowed, not *when* it is evaluated relative to others. The Scheduler handles the latter; the Router, the former.

### 2. Replay Determinism Requires Observable Dispatch

In hermetic replay (§11), the WAL records captured outputs for every external call. To achieve byte-equality on re-run, the dispatch order must be **deterministic and replayable** — i.e., recorded in the ledger.

- **FifoScheduler (v0.5):** Dispatches immediately; same proposal sequence always produces identical `scheduler_dispatched` events. No replay drift.
- **Direct L3→L4 without Scheduler:** Ordering depends on OS thread scheduling during replay; output diverges.

### 3. Instruction-Trace Hazards Become Visible

When concurrent generators (e.g., Curator auto-detecting an issue, Forge prescriber analyzing options) emit proposals simultaneously, data dependencies emerge:
- **RAW (Read-After-Write):** Generator B reads output from Generator A's previous proposal
- **WAR (Write-After-Read):** Generator B's proposal overwrites state that Generator A read
- **WAW (Write-After-Write):** Two generators independently propose mutations to the same field

A Scheduler tier makes these dependencies visible (recorded in dispatch order and causal-readset evidence) and enforceable (Router and Applier can check consistency before committing).

### 4. Hardware Dispatch Analogy (Erasmus US-E-13)

Modern CPUs employ out-of-order execution with dispatch units that maintain memory-ordering invariants despite concurrent execution. The Scheduler plays an analogous role:
- **Generators** = execution pipes (concurrent, asynchronous)
- **Scheduler** = dispatch unit (orders and mediates concurrency)
- **Router** = execution pipeline (evaluates, accepts)
- **Applier** = memory system (commits to ledger)

This analogy clarifies why a dispatch tier is necessary and where it belongs.

### 5. Back-Pressure Without Router Coupling

If generators can overload the Router directly, the Router must implement back-pressure (slowing generators). This couples the Router's policy logic with concurrency management, violating separation of concerns.

The Scheduler can buffer proposals and signal back-pressure to generators independently, leaving the Router free to focus on approval policy.

---

## What Changes

### New Components
- **SchedulerPort interface** (§5.A.1, types.ts): `submit(proposal)` and `pending()` methods
- **FifoScheduler implementation** (v0.5, skeleton/fifo-scheduler.ts): Immediate dispatch, A-Sched-1 compliant
- **SchedulerDispatched event type** (§5.A.2, types.ts): First-class WAL row kind for dispatch decisions

### Modified Components
- **L3 ProposalGenerator interface** (§7): Generators submit to Scheduler, not directly to Router
- **L4 Router** (§5): Consumes ordered stream from Scheduler; removed concurrent-submission handling
- **L1 WAL schema** (§3): New row kind `scheduler_dispatched` joins the 5-primitive set for logging dispatch decisions

### Graduation Path
- **Phase 1:** Implement `WeightedRoundRobinScheduler` with:
  - **A-Sched-2 (Back-Pressure):** Quanta-budgeted dispatch with configurable per-generator quotas; return `scheduler_deferred` when quota exhausted
  - **A-Sched-3 (Fair Dispatch Under Load):** Round-robin or weighted-fair queuing to ensure no single generator starves others even under sustained overload

---

## Consequences

### Positive
- **Deterministic replay:** Scheduler tier guarantees byte-identical dispatch stream on replay (A-Sched-1)
- **Observable dispatch:** All dispatch decisions recorded in WAL; auditability and debugging improved
- **Clear separation of concerns:** Router owns approval policy; Scheduler owns dispatch ordering
- **Back-pressure locality:** Generators are throttled by Scheduler, not Router; Router remains focused on policy
- **Extensibility:** Hardware dispatch analogy enables future extensions (e.g., priority-level scheduling, deadline-aware dispatch for time-critical tasks in v1.5+)

### Negative
- **Latency overhead:** Each proposal traverses an additional tier (L3→L3.5→L4); latency budget grows by ~5–10% for the skeleton (FifoScheduler is zero-cost; WeightedRoundRobinScheduler adds dispatch-decision time)
- **WAL volume:** Every `scheduler_dispatched` event is a new row; WAL footprint increases by ~1 event per proposal (acceptable; bounded)
- **Complexity:** One more state machine to verify (Scheduler lifecycle, replay of dispatch state)

### Trade-Offs
- The latency cost is acceptable in v0/v1 (single-user, single-session); v2+ multi-agent scenarios may require Scheduler sharding or pipelining
- The WAL volume is acceptable because dispatch events are lightweight (5 fields) and essential for replay determinism

---

## Acceptance Signals

**A-Sched-1 (Replay-Ordering Determinism):**
- Conformance test: FifoScheduler unit tests verify that identical proposal sequences produce identical `scheduler_dispatched` streams across 100+ replay runs
- Integration test: Replay of a recorded session reproduces the exact dispatch event stream (byte-for-byte)
- No divergence in `scheduler_dispatched` row offsets, timestamps, or field values

**A-Sched-2 (Back-Pressure) — Phase 1 Graduation Gate:**
- WeightedRoundRobinScheduler implements per-generator quanta budgets
- Conformance test: Overloaded generator triggers `scheduler_deferred` after quanta exhaustion
- Integration test: Router receives proposals in fairness-compliant order even under 10:1 generator load ratio

**A-Sched-3 (Fair Dispatch Under Load) — Phase 1 Graduation Gate:**
- WeightedRoundRobinScheduler ensures no single generator starves others
- Conformance test: Starvation test verifies that all active generators make progress within a bounded number of turns (e.g., max 50:1 turn ratio between any two generators)
- Leaderboard confirms that fast generators don't prevent slow ones from dispatching

**Contract-Tier Signals:**
- `SchedulerPort.submit()` always returns a `SchedulerEvent` synchronously (no async dispatch decisions that would require Router polling)
- `pending()` returns accurate queue depth even under concurrent proposal submission
- Scheduler state is fully replayable from recorded `scheduler_dispatched` events

**Invariant Signals:**
- Dispatch-order invariant: proposals appear in the WAL in the order the Scheduler emitted them (Scheduler ordering ⇒ WAL ordering)
- Determinism invariant: same proposal log replayed from offset 0 produces identical Scheduler output (tested via `ReplayEngine.replay()` with replay divergence classification `scheduler_dispatch`)

**Countersignals (What Breaks If Violated):**
- If Scheduler is removed and L3→L4 direct submission is restored, replay diverges (order dependent on OS scheduling)
- If Scheduler dispatch events are not recorded in WAL, replay verification cannot assert ordering correctness
- If Scheduler is asynchronous (returns events later, not synchronously), the Applier may commit proposals in an order different from Scheduler emission order, breaking replay

---

## Security Implications

**Instruction-Trace Integrity (Medium Confidence):**
- The Scheduler records dispatch order as first-class WAL events. This enables detection of instruction-trace anomalies (e.g., a proposal approved out of order could be flagged as a data-dependency violation if causal-readset evidence contradicts dispatch order).
- Proposal ordering is **not a trust-tier enforcement point** (the Router handles trust; the Scheduler handles order), so the Scheduler tier does not directly mitigate trust-tier bypass. However, it does provide forensic visibility (audit logs will show dispatch order, enabling post-incident analysis).

**Denial-of-Service (Back-Pressure):**
- FifoScheduler (v0.5) offers no back-pressure; a runaway generator filling the queue indefinitely could exhaust memory. This is acceptable in v0.5 (walking skeleton, single-user); v1 mandates A-Sched-2 back-pressure as a security gate.
- WeightedRoundRobinScheduler (Phase 1) implements per-generator quanta budgets; generators that exceed their budget are deferred, mitigating resource exhaustion.

---

## Resolved Questions

1. **Q: Why not defer the Scheduler to Phase 2 (v1.5)?**
   **A:** Aaron's ruling (Phase 4 design review): "Dispatch contract must be argued before Router + Scheduler code begins." Deferring the Scheduler would require Router code to implement inline dispatch ordering, then refactoring Router when the Scheduler arrives. Upfront clarity prevents rework.

2. **Q: Doesn't FifoScheduler's zero-buffering make the whole tier pointless?**
   **A:** No. FifoScheduler is the v0.5 skeleton that proves the L3.5 tier boundary exists and is observable. It satisfies A-Sched-1 (deterministic replay). Phase 1 graduates to WeightedRoundRobinScheduler (A-Sched-2/3), at which point the tier demonstrates its full value (back-pressure, fairness). The tier itself is load-bearing; the v0.5 implementation is minimal.

3. **Q: What about A-Sched-2 and A-Sched-3? They're not in the skeleton.**
   **A:** Correct. A-Sched-1 (replay determinism) is the v0.5 gate. A-Sched-2 (back-pressure) and A-Sched-3 (fair dispatch) are Phase 1 graduation criteria. This ADR documents all three so the graduation path is locked before implementation diverges.

4. **Q: If Scheduler events are recorded in the WAL, doesn't that double the WAL volume?**
   **A:** Scheduler events add ~1 row per proposal submitted. Proposal volume is O(generator count × turns), not exponential. WAL footprint grows acceptably (e.g., 3 proposals per turn × 100 turns = 300 `scheduler_dispatched` rows, each ~50 bytes = 15 KB). Acceptable for v0/v1.

5. **Q: How does the Scheduler tier interact with the Hook Bus and Aperture?**
   **A:** The Scheduler sits between Generators (L3) and Router (L4); it does not consume Hook Bus verdicts and does not emit to Aperture. Hook Bus integration is L4 (Router policy), not L3.5 (Scheduler ordering). This remains orthogonal.

6. **Q: Can the Scheduler be stateless (like FifoScheduler), or must it be stateful?**
   **A:** FifoScheduler is stateless (immediate dispatch, no queue). WeightedRoundRobinScheduler is stateful (maintains proposal queue + quanta ledger). Both are valid implementations of SchedulerPort. The tier is an abstraction; the implementation varies by version.
