# §0 — Phase 2 Synthesis Review (Interface Coherence)

**Status:** FINAL. Gate output for Phase 3 fan-out (§17 / §18 / §19).
**Owner:** Graham (Lead / Architect, reviewer-rejection lockout authority).
**Date:** Phase 2 close, 2026-05-28.
**Scope:** Phase 2 sections §9, §10, §13, §14, §15, §16 (≈ 90 KB) + the
five Phase 1 sections re-touched for errata (§1, §3, §5, §6, §7). Total
authored CTD surface now 17 sections + this synthesis ≈ 281 KB.
**Methodology:** 10 coherence checks per CTD plan rev. 3 Appendix C
"Phase 2 Synthesis" gate, plus a dedicated erratum-verification pass that
walks the Phase 1 §0.1 findings table row-by-row and confirms each
landing.
**Verdict:** **GREEN — Phase 3 spawns.** All Phase 1 errata closed; both
Phase 2 sync pairs CLOSED; no structural finding outstanding; three
advisory items (Sonny consult, Phase 3 ADR scope, future L2/L5 standalone
sections) routed without blocking.

## Newly-surfaced open questions for Aaron

**None.** Every Phase 2 outcome is either an applied erratum, an
explicitly-CLOSED sync pair (§15.7), or a forward-routed Phase 3 hot
item with a named owner. No locked decision was challenged; no new
contract was authored that exceeds the depth budget or breaks an
invariant.

---

## 0.1 Phase 1 Erratum Verification Pass

Walked the Phase 1 §0.1 findings table; each erratum confirmed landed
in the file the synthesis routed it to.

| #   | Phase 1 finding                                              | Routed to            | Status   | Verified at                                                                                                                                  |
|-----|--------------------------------------------------------------|----------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------|
| 2a  | `Timestamp` ms-vs-ns drift                                   | Roger (§6 + §3)      | CLOSED   | §6 adds `type TimestampNs = bigint` (option c — split); §3.3 `WalRow.timestampNs: TimestampNs`; §3 imports updated; §3.10 unchanged in behaviour. §15.7 records pair as CLOSED.       |
| 2b  | `manifestRoot` flag missing from §3.3 flags enum             | Roger (§3.3)         | CLOSED   | §3.3 flags enum now includes `manifestRoot: boolean`; §3.2 bitfield comment updated; §3.8 bootstrap pseudocode reference matches schema; §10.4 sets `manifestRoot: false` on `fork_origin`. |
| 5   | `dependentPaths` semantic split (string[] vs EventId[])      | Rosella → Roger (§7) | CLOSED   | §7.1 + §7.D switched to `EventId[]`; §7.A C-7 preserved; §5.3 was already `EventId[]`; §9.5 queue entry uses `EventId[]`; §15.2 `StructuralProposal` type uses `EventId[]`. §15.7 CLOSED. |
| 6b  | §5 vs §8 ack sub-kind disagreement                           | Valanice (§5.3+§9)   | CLOSED   | §5.3 surgical patch applied: subscribes by `(primitiveKind, subKind ∈ structural_proposal_{acked,rejected,expired})`; §9.5 handshake spec matches; §9.4 lifecycle matches; §8.2 references the same sub-kind family; §13.1 verbs write the matching sub-kinds. |
| 10  | §1.2 L4 row vs §8 self-label                                 | Graham (§1.2)        | CLOSED   | §1.2 split into "L4 — Router (decision sub-tier)" and "L4 — Applier (enforcement sub-tier)" rows + sub-tier note; §8 self-label aligns; §1.4 package list (`@akubly/crucible-router` + `@akubly/crucible-applier`) consistent. |
| 12a | `structural_proposal_*` sub-kinds in §6.3                    | Graham (Phase 1)     | APPLIED  | §6.2 union + §6.3 sub-type table both carry the four sub-kinds; §3 sub-kind index consumers (§3.3.1) unchanged; §9 / §13 / §5 all reference the same names verbatim. |
| 12b | `appendFenced` missing from §3.4                             | Roger (§3.4.1)       | CLOSED   | §3.4.1 publishes full surface — args (`{sessionId, expectedHead, row}`), failure shape (`{kind: 'fence-violation', actualHead}`), success path, when-to-use vs `append(batch)`, bounded-retry contract for §8.3. §8 reference site reads cleanly. §15.7 CLOSED. |

