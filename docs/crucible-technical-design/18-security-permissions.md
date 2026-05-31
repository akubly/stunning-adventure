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

| #   | Threat                                                                                  | Mitigation                                                                                       | Credibility                                                                                      | Sufficiency                                                                                     |
|-----|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| T1  | A misbehaving agent emits a destructive proposal (rm-rf, schema drop)                   | Hook Bus `pause` verdict on `(primitiveKind, subKind)` match (§4); Router default-deny (§5.1)    | Hook runs pre-commit (§4.3); primitives never written without hook evaluation. Router enforces policy before Applier materializes. | Solo-user knows what commands they registered as destructive. v1 trusts user to configure hooks; no auto-detection of destructiveness. |
| T2  | A buggy plugin emits high-volume garbage Observations                                   | `external` tier default-sandbox; observe-queue bounded + sampled (§4.5)                          | Queue overflow discards oldest, not newest (§4.5 tail-drop policy). Sampled overflow emits `Observation{subKind:'subscriber_drop'}` to ledger. | Volume cap prevents WAL explosion; sampling preserves high-severity signals. v1 does not rate-limit per-plugin; assumes solo-user stops runaway plugins manually. |
| T3  | A plugin self-promotes its trust tier in its emitted primitives                         | Registry-stamped `trustTier` is authoritative (§7.4); divergence = structural error              | Tier stamped by host at `register()` time (§7.2), not read from plugin-emitted payload. Host owns `PluginManifest → trustTier` mapping. | Prevents tier-promotion bugs. Does not prevent user from mis-classifying a plugin at adoption (O4 deferred); v1 trusts solo-user to correctly tier plugins. |
| T4  | A structural change (schema, plugin swap) lands without user awareness                  | Router classifies → `RouterPaused` for every `dependentPaths[]` member; Aperture `attention` push (§5.8, §9.5) | Router reads `dependentPaths` from `StructuralProposalGenerator` contract (§7.A C-8). Aperture polls ledger (§9.3) and pushes attention-tier events to CLI. | Prevents silent structural changes. User must acknowledge via `crucible ack` or accept-at-prompt. v1 does not auto-revert on reject; assumes user inspects and manually rolls back. |
| T5  | A predicate runs too long and blocks the WAL commit                                     | 80 µs per-row hard cap; fail-open with `predicate_timeout` Observation (§4.3)                    | Timeout enforced by §4.3 dispatcher with `Promise.race()` + timeout handle. Timed-out predicate unsubscribed; does not re-run. | 80 µs budget allows ~100 predicates/commit without violating A2 replay SLO. Fail-open means no predicate can block commit indefinitely. |
| T6  | A replay yields a different decision than the original (hidden control-plane drift)    | No live policy reload (§5.5); policy mutations go through the same ledger; replay-equivalence oracle (§11.6) | Policy rows are primitives (§6); policy changes recorded as Decisions. Replay re-feeds policy from ledger, not live config file. | Prevents policy drift. Does not prevent user from manually editing policy file between sessions; assumes solo-user manages config consistently. |
| T7  | A compromised L0 adapter forges Observations attributed to a higher tier                | Tier is stamped by the registry, not the adapter (§7.4); CoI rule defaults self-authored adapters to `external` | Adapter cannot write `trustTier` on emitted rows; registry applies tier at emission boundary (§7.2). L0 adapters are SDK wrappers, not plugin-authored. | Prevents tier forgery by adapters. v1 SDK adapter (§12) is builtin; future adapters default to external until adopted (O4). |
| T8  | A revert (compensating Decision) is conflated with the original being undone           | Compensating Decision is its own row (§8.7); causal lineage is explicit, not destructive         | Ledger is append-only (§6.1 invariant); no row deletion or in-place update. Compensating Decision links to original via `causalParentId`. | Preserves audit trail. Does not auto-rollback side effects; assumes user understands revert semantics (Decision reverts Decision, not underlying file changes). |

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

