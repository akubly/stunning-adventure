# §18 — Security & Permissions

**Status:** FINAL (Phase 3, Lane Sec). Authoritative; do not re-litigate locked decisions.
**Owner:** Gabriel (Infrastructure / Router / Observability).
**Secondary:** Graham (policy architecture).
**Cross-refs:** §4 (Hook Bus safety floor), §5 (Router policy enforcement), §6.7 (Trust-Tier Monotonicity invariant), §7 (trust-tier attribution + adapter lifecycle), §9 (Aperture surfacing of denials), §17 (`capability-denied` event).
**Depth budget:** ≤1 page.

Crucible v1 is **solo-user, self-audit**. The user is the operator, the developer, and the only principal. Security in v1 is therefore not adversarial — it is **accident containment**: bounding the blast radius of agent misbehavior, buggy plugins, and poorly-specified prescriptions. The hook bus (§4) is the real-time safety floor; the Router (§5) is the policy enforcement point; the trust-tier dimension (§7.4) is the discrimination axis. Marketplace governance, multi-user authz, secret redaction, and supply-chain attestation are all explicitly out of scope for v1 (§18.4).

## 18.1 Threat Model Summary

**Trust boundary:** the single user owns the machine, the ledger, the plugin registry, and the policy table. Everything inside the boundary is cooperating-but-fallible. Everything outside (LLM providers, MCP tools, registries, network) is reached through L0 adapters whose outputs are captured-and-replayed (§11), never re-executed.

**In-scope threats (v1):**

| #   | Threat                                                                                  | Mitigation                                                                                       |
|-----|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| T1  | A misbehaving agent emits a destructive proposal (rm-rf, schema drop)                   | Hook Bus `pause` verdict on `(primitiveKind, subKind)` match (§4); Router default-deny (§5.1)    |
| T2  | A buggy plugin emits high-volume garbage Observations                                   | `external` tier default-sandbox; observe-queue bounded + sampled (§4.5)                          |
| T3  | A plugin self-promotes its trust tier in its emitted primitives                         | Registry-stamped `trustTier` is authoritative (§7.4); divergence = structural error              |
| T4  | A structural change (schema, plugin swap) lands without user awareness                  | Router classifies → `RouterPaused` for every `dependentPaths[]` member; Aperture `attention` push (§5.8, §9.5) |
| T5  | A predicate runs too long and blocks the WAL commit                                     | 80 µs per-row hard cap; fail-open with `predicate_timeout` Observation (§4.3)                    |
| T6  | A replay yields a different decision than the original (hidden control-plane drift)    | No live policy reload (§5.5); policy mutations go through the same ledger; replay-equivalence oracle (§11.6) |
| T7  | A compromised L0 adapter forges Observations attributed to a higher tier                | Tier is stamped by the registry, not the adapter (§7.4); CoI rule defaults self-authored adapters to `external` |
| T8  | A revert (compensating Decision) is conflated with the original being undone           | Compensating Decision is its own row (§8.7); causal lineage is explicit, not destructive         |

**Out of scope (v1, explicitly deferred):**