**Erratum-verification verdict:** **7 of 7 Phase 1 findings closed**;
zero residual coordination required from Phase 1 routing.

---

## 0.2 Phase 2 Coherence-Check Results Table

| #  | Coherence check                                                                                              | Result    | Finding kind |
|----|--------------------------------------------------------------------------------------------------------------|-----------|--------------|
| 1  | §10 (branching) ↔ §3 (WAL): segment model, bootstrap manifest inheritance, transitive-dep graph (Q1/Q4/R2-2/R2-6) | CLEAN     | — |
| 2  | §9 (Aperture) ↔ §4 (Hook Bus) ↔ §5 (Router): subscriber contract; StructuralApprovalQueue ↔ Router resume (R2-3 + 6b); 4 locked event shapes | CLEAN     | — (one observation noted under §0.4) |
| 3  | §13 (CLI) ↔ §8 (DecisionGate) ↔ §9 (Aperture): verb coverage for all interaction surfaces                    | CLEAN     | — |
| 4  | §15 (coexistence) ↔ §7 (generators) ↔ §10 (transitive-dep timing): three-phase lifecycle + sync pair         | CLEAN     | — (R2-6 sync pair CLOSED per §15.7) |
| 5  | §16 (Test Strategy) ↔ Laura's TDD strategy + all CTD sections: cross-reference discipline + collaborator matrix | CLEAN  | — (two future-section bindings = L2/L5 future work, not Phase 3 gaps) |
| 6  | Erratum verification — Phase 1 findings 2a / 2b / 5 / 6b / 10 / 12a / 12b                                     | CLEAN     | All seven CLOSED (see §0.1) |
| 7  | Vocabulary consistency on Phase 2 surface (TimestampNs, appendFenced, structural_proposal_*, EventId[], nonDominatedReason, R2-3 queue projection, R2-4 env-snapshot stamp) | CLEAN | — |
| 8  | Cross-section sync-pair status (Gabriel↔Valanice R2-3, Rosella↔Roger R2-6)                                    | CLEAN     | Both CLOSED |
| 9  | Phase 3 readiness: §17 / §18 / §19 inputs satisfied by Phase 0+1+2 surface                                    | CLEAN     | Hot items enumerated in §0.5 |
| 10 | Sonny consultant pull-in (advisory, parallel to this gate)                                                    | CLEAN     | Status note routed to coordinator (§0.6) |

Counts: **CLEAN 10 · MINOR 0 · STRUCTURAL 0 · APPLIED (Phase 1) 7 / 7**.

---

## 0.3 Per-Check Detail

### Check 1 — §10 branching ↔ §3 WAL substrate

§10 uses §3's published surfaces correctly. `ledger.bootstrap` (§10.3)
calls `AppendProtocol.bootstrap(payload)` — §3.4's authored entrypoint —
and emits the `manifestRoot`-flagged Observation (§10.1 column comment
+ §3.8 bootstrap pseudocode + §3.3 flags enum now agree). Fork protocol
(§10.4) writes a synthetic `fork_origin` Observation through
`AppendProtocol.append([origin])` (the high-throughput entrypoint, no
fence required because forks are single-writer at the segment-creation
boundary). Bootstrap manifest inheritance is **by reference** (R2-2
preserved — extra-ledger context lives on offset-0 Observation rows,
not in the manifest column); plugin lockfile is copied **verbatim**
(R2-6 preserved). Transitive-dep three-phase lifecycle (§10.5) cleanly
divides into install / fork-snapshot / session-start with named owners
per phase. The forked-timestamp monotonicity floor (§10.7) propagates
through `fork_origin.body.parentForkPointTimestampNs`, structurally
carrying TDD §6.4 / §6.9 invariants across multi-generation fork
chains. No re-litigation of locked §3 contract.

### Check 2 — §9 Aperture ↔ §4 Hook Bus ↔ §5 Router

