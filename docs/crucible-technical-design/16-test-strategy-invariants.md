# §16 — Test Strategy + Invariants

**Status:** FINAL (Phase 2). Declarative CTD-side reference; authoritative test
strategy lives in `docs/crucible-tdd-strategy.md` (the "TDD strategy").
**Owner:** Laura. **Secondary:** Gabriel (CI harness, conformance runner,
zero-tolerance gate enforcement).
**Cross-refs:** §3 (WAL), §4 (Hook Bus), §11 (Replay), §6 (Primitive Taxonomy),
§7 (Generators), §8 (Applier + DecisionGate), §15 (Coexistence + Plugin
Registry); TDD strategy §3, §5.1, §6.1–§6.9, §7.2, §9, A1–A12.
**Depth budget:** ≤3 pages. This section **cross-references the TDD strategy
and does not duplicate it.** The TDD strategy owns test counts, fixture builder
patterns, mock-drift defenses, and CI policy text; §16 names the seams the CTD
exposes and pins which CTD section implements which tested collaborator.

## 16.1 Test Category Matrix

The CTD-specified module decomposition (per §1, §15) maps to the TDD strategy's
five-tier pyramid (TDD §5.1 — **do not re-author counts here**). Each category
binds to a runner and a CI stage; the runner is the only place tier mechanics
are spelled out.

| Category | Scope | Runner | CI stage | Authority |
|---|---|---|---|---|
| Unit | Pure leaf logic (CBOR canonicalization, ReadSetHasher hash, fork-lineage predicates) | `vitest run --pool=threads` | `ci:unit` (pre-merge, <30 s) | TDD §5.2 Tier 1 |
| Contract | Real impl vs. mocked collaborator interface (per §16.3 matrix) | `vitest run -- --project=contracts` | `ci:contracts` (pre-merge, **zero-tolerance gate** per §16.5) | TDD §5.2 Tier 3, §7.1 |
| Component | Single layer with collaborators mocked | `vitest run -- --project=components` | `ci:components` (pre-merge) | TDD §5.2 Tier 2 |
| Integration | Two+ layers, real DB (`:memory:`), real projectors, mocked L0 I/O | `vitest run -- --project=integration` | `ci:integration` (pre-merge) | TDD §5.2 Tier 4 |
| Acceptance (A1–A12) | Full CLI → ledger → projection path, file-backed DB in `.test-sessions/` | `vitest run -- --project=acceptance` | `ci:acceptance` (pre-merge subset, full nightly) | TDD §5.2 Tier 5, §2 |
| Invariant / property | §6.1–§6.9 propositions over `fast-check` generators | `vitest run -- --project=invariants` | `ci:invariants` (nightly + on-change of §3/§4/§11) | TDD §6 |
| Conformance — Replay (A2/A9) | Golden corpus replay-equivalence against §11.6 oracle | `crucible conformance replay` | `ci:conformance` (nightly) | §11.8, TDD §5.3 |
| Conformance — Generic L3 Adapter | New adapter passes §7.A `GenericL3AdapterContract` (§16.6) | `crucible conformance l3-adapter <adapter-id>` | `ci:conformance` (per-adapter opt-in) | TDD §3.4, §16.6 |
| Conformance — Performance | Fixed thresholds for WAL append latency (p50/p99), fsync amortization ratio, hook timeout rate, replay throughput | `crucible conformance perf` | `ci:conformance:perf` (pre-merge, ≤3 min) | TDD §8.4 (latency targets) |
| Smoke — productivity loop | One-week-loop bar test (§16.4) | `crucible smoke productivity-loop` | `ci:smoke` (every PR, ≤2 min) | §16.4 |

Mapping rule: every PR runs `ci:unit + ci:contracts + ci:components +
ci:integration + ci:acceptance:fast + ci:conformance:perf + ci:smoke`. Nightly
extends with `ci:invariants + ci:conformance + ci:acceptance:full`. Tier
ratios, per-layer counts, and per-tier latency targets are owned by **TDD §5.1
and §8.4** — see those sections for numbers; do not duplicate here.

