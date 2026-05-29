# §7 — Generators (L3)

**Status:** FINAL (Phase 1). Authoritative; do not re-litigate locked decisions.
**Owner:** Rosella. **Secondary:** Graham (contract shape), Laura (fitness +
read-set + conformance suite shape).
**Cross-refs:** §3 (L1 WAL), §5 (L4 Router), §6 (Primitive Taxonomy), §8
(Applier + DecisionGate), §9 (Aperture leaderboard rendering), §10 (Session +
Branching), §15 (Coexistence & Types), Appendix 7-E (Eureka v1.5).
**Depth budget:** ≤3 pages (Appendix 7-E is separate, ≤1 page).

L3 is the **generator tier**. Every actor that proposes a change to the
running system — Forge prescribers, Curator detectors, Alchemist variants,
future marketplace plugins, the v1.5 Eureka adapter — implements one of two
sibling interfaces below and is mounted through a single uniform lifecycle.
The Router (§5) and Applier (§8) consume only the shape defined here.

**Newly surfaced ambiguity:** none. (All structural choices fall out of
locked decisions; no open question raised by this section.)

**TOC:** §7.1 interface + dual split · §7.2 lifecycle · §7.3
`ReadSetBuilder` · §7.4 trust-tier table · §7.5 Pareto + `PrescriptionResult`
· §7.A conformance contract · §7.B Forge worked example · §7.C Curator
charter · §7.D structural emission · §7.F Eureka v1 forward ref · §7.6
collaborator alias map · §7.7 acceptance signals · Appendix 7-E
(Eureka v1.5).

---

## §7.1 `ProposalGenerator` Interface (Phase A 8-Field Lock)

Phase A locked an 8-field proposal schema (Round 3, 2026-05-24 Laura signoff).
Two further fields — `determinismClass` and `causalReadSet` — were locked as
amendments in the same round. The combined 10-field shape is the only
proposal payload that ever crosses L3 → L4.

```ts
import type { EventId, TrustTier, ReadSetRef } from './06-primitive-taxonomy';

type ProposalCategory =
  | 'prompt-tune' | 'tool-binding' | 'policy-tune' | 'skill-induction'
  | 'schema-change' | 'plugin-swap' | 'router-policy' | 'other';

type Reversibility =
  | 'pure-data'           // revert by re-applying inverse data delta
  | 'idempotent-rerun'    // safe to re-execute; converges
  | 'manual-rollback'     // requires operator action to revert
  | 'irreversible';       // cannot be undone in-system

type DeterminismClass =
  | 'deterministic'       // pure function of declared causalReadSet
  | 'seeded'              // deterministic given (read-set, recorded seed)
  | 'observational'       // captures live system state; replayable via §11
  | 'non-deterministic';  // forbidden in v1 (Router will VETO)

interface FitnessContract {
  axes: Record<string, FitnessAxis>;   // sparse; missing = "not measured"
  measuredAt: number;
  measurementSource: 'simulation' | 'live-ab' | 'historical-replay';
}
interface FitnessAxis { value: number; unit: string; higherIsBetter: boolean; }

interface CostEstimate {
  tokens?: number; walRows?: number; wallClockMs?: number;
  externalCalls?: { provider: string; count: number }[];
}

interface Evidence {
  rationale: string;
  citations: EventId[];                 // pointers into L1 / §6 primitives
  tier: 'internal' | 'certification' | 'deployment';  // ProvenanceTier (Cairn)
}

interface ProposalGeneratorBase {
  // Phase A 8-field lock
  category: ProposalCategory;
  confidence: number;                   // 0..1
  rationale: string;
  preview: ProposalPreview;             // human-renderable; CBOR-safe
  fitnessContract: FitnessContract;
  evidence: Evidence;
  costEstimate: CostEstimate;
  reversibility: Reversibility;

  // R3 amendments (Laura signoff)
  determinismClass: DeterminismClass;
  causalReadSet: ReadSetRef;            // §6 envelope shape; hashed by L4
}
```