§9 is correctly authored as a **post-commit L2 projection** (§6.6
purity invariant). It does not subscribe to §4's pre-commit hook bus
(which would be wrong — Aperture renders committed state, not
verdict-eligible drafts); it consumes commits via
`LedgerProjector.onCommit` (TDD §3.3). This is the right contract for
Aperture's role and the §4 subscriber surface remains exclusively for
predicate-registered pre-commit hooks.

The StructuralApprovalQueue handshake with §5's Router resume protocol
is implemented per finding 6b's recorded resolution:

- Aperture writes `Observation{subKind ∈ structural_proposal_{acked,
  rejected, expired}, body: StructuralAckPayload}` (§9.5 steps 3, §9.9
  verbs).
- Router's L2 subscriber subscribes by `(primitiveKind, subKind)` —
  matching §5.3 (Valanice's surgical patch) and §6.3's sub-kind index.
- Router emits `router.decision` with `outcome: 'resume' | 'reject'`;
  Applier resumes per §8.2 step 5.
- Aperture's projector flips `resolved = 1` on the queue entry as soon
  as the resolving sub-kind row commits (UX guarantee: "I clicked
  approve, the row left my inbox"), independent of Router progress.

The 4 event shapes Gabriel locked (`router.paused`, `router.decision`,
`aperture.structural-ack-prompt`, `aperture.structural-ack`) are
consumed correctly. One narrow clarification surfaced and noted under
§0.4: §9.5 step 2 repositions `aperture.structural-ack-prompt` as a
**CLI-shell-only in-process pubsub event** (consumed by `crucible
aperture watch` and the status-line tail) rather than as a §5-routed
event. This is internally consistent (§5 did not need the prompt —
only the `_acked/_rejected/_expired` sub-kind commit) and does not
break Gabriel's contract; it sharpens the "Aperture owns its own
notification surface" boundary. No finding.

### Check 3 — §13 CLI verbs ↔ §8 DecisionGate ↔ §9 Aperture

§13.1 covers every §8 DecisionGate interaction surface (`crucible
decide approve|reject|defer` wrapping `Applier.onRouterDecision`;
`crucible revert <decisionId>` wrapping `Applier.revert` for the §8.7
compensating-Decision path) and every §9 Aperture verb (`crucible
aperture watch|show|approve|reject|defer|why|bisect`). Distinct
namespaces (`crucible aperture …` vs. `crucible decide …`) preserve
the "structural is async, data is inline" mental model called out in
§13.7. Idempotency rule (write verbs no-op on already-resolved
proposal/decision ids) matches §9.4 resolution lifecycle and §8.2
state transitions.

### Check 4 — §15 coexistence ↔ §7 generators ↔ §10 transitive-dep timing

§15.1 boundary table is consistent with §7's generator contract:
plugin registry forked (Cairn discovery vs.
`@akubly/crucible-plugin-registry`); Cairn host **reused** inside §7.2
generator lifecycle (no new plugin-host package per §7.2 lock); two
trust-tier vocabularies bounded with Forge adapter (§7.B) mapping
`source` → `trustTier` at emission. The R2-6 three-phase lifecycle in
§15.5.2 mirrors §10.5 row-for-row; ownership boundary spelled out
(Rosella owns install algorithm; Roger owns lockfile format +
fork-snapshot + session-start pure-load contract). `PluginVersionLock`
appears in §15.2 evolution table, in §15.5.1 package surface, and in
§10.5 verbatim — three references, one shape. Sync pair Rosella↔Roger
CLOSED per §15.7.

### Check 5 — §16 Test Strategy ↔ Laura's TDD strategy + all CTD sections

§16 is correctly authored as a **declarative CTD-side cross-reference**
to `docs/crucible-tdd-strategy.md`; counts, tier ratios, fixture
patterns, and proposition text remain in the TDD strategy. §16.2 maps
each invariant (TDD §6.1–§6.9) to its CTD binding surface; §16.3 maps
each TDD collaborator (§3.1–§3.7) to its CTD-owning section.

The collaborator alignment matrix is **complete**: all 17 collaborators
(per Laura's drop) have rows. Two rows bind to CTD sections that are
not yet authored as standalone files — `QueryExecutor` (L2 Derived
Queries detail section, deferred) and `CausalSliceEngine` (L5
Investigation section, deferred). Both are referenced via §1.2's L2
row and §11's substrate respectively; both have primary test tier
fixed (Component) regardless of which section ultimately owns the
impl. **These are L2/L5 future-work sections, not Phase 3 §17/§18/§19
sections** — confirmed by inspection of the Appendix C scope tables
and the §16 drop's own framing. No Phase 3 gap.

`BisectOrchestrator` is jointly mapped to §13 (CLI verb) and the L5
Investigation section; this matches §13.1 / §13.6 / §9.6 / §16.5 / the
R2-4 env-snapshot lock surface, all of which read from the same
`BisectRow.envSnapshotHash` source.

### Check 6 — Erratum verification

See §0.1 above. **7 of 7 closed.**

### Check 7 — Vocabulary consistency on Phase 2 surface

| New / amended type                  | Owning section | Consumer cross-references                                | Status |
|-------------------------------------|----------------|----------------------------------------------------------|--------|
| `TimestampNs = bigint`              | §6 (Phase 2 finding 2a) | §3.3 `WalRow.timestampNs`, §10.1 `created_at_ns`, §10.5 `PluginVersionLock.resolvedAt`, §15.2 evolution table | Consistent |
| `appendFenced(...)`                 | §3.4.1         | §8.3 `applyWithFence`, §15.7 sync-pair row              | Consistent |
| `structural_proposal_{emitted,acked,rejected,expired}` | §6.3 | §5.3 subscription, §8.2 / §8.8 emission, §9.4 / §9.5 / §9.9 lifecycle + verbs, §13.1 / §13.5 verb help text | Consistent |
| `dependentPaths: EventId[]`         | §7.1 + §7.D    | §5.3 `RouterPausedPayload`, §9.5 `StructuralApprovalEntry`, §15.2 `StructuralProposal` | Consistent |
| `nonDominatedReason: 'optimal' \| 'incomparable'` | §7.5 | §8.5 propagation, §9.7 leaderboard rendering, §13.6 `LeaderboardJsonRow`, §15.2 `PrescriptionResult` | Consistent |
| R2-3 queue projection (`StructuralApprovalQueue` as SQL view) | §9.5 | §5.3 / §8.2 handshake, §13.1 verb set, §13.4 `@inbox` saved query | Consistent |
| R2-4 env-snapshot stamp             | §9.6 + §13.6   | §16.4 productivity-loop smoke test, §16.5 Tooling subsection, TDD §3.6 `BisectOrchestrator` | Consistent |

No vocabulary drift detected. The §6.3 union, §3.3 sub-kind index,
§5.3 subscription, §9.5 lifecycle, and §13.1 verb table all reference
the same four `structural_proposal_*` sub-kinds verbatim.

### Check 8 — Cross-section sync-pair status

- **Gabriel ↔ Valanice (R2-3 Aperture ↔ Router):** **CLOSED.** §9.5
  handshake step list + §5.3 surgical patch + §6.3 sub-kind family
  jointly satisfy. Confirmed by Valanice's drop §"Finding 6b
  Resolution — Confirmed."
- **Rosella ↔ Roger (R2-6 lockfile format ↔ snapshot field):**
  **CLOSED.** Roger's drop §4 records lockfile-format agreement (flat
  `Record<packageName, ...>` + `lockId: Blake3Hash` footer). §15.5.1
  publishes the `PluginRegistry` surface; §10.5 publishes the
  verbatim-copy fork rule; §15.7 records the pair as CLOSED.

### Check 9 — Phase 3 readiness

See §0.5 hot-items list. Inputs for §17 / §18 / §19 are all satisfied
by Phase 0+1+2 surface.

### Check 10 — Sonny consultant pull-in

See §0.6 routing note.

---

## 0.4 Findings Categorisation

- **CLEAN:** 10 of 10 coherence checks.
- **MINOR:** 0.
- **STRUCTURAL:** 0.
- **APPLIED (Phase 1 errata verified at landing):** 7 of 7.

No proposed fix list — there is nothing to fix. The narrow §9.5
clarification that `aperture.structural-ack-prompt` is CLI-shell-only
in-process pubsub (rather than a §5-routed event) is noted as an
observation, not a finding; it sharpens the boundary in the direction
both authors already documented.

---

## 0.5 Phase 3 Hot Items — Inputs for §17 / §18 / §19

### §17 — Observability (event catalog spans all layers)

**Owner:** TBD per Appendix C §17 (Phase 3 fan-out).
**Inputs satisfied by Phase 0+1+2:**

- **L0 events:** §2 boundary contract — `CrucibleEvent` shape per
  primitive kind.
- **L1 events:** §3.3 `WalRow` columns + §3.4 commit / fence outcomes;
  §3.8 bootstrap; §3.10 monotonic-violation post-hoc emission.
- **L2 events:** §6.6 projection-purity invariant; §9 Aperture
  projection events (`ApertureEvent` family in §9.1); §10
  `sessions`-table rebuild signals.
- **L3 events:** §7 `ProposalGenerator` lifecycle hooks (start, propose,
  stop); §7.A conformance suite fail-open recordings.
- **L4 events:** §5 Router decisions (`router.paused`,
  `router.decision`); §8 Applier `applied | reverted | quarantine`
  Decisions + `structural_proposal_*` Observations.
- **L5 events:** §9.6 `BisectRow.envSnapshotHash`; §9.8 causal-slice
  + registry hits.
- **Hook bus events:** §4.7 P1–P5 replay-recording rules.
- **Mock-drift telemetry as a distinct PR-blocking channel** per §16.8
  agentic-cost framing.

§17 author writes the catalog; no new primitive shape required.

### §18 — Security (threat model + safety floor)

**Inputs satisfied by Phase 0+1+2:**

- **Safety floor in §4:** pause-on-hook, observe (fail-open),
  capability tiers from §5 + §8 (trust-tier monotonicity per §15
  enforcement points).
- **Trust gradient:** §15.1 + §15.4 (4-tier vocabulary builtin /
  adopted / community / external + Forge `source` mapping).
- **Capability boundaries:** §5 default-deny on external tier; §8.6
  DecisionGate rules table.
- **Ledger integrity:** §3.2 CAS + BLAKE3 hash-chain; §3.13
  append-only-by-construction; §11.5 `verifyCommitment`; §11.7
  preflight refusals.
- **Bootstrap-capture-completeness:** §3.8 atomic offset-0 append + §10
  bootstrap manifest inheritance.
- **Coexistence boundary:** §14.1 SHARED-vs-PRIVATE table for Eureka;
  §15.1 for Cairn — neither has read or write authority into
  `~/.crucible/`.
- **Plugin supply chain:** §15.5 `PluginVersionLock` integrity + R2-6
  pinning + Rosella's install-time conflict detection (algorithm
  contract).

§18 author writes the threat model and enumeration of attack
surfaces; no new contract required.

### §19 — ADR Set (full index)

**ADRs expected** (every locked decision and structural choice should
land as an ADR; flat list, Phase 3 author categorises):

- R-series locks: R2-1 (declared-window commitment), R2-2 (extra-
  ledger context on offset-0 only), R2-3 (StructuralApprovalQueue as
  pure projection + queue mechanics), R2-4 (bisect env-snapshot
  per-row stamp), R2-5 (`nonDominatedReason` field + no Pareto
  zero-fill), R2-6 (transitive-dep three-phase lifecycle + lockfile
  format).
- TDD-Q locks: Q1 (Observation as first-class primitive), Q2 (Eureka
  adapter v1.5 deferral + §7.A conformance reuse), Q3 (structural
  proposals async-queue; default-not-applied), Q5 (bisect env-snapshot
  internal-consistency, not external-hermeticity), Q6 (forked-
  timestamp monotonicity floor), Q7 (zero-tolerance mock-drift gate),
  Q8 (no-zero-fill Pareto rule).
- Phase 1 findings: 2a (TimestampNs split, option c chosen), 2b
  (`manifestRoot` flag), 5 (`dependentPaths` → `EventId[]`), 6b
  (Aperture-written ack sub-kind family), 10 (§1.2 L4 sub-tier split,
  option a), 12a (sub-kind enum amendment), 12b (`appendFenced`
  surface).
- Coexistence stance: §14 (Eureka as external library + adapter, not
  a Crucible chamber); §15 (no shared substrate with Cairn; share
  identifiers, fork everything else); accepted-tax enumeration
  (§15.4).
- Architectural choices: Aperture as pure projection (no
  write-stateful queue storage); `crucible aperture` vs `crucible
  decide` verb namespace split; CLI as thin REPL over
  `@akubly/crucible-runtime`; commitmentMethod fallback-only in v1
  (Alexander §12 SDK finding).
- Reviewer-rejection lockout pattern (history-of-record on Graham's
  side); 12-check coherence-synthesis pattern (reusable).

§19 author indexes these; no new content required.

---

## 0.6 Sonny Consultant Pull-In — Routing Note

Valanice flagged advisory consult for **§9.8** (investigation tool
interfaces — `CausalSliceTool`, `BisectTool`, `RegistryTool`), **§9.6**
(bisect rendering vocabulary), **§13.1** (CLI verb vocabulary,
especially `why` / `bisect` / `approve|reject|defer` triads), and
**§13.6** (JSON schemas for machine-consumer adequacy). Consult is
**advisory, runs in parallel with this synthesis**; neither §9 nor §13
blocks on it. Coordinator to schedule when ready.

Sonny's outstanding T1 deliverable (gdb→Aaron vocabulary translation
table per `valanice/history.md` 2026-05-25) is a natural pairing
artifact for the §9 / §13 advisory pass; recommend bundling.