**Performance conformance thresholds** (for `ci:conformance:perf`):
<!-- TBD: thresholds defined by Graham/Gabriel during L1 substrate implementation -->
- WAL append latency: p50 ≤ X µs, p99 ≤ Y µs
- fsync amortization ratio: ≥ Z (fsync per N appends)
- Hook timeout rate: ≤ W% (predicates exceeding 80 µs budget)
- Replay throughput: ≥ N rows/s (on golden corpus)

Parameterized placeholders (X/Y/Z/W/N) will be populated with fixed thresholds
during §3 (WAL) and §4 (Hook Bus) implementation; the gate becomes blocking
when thresholds land. Pre-merge blocking prevents silent perf regressions from
shipping before nightly catches them.

## 16.2 Invariant Surfaces (Cross-Reference)

The nine invariants are **defined by TDD §6.1–§6.9**. §16 only pins where their
testable surfaces land in the CTD; the proposition text, fixture sketches, and
counterexample shapes stay in the TDD strategy.

| Invariant | TDD §  | CTD surface where the invariant binds |
|---|---|---|
| Append-Only | §6.1 | §3.3 row schema + §3.4 `AppendProtocol` (immutable after fsync) |
| Hash-Chain Integrity (context-window commitment) | §6.2 | §3 hash-chain field + §11.5 `verifyCommitment` |
| Replay Equivalence | §6.3 | §11.6 oracle + §11.8 A2 pseudocode |
| Fork Lineage Transitivity | §6.4 | §3 `parentSessionId` / `forkPointEventId` + §10 (Phase 2) branching |
| Hook Verdict Consistency | §6.5 | §4.7 replay recording rules (P1–P5) |
| Projection Purity (L2) | §6.6 | `LedgerProjector` contract — §9 Aperture (Phase 2), §1.2 L2 row |
| Trust-Tier Monotonicity | §6.7 | §15 plugin registry trust transitions; §8 DecisionGate enforcement |
| Bootstrap-Capture-Completeness | §6.8 | §3.8 bootstrap atomic-append + §11.7 preflight refusal #1 |
| Monotonic-Timestamps-Within-Session | §6.9 | §3.10 monotonic-floor rule + §11.7 preflight refusal #5 |

These bindings are the **only** thing §16 asserts about the invariants. Authors
extending an invariant edit TDD §6.x; CTD §16 needs no edit unless a new
surface section appears.

## 16.3 Collaborator-Contract → CTD-Section Alignment Matrix

For every collaborator role in TDD §3, the table below pins the CTD section
that defines the real implementation and the **primary test tier** at which
the role binds. Component-tier rows are also covered by a contract-tier
double-check per the zero-tolerance gate (§16.5).