### Dual-interface split (Round 1 lock; Q3 emission lock)

```ts
interface DataProposalGenerator extends ProposalGeneratorBase {
  kind: 'data';
  apply: ApplyPlan;                     // pure data delta
}

interface StructuralProposalGenerator extends ProposalGeneratorBase {
  kind: 'structural';
  schemaChange: SchemaChangeSpec;       // skill schema / plugin shape / policy
  dependentPaths: EventId[];            // REQUIRED — Router pause scope. Phase 2 finding 5: content-addressed EventIds (not routing-key strings); reconciled with §5.3 RouterPausedPayload.dependentPaths shape so §5.8's "one RouterPaused row per dependent path" projection keys off a stable id.
}
```

`dependentPaths[]` is **mandatory** on every structural proposal (Q3 LOCK).
It enumerates the L2/L4 execution paths the Router MUST pause (`hook_verdict
= pause`, §3) until the structural ack lands through Aperture (§9). Empty
`dependentPaths` is a contract violation — the conformance suite (§7.A)
rejects it.

## §7.2 Plugin Lifecycle Contract

Every L3 generator is hosted through five phases. The existing Cairn
discovery walker (`packages/cairn/src/agents/discovery.ts`, 482-line
topology scanner) is the v1 host — no new plugin-host package.

| Phase | Trigger | Contract |
|---|---|---|
| `register` | install / discovery | Adapter publishes `PluginManifest{id, version, trustTier, entrypoint, dependsOn[]}` (transitive per Q4). Manifest SHA-256 hashed; pinned per session-fork (R2-6, with Roger §10). |
| `discover` | session bootstrap | `PluginRegistry.list({kind:'L3Generator'})`; order is deterministic (manifest-id lex). |
| `start` | bootstrap, post-L1 | `adapter.start(ctx)`; `ctx` exposes `ReadSetBuilder`, `LedgerWindowReader` (read-only), `logger`. Crash ⇒ **fail-open**: skip adapter, emit `Observation{sub-kind:'external_input', body:{adapter,err}}`, session continues. |
| `stop` | session-end / revocation / disable | `adapter.stop(reason)`; idempotent; ≤500ms; SIGKILL-equivalent after. |
| `teardown` | uninstall | Removes adapter-local state; never touches L1 (§6.1 append-only). |

Lifecycle errors surface as Aperture `attention`-tier notifications (§9),
never silent drops. Each lifecycle transition is a Decision primitive
with `evidence.tier='internal'`.

## §7.3 `ReadSetBuilder` Helper

Generators MUST declare their `causalReadSet` through a `ReadSetBuilder` —
the helper canonicalises read-edges and produces the `ReadSetRef` (§6.1)
that L4 hashes into `causal_read_set_hash` (§3).

```ts
interface ReadSetBuilder {
  primitive(id: EventId): this;          // direct L1 read
  projection(key: string): this;          // L2 Salsa-mediated read
  externalInput(handleHash: string): this;// hashed identifier only
  build(): ReadSetRef;
}
```

