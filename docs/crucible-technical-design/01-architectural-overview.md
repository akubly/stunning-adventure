# §1 — Architectural Overview

**Status:** FINAL (Phase 1, Lane 6). Authoritative orientation for the CTD; do not re-litigate locked decisions.
**Owner:** Graham. **Depth budget:** ≤3 pages.
**Cross-refs:** §2 (L0/L1 Boundary), §3 (L1 WAL), §4 (Hook Bus), §5 (Router), §6 (Primitive Taxonomy), §7 (Generators), §8 (Applier), §9 (Aperture), §15 (Coexistence).

This section is the canonical introduction to the Crucible runtime. Readers
should land here first to acquire the shared mental model — the **5-layer
stack** (with the explicit **L3.5 Scheduler** tier inserted between L3
Generators and L4 Router per ADR-0024), the **6-chamber product map**, the
**`@akubly/crucible-*` package namespace**, and the **coexistence stance**
with Cairn and Forge. Every downstream section refines one slice of this
picture; none restates it.

**Identity (locked, ADR-0020).** Crucible is **a minimal typed trace algebra
for replayable, accountable agentic computation, materialized as an
append-only WAL with hermetic replay over hardware-class observability
discipline.** The five primitives (§6) are the base algebra; executable
"instructions" are defined by sub-kinds, schemas, declared effects, causal
edges, and runtime semantics — not by the primitive nouns alone. Hardware
analogies are mental scaffolding for orientation (§1.6), not load-bearing
architectural claims.

**Newly-surfaced open questions:** none. §1 stands on locked decisions.

---

## 1.1 The 5-Layer Stack

Crucible is a five-layer pipeline with one orthogonal investigation surface.
Layers communicate only through the seams documented in §2–§9; no layer ever
reaches around another.

```
                                        ┌──────────────────────────────────┐
                                        │  Aperture (L5-adjacent)          │
                                        │  investigation + trust surface   │
                                        │  observes ALL layers; never      │
                                        │  mutates the ledger              │
                                        └──────────────┬───────────────────┘
                                                       │ (read-only projections,
                                                       │  notifications, queue state)
                                                       ▼
  ┌───────────┐  CrucibleEvent  ┌──────────┐ append  ┌──────────┐ project ┌──────────┐ propose ┌──────────┐ verdict ┌──────────┐
  │ L0        │  ──────────────►│ L1       │────────►│ L2       │────────►│ L3       │────────►│ L4       │────────►│ Applier  │
  │ Provider  │  (§2 boundary)  │ WAL      │         │ Derived  │         │ Generators        │ Router   │ ESCALATE │ (§8)     │
  │ (SDK      │  ◄──────────────│ (§3)     │◄────────│ Query    │◄────────│ (§7)     │◄────────│ (§5)     │ APPROVE  │          │
  │  adapter) │  OutboundPrompt │          │  query  │ (§4 bus) │  read   │          │  pause/ │          │ DENY     │          │
  │           │  ControlSignal  │          │         │          │         │          │  observe│          │          │          │
  └───────────┘                 └──────────┘         └──────────┘         └──────────┘         └──────────┘         └────┬─────┘
                                                                                                                          │
                                                  ▲                                                                       │
                                                  └───────────────── Decision / Artifact (re-appended via §2) ────────────┘
```

**Direction summary.** Forward edges (left→right) carry *production*:
primitives flow from the SDK through the WAL into projections, into
generators, into router verdicts, into the applier. The applier's outputs are
re-appended as new primitives (Decision, Artifact) through the L0→L1 path,
closing the loop. Backward edges carry *control*: §2 `OutboundPrompt` and
`ControlSignal` (L1 → L0), §5 router verdicts pausing dependent paths, §7
generators reading L2 projections. Aperture taps every layer for observation
but holds no write authority over the ledger (§9, projection purity).

**L3.5 Scheduler inset (ADR-0024).** Between L3 Generators and L4 Router sits
an explicit **L3.5 Scheduler** tier — the dispatch unit that resolves which
generator emissions advance to Router policy and in what order. The §1.1
diagram shows L3 → L4 as a single arrow for legibility; the canonical
sub-pipeline is:

```
┌──────────┐ propose ┌──────────────┐ dispatch ┌──────────┐
│ L3       │────────►│ L3.5         │─────────►│ L4       │
│ Generators        │ Scheduler    │          │ Router   │
└──────────┘         │ (dispatch    │          └──────────┘
                     │  unit;       │
                     │  ordering,   │
                     │  hazards,    │
                     │  fairness)   │
                     └──────────────┘
```