| Collaborator (TDD §) | Real impl owned by CTD § | Primary tier | Contract-tier double-check |
|---|---|---|---|
| `SessionBootstrapper` (§3.1) | §2 L0/L1 boundary; §12 SDK integration | Component | Yes — bootstrap-payload shape |
| `LedgerWindowReader` (§3.1) | §3.3/§3.4 WAL; consumed by §11.4/§11.5 | Component | Yes — prefix-query shape |
| `AppendProtocol` (§3.2) | §3.4 (incl. `appendFenced` per §0 Finding 12b) | Contract | n/a (already contract-tier) |
| `PreCommitHookBus` (§3.2) | §4.2–§4.4 | Component | Yes — verdict-array shape + 80 µs budget (verified by component-tier perf test per §4.3) |
| `ReadSetHasher` (§3.2) | §3 (CBOR-dcbor + BLAKE3); fixture in §11.5 | Unit + Contract | Yes — determinism across machines |
| `LedgerProjector` (§3.3) | §9 Aperture (Phase 2); generalized in §1.2 L2 | Component | Yes — projection-purity contract |
| `QueryExecutor` (§3.3) | §1.2 L2 row; Salsa-style implementation deferred to L2 detail section | Component | Yes (when L2 section lands) |
| `PrescriberOrchestrator` (§3.4) | §7.1–§7.2 | Component | Yes — fail-open + attribution |
| `GenericL3AdapterContract` (§3.4) | §7.A conformance suite | **Contract** (the suite IS the contract tier) | Self-referential — see §16.6 |
| `ChangeVectorProvider` (§3.4) | §7 (Generators) | Component | Yes — fail-open returns `[]` |
| `ParetoFitnessEvaluator` (§3.4) | §7 / §8.5 (`nonDominatedReason` propagation per R2-5) | Component | Yes — dominance correctness |
| `SchedulerDispatcher` (§3.5) | §5.A L3.5 Scheduler tier (ADR-0024); Phase 0.5 uses FifoScheduler stub (A-Sched-1), Phase 1 upgrades to WeightedRoundRobinScheduler (A-Sched-2/A-Sched-3); dispatch ordering + hazard analysis | Component | Yes — dispatch fairness + serialization of WAW hazards |
| `PolicyEngine` (§3.5) | §5 Router (policy lookup) + §8 DecisionGate (enforcement) | Component | Yes — verdict shape per trust tier |
| `EscalationQueue` (§3.5) | §5 Router; §9 Aperture `StructuralApprovalQueue` (Q3) | Component | Yes — priority + timeout |
| `CausalSliceEngine` (§3.6) | L5 Investigation section (Phase 2/3); §11 ledger reader is the substrate | Component | Yes — slice = recomputed commitment (§11.8 A4) |
| `BisectOrchestrator` (§3.6) | §13 CLI tooling + L5 Investigation; env-snapshot per Q5/R2-4 (§16.5 Tooling) | Integration | Yes — env-snapshot-hash on every row |
| `PluginRegistry` (§3.7) | §15 (`@akubly/crucible-plugin-registry`); R2-6 lockfile | Component | Yes — pinning + deny-list |
| `CLIRenderer` (§3.7) | §13 CLI | Component | Yes — badge-on-attention |

**Completeness check:** every collaborator in TDD §3.1–§3.7 has a row, including
L3.5 Scheduler tier (ADR-0024, §5.A). `QueryExecutor` and `CausalSliceEngine`
reference CTD sections that are Phase 2/3 deliverables not yet authored as
standalone files; their primary tier is fixed regardless of which section
ultimately owns them, and Phase 3 synthesis re-verifies the binding when those
sections land.

## 16.4 One-Week Productivity-Loop Smoke Test

The smoke test that proves the daily-driver works. Runs on every PR in
`ci:smoke` with a ≤2 min budget. Authoritative implementation: TDD §2 acceptance
fixtures + TDD §9 builders.

**Bar:** in one synthetic "week" of Crucible usage compressed into a single
test run, the loop a working developer relies on does not regress. The test
exercises the end-to-end seam the user actually touches; failure means the
daily driver is broken even if every unit test passes.

```ts
test('productivity loop — daily driver bar', async () => {
  // Day 1 — bootstrap a session, run a few prescribers.
  const s = await crucible.session.create({ bootstrap: goldenBootstrap });
  await crucible.run(s, sampleSkills(3));

  // Day 2 — fork from a decision, diverge.
  const child = await crucible.fork(s, { atOffset: decisionOffset(s, 'P-day1-3') });
  await crucible.run(child, sampleSkills(2));

  // Day 3 — replay child hermetically, oracle must pass.
  const r = await crucible.replay(child.id);
  expect(r.status).toBe('pass');                                    // §11.8 A2

  // Day 4 — bisect a planted regression in child between offsets 5 and 18.
  const b = await crucible.bisect(child.id, { good: 5, bad: 18, cmd: 'echo PASS' });
  expect(b.failingOffset).toBeGreaterThan(5);
  expect(b.rows.every(row => row.envSnapshotHash)).toBe(true);      // R2-4

  // Day 5 — `crucible why` traces causal slice for the bisect-fingered primitive.
  const slice = await crucible.why(b.failingOffset);
  expect(hasher.hashCanonicalRows(slice)).toEqual(
    decision(b.failingOffset).contextWindowCommitment);             // §11.8 A4

  // Day 6 — Aperture renders one attention event for the bisect finding.
  const events = await crucible.aperture.list(child.id, { tier: 'attention' });
  expect(events).toHaveLength(1);

  // Day 7 — close. No CAS-miss, no commitment divergence, no quarantine.
  const health = await crucible.health(child.id);
  expect(health).toMatchObject({ casIntegrity: 'ok', quarantine: [] });
});
```