Direct L1 reads are billed at full cost; projection reads through the L2
Salsa cache are the cheap A3-replay path (Laura signoff: "L2↔L3
`ReadSetBuilder` helper pushes generators toward Salsa-mediated reads").
External inputs MUST be referenced by hash only — the input bytes never
enter the read-set object.

## §7.4 Trust-Tier Attribution

The v1 enum is `{builtin | adopted | community | external}` (Round 2.3
LOCK). Tier is stamped on emission by the **registry** at adapter
`register` time, propagated into the `PrimitiveEnvelope.trustTier` field
on every emitted primitive, and is monotonic per §6.7 — generators MUST
NOT downgrade tier mid-session.

| Tier | Stamping rule | Self-promotion path | Router default |
|---|---|---|---|
| `builtin` | Adapters shipped in the Crucible repo. Never demoted. | n/a | APPROVE-by-default |
| `adopted` | Aaron-vetted via explicit `crucible plugin adopt <id>`. Recorded as Decision with `alternatives[]`. | from `community` only | APPROVE-by-default; structural still escalates (§7.D) |
| `community` | Auto-promoted from `external` after 30 days + 10 invocations + 0 Router policy violations. | from `external` | PAUSE-on-structural; APPROVE-on-data with confidence ≥ 0.7 |
| `external` | Default tier for any newly registered adapter, including self-authored work (CoI rule, Cassima signoff). | initial | sandboxed; ESCALATE-on-structural; PAUSE-on-data unless confidence ≥ 0.9 |

Trust-tier attribution is **never** generator-self-declared. Adapters that
emit a primitive with a tier higher than their registered tier are
rejected by L4 (Router policy violation; counted toward the 30-day
zero-violations clock).

## §7.5 Pareto Fitness Emission Rules and `PrescriptionResult`

Generators emit a `fitnessContract` whose `axes` map is **sparse by
design** (Q8 LOCK). Generators MUST NOT zero-fill missing axes. A missing
axis means "not measured", not "measured as zero" — zero-filling collapses
*incomparable* into *dominated*, which silently discards Pareto-frontier
prescriptions. Conformance suite rejects zero-fill (§7.A test C-8).

```ts
interface PrescriptionResult {
  prescriptionId: string;
  proposal: DataProposalGenerator | StructuralProposalGenerator;
  fitness: FitnessContract;
  // R2-5 LOCK — coordinated field name with Valanice §9 leaderboard badge
  nonDominatedReason: 'optimal' | 'incomparable';
  incomparableWith?: string[];          // OPTIONAL; sibling prescriptionIds
}
```

`nonDominatedReason` is set by the `ParetoFitnessEvaluator` (§7.6
collaborator alias) at evaluation time, **not** by the generator. Generators
emit `fitness` only. The semantics are:

- `'optimal'` — dominates every comparable sibling on the shared-axis
  intersection. Pure win.
- `'incomparable'` — non-dominated only because no sibling shares its axis
  set; **unchallenged on a different axis set**, not proved better.
  `incomparableWith[]` lists the sibling prescriptionIds whose axis
  intersection with this prescription was empty (or strictly smaller than
  the dominance check requires).

Valanice's §9 leaderboard renders the `[incomparable-axes]` badge by
reading `nonDominatedReason === 'incomparable'`. The Applier (§8) records
the chosen-prescription's `nonDominatedReason` on the resulting Decision
primitive (§6.2 `DecisionPayload.nonDominatedReason`, already present in
§6) for replay-time audit.

---

## §7.A Generic L3 Adapter Conformance Contract (Q2 LOCK)

The conformance contract is a **property-based test suite** that runs
against any L3 adapter — Forge in v1, Eureka in v1.5, every future
marketplace plugin. There is **no Eureka-specific test infra in v1**
(Q2 LOCK). Laura's §5.3 owns the runner; this section owns the spec.

The suite is a single function:

```ts
function runGenericL3AdapterConformance(
  adapterFactory: () => L3Adapter,        // any DataProposalGenerator | StructuralProposalGenerator host
  opts: { fixtureLedger: LedgerFixture; trustTier: TrustTier },
): ConformanceReport;
```

It asserts **eight property classes** (C-1 … C-8). All eight MUST pass for
an adapter to be eligible for any tier above `external`.

| Id | Property class | Pass condition |
|---|---|---|
| C-1 | **Interface compliance** | Adapter exposes `register`, `discover`, `start`, `stop`, `teardown`; manifest validates against `PluginManifest` JSON schema; every emitted proposal validates against the 10-field union of §7.1. |
| C-2 | **Fail-open on adapter crash** | Inject crash at each lifecycle phase + at `propose()`. Other adapters in the session MUST continue; an `Observation{sub-kind:'external_input'}` row MUST be emitted naming `{adapter, phase, error}`; no L1 write is lost. |
| C-3 | **Hint attribution** | Every emitted primitive carries `trustTier` matching adapter registration AND an `evidence.citations[]` referencing only EventIds visible to the adapter at emission time. No "phantom" citations. |
| C-4 | **Lifecycle ordering** | Spy asserts: `register` precedes `discover` precedes `start` precedes any `propose()`; `stop` precedes `teardown`; `stop` is idempotent. |
| C-5 | **Registration / discovery** | Manifest is discoverable by `PluginRegistry.list()` after `register`; un-registers cleanly after `teardown`. Manifest SHA-256 is stable across reboots. |
| C-6 | **`causalReadSet` completeness** | For every emitted proposal, every EventId / projection key / external input the adapter touched between `start` and emission appears in `causalReadSet`. Property test: stub the `LedgerWindowReader` and `Salsa` cache to record reads; assert read-set superset. (Laura A4 assertion mirrors this.) |
| C-7 | **`dependentPaths` non-empty on structural** | Any `kind:'structural'` proposal with empty `dependentPaths[]` is rejected at the adapter boundary, not at Router. |
| C-8 | **No Pareto axis zero-fill** | Adapter MAY emit a fitness map with a strict subset of declared axes; conformance fails if the adapter emits `0` (or any sentinel) for axes its `measurementSource` did not actually measure. |

The conformance report is itself an L1 Decision primitive (one per adapter
per run) with `evidence.tier='internal'` and `alternatives[]` listing the
property classes asserted — replayable, bisectable, and visible in the
Aperture leaderboard.

## §7.B Forge-as-L3 (Worked Example)

The existing `packages/forge/` is the **reference implementation**.
`ForgePrescriberOrchestrator` (Wave 2, W2-5) is the canonical
`PrescriberOrchestrator` (Laura §3.4 alias). The v1 adapter projects each
`OptimizationHint` into a `DataProposalGenerator`: hint `category` →
`category`; `confidence` → `confidence`; `source/evidence` →
`evidence{rationale, citations, tier:'internal'}`; `autoApplyEligible:false`
→ `reversibility:'manual-rollback'`; `costEstimate` from the existing
`ChangeVectorProvider` summary; `trustTier:'builtin'` for shipped
prescribers, `'external'` for user-installed. C-1…C-6 are satisfied by
existing code (fail-open + `ATTENUATION_FLOOR=0.1` already enforced;
`(skillId, source, category)` dedup is hint attribution; Cairn
`agents/discovery.ts` is the registry; reads route through
`SqliteChangeVectorProvider` via `ReadSetBuilder.projection()`). C-7 is
vacuous in v1 (Forge emits only `kind:'data'`); C-8 holds because the
single-axis `meanNetImpact` is one sparse entry, not a zero-filled vector.
**Pattern lift:** Forge-as-reference is the template for every later
adapter — replicate the mapping table; do not add adapter-specific
test infra.

## §7.C Curator-as-L3 (Charter)

Curator's L3 role is **detection + proposal authority, never approval
authority** (Round 1 lock, Q2 Cassima resolution). Curator observes the
L1 ledger through `LedgerWindowReader`, computes change vectors via
`ChangeVectorProvider`, and emits:

- `Observation` primitives recording the detection signal
  (`sub-kind:'external_input'` with `body.detector` and `body.signal`),
- `DataProposalGenerator` proposals when the detection maps onto a
  known prescriber category,
- `StructuralProposalGenerator` proposals when the detection requires
  schema or skill-shape change (these always route to Aperture per §9).

Curator never writes Decision primitives — those are Applier-only (§8).
Curator's trust-tier is `builtin`. Curator passes the §7.A suite the
same way Forge does; no Curator-specific test infra.

## §7.D `StructuralProposalGenerator` Emission Contract

Re-states §7.1 with the Router-pause contract:

1. `kind: 'structural'` is mandatory.
2. `schemaChange: SchemaChangeSpec` carries the typed shape change (skill
   schema diff, plugin manifest swap, policy edit). CBOR-canonicalisable.
3. `dependentPaths: EventId[]` is non-empty. Each entry is a content-
   addressed EventId identifying an L1 row whose downstream paths the
   Router pauses (`hook_verdict='pause'`, §3) until the proposal is acked
   through Aperture's StructuralApprovalQueue (§9). Phase 2 finding 5
   reconciliation with §5.3 `RouterPausedPayload.dependentPaths`.
4. The Router records the pause as a verdict witness on the L1 row; the
   Applier resumes the paused paths on ack (§8 paused-awaiting-structural-
   ack state).
5. Structural proposals land at Aperture `attention` tier — never
   `urgent` (Q3 lock; no blocking modal).
6. **Supersede contract (Phase 4 synthesis amendment, Graham).** A generator
   MAY emit a replacement proposal that obsoletes an in-flight one
   (typically because newer L2 state invalidates the prior recommendation).
   When it does, the replacement's `envelope.parentId` MUST be set to the
   `EventId` of the obsoleted proposal. The L3.5 Scheduler then emits
   `Decision{subKind: 'scheduler_cancelled', body: { reason:
   'superseded', supersededBy: <replacement EventId> }}` against the
   obsoleted proposal (§5.A.2), keying off the `parentId` lineage edge to
   resolve `supersededBy` deterministically. An emission with
   `reason='superseded'` and no resolvable `parentId` on the replacement is
   a contract violation; the §7.A conformance suite rejects it (new check
   C-9 on `StructuralProposalGenerator`; equivalent additive check applies
   to `DataProposalGenerator` replacements when generators choose to
   supersede). Replacement chains compose (`parentId` walks back through
   the supersede graph); the v1 Scheduler does not collapse them — each
   `scheduler_cancelled{superseded}` row stands.

## §7.E (Reserved — see §7.5 + §8 + §9)

Generator obligations: §7.5. Evaluator: §7.6 (`ParetoFitnessEvaluator`).
Applier propagation: §8. UI badge: §9. Field name `nonDominatedReason` is
identical across all four surfaces (R2-5 LOCK).

## §7.F Eureka Adapter (v1 forward reference)

Eureka is an **external library consumed via optional adapter**, not a
Crucible chamber (Aaron lock, 2026-05-27). The v1.5 Eureka adapter is a
`DataProposalGenerator` host that wraps Eureka's public surface and emits
standard proposals; it MUST pass the §7.A conformance suite without any
Eureka-specific test infrastructure (Q2 LOCK). Detailed adapter design is
out of v1 scope — see **Appendix 7-E** below.

## §7.6 Collaborator Name Alias Map (CTD ↔ Laura §3.4)

| This section (CTD §7) | Laura's §3.4 collaborator name | Notes |
|---|---|---|
| `PluginRegistry` (lifecycle host) | `PluginRegistry` | Same name; lives in Cairn `agents/discovery.ts` extension. |
| Adapter orchestrator (per-session) | `PrescriberOrchestrator` | Forge's `ForgePrescriberOrchestrator` is the v1 implementation. |
| §7.A property suite | `GenericL3AdapterContract` | Laura §5.3 owns the runner. |
| `ChangeVectorProvider` (§7.B) | `ChangeVectorProvider` | Same name; Cairn `SqliteChangeVectorProvider` is the v1 impl. |
| Pareto evaluator (§7.5) | `ParetoFitnessEvaluator` | Owns `nonDominatedReason` assignment. |
| `ReadSetBuilder` (§7.3) | `ReadSetBuilder` | Same name; helper, not a service. |
| `LedgerWindowReader` (read-only L1 view in `AdapterContext`) | `LedgerWindowReader` | Renamed from `ObservationCaptureStore` per Q1. |

## §7.7 Acceptance Signals (Laura A7, A8, A10, A12)

This spec is sufficient for Laura to author and run:

- **A7 (Curator auto-trigger):** §7.C charter + §7.2 lifecycle define the
  bootstrap-time invocation; §7.6 binds `PrescriberOrchestrator`.
- **A8 (Pareto fitness):** §7.5 + §7.A C-8 define the emission shape and
  the no-zero-fill rule; `nonDominatedReason` is the assertion key.
- **A10 (Router policy escalation for structural):** §7.D defines
  `dependentPaths[]`; §7.A C-7 makes empty-dependentPaths a unit-test-
  visible contract violation.
- **A12 (trust-tier gradient):** §7.4 table defines tier defaults,
  self-promotion path, and monotonicity; §7.A C-3 makes attribution
  testable per adapter.

Laura can run the §7.A conformance suite against Forge using only the
contents of this section plus existing Forge sources. No additional
specification is required.

---

# Appendix 7-E — Eureka Adapter v1.5 (≤1 page; v1.5 deliverable)

**Status:** ROADMAP — not v1. v1 retains §7.F forward reference only.
**Owner (when scheduled):** Rosella, with Graham (cross-PRD coordination
per the Eureka PRD overlap analysis).
**Cross-refs:** §14 (Eureka Integration Surface), §15 (Coexistence &
Types), §7.A (conformance contract Eureka MUST pass).

## E.1 Scope

A single Crucible-owned `DataProposalGenerator` adapter package
(`@akubly/crucible-eureka-adapter`) that:

1. Imports Eureka's public surface (no Crucible-internal types ever
   imported by Eureka — coexistence boundary, §15).