The Scheduler does not author policy verdicts (that remains L4 Router) and
does not write the ledger (that remains the Applier). It owns generator
emission ordering, dispatch fairness, and instruction-trace hazard analysis
(RAW/WAR/WAW across concurrent generators). §5 is canonical for the
Router-Scheduler boundary; Gabriel owns that authoring slice.

## 1.2 Layer Responsibility Table

| Layer | Owns | Produces | Consumes | Implemented in |
|---|---|---|---|---|
| **L0 — Provider** | SDK adapter; hermetic boundary projection. | `BootstrapPayload` (once), `CrucibleEvent` stream, per-tool-call boundary tags (§2.5). | SDK-native events; `OutboundPrompt`, `ControlSignal` from L1. | `@akubly/crucible-l0-provider` (+ vendor adapters, e.g. Copilot SDK in §12) |
| **L1 — WAL** | Append-only ledger at `~/.crucible/crucible.db`; primitive envelope, content-addressing, monotonic timestamps, bootstrap offset-0 semantics, context-window commitments. | Durable rows; `AppendProtocol` ack; pre-commit hook bus events. | `CrucibleEvent` via `AppendProtocol`; pre-commit hook verdicts. | `@akubly/crucible-l1-wal` |
| **L2 — Derived Query** | Pure projections over L1 (read-set tracked, deterministic, recomputable). | Query results, projection tables (incl. `aperture_events`), `ReadSetRef` provenance for downstream emitters. | L1 row stream (via `LedgerWindowReader`). | `@akubly/crucible-derived-query` |
| **L3 — Generators** | `ProposalGenerator` contract (data + structural variants); trust-tier attribution; conformance suite. | `DataProposal`, `StructuralProposal`, Pareto-fitness results (`PrescriptionResult` with `nonDominatedReason`). | L2 projections; plugin manifests from the registry. | `@akubly/crucible-generators` (interface); Curator, Alchemist, Forge-as-L3 adapter, third-party plugins. |
| **L3.5 — Scheduler** | Dispatch unit between L3 and L4: resolves which generator emissions advance to Router policy and in what order; owns generator-emission ordering, dispatch fairness, and instruction-trace hazard analysis (RAW/WAR/WAW across concurrent generators). Authors no policy verdicts, writes no ledger rows. | `SchedulerDispatch` events (proposal-ordering decisions, hazard annotations); generator-fairness telemetry. | L3 proposals; L2 projections (for hazard analysis); Router back-pressure signals. | `@akubly/crucible-scheduler` (ADR-0024; §5 canonical for the Router boundary). |
| **L4 — Router** (decision sub-tier) | Policy table indexed by `(primitiveKind, trustTier)`; verdict bus; paused-dependent-paths state; Pareto-non-dominated surfacing. | `RouterDecision` events; verdicts (`APPROVE`/`DENY`/`OBSERVE`/`PAUSE`/`ESCALATE_USER_REVIEW`); Aperture queue enqueues. | Scheduler-dispatched proposals; pre-commit hook outcomes; user acks via Aperture. | `@akubly/crucible-router` |
| **L4 — Applier** (enforcement sub-tier) | Sole translator of approved `RouterDecision`s into committed `Decision` primitives on L1; ledger-position fence; context-window-commitment computation; `paused-awaiting-structural-ack` sub-state (R2-3 projection); compensating-Decision revert path. | `Decision` primitives (via §2 boundary); `structural_proposal_state:*` Observations; Aperture notifications on pause/fail/revert. | `RouterDecision` events; `StructuralApprovalQueue` acks (§9); `LedgerWindowReader` slices. | `@akubly/crucible-applier` |
| **Aperture — L5-adjacent** | Notifications + dashboard; `StructuralApprovalQueue` (pure projection per R2-3); bisect, causal slice, time-travel; leaderboard rendering. | `ApertureEvent` projection; CLI verb surface (`crucible aperture witness/show/approve/reject/defer`). | All layers (read-only); Router enqueue handshake. | `@akubly/crucible-aperture` |

Refer to §6 for the exact primitive envelope every layer indexes off, and §2
for the load-bearing L0/L1 boundary that gates the entire pipeline.

**L4 sub-tier note.** L4 is a single layer split into two co-owned sub-tiers:
**Router** (decision: classifies proposals, emits verdicts, manages
paused-dependent-paths state) and **Applier** (enforcement: translates
approved decisions into committed `Decision` primitives under a ledger-position
fence). The §1.1 diagram shows them as adjacent boxes for clarity, but they
share the L4 tier — Applier is not a sixth layer. §5 is canonical for the
Router half; §8 is canonical for the Applier half (and self-labels as "L4"
for that reason). The split exists because the verdict surface and the
ledger-write surface have independently testable contracts; both packages
(`@akubly/crucible-router`, `@akubly/crucible-applier`) ship and version
together.