A regression in **any** of bootstrap, fork, replay, bisect, `why`, Aperture
rendering, or CAS integrity fails the smoke test. The seven steps are
deliberately not factored into separate tests at this tier — the contract
is that the seven steps **compose**.

## 16.5 Tooling

Three tooling surfaces are testable artifacts of the CTD; their existence is
a design requirement, not a CI policy choice.

**Bisect (env-snapshot at start, per Q5 / R2-4).** §13 CLI + L5
Investigation. `BisectOrchestrator` (TDD §3.6) captures `process.env` plus
relevant config files **once at bisect start**; each iteration shells out to
the user's shell with the **fixed snapshot env**, not the live env. Every
row in the bisect report carries `envSnapshotHash` (16-char abbreviation
acceptable per R2-4 lock). Internal consistency, not external hermeticity;
re-runs days later may differ legitimately. Test tier: integration (mock the
shell-out, real env-snapshot capture, real fork+replay).

**Replay CLI (per §11).** `crucible replay <sessionId> [--strict]` exposes
the §11.4 `ReplayDriver` contract. Output is a `ReplayReport`; non-zero exit
on `status: 'fail'`. The CLI is the user-facing handle on the §11.6 oracle
and §11.7 preflight refusals — both surface as `divergenceKind`. Test tier:
acceptance (A2, A9) against the golden corpus. **SLO (per I1):** Replay
throughput ≥500 rows/sec on reference hardware (M2 MacBook Air, 8GB). Budget
rationale: fallback-path O(N²) hashing dominated v1 sessions; prefix-commitment
caching (§3.7) reduces to O(N) and guarantees this SLO for typical sessions
(≤1000 rows). A2 test must complete full replay in <10% of original session
wall-clock time.

**Why command + watchpoint/breakpoint/logpoint registry.** `crucible why <id>`
walks the §11/§3 `causalReadSet` backward via `CausalSliceEngine` (L5 section,
Phase 2/3). The registry of watchpoints, breakpoints, and logpoints is the
**predicate registration log itself** — `Observation{subKind:
'predicate_registered' | 'predicate_unregistered'}` rows per §4.2 — so the
substrate already exists. §13 CLI exposes `crucible debug list-predicates`
as the read view; new entries are authored as predicate registrations, not
as a separate registry data structure. Test tier: component for registry
projection; integration for the CLI verbs.

**Hook bus 80 µs predicate-budget validation (per §4.3).** The §4.2 claim that
~50 compiled predicates per kind stay inside the 80 µs row-stage budget is
load-bearing for commit latency (§3.11) and must be validated by a
component-tier perf test. Test shape: 50 representative predicates (each
inspecting `primitiveKind` + `subKind` + 1 payload field check), 1000 appends
across mixed kinds, assert p99 dispatch latency ≤80 µs per row. Predicates
should reflect realistic production patterns (CBOR body inspection, hash
lookups, causal-edge traversal). If test fails: fallback strategies include
(a) reduce predicate cap from 50 to lower ceiling, or (b) implement two-phase
dispatch (fast kind+subKind filter → slow witness-body materialization only
for matched predicates). Test authority: TDD §5.2 component tier. CI stage:
`ci:components` (pre-merge). Cross-ref to §16.3 `PreCommitHookBus` row which
notes "80 µs budget verified by component-tier perf test per §4.3."

**Streaming-token capture policy (LLM I/O subsystem).** Streaming LLM
responses do **not** emit one `Observation` per token. WAL volume would
explode (a single 4k-token response × 500 LLM calls ≈ 2M rows / session,
killing both append throughput and the §11 replay budget), and per-token
re-feed would interleave pathologically with the hook bus. The captured
shape is a bounded triple, all three rows being `Observation` primitives
(§6.2) causally chained via `causalReadSet`:

