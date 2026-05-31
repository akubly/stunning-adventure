# ADR-0006: Router as Single Policy Choke-Point — Shell

**Status:** Accepted — 2026-05-29 by Aaron
**Author:** Gabriel (Router owner, §5); shell by Graham
**Date:** 2026-05-29
**CTD Anchor:** §5 — Router Design (L4)

---

## Context

Crucible's trust model requires a single component that evaluates whether a
proposal may proceed to world-state mutation. Multiple policy-evaluation
points would create bypass paths (a proposal could reach the Applier without
Router approval) and make audit non-trivial (which component made the allow
decision?).

The Router (§5) is the L4 policy choke-point. The Applier (§8) is the
mutation surface. The question: should any other component evaluate policy?

**PA-B3 resolution:** Non-singleton non-dominated prescription sets are policy
decisions, not mutation mechanics. The Router owns the tiebreak policy and
emits either a selected prescription or an escalation verdict. DecisionGate
does not call an independent `tiebreak()` path; it verifies that the
RouterDecision is present, session-pinned, and authorized before the Applier
mutates state.

---

## Options Considered

### Option 1 — Router + Applier both evaluate policy

Applier has its own policy table for approval/rejection or prescription
tiebreaking. Router handles routing only (data vs structural classification).

**Rejected because:** two policy tables means two bypass surfaces. A buggy
Applier policy could approve a proposal the Router would have rejected.
Audit requires inspecting two policy evaluation paths instead of one.

### Option 2 — Router is sole policy choke-point (chosen)

Router evaluates all policy (`auto-approve`, `escalate`, `pause-dependents`,
`sandbox`, `veto`, and non-dominated prescription tiebreaks). Applier is a
pure mutation surface that executes approved proposals. DecisionGate is a thin
rule engine within the Applier that enforces Router-decided policy, not an
independent policy evaluator.

### Option 3 — Distributed policy (per-layer evaluation)

Each layer evaluates its own policy subset. Maximizes autonomy; minimizes
auditability. Rejected as antithetical to the single-principal v1 trust model.

---

## Decision

The Router is the sole place where trust-tier, capability, approval, and
prescription-tiebreak policy is enforced; generators, Applier, DecisionGate,
and SDK never decide policy.

---

## Rationale

- **Audit simplicity.** One policy evaluation point → one place to inspect
  for any allow/deny decision. `crucible why <decision>` traces through one
  Router Decision, not a distributed evaluation chain.
- **Bypass prevention.** If only the Router can approve, every proposal must
  pass through L4. No component below (generators) or alongside (Applier)
  can short-circuit.
- **Trust-tier monotonicity.** §6.7 invariant requires that trust-tier
  attribution is carried, not inferred. A single policy choke-point is the
  natural enforcement site for this invariant.

---

## What Changes

- §5 Router owns the `PolicyRow` table (§5.1), prescription tiebreak policy,
  and all verdict evaluation.
- §8 Applier consumes `RouterDecision` events; its `DecisionGate` enforces
  Router-decided verdicts but does NOT independently evaluate policy.
- No other component reads or writes the policy table.

---

## Consequences

- **Positive:** Single audit trail. Bypass-free by construction.
- **Negative:** Router is a bottleneck for all policy evaluation. Acceptable
  in v1 (single-session, single-user); may need sharding in v2+ multi-session
  scenarios.
- **Trade-off:** Tiebreak changes now flow through Router policy, not Applier
  code. That centralizes auditability at the cost of making Router the explicit
  owner for one more policy axis.

---

## Security Implications

- Policy-bypass is a T1-class threat (§18.1). This ADR is the primary
  mitigation: if only the Router evaluates policy, bypass requires
  compromising the Router itself, not any of the downstream components.
- Session-pinned policy (§5.5, TDD-Q3) prevents mid-session policy
  mutation, eliminating a TOCTOU class of policy-bypass attacks.