## 1.3 Chamber-to-Layer Mapping

Crucible's six **product-named chambers** are inherited from the vision-doc
flavor vocabulary (Aaron's verbatim names; see decisions.md "Naming" table).
Layers (L0–L4) are the **implementation taxonomy**; chambers are the
**conceptual surfaces a user sees**. A chamber may span layers or live
entirely outside the Crucible runtime — both are valid.

Notation: `█` = chamber's primary layer; `▒` = chamber participates / has a
contract there; *italic in "Where it lives"* = the chamber is an independent
product, not internal to Crucible.

| Chamber    | L0 | L1 | L2 | L3 | L4 | Aperture | Where it lives |
|------------|:--:|:--:|:--:|:--:|:--:|:--:|----------------|
| **Crucible** | █ | █ | █ | █ | █ | ▒ | The runtime itself — the union of L0–L4 plus Aperture-as-investigation. `@akubly/crucible-runtime` is the composition root. |
| **Cairn**    |   |   |   |   |   |   | *Independent product.* Separate WAL (`~/.cairn/knowledge.db`), separate hooks, separate CLI. Convergence with Crucible only via `@akubly/types`. **NOT a Crucible layer.** |
| **Forge**    |   |   |   | ▒ |   |   | *Independent product.* Also ships a **Forge-as-L3 adapter** that conforms to the §7 generic conformance suite, so Crucible can host Forge prescribers as one L3 generator among many. The adapter is the only Crucible-facing surface; the product itself stays standalone. |
| **Curator**  |   |   |   | █ |   |   | L3 generator within Crucible (`@akubly/crucible-generators/curator`). Detection + proposal authority only — never approval (Tension #2 resolution). |
| **Alchemist**|   |   |   | █ |   | ▒ | L3 **structural** generator (variant transformation loop, skill induction). Emits `StructuralProposal`; surfaces leaderboard rows through Aperture (R2-5). |
| **Aperture** |   | ▒ | ▒ |   | ▒ | █ | The L5-adjacent observation surface. Subscribes to the §4 hook bus, projects L1, hosts the §5 router's structural-approval queue, never writes ledger rows. |

**Why Cairn and Forge appear in the chamber table at all.** They are part of
the broader `@akubly/*` portfolio's mental map and frequently come up in
contributor onboarding. Listing them here pins their non-membership in
Crucible explicitly so future readers do not infer delegation. See §1.5 and
§15 for the coexistence contract.

## 1.4 Package Decomposition (`@akubly/crucible-*`)

Authoritative list of Crucible packages. New packages enter via the §15
coexistence + shared-types PR process; existing `@akubly/cairn`,
`@akubly/forge`, and `@akubly/skillsmith-runtime` packages are out of scope
for this namespace.

| Package | Owns | Notes |
|---|---|---|
| `@akubly/types` | Shared cross-product types: `SessionId` brand, `SessionMetadata`, `BootstrapPayload`, `ContextWindowCommitment`, `StructuralProposal`, `PluginVersionLock`, `PrescriptionResult`, `OptimizationCategory`. | Co-owned (Crucible + Cairn + Forge). Only convergence point across products. |
| `@akubly/crucible-boundary` | The §2 pure-data interface package: `CrucibleEvent`, `BootstrapPayload`, `OutboundPrompt`, `ControlSignal`, `ToolCallBoundary`. Dependency-cruiser rules live here. | No runtime logic; type-only + adapter contracts. |
| `@akubly/crucible-l0-provider` | L0 adapter base + per-SDK implementations. | Vendor adapters (e.g. Copilot SDK §12) live in subpaths or sibling packages. |
| `@akubly/crucible-l1-wal` | Custom append-only WAL, content-addressing, monotonic-timestamp validator, `AppendProtocol`, `LedgerWindowReader`, `ReadSetHasher`. | Storage at `~/.crucible/crucible.db`. |
| `@akubly/crucible-derived-query` | L2 projection runtime; `LedgerProjector`, `QueryExecutor`; `aperture_events` projection table. | Pure functions over L1; replayable. |
| `@akubly/crucible-generators` | L3 `ProposalGenerator` interfaces, conformance suite, generic adapter test catalog, built-in Curator + Alchemist generators. | Forge-as-L3 adapter lives here as the worked example; third parties register through the plugin registry. |
| `@akubly/crucible-router` | L4 policy engine, verdict bus, paused-dependent-paths state machine, `RouterDecision` shape. | Aperture handshake on structural queue ack/reject. |
| `@akubly/crucible-applier` | §8 Applier: state machine (`proposed → approved → applying → applied|failed`), ledger-position fence check, context-window-commitment computation. | Records Decision/Artifact back through §2. |
| `@akubly/crucible-aperture` | §9 Aperture: `ApertureEvent` schema, notification policy, `StructuralApprovalQueue` projection, bisect / causal slice / time-travel investigation tools. | Pure projection per R2-3; no persistent queue state. |
| `@akubly/crucible-plugin-registry` | Plugin discovery, transitive-dep resolution, lockfile format (`PluginVersionLock`), install/fork/session-start lifecycle (R2-6). | Rosella ↔ Roger sync pair owns the lockfile ↔ `SessionMetadata.pluginVersions` handshake. |
| `@akubly/crucible-runtime` | Composition root: wires L0→L1→L2→L3→L4→Applier→Aperture per the §12 SDK integration spec. Exports the runtime SDK consumed by the CLI and the Copilot plugin. | Thin facade; no domain logic of its own. |
| `@akubly/crucible-cli` | The `crucible` bin (§13). Thin shell around `@akubly/crucible-runtime`. | UX layer only. |
| `crucible-copilot-plugin` | Copilot CLI plugin that invokes Crucible via MCP when delegating to the harness. | Unscoped name per Aaron's MCP-surface lock. |

**Naming conventions** (enforced by dependency-cruiser per §2.9):
- All Crucible-internal packages are under the `@akubly/crucible-*` scope.
- Layer-specific packages are named `crucible-<layer-token>` (`l0-provider`,
  `l1-wal`, `derived-query`, `generators`, `router`, `applier`, `aperture`).
- The boundary contract is its own package (`crucible-boundary`) so both L0
  and L1 import it without inducing a layer-to-layer dependency.
- `crucible-runtime` is the only package permitted to import from every other
  Crucible package; all other intra-namespace imports respect layer order.

## 1.5 Coexistence Stance (T5-Consistent)

Crucible is **greenfield**. Cairn and Forge persist as **independent live
products** serving Copilot CLI consumers who want a lightweight harness
without "the heavy hammer of Crucible" (Aaron's lock, verbatim). The
architecture commits to four invariants:

1. **No delegation.** Crucible does not call into Cairn or Forge as
   subsystems; Cairn and Forge do not call into Crucible. The Forge-as-L3
   adapter (§7.B) is the single allowed Crucible-facing surface, and it is a
   conformance-tested *adapter* — not a runtime dependency on the Forge product.
2. **No shared substrate.** Crucible's WAL is `~/.crucible/crucible.db`;
   Cairn's knowledge DB is `~/.cairn/knowledge.db`. No shared schema, no
   cross-DB foreign keys, no shim packages, no harness-in-harness.
3. **Convergence at `@akubly/types` only.** Both teams co-own the shared
   types package. Neither product is the source of truth for the other.
4. **Accepted tax.** Two implementations of overlapping concepts (Cairn
   `event_log` vs Crucible L1 WAL; Forge prescribers vs L3 Generators) are a
   deliberate cost. Audiences differ; the duplication is bounded.

T5 governs Aaron's daily-driver shell. It does not govern the broader
product portfolio. Cairn and Forge keep shipping on their own roadmaps.

## 1.6 Mental Models (Hardware Scaffolding, Not Load-Bearing)

The CTD uses hardware-instruction analogies — Decision↔branch,
Observation↔load, Question↔trap, Artifact↔store, Request↔args — as
**orientation aids** for readers fluent in CPU/OS/database vocabulary. They
are not executable opcode semantics and they are not the architectural
identity of Crucible. The load-bearing identity claim is the one in §1
above: a **minimal typed trace algebra for replayable, accountable agentic
computation**. Hardware analogies survive as long as they remain useful
explanations; they are removable without touching the algebra. See ADR-0020
for the precision-reframing rationale (rejecting the earlier "universal
instruction set of agentic computation" framing as overreach), §6.7 for the
canonical analogy table, and ADR-0024 for the one place a hardware analogy
*did* motivate an architectural change (the L3.5 Scheduler tier).

---

**Reading order from here.** §2 + §6 (Phase 0, already final) pin the
primitive vocabulary and the L0/L1 seam. Phase 1 sections §3, §4, §5, §7,
§11, §12 specify each layer. Phase 2 sections §8, §9, §10, §13, §14, §15
specify the surrounding surfaces. Phase 3 sections §16–§19 cover testing,
observability, security, and the ADR set. The Phase 1 cross-section synthesis
review (interface coherence across the parallel lanes) is a separate
deliverable owned by Graham and produced after all Phase 1 outputs land.