- `Observation{subKind: 'stream_open'}` — body carries `{ model, requestHash,
  decodingParams }` where `decodingParams` includes `temperature`, `top_k`,
  `top_p`, `seed` (if any), `maxTokens`, and provider/version. Hashed into
  the CAS like any other Observation body.
- `Observation{subKind: 'stream_delta'}` — emitted at **checkpoint
  boundaries**, configurable per `(every N tokens) OR (every M ms)`, default
  `(N=256 tokens) OR (M=500 ms)` whichever fires first. **Semantics (M2
  clarification):** Each delta carries **decoded UTF-8 text** (not raw bytes),
  NFC-normalized. The cumulative-text CAS digest and the delta-text CAS digest
  are stored; both are `causalRead`-bound to the originating `stream_open` row.
  L0 adapter must buffer partial multi-byte UTF-8 sequences across token
  boundaries; deltas emit only complete codepoints.
- `Observation{subKind: 'stream_close'}` — body carries `{ finalContentRef,
  finishReason, usage: { promptTokens, completionTokens, totalTokens } }`.
  `finalContentRef` is the CAS digest of the complete response **text**
  (UTF-8 NFC-normalized bytes); this is the same digest a non-streaming
  `llm_response` would carry, so the re-feed key (§11.4) remains uniform.

Replay (§11.4) re-feeds the **captured delta sequence** in original order
from the CAS; it does **not** regenerate from the model and does not collapse
the deltas into the `stream_close` payload. The corresponding invariant
(tested at `ci:invariants`): for every streamed `llm_response` row group,
the **text concatenation** of `stream_delta` payloads in offset order equals
the `stream_close.finalContentRef` text (both UTF-8 NFC-normalized),
character-for-character. Failure is an oracle divergence with
`divergenceKind: 'commitment'` (the delta chain is part of the row's
structural projection per §11.6).

This policy is the operational consequence of treating the LLM as the I/O
subsystem (§11.10): we sample the stream at checkpoints sufficient to
reconstruct it on replay, exactly as `rr` records syscalls without recording
every CPU cycle inside the kernel.

## 16.6 Generic L3 Adapter Conformance Suite

