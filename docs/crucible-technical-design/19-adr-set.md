# §19 — ADR Set (Index)

**Owner:** Graham (Lead / Architect)
**Status:** FINAL — index only; ADR bodies are post-CTD authoring work in `docs/adr/`.
**Format reference:** [`docs/adr/0001-composition-root.md`](../adr/0001-composition-root.md).

---

## 19.1 Purpose

The CTD locks 17 design choices that would be expensive to reverse, plus the **two Phase 4 framing-amendment ADRs** (ADR-0020 typed-trace-algebra reframing, ADR-0024 explicit L3.5 Scheduler tier) added after the 8/8 STRENGTHENS UIS weigh-in. ADR-0019 is reserved for the landed childSid-collision hybrid decision, which post-dates CTD close but is now part of the durable ADR set. Each lands as a standalone ADR in `docs/adr/000N-<slug>.md` after CTD acceptance, authored by the section owner who carries the decision in the body of the CTD. This section is the **index only** — number, title, one-line decision statement, status, author, and the CTD anchor where the decision is argued. No ADR content lives here.

Rows without authored bodies carry status **Accepted (CTD-locked) — pending authoring**: Aaron accepted the CTD decision at CTD acceptance time; the ADR file is the durable artifact and gets `Status: Accepted — <date> by Aaron` at the moment its file lands. Post-CTD ADRs carry their own accepted date.

---

## 19.2 ADR Index

| # | Title | Decision (one line) | CTD anchor | Author | Status |
|---|-------|--------------------|------------|--------|--------|
| **ADR-0002** | L1 WAL Substrate Selection | Adopt Roger's A.3 hybrid — custom pure-TypeScript append-only WAL for L1, with SQLite reserved for derived tables only. | §3 | Roger | Accepted (CTD-locked) — [body authored](../adr/0002-l1-wal-substrate.md) |
| **ADR-0003** | L0/L1 Boundary Hermetic Contract | The L0 SDK boundary emits exactly one `BootstrapPayload` + a totally-ordered append-only event stream; no out-of-band state crosses the boundary. | §2 | Graham | Accepted (CTD-locked) — pending authoring |
| **ADR-0004** | Canonical Serialization (CBOR + BLAKE3) | All L1 records use deterministic CBOR for bytes and BLAKE3 for content hashes and Merkle chains; SHA-* and JSON are forbidden on the hermetic path. | §3, §11 | Roger | Accepted (CTD-locked) — pending authoring |
| **ADR-0005** | Hook Bus Verdict Model | Pre-commit hooks return exactly one of `continue` / `observe` / `pause`; no veto, no rewrite, no async verdict. | §4 | Roger | Accepted (CTD-locked) — pending authoring |
| **ADR-0006** | Router as Single Policy Choke-Point | The Router is the sole place where trust-tier, capability, approval, and prescription-tiebreak policy is enforced; generators, applier, DecisionGate, and SDK never decide policy. | §5 | Gabriel | Accepted (CTD-locked) — [body authored](../adr/0006-router-policy-chokepoint.md) |
| **ADR-0007** | Session Branching Model | Sessions branch via `parent_session_id` + `fork_point_event_id`; forks are pure projections over the parent's L1 prefix, never copies. | §10 | Roger | Accepted (CTD-locked) — pending authoring |
| **ADR-0008** | Hermetic Replay Doctrine | Replay re-feeds recorded events into the same code paths; it never re-executes model calls, tools, or wall-clock side effects. | §11 | Laura | Accepted (CTD-locked) — pending authoring |
| **ADR-0009** | T5 — Crucible Owns Trunk, Copilot SDK is One Provider | Crucible owns the trunk session and event ordering; the Copilot SDK is one Provider among many on equal footing with future Providers. | §1, §12 | Graham | Accepted (CTD-locked) — pending authoring |
| **ADR-0010** | Cairn / Forge / Crucible Coexistence Stance | Crucible is greenfield; Cairn and Forge remain independent products; the only shared surface is `@akubly/types`. No cross-runtime imports. | §15 | Roger | Accepted (CTD-locked) — pending authoring |
| **ADR-0011** | Observation as First-Class L1 Primitive + Declared Context-Window Commitment | Observation is one of the 5 L1 primitives; every Decision row carries a Merkle hash over its declared causal-context window, with a fallback when the model API hides it (R2-1 hybrid). | §2, §3, §6 | Graham | Accepted (CTD-locked) — [body authored](../adr/0011-observation-commitment.md) |
| **ADR-0012** | BootstrapPayload Literal + Manifest | The `BootstrapPayload` is a single literal CBOR document plus a content-addressed manifest of every file/blob it references; no implicit inheritance from process env (R2-2). | §2, §12 | Alexander | Accepted (CTD-locked) — pending authoring |
| **ADR-0013** | Structural-Proposal Queue as L1-Derived Projection | The Aperture approval queue is a pure SQL projection over L1 sub-kind rows; no separate write surface, no state-drift gap (R2-3). | §9 | Valanice | Accepted (CTD-locked) — pending authoring |
| **ADR-0014** | Transitive Plugin Dependency Graph Pinned at Fork | Plugin deps follow install-time resolve → fork-time snapshot into `SessionMetadata.pluginVersions` → session-start rehydration; no late resolution (R2-6). | §7, §10, §15 | Rosella | Accepted (CTD-locked) — pending authoring |
| **ADR-0015** | Bisect Env-Snapshot Stamped at Start | Bisect snapshots env once at start, all iterations use the fixed snapshot, output stamps the snapshot hash; internally consistent, not externally hermetic (R2-4). | §11 | Laura | Accepted (CTD-locked) — pending authoring |
| **ADR-0016** | Timestamps Informational + Monotonic-Within-Session Invariant | Replay byte-equality excludes timestamps; a separate property test enforces strict per-session monotonicity (Q6). | §11, §16 | Laura | Accepted (CTD-locked) — pending authoring |
| **ADR-0017** | Zero-Tolerance Mock-Drift Gate (Agentic-Cost Framing) | A single SDK-contract test failure blocks all PRs; rationale is the agentic cost function, not CI throughput preference (Q7). | §16 | Laura | Accepted (CTD-locked) — pending authoring |
| **ADR-0018** | Pareto-Incomparable Prescriptions Both Non-Dominated | When two prescriptions are Pareto-incomparable, both surface as non-dominated with `nonDominatedReason: 'incomparable'`; no zero-fill, no partial-dominance heuristic in v1 (R2-5 + Q8). | §7, §8, §9, §13 | Rosella | Accepted (CTD-locked) — [body authored](../adr/0018-pareto-incomparable.md) |
| **ADR-0019** | childSid Collision — Always-Prompt Hybrid Design | On childSid collision, prompt the user to start a new timestamp-variant fork or resume the aborted child; non-TTY callers must pass `--new` or `--resume`. | §10, §13, §16 | Rosella | Accepted — [body authored](../adr/0019-childsid-collision-hybrid.md) |
| **ADR-0020** | Primitives as Minimal Typed Trace Algebra (not Universal ISA) | Adopt rubber-duck reframing; 5 primitives are the base replay/audit algebra, with executable semantics defined by sub-kinds + schemas + effects + causal edges. Rejects the earlier "universal instruction set of agentic computation" framing as overreach; hardware-instruction analogies remain mental scaffolding (§1.6, §6.7), not load-bearing architectural claims; sub-kind discipline (declared schema + effects + causal-edge contract + runtime semantics) is the governance rule that prevents semantic bucket inflation. | §1, §6 | Graham | Accepted (CTD-locked) — pending authoring |
| **ADR-0024** | Explicit L3.5 Scheduler Tier | Promote scheduler to explicit L3.5 tier between L3 Generators and L4 Router; resolves generator-dispatch ordering, dispatch fairness, and instruction-trace hazards (RAW/WAR/WAW) across concurrent generators; motivated by the hardware out-of-order-execution / dispatch-unit analog (Erasmus US-E-13 + rubber-duck convergence under the 3+ agent missing-concept threshold); promoted from B-revisit-deferred to v1 because the dispatch contract has to land before Router policy is wired. | §1, §5 | Gabriel | Accepted (CTD-locked) — pending authoring |