1. **L3 adapters run in the host process** in v1 (Rosella §7.2 lifecycle). They are not isolated by OS process; a malicious or careless adapter can still import Node built-ins such as `fs`, `net`, or `child_process` directly. v1 therefore treats the following as convention and audit discipline, not a hard sandbox:
   - **Capability scoping by convention.** The `ProposalGeneratorBase.start(ctx)` context (§7.2) exposes only `ReadSetBuilder`, `LedgerWindowReader` (read-only), and `logger`. There is no filesystem, network, or process-spawn capability passed through `ctx`; well-behaved adapters that need those must reach them via L0 (which captures every call). Enforced sandboxing requires the v1.5+ process isolation below.
   - **Tier-stamped emission.** Every row an adapter emits carries `trustTier` set by the registry (§7.4). Router policy (§18.2) then applies.
   - **Fail-open on crash.** Adapter crashes do not crash the session; they emit `Observation{subKind:'external_input', body:{adapter, phase, error}}` and the host continues (§7.2 lifecycle row "start").
   - **Read-set discipline.** `causalReadSet` is built by the framework, not the adapter; an adapter cannot hide a read by omitting it (§7.3, conformance C-6).

2. **MCP-tool adapters at the L0 boundary** are subprocesses by virtue of MCP being a stdio/socket protocol. The §2 boundary captures every invocation; replay (§11) re-feeds the captured response without re-executing the subprocess.

3. **v1.5+ deferred:** OS-process-level isolation for L3 adapters (separate `child_process` per adapter with capability tokens minted at `register` time), seccomp-style syscall filtering, network egress policy. The `ProposalGeneratorBase` interface is shaped so this is an **additive runtime change** — no breaking change to §7.

The full plugin loader specification (resolution, manifest validation, capability minting) is owned by Rosella's §15 (`@akubly/crucible-plugin-host`) and is intentionally not duplicated here. This section specifies what the Router and Hook Bus assume about plugin behavior; §15 specifies how the host enforces it.

## 18.4 Tension #6 Deferral (Marketplace Governance + Secret Capture)

**Tension #6** (`.squad/decisions.md` "Capture Cost vs Throughput vs Privacy") observes that Observation capture will eventually contain secrets (API keys leaked into LLM responses, tool outputs containing credentials, etc.) and that marketplace plugin publishing, vetting, and revocation workflows require governance. **Both are explicitly deferred to v1.5+** and are out of scope for the v1 CTD.

**v1 stance (Aaron-vetted, decisions.md):** the user is responsible for not piping secrets through agents in v1. The single-user threat model (§18.1) makes this a tractable expectation. The architecture is shaped to accept the v1.5+ work as **additive**, not breaking:

- A **post-commit redaction `DataProposalGenerator`** can read captured Observations and emit compensating redaction Observations that replace projected secrets with content-hashed placeholders. This preserves the v1 L0/L1 boundary: L3 cannot sit before WAL commit without a v1.5+ L0/L1 boundary amendment or explicit pre-commit layer.
- A **marketplace governance layer** can hang off the `external → community → adopted` promotion path (§7.4) by attaching publish/review/revocation Decisions to manifest installs. Trust tier is already the discrimination axis; the marketplace adds workflow on top.
- A **replay-across-key-rotation policy** can pin the rotation event as a Decision and use the §11 oracle to require explicit user acknowledgment before replaying prefixes that cross the rotation. Replay refusal (§11.7) is the existing mechanism.

Until v1.5 lands, the v1 documentation surface (CLI help, README) MUST warn the user that captured Observations are not redacted and that adopting a plugin grants it data-tier auto-approve. This warning is the v1 security UX for Tension #6.

### 18.4.1 Known Limits — v1 PII and Secret Handling

**Captured content reflects the boundary already crossed.** Every `Observation` row in the L1 WAL derives from content that crossed the §2 L0/L1 boundary — LLM provider request/response pairs, tool invocation results, MCP server outputs. Per §11.10.1 boundary-faithful replay, Crucible captures what the `SdkProvider` interface returned, which is the **same content the cloud LLM provider already saw** in its request logs. The WAL does not introduce new exposure upstream; it mirrors exposure that already occurred.