**Spec authority:** TDD §3.4 `GenericL3AdapterContract` + §5.2 Tier 3 ("Generic
L3 Adapter conformance"). §16 fixes execution mechanics.

**Suite scope:** any L3 Generator adapter (Forge in v1; Eureka in v1.5 per §14;
marketplace plugins thereafter) must pass: (a) `PrescriberOrchestrator`
interface compliance — discovery, invocation, aggregation; (b) fail-open under
controlled crashes; (c) hint-attribution tagging on every emitted primitive;
(d) lifecycle hooks in declared order; (e) registration/discovery via the
§15 plugin registry.

**CI stage:** `ci:conformance` (nightly) for the always-on adapter set (Forge
in v1). New-adapter opt-in: a marketplace or in-tree adapter declares itself
to the suite by adding a `crucible.conformance.l3-adapter` entry to its
`package.json` plus a fixture-emitting harness that constructs the adapter
with the suite's stub `PrescriberOrchestrator` context. The suite runs against
that harness on every PR that touches the adapter package and nightly across
all opted-in adapters. **Forge is the v1 reference implementation; the suite
is the contract.**

**Failure surface:** conformance failure blocks merge for the offending
adapter only (not the whole tree); a Forge failure additionally blocks all
PRs because Forge is on the daily-driver path.

## 16.7 Fixture & Pyramid (Cross-Reference)

Fixture strategy is **owned by TDD §7.2 (shared fixture builders) and §9
(builder pattern, golden files, randomized generators, seeded test
databases) — do not duplicate here.** The CTD-side commitment is that every
new collaborator added to the §16.3 matrix arrives with at least one
fixture builder in the TDD §9 sense; no test in any §16-listed category
constructs collaborators by hand-rolling shape literals.

Pyramid ratios and per-tier counts are **owned by TDD §5.1**. The §16
category matrix names runners and CI stages; it does not re-author counts.

## 16.7a Trace-Reproducibility vs. Behavioral-Reproducibility Test Layering

The replay-equivalence oracle (§11.6) and the §11.10 reproducibility-honesty
clause partition agent-testing surfaces into three disjoint, non-substitutable
layers. **No test in any layer may be quoted as evidence for a property
belonging to a different layer.** This is the §11.10 honesty discipline
re-stated in test-strategy terms; the matrix below is the contract.

| Layer | What it asserts | What it does NOT assert | CTD home | v1 scope |
|---|---|---|---|---|
| **Trace-replay tests** (A1–A4, A9) | Byte-equivalence of the replay ledger under the §11.6 oracle, given the captured CAS. The agent saw, ran, and committed the recorded primitive stream identically on re-feed. | Anything about model behavior, decision correctness, or stability under perturbation. | §11.6 oracle, §11.8 assertion specs, §16.1 `ci:conformance`. | **In v1.** Always-on, golden corpus parameterized. |
| **Mutation-testing on primitives** | Downstream Decisions stay stable under **approved** perturbations (timestamp jitter, informational-field rewrites) and **change** under disallowed ones (sub-kind swap, causal-edge rewrite, payload byte flip). Direct fitness function for §11.6 completeness. | Behavior of the underlying model; only the substrate's response to substrate-level mutation. | §16.1 `ci:invariants` (nightly + on-change of §3/§4/§11), generator scaffolding in TDD §6 / §7.2. | **In v1.** Nightly. |
| **Behavioral-reproducibility tests** (NEW) | Across model versions, providers, sampler seeds, decoding stacks, and prompt revisions: the **shape** of Decisions (sub-kind, gross structure, policy-relevant fields) conforms; the **bytes** are explicitly not expected to match. Differential testing of the I/O subsystem itself. | Trace equivalence — these tests intentionally violate trace reproducibility and must NEVER be run against the §11.6 oracle. | Not yet authored; **v1.5+ scope**, future-work entry in §14 roadmap. New `ci:differential` stage with its own runner. | **NOT in v1.** Documented as gap; explicitly outside the v1 conformance suite. |

The third row is the load-bearing one. Conflating it with trace-replay tests
is the failure mode §11.10 names. v1 ships the first two layers as
zero-tolerance gates (§16.5/§16.8) and ships the third layer as a **named
absence** — present in the roadmap, absent from the green-build bar, never
silently substituted for trace replay. When v1.5 lands behavioral
reproducibility tests, they arrive as a new CI stage and a new conformance
contract, not as an extension of `ci:conformance:replay`.

Cross-ref: §11.10 (the honesty clause this layering operationalizes); §14
(roadmap; v1.5+ behavioral-reproducibility entry to be added when scoped);
TDD §6 (invariant + mutation generators).

## 16.8 Agentic-Cost Framing — Zero-Tolerance Mock-Drift Gate (Q7)

**Design constraint, not just CI policy.** Captured here so future
contributors cannot downgrade the gate without re-opening the constraint.

The `ci:contracts` stage is **zero-tolerance**: a single contract-test
failure blocks every PR. The rationale is the inversion of the cost
function under agentic development:

- **Drift cost compounds.** An agentic system makes many decisions per
  session against the model embodied by the mocks. When the mock drifts from
  the real collaborator, every agent action against that seam is wrong in a
  way that is invisible until integration. The cost grows with action count,
  not with developer-attention count.
- **Fix cost is near-zero.** When the gate fires, the fix is "spawn an agent
  to reconcile the contract." There is no context-switch tax, no resentment,
  no incentive to disable the test for expediency. The human-team failure
  modes that make zero-tolerance brittle (Q7 decisions.md, Aaron's lock)
  do not apply to the team operating against this codebase.
- **Therefore** the threshold that minimizes total cost is **zero**, not
  the human-team-typical "≥3 in layer" or "≥10% total."

This constraint binds §16 (contract-tier definition), §17 (observability —
mock-drift telemetry as a distinct PR-blocking channel), and §1 (agentic-
development test discipline). Removing or weakening the gate requires
re-opening Q7 with explicit Aaron triage; it cannot be done as a §16 edit.

## 16.9 Acceptance Signals

This section is sufficient to enable the work it gates without re-authoring
any TDD strategy content:

- **A1–A12 acceptance scenarios:** runnable against `ci:acceptance` per
  the category matrix (§16.1); per-scenario fixture lives in TDD §2 and §9.
- **A13 Scheduler dispatch ordering + hazard serialization:** two concurrent
  generators with a WAW (write-after-write) hazard on the same skill →
  Scheduler serializes correctly → Router receives proposals in hazard-safe
  order. Validates L3.5 tier (§5.A, ADR-0024) prevents race conditions between
  generators. Runnable against `ci:acceptance` per §16.1.
- **A-Fork-1 through A-Fork-8 (ADR-0019 childSid collision hybrid):**
  - **A-Fork-1 (Quick retry):** `crucible fork --at 50` + abort + `crucible fork --at 50 --new` → two distinct `childSid`s, both active/closed. Parent ledger records two Decision rows (one per fork attempt). Validates US-1 (quick experiment retry).
  - **A-Fork-2 (Crash recovery):** `crucible fork --at 50` + crash + `crucible fork --at 50 --resume` → same `childSid`, `fork_resume` Observation row appended at resume point, `status='resumed'`. Validates US-2 (crash salvage).
  - **A-Fork-3 (Closed session collision):** closed session + `crucible fork --at 10` → error unless `--new` flag provided. Validates that closed sessions don't auto-resume.
  - **A-Fork-4 (Collision surfacing):** aborted session created 3 days ago + `crucible fork --at 50` (interactive TTY) → prompt shows "3 days ago" relative time + turn count. User presses 'N' or 'R'. Validates collision surfacing (US-4 prevention).
  - **A-Fork-5 (Replay determinism):** replay parent session → Decision rows replayed in order → child sessions replay deterministically (new vs resume paths followed via recorded `chosenOption`). Validates §11 hermetic replay + Decision row commitment.
  - **A-Fork-6 (Non-TTY behavior):** `echo "..." | crucible fork --at 50` (non-TTY stdin) → exit code 2, stderr: "Interactive prompt unavailable. Use --new or --resume." Validates script/CI safety.
  - **A-Fork-7 (--no-interactive flag):** `crucible fork --at 50 --no-interactive` without `--new`/`--resume` → exit code 2. With flag: succeeds. Validates explicit opt-out of interactive prompt.
  - **A-Fork-8 (Direct resume by session ID):** `crucible session resume <childSid>` (where `childSid` has `status='aborted'`) → resumes session, appends `fork_resume` row, updates `status='resumed'`. Idempotent. Validates alternative path for discovered aborted sessions.
- **§6.1–§6.9 invariants:** runnable against `ci:invariants` per §16.2's
  surface bindings; proposition text stays in TDD §6.
- **A9 determinism conformance:** runnable against `ci:conformance` via
  `crucible conformance replay` against the §11.6 oracle on the golden
  corpus; A2 is the per-session unit, A9 is the corpus parameterization.
- **§7.A Generic L3 Adapter Conformance:** runnable against
  `ci:conformance` via `crucible conformance l3-adapter <id>` per §16.6.
  Includes **C-9 (structural-proposal supersede contract)**: replacement
  proposals that trigger `scheduler_cancelled{reason:'superseded'}` MUST set
  `envelope.parentId` to the obsoleted proposal's EventId. Observable signal:
  conformance suite rejects generators that emit supersede-replacement proposals
  without valid `parentId` lineage. NOTE: the §7.A conformance-test specification
  may shift as Rosella executes PA-B4 (ancestry/replay API unification), but the
  C-9 contract requirement is stable — it validates the supersede-lineage edge,
  not the broader ancestry-read mechanism.
- **Productivity-loop bar:** runnable on every PR per §16.4.

No open question is surfaced by this section. The CTD-side hooks for
TDD-Q2 (Generic L3 conformance), TDD-Q5 (bisect env-snapshot), and TDD-Q7
(zero-tolerance + agentic-cost) are all captured above as design constraints,
not as deferred work.
