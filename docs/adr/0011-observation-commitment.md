# ADR-0011: Observation as First-Class L1 Primitive + Declared Context-Window Commitment

**Status:** Accepted — 2026-05-29 by Aaron
**Author:** Graham (Lead / Architect)
**Date:** 2026-05-29
**CTD Anchor:** §2 (L0/L1 Boundary), §3 (L1 WAL), §6 (Primitive Taxonomy)

---

## Context

Crucible's replay and audit properties depend on two foundational choices
about what the L1 WAL captures and how Decisions prove their causal context:

1. **Observation status.** LLM responses, tool outputs, and external state
   reads must be captured for replay. The question: are they envelope metadata
   on Decision rows, or a first-class primitive type alongside Decision,
   Request, Artifact, and Question?

2. **Context-window commitment.** Every Decision should carry a Merkle hash
   proving what the agent "saw" when it decided. The question: does the hash
   cover the full ledger prefix (simple but conservative), or a declared subset
   (precise but requires provider support)?

---

## Options Considered

### Observation Status

**Option O1 — Envelope metadata on Decisions.** Observations are fields on
Decision rows (`observedInputs: Observation[]`). Fewer primitive types; but
Observations that don't lead to Decisions are lost, and the Observation-to-
Decision cardinality is forced to N:1.

**Option O2 — First-class primitive (chosen).** Observation is one of 5 L1
primitive types. Every LLM response, tool result, and external read is its own
WAL row with its own hash-chain position. Replay re-feeds Observations as
oracle reads (§11.2–§11.4). Cardinality is unconstrained; Observations exist
independently of Decisions.

### Context-Window Commitment

**Option C1 — Full prefix only.** Every Decision hashes the entire ledger
prefix. Simple, always correct, no provider dependency. But conservative:
includes rows the model may not have attended to.

**Option C2 — Declared only.** L0 provider declares `causalContextWindow:
EventId[]` per Decision. Hash covers only declared rows. Precise, but requires
provider support that no current SDK exposes.

**Option C3 — Hybrid: declared-with-fallback (chosen, R2-1 LOCK).** L0 MAY
declare `causalContextWindow`. When declared, L1 hashes exactly those rows
and tags `commitmentMethod: 'declared'`. When absent, L1 falls back to the
full ledger prefix and tags `commitmentMethod: 'fallback'`. Both paths
produce valid, replay-equivalent commitments.

---

## Decision

1. Observation is one of the 5 L1 primitives (alongside Decision, Request,
   Artifact, Question).
2. Every Decision row carries a `contextWindowCommitment: Blake3Hash` plus a
   `commitmentMethod: 'declared' | 'fallback'` tag.
3. The fallback path (full prefix hash) is the v1 default for the Copilot SDK
   provider (§12.7).

One-line: Observation is one of the 5 L1 primitives; every Decision row
carries a Merkle hash over its declared causal-context window, with a fallback
when the model API hides it (R2-1 hybrid).

---

## Rationale

### Why first-class Observation (O2 over O1)

- **Replay fidelity.** The replay oracle (§11.6) must re-feed every external
  input in causal order. If Observations are envelope metadata on Decisions,
  inputs that precede but don't directly cause a Decision are invisible to
  replay. First-class Observations ensure nothing is lost.
- **Bootstrap capture.** TDD Q1 requires extra-ledger context (system prompts,
  tool definitions, injected memory) to be captured as Observation primitives
  at offset 0. This is a natural consequence of Observation being first-class;
  as envelope metadata it would require a synthetic "bootstrap Decision" that
  doesn't represent an actual agent choice.
- **Investigation.** `crucible why <decision>` (§13) traces causal ancestry
  through the ledger. First-class Observations appear in that trace as
  independent nodes; envelope metadata collapses them into the Decision node,
  hiding intermediate reasoning steps.
- **Cost.** One additional primitive kind adds one row to the §6 taxonomy and
  one case to the §3.3.1 sub-kind validator. No architectural complexity.

### Why hybrid commitment (C3 over C1/C2)

- **Forward compatibility.** The declared path is shaped for future providers
  (or future SDK versions) that expose attention metadata. The boundary is
  ready; no schema change is needed when the capability arrives.
- **Conservative correctness.** The fallback path (full prefix) is always
  correct — it over-commits (hashes rows the model may not have attended to)
  but never under-commits. Over-commitment does not invalidate replay;
  under-commitment would.
- **Traceability.** The `commitmentMethod` tag lets investigation distinguish
  "we know what the model saw" (declared) from "we hashed everything because
  we don't know" (fallback). This distinction is critical for the boundary-
  faithful replay honesty discipline (§11.10.1).

---

## What Changes

- §6 Primitive Taxonomy: 5 primitive types (Decision, Observation, Request,
  Artifact, Question).
- §3 WAL Row Schema: `primitiveKind` u8 enum includes Observation; Decision
  rows carry `contextWindowCommitment` (32 bytes) + `commitmentMethod` (u8).
- §2 L0/L1 Boundary: `BootstrapPayload` materializes as offset-0 Observation
  rows; `CrucibleEvent` may carry optional `causalContextWindow`.
- §11 Hermetic Replay: oracle re-feeds Observations from CAS; A2 conformance
  covers Observation rows.
- §12 SDK Integration: `SdkProviderCapabilities.declaresCausalContextWindow =
  false` for Copilot SDK v1 (§12.7).

---

## Consequences

- **Positive:** Complete replay fidelity. Observation-independent-of-Decision
  allows richer causal graphs. Hybrid commitment is future-proof without being
  speculative.
- **Negative:** More L1 rows (every tool output is its own row, not tucked into
  a Decision envelope). Storage volume is bounded by CAS deduplication but
  metadata overhead is real.
- **Risk:** The fallback path may dominate indefinitely if no provider ever
  exposes attention data. Mitigation: the fallback is correct and replay-
  equivalent; it costs only a wider hash and a less precise audit trail.

---

## Acceptance Signals

- For providers that declare `causalContextWindow`, replay recomputes the exact
  `contextWindowCommitment` from the declared `causalContextWindowSlice`.
- For providers that do not declare attention data, L1 records
  `commitmentMethod: 'fallback'`, sets the slice to `null`, and hashes the full
  prefix without weakening replay equivalence.
- Mutating any committed Observation in the declared or fallback context window
  causes the replay oracle to fail at the dependent Decision.
- SDK capability tests prove Copilot SDK v1 follows the fallback path until
  `SdkProviderCapabilities.declaresCausalContextWindow` is true.
- Aperture/CLI inspection exposes the commitment method and hash so users can
  distinguish precise declared commitments from conservative fallback ones.

---

## Security Implications

- Observation rows contain verbatim LLM responses and tool outputs. Same
  retention/exposure considerations as ADR-0002 (local-disk, single-user
  threat model, `crucible session delete --purge` as control primitive).
- The `contextWindowCommitment` hash is a tamper-evidence seal, not an
  encryption mechanism. It proves what was committed, not who committed it.
  Multi-user attestation is a v1.5+ concern.

---

## Resolved Questions

- **Q: Does the fallback path weaken the commitment?** No — it over-commits
  (conservative). The commitment is weaker in *precision* (we don't know which
  rows the model attended to) but not in *correctness* (the full prefix is a
  superset of the actual attention set).
- **Q: Should Observation be split into sub-types at L1?** No at the primitive
  level. Sub-kinds (`system_prompt`, `tool_output`, `user_input`, etc.) are
  carried in the `subKind` field per §6.3, not as separate primitive types.