**Crucible introduces a local-disk retention surface with distinct data-controller obligations.** Cloud provider request logs are ephemeral (7–90 day TTLs typical, provider-controlled, SOC2-audited deletion). The v1 WAL is **durable and user-controlled**: persists at `~/.crucible/` until explicit GC, follows the machine across networks, survives backups to personal cloud storage (Dropbox, OneDrive, Time Machine). This is a distinct attack surface with different threat models — user may trust the LLM provider's security posture but not their own laptop's disk encryption, backup hygiene, or physical access controls. Crucible-as-storage takes on retention and exposure obligations independent of upstream egress.

**D1 ruling bounds the surface: only LLM-visible tool_result captured.** Per D1 (§2 L0/L1 Boundary decision), the WAL records `tool_result` (the byte sequence the LLM consumed) but **not** raw `tool_output` (intermediate stdio, file reads, network responses that L0 filters before constructing the result). This limits v1 capture to content the LLM already ingested — no secret amplification beyond the prompt/response boundary. Tool output that was redacted by L0 before reaching the model is not in the WAL.

**v1 mitigation toolkit:**

1. **`crucible session delete [--purge]`** (§13 remediation primitive) — deletes a session's WAL segments + CAS blobs. Operator runs this when secrets leak in. `--purge` removes immediately; default tombstones for 7-day retention-window grace period (allows recovery from accidental delete). This is the manual remediation path.
2. **Retention ceiling** (§17.3.1) — soft-warn 500 MiB, hard-limit 2 GiB / 90-day rolling. Prompts operator to run `crucible gc` when storage grows, creating a natural pressure toward session hygiene.
3. **Operator hygiene** — user responsibility to avoid piping secrets through agent commands (same posture as "don't commit secrets to Git"). v1 CLI help and README MUST warn: "Captured observations include tool results and LLM responses. Review sessions containing production credentials and delete them with `crucible session delete --purge <sessionId>`."

**Explicit non-goals for v1 (deferred to v1.5+):**

- **Pre-capture redaction** — no regex-based secret scanner, no CAS quarantine on high-confidence patterns, no pre-commit hooks. Adding a true pre-commit redaction layer in v1.5+ requires an explicit L0/L1 boundary amendment or a new pre-commit layer. A redaction `DataProposalGenerator` (§7.3) is post-commit only: it emits compensating Observations that replace projected matched patterns with content-hashed placeholders.
- **At-projection redaction** — Aperture (§9) renders captured content verbatim in v1. A v1.5+ redaction layer could apply masking at projection-read time (when `crucible aperture show` renders rows), separate from the durable WAL. This is an Aperture UX change, not a ledger change.
- **Tiered recording fidelity** — future work may add a `--capture-level` flag at session start: `metadata-only` (no tool results), `summary` (hashed digests only), `full` (current v1 behavior). This is a §2 boundary change and must wait for cross-layer coordination.

**Cross-reference to §11.10 reproducibility honesty:** The captured boundary is what replay (§11) makes hermetic. Redaction or capture-level tuning would degrade replay fidelity (can't reconstruct Decision context from redacted Observations). v1 prioritizes replay completeness over redaction; v1.5+ will make this a tunable tradeoff via explicit operator consent at session start.

## 18.5 Acceptance Signals

- **A3** (pre-commit hook veto) — §4 Hook Bus + §18.2 hook-bus pause floor are sufficient.
- **A12** (marketplace extension trust gradient) — §18.2 tier table + §7.4 stamping discipline.
- **§6.7 Trust-Tier Monotonicity** — install-time enforcement on `PolicyRow` (§5.1) + tier-as-attribution (§7.4) + no mid-session downgrade (§18.1 T3).
- **§17 cross-ref** — `capability-denied`, `predicate_timeout`, `monotonic_violation`, `ci_gate_failure` are the observability surfaces this security model relies on; severity (`attention`) is set by §9.3 projector, not by emitters.

No locked decisions are re-litigated. No new open question is surfaced. v1.5+ deferrals are documented as additive paths so the boundary types (§2, §6) remain stable across the security-feature expansion.