2. Wraps Eureka's prescriber output, projects each result into a
   `DataProposalGenerator` proposal per the §7.1 shape.
3. Registers through the standard §7.2 lifecycle; trust-tier defaults to
   `external` on install (CoI rule, §7.4); promotes to `community` on the
   standard 30-day / 10-invocation / 0-violation clock.
4. Passes the **§7.A Generic L3 Adapter Conformance suite unchanged**.
   No Eureka-specific test infra is added to Laura's §5.3 runner.

## E.2 Mapping Table (Eureka → ProposalGenerator)

| Eureka concept | Adapter projection |
|---|---|
| Eureka prescriber id | `evidence.citations[]` (hashed reference) + adapter-local mapping table |
| Eureka score | `confidence` (clamped 0..1) |
| Eureka rationale text | `rationale` + `evidence.rationale` |
| Eureka measurement source | `fitnessContract.measurementSource` |
| Eureka per-axis metric | sparse entry in `fitnessContract.axes` (NO zero-fill — C-8) |
| Eureka cost data (if exposed) | `costEstimate.{tokens,wallClockMs,externalCalls}` |
| Eureka reversibility hint | `reversibility` (default `'manual-rollback'` if unknown) |
| (Eureka has no schema-change concept in scope) | adapter emits `kind:'data'` only in v1.5; structural-mode reserved for v2+ |

## E.3 Non-Scope (Locked Out)

- Eureka MUST NOT import any Crucible internal types (`@akubly/types`
  shared surface only — §15).
- Eureka MUST NOT see WAL internals, hook bus, or `~/.crucible/`
  filesystem layout (§14).
- No new fitness axes, trust tiers, or proposal kinds are introduced by
  the Eureka adapter; if Eureka emits a signal that does not map to the
  §7.1 shape, the adapter MUST drop it (and emit an `Observation{sub-
  kind:'external_input'}` recording the drop).

## E.4 v1.5 Exit Criteria

1. §7.A conformance suite passes against the Eureka adapter (all eight
   C-1…C-8 properties).
2. At least one A7-style acceptance test passes end-to-end with an
   Eureka prescriber producing a `DataProposalGenerator` proposal that
   the Router routes and the Applier applies.
3. Coexistence verified: Eureka package builds and tests pass with the
   adapter disabled; Crucible builds and tests pass with the adapter
   absent.

End of Appendix 7-E.