---

## 19.3 Authoring & Lifecycle Rules

- **One ADR per file** under `docs/adr/`. ADR-0001 (Composition Root) predates Crucible and is left in place. Landed ADR numbers are stable; if a planned/pending row collides with a landed ADR, renumber the planned row to the next free number rather than renumbering the landed artifact. ADR numbering may retain gaps from earlier draft allocations (the Phase 4 framing amendments now slot in as ADR-0020 and ADR-0024).
- **Section owner = ADR author.** The agent who carried the decision in the CTD body owns the ADR file. Reviewer is Aaron in every case; secondary review follows the §19 ownership map row for the originating CTD section.
- **Status transitions:** `Pending` → `Accepted — <date> by Aaron` at file-landing. Future revisions use the standard `Superseded by ADR-XXXX` chain; no in-place edits to the decision once accepted.
- **Body shape:** Follow ADR-0001 — Context, Options Considered, Decision, Rationale, What Changes, Consequences, Security Implications, Resolved Questions. CTD anchor cited in Context; one-line decision statement above appears verbatim in the Decision section. **Options Considered MUST include ≥1 rejected alternative with rejection rationale** (PA finding: reviewers need to see what was rejected, not just what was chosen). **Security Implications** subsection is mandatory (even one sentence per threat surface suffices; full threat modeling stays in §18).
- **No new ADRs are surfaced by §19 itself.** Any decision not in this table either (i) is already covered by ADR-0001, or (ii) is a refinement that lives in the CTD section without an ADR. Surfacing a new ADR after CTD acceptance requires a new decisions-inbox drop.

---

**Cross-references:** All nineteen rows trace to a numbered CTD section; the CTD section is the durable argument, the ADR is the durable lock. The CTD itself is the source of truth until the ADR files land; thereafter the ADR governs and the CTD section becomes a pointer.