| #   | Out-of-scope                                                                    | Deferred to | Rationale                                                                              |
|-----|---------------------------------------------------------------------------------|-------------|----------------------------------------------------------------------------------------|
| O1  | Multi-user authentication / per-user authz                                       | v1.5+       | Single-principal model; no shared installation in v1                                   |
| O2  | Secret redaction at capture time                                                 | v1.5+       | Tension #6 — captured Observations may contain secrets; see §18.4                      |
| O3  | Sigstore / supply-chain attestation on plugin manifests                          | v2+         | `external` tier sandbox is sufficient for solo-user "I trust myself" posture           |
| O4  | Marketplace governance (publish/review/revoke workflows)                         | v1.5+       | See §18.4 (Tension #6 deferral); v1 trust comes from user-driven `crucible plugin adopt` |
| O5  | Cross-session memory access control                                              | v2+         | Cross-session queries already content-addressed and tier-stamped per §7.4              |
| O6  | Network egress policy at the runtime layer                                       | v1.5+       | L0 adapters are the egress points; v1 sandbox is process-boundary, not network-layer   |

## 18.2 Policy Defaults Table (Router v1)

The Router (§5.1) ships with the following default `PolicyRow` set. Default-deny applies to any `(kind, tier)` pair not enumerated below (resolves to `escalate` for data, `pause-dependents` for structural). Per §5.1 Round 2.3 lock, the default-most-restrictive ordering is `external > community > adopted > builtin`.

| Trust tier   | Data proposals (DataProposalGenerator)                        | Structural proposals (StructuralProposalGenerator)             | Hook-Bus pause floor               |
|--------------|---------------------------------------------------------------|----------------------------------------------------------------|------------------------------------|
| `builtin`    | auto-approve                                                  | escalate (always; structural never auto-approves)              | Veto on registered destructive predicates (§4) |
| `adopted`    | auto-approve                                                  | escalate                                                       | Same as builtin                    |
| `community`  | escalate                                                      | pause-dependents (default; user ack required)                  | Same as builtin                    |
| `external`   | sandbox; escalate if confidence < 0.9; pause if dependent     | pause-dependents (always)                                      | Same + extra default `pause` on `Decision.subKind ∈ {policy-install, plugin-swap, schema-change}` |

**TDD-Q7 zero-tolerance gates** (`mock-drift`, `replay-equivalence-failure`, monotonic-violation) are NOT Router policies — they are §16 CI gates that **block PR merge**, surfaced via §17.1 `ci_gate_failure` events. The Router's policy table governs runtime behavior; CI gates govern the merge boundary; both report through Aperture.

**Tier promotion path** (per §7.4): `external → community → adopted` is gated by explicit user-driven Decisions (`crucible plugin adopt <id>`), recorded with `alternatives[]` so the demotion path remains in the ledger. There is no automatic promotion. The §6.7 Trust-Tier Monotonicity invariant prevents mid-session downgrades (which would invalidate prior tier-attributed Decisions).

## 18.3 Plugin Sandboxing Sketch

**v1 isolation = process boundary + capability-passing through the boundary types.** Concretely:

1. **L3 adapters run in the host process** in v1 (Rosella §7.2 lifecycle). They are not isolated by OS process. They ARE isolated by:
   - **Capability scoping.** The `ProposalGeneratorBase.start(ctx)` context (§7.2) exposes only `ReadSetBuilder`, `LedgerWindowReader` (read-only), and `logger`. There is no filesystem, network, or process-spawn capability passed through `ctx`; adapters that need those must reach them via L0 (which captures every call).
   - **Tier-stamped emission.** Every row an adapter emits carries `trustTier` set by the registry (§7.4). Router policy (§18.2) then applies.
   - **Fail-open on crash.** Adapter crashes do not crash the session; they emit `Observation{subKind:'external_input', body:{adapter, phase, error}}` and the host continues (§7.2 lifecycle row "start").
   - **Read-set discipline.** `causalReadSet` is built by the framework, not the adapter; an adapter cannot hide a read by omitting it (§7.3, conformance C-6).

2. **MCP-tool adapters at the L0 boundary** are subprocesses by virtue of MCP being a stdio/socket protocol. The §2 boundary captures every invocation; replay (§11) re-feeds the captured response without re-executing the subprocess.

3. **v1.5+ deferred:** OS-process-level isolation for L3 adapters (separate `child_process` per adapter with capability tokens minted at `register` time), seccomp-style syscall filtering, network egress policy. The `ProposalGeneratorBase` interface is shaped so this is an **additive runtime change** — no breaking change to §7.

The full plugin loader specification (resolution, manifest validation, capability minting) is owned by Rosella's §15 (`@akubly/crucible-plugin-host`) and is intentionally not duplicated here. This section specifies what the Router and Hook Bus assume about plugin behavior; §15 specifies how the host enforces it.

## 18.4 Tension #6 Deferral (Marketplace Governance + Secret Capture)

**Tension #6** (`.squad/decisions.md` "Capture Cost vs Throughput vs Privacy") observes that Observation capture will eventually contain secrets (API keys leaked into LLM responses, tool outputs containing credentials, etc.) and that marketplace plugin publishing, vetting, and revocation workflows require governance. **Both are explicitly deferred to v1.5+** and are out of scope for the v1 CTD.

**v1 stance (Aaron-vetted, decisions.md):** the user is responsible for not piping secrets through agents in v1. The single-user threat model (§18.1) makes this a tractable expectation. The architecture is shaped to accept the v1.5+ work as **additive**, not breaking:

- A **redaction `DataProposalGenerator`** can sit between L0 capture and L1 commit, emitting compensating Observations that replace captured secrets with content-hashed placeholders. This is a new L3 generator + a new policy row in §18.2; no boundary change.
- A **marketplace governance layer** can hang off the `external → community → adopted` promotion path (§7.4) by attaching publish/review/revocation Decisions to manifest installs. Trust tier is already the discrimination axis; the marketplace adds workflow on top.
- A **replay-across-key-rotation policy** can pin the rotation event as a Decision and use the §11 oracle to require explicit user acknowledgment before replaying prefixes that cross the rotation. Replay refusal (§11.7) is the existing mechanism.

Until v1.5 lands, the v1 documentation surface (CLI help, README) MUST warn the user that captured Observations are not redacted and that adopting a plugin grants it data-tier auto-approve. This warning is the v1 security UX for Tension #6.

## 18.5 Acceptance Signals

- **A3** (pre-commit hook veto) — §4 Hook Bus + §18.2 hook-bus pause floor are sufficient.
- **A12** (marketplace extension trust gradient) — §18.2 tier table + §7.4 stamping discipline.
- **§6.7 Trust-Tier Monotonicity** — install-time enforcement on `PolicyRow` (§5.1) + tier-as-attribution (§7.4) + no mid-session downgrade (§18.1 T3).
- **§17 cross-ref** — `capability-denied`, `predicate_timeout`, `monotonic_violation`, `ci_gate_failure` are the observability surfaces this security model relies on; severity (`attention`) is set by §9.3 projector, not by emitters.

No locked decisions are re-litigated. No new open question is surfaced. v1.5+ deferrals are documented as additive paths so the boundary types (§2, §6) remain stable across the security-feature expansion.