---

## 0.7 Phase 3 Verdict: GREEN

**Phase 3 spawns unblocked.** All 7 Phase 1 errata closed at landing.
Both Phase 2 sync pairs CLOSED. Zero structural findings; zero minor
findings; zero vocabulary drift on the new surface. §17 / §18 / §19
inputs are all satisfied by Phase 0+1+2; the hot-items list in §0.5
is informational scope for Phase 3 authors, not blocking work.

The synthesis is **GREEN rather than YELLOW** because the Phase 1
routing worked: every finding that was named in §0.3 of the Phase 1
synthesis review landed in the file that synthesis routed it to, with
the type / shape / sub-kind names matching across all consumers.
Phase 2 produced two new sync pairs (R2-3 and R2-6), both authored
to closure inside the Phase 2 deliverables themselves (per §15.7 and
Valanice's drop). There is no carry-forward debt into Phase 3.

### What Phase 3 authors should know on day one

- **§17 author:** Event catalog scope is enumerated in §0.5; every
  primitive emission point is already authored by Phase 0+1+2 — your
  work is the catalog index, not new emission contracts. Mock-drift
  telemetry is a distinct PR-blocking channel per §16.8; honour the
  Q7 lock by giving it its own observability surface.
- **§18 author:** Threat model uses §4 safety floor + §15 coexistence
  boundary + §11 hermetic-replay invariants as already-locked
  primitives. The supply-chain surface is §15.5 `PluginVersionLock`
  integrity; the user-facing surface is §13 verb friction calibration.
- **§19 author:** ADR list in §0.5 is exhaustive over Phase 0–2;
  recommend one ADR per row plus a category index. Phase 1 findings
  10 and 12b are the most likely to need narrative ADRs (the rest
  are short-form lock records). Future-work L2 (Derived Queries detail)
  and L5 (Investigation detail) sections are flagged here so the ADR
  index can stub forward placeholders.

---

## 0.8 Methodology Note — Erratum-Verification-After-Phase Step

The Phase 1 synthesis routed 7 findings to Phase 2 owners under the
reviewer-rejection lockout. The Phase 2 synthesis adds an explicit
**erratum-verification pass** as its first work product (§0.1 above):
walk the previous synthesis's findings table, and for each row that
was routed forward, locate the landing site in the current Phase's
output and confirm the type / shape / sub-kind / vocabulary is
consistent across all named consumers.

This pass is what turns YELLOW into GREEN. Without it, the Phase 2
synthesis would have had to repeat the 12-check matrix against the
re-touched Phase 1 sections to convince itself nothing regressed; the
erratum-verification table is a much cheaper and more honest version
of that work. Recommend adopting as a standard pattern for any
subsequent CTD synthesis gate where the previous gate's verdict was
not GREEN.

Recorded in Graham's history (Learnings) for reuse on the Phase 3
synthesis gate.
