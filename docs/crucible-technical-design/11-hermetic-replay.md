# §11 — Hermetic Replay

**Status:** FINAL (Phase 1, Lane 4). Authoritative; do not re-litigate locked decisions.
**Owner:** Laura. **Secondary:** Alexander (LLM-boundary capture), Roger (CAS ↔ L1).
**Cross-refs:** §2 (L0/L1 Boundary), §3 (L1 WAL Substrate), §6 (Primitive Taxonomy).
**Test-surface spec:** `docs/crucible-tdd-strategy.md` §3.1 (`LedgerWindowReader`), §3.2 (`ReadSetHasher`), §6.3 (Replay Equivalence), §6.8 (Bootstrap-Capture-Completeness), §6.9 (Monotonic-Timestamps), A2 + A9.
**Depth budget:** ≤3 pages.

This section specifies HOW replay works (capture spine, CAS, re-feed loop, oracle, refusal conditions). The TDD strategy specifies WHAT replay tests assert against that surface; the two documents bind at the named collaborators (`LedgerWindowReader`, `ReadSetHasher`) and the oracle shape defined below.

## 11.1 Non-Determinism Doctrine

Replay **re-feeds captured outputs; it never re-executes side effects**. Anything reached through an L0 adapter (LLM call, MCP tool, filesystem read, web fetch, cross-session memory query) is non-deterministic at the source and is rendered deterministic only by capture-and-replay. Wall-clock time, monotonic process IDs, and machine-local entropy are **legitimate** non-determinism: they appear in the ledger but are explicitly excluded from the replay-equivalence oracle (§11.6). Anything else — different LLM output bytes on identical request hash, missing Observation at a re-fed offset, divergent Decision commitment — is a **replay-equivalence failure** and surfaces as a hard error, never silent drift.

The doctrine drives every choice in this section: the capture scope (§11.2) exists so every non-deterministic input is in the ledger or CAS; the oracle (§11.6) partitions fields into structural vs informational so legitimate non-determinism doesn't trip the test; the preflight refusals (§11.7) exist so a corrupt source ledger never produces a "successful" replay that just happens to disagree with reality.

## 11.2 Capture Scope

Capture is exhaustive over the L0/L1 boundary (§2). Every L0-mediated input becomes an `Observation` primitive (§6.2) on the ledger; large payloads spill to the CAS by content hash. Capture is keyed to the `Request`/`Artifact`/`Observation` row schema defined in §3; this section adds no new row fields.

| Source | Captured as | Sub-kind (§6.3) | Bootstrap? | Body location |
|---|---|---|---|---|
| System prompt (L0-injected) | `Observation` | `system_prompt` | **Yes (offset 0)** | inline if ≤4 KiB, else CAS |
| Tool definitions (L0-injected) | `Observation` | `tool_definitions` | **Yes (offset 0)** | inline |
| Memory fragments literally injected at bootstrap | `Observation` | `injected_memory` | **Yes (offset 0)** | CAS, `sourceManifestId` set |
| LLM call response | paired `Request{llm_call}` + `Artifact{llm_output}` + `Observation{llm_response}` | — / — / `llm_response` | No | response bytes in CAS; request hash in Observation body |
| Streaming LLM delta (M2) | `Observation{stream_delta}` | `stream_delta` | No | **CAS, UTF-8 NFC text** (decoded, not raw bytes) |
| MCP / tool call **result** (D1) | paired `Request{tool_call}` + `Artifact{tool_output}` + `Observation{tool_output}` | — / — / `tool_output` | No | **LLM-visible result bytes in CAS** (post-SDK-truncation; see §2.3 D1 note) |
| Side-effect-only tool call (M3) | `Request{tool_call}` + `Artifact{synthetic_output}` + `Observation{tool_output}` | — / synthetic / `tool_output` | No | inline marker |
| Cross-session memory query result | `Observation` | `cross_session_memory` | No | CAS |
| Ambient external input not modeled as Request (user paste, env var) | `Observation` | `external_input` | No | CAS, hashed source identifier |
| L0 context-manager pruning event | `Observation` | `context_truncation` | No | inline |

`Observation.body` for any `llm_response` / `tool_output` / `cross_session_memory` carries `{ requestHash, responseRef }`, where `requestHash` is the BLAKE3 of the CBOR-canonical request (LLM messages array, tool arguments, etc.) and `responseRef` is the CAS digest of the response bytes. This pair is the replay re-feed key (§11.4). **D1 clarification:** For `tool_output` sub-kind, `responseRef` points to the **LLM-visible tool result** (post-SDK-truncation/filtering), not the raw pre-filter tool source bytes. The capture boundary (§2.3) sits after SDK-side content filtering; pre-filter bytes never cross L0→L1 and are out of scope for v1 replay.

Bootstrap rows (offset 0) materialize directly from `BootstrapPayload` (R2-2 lock, §2): `literalContext.systemPrompt` → `system_prompt`, `literalContext.toolDefinitions` → `tool_definitions`, `literalContext.injectedMemoryFragments[*]` → `injected_memory` rows, and `memoryManifest` is recorded as a SessionMetadata side-table (queryable later but not bootstrap rows). They commit as a single atomic group-commit batch per §3.

## 11.3 Content-Addressed Store (CAS) Interface

The CAS is the spill store for any payload too large to inline in a WAL row. It is content-addressed (BLAKE3-256), append-only, garbage-collected by L1 retention policy (§3), and deduplicating across sessions.

```ts
type CasDigest = string;                    // hex BLAKE3-256

interface CasStore {
  put(bytes: Uint8Array): Promise<CasDigest>;          // idempotent; returns existing digest if seen
  get(digest: CasDigest): Promise<Uint8Array | null>;  // null = miss (replay refusal trigger §11.7)
  has(digest: CasDigest): Promise<boolean>;
  iterDigests(prefix?: string): AsyncIterable<CasDigest>;  // for GC + integrity audits
}
```

**Volume projection (v1, per-session steady-state):**

- WAL ledger rows: ~0.5–2 KiB/row × ~500 rows/typical-session ≈ **0.25–1 MiB**.
- CAS payload (dominated by LLM responses + tool outputs): ~5–20 KiB/response × ~150 LLM/tool calls ≈ **1–3 MiB**, with dedup typically reclaiming 30–50% across repeat prompts within a session.
- Combined steady-state per session: **~2–4 MiB**; CAS:WAL ratio **~3–10×** (consistent with the rev. 3 plan's "~5–10×" projection). Bootstrap offset 0 contributes ≤200 KiB typical (system prompt + tool defs), regardless of session length.

## 11.4 Replay Protocol

```ts
interface ReplayDriver {
  replay(sessionId: SessionId, opts?: { strict?: boolean }): Promise<ReplayReport>;
}

interface ReplayReport {
  status: 'pass' | 'fail';
  divergenceAtOffset: number | null;
  divergenceKind: 'oracle' | 'bootstrap' | 'commitment' | 'plugin' | 'cas-miss' | null;
  rowsReplayed: number;
  wallClockMs: number;        // informational; budget < 10% of original (A2)
}
```

**Procedure:**

1. **Preflight** (§11.7). Refuse-to-start checks run before any row is re-fed.
2. **Bootstrap rehydration.** Load offset-0 row set via `LedgerWindowReader.read(sessionId, 0, 0)`. Reconstruct an in-memory replay session pinned to the source ledger's `schemaVersion` and `SessionMetadata.pluginVersions`.
3. **Re-feed loop.** For each subsequent row at offset `n`, in canonical order:
   - If it is a `Request{llm_call}` or `Request{tool_call}`, do **not** dispatch to the live L0 adapter. Compute `requestHash` from the row's canonical CBOR and look up the matching `Observation{llm_response | tool_output}` later in the ledger (cross-indexed by `producedBy` ⇄ Artifact ⇄ paired Observation). Re-feed the captured `responseRef` payload as if the adapter had just returned it. **D1 note:** For tool calls, the re-fed payload is the LLM-visible result (post-SDK-filter), not the raw tool source output; replay proves boundary-faithfulness at the L0↔L1 interface (§11.2).
   - If it is a `Decision`, reconstruct its causal context window per §11.5, recompute the commitment, and assert equality with the stored `contextWindowCommitment`. Mismatch → `divergenceKind: 'commitment'`, fail.
   - **PA-B4 ancestry reads:** If the row's `causalReadSet.ancestryRefs[]` is non-empty, replay re-feeds the same stitched view (parent + child ledger) that the generator saw during live runtime. The stitched view is keyed by read-set hash; `LedgerWindowReader.readAncestry(childSid, includeParents=true)` is the L1 primitive (§10.4). Generators that omit `.ancestry()` in forked sessions will replay with child-only context, matching their live emission.
   - For every row, append into the replay ledger via the normal `AppendProtocol` (§3) with `replayMode: true` so timestamps are assigned but excluded from the oracle.
4. **Oracle comparison** (§11.6). After re-feed completes, compare original ledger vs. replay ledger under `normalizeTimestamps()`; any structural-field divergence → fail.

The re-feed loop is testable at the component tier by stubbing `LedgerWindowReader` and `ReadSetHasher` (Laura TDD §3.1, §3.2). No L0 adapter is constructed during replay.

## 11.5 Context-Window Reconstruction (R2-1 LOCK)

For each `Decision` row, replay reads `DecisionPayload.commitmentMethod` (§6.2) and dispatches:

```ts
function reconstructWindow(d: Decision, reader: LedgerWindowReader): EventId[] {
  if (d.primitivePayload.commitmentMethod === 'declared') {
    // L0 declared an explicit attention slice at emission time.
    return d.primitivePayload.causalContextWindowSlice!;   // non-null by R2-1 invariant
  }
  // Fallback: full ledger prefix up to (but excluding) this Decision's offset.
  const prefix = reader.read(d.sessionId, 0, d.commitOffset - 1);
  return prefix.map(row => row.id);
}

function verifyCommitment(d: Decision, hasher: ReadSetHasher, reader: LedgerWindowReader): void {
  const window = reconstructWindow(d, reader);
  const rows = reader.materialize(d.sessionId, window);   // resolve ids → canonical CBOR
  const recomputed = hasher.hashCanonicalRows(rows);      // BLAKE3 over CBOR-canonical concatenation
  assertEqual(recomputed, d.primitivePayload.contextWindowCommitment);  // mismatch = replay failure
}
```

Two refusal conditions specific to this step: (a) `commitmentMethod === 'declared'` with `causalContextWindowSlice === null` is a schema violation, fail immediately; (b) any `EventId` in the declared slice that resolves outside the ledger prefix at `commitOffset` is a Bootstrap-Capture-Completeness violation per R2-1's edge-case clause, fail and route to the §6.8 invariant test, not the oracle.

## 11.6 Replay-Equivalence Oracle (Q6 LOCK)

The oracle is a deep-equality comparison over a **structural projection** of each ledger row. Informational fields are masked.

| Field | Class | Compared? |
|---|---|---|
| `id`, `sessionId`, `primitiveKind`, `primitivePayload`, `parentId`, `causalParentId`, `causalReadSet`, `taskId`, `trustTier`, `schemaVersion` | structural | **yes — byte-equal required** |
| `hooks` (verdict + witness) | structural | **yes** (per A3) |
| `DecisionPayload.contextWindowCommitment`, `commitmentMethod`, `causalContextWindowSlice` | structural | **yes** |
| WAL hash-chain field (§3) | structural | **yes** |
| `timestamp` (envelope) | informational | **no** — normalized to `0` |
| any payload field tagged `wallClockDerived` (e.g., adapter-stamped duration_ms) | informational | **no** — masked to `null` |
| CAS `responseRef` digest | structural | **yes** (re-feed must hit the same bytes) |
| CAS payload bytes | structural | **yes** (covered transitively by digest equality) |

```ts
function normalizeTimestamps<T extends { timestamp: number; primitivePayload: any }>(rows: T[]): T[] {
  return rows.map(r => ({
    ...r,
    timestamp: 0,
    primitivePayload: stripWallClockDerived(r.primitivePayload),
  }));
}
// Oracle:
expect(normalizeTimestamps(replayed)).toEqual(normalizeTimestamps(original));
```

The Monotonic-Timestamps invariant (§6.9) is enforced by a **separate** property test against each ledger independently; it is not part of the oracle. This split is deliberate: replay must remain bit-equivalent on structure even when source-ledger clocks behave reasonably differently from replay-host clocks.

## 11.7 Replay Refuses To Start

Preflight is fail-fast. Replay never begins re-feed if any of the following hold; each maps to a distinct `divergenceKind`:

1. **Bootstrap-Capture-Completeness violation** (`bootstrap`). The offset-0 row set does not match the bootstrap manifest in `SessionMetadata` (missing `system_prompt`, missing `tool_definitions`, count mismatch on `injected_memory`, or any `sourceManifestId` not resolvable from `memoryManifest`). Per §6.8, this is a hard error, not silent drift.
2. **Missing transitive-dep rehydration** (`plugin`). `SessionMetadata.pluginVersions` (R2-6 snapshot) lists a `(name, version)` that the local plugin cache cannot produce. Replay refuses rather than silently substituting a different version.
3. **Schema-version mismatch** (`bootstrap`). Source ledger's offset-0 `schemaVersion` is not supported by the current binary (§6.5).
4. **CAS miss on a referenced payload** (`cas-miss`). Any `responseRef` digest in any captured Observation is not present in the CAS.
5. **Monotonicity violation in source ledger** (`bootstrap`). §6.9 invariant fails on the source — replay would launder corruption.

The preflight stage is itself testable: see §6.8 / A2 test pseudocode below.

## 11.8 Conformance Assertion Specs (A1–A4)

Names align with Laura TDD strategy §A1–A4 / §A9. Pseudocode is the **literal assertion shape** the conformance runner emits.

```ts
// A1 — Fork lineage preserved through replay.
test('A1 fork lineage', async () => {
  const child = await fork(parent, /*atOffset*/ 23);
  const replayed = await replay(child.sessionId);
  expect(replayed.status).toBe('pass');
  expect(meta(child).parentSessionId).toBe(parent.sessionId);
  expect(meta(child).forkPointEventId).toBe(eventIdAt(parent, 23));
});

// A2 — Hermetic replay produces identical ledger.
test('A2 hermetic replay', async () => {
  const original = await loadGoldenSession();          // 100 primitives, 3 LLM, 12 tools
  const replayed = await replay(original.sessionId);
  expect(replayed.status).toBe('pass');
  expect(normalizeTimestamps(rows(replayed)))
    .toEqual(normalizeTimestamps(rows(original)));
  expect(replayed.wallClockMs).toBeLessThan(0.1 * original.wallClockMs);
});

// A3 — Pre-commit hook verdicts replay identically.
test('A3 hook verdict replay', async () => {
  const replayed = await replay(sessionWithVetoes.sessionId);
  for (const [o, r] of zip(rows(sessionWithVetoes), rows(replayed))) {
    expect(r.hooks).toEqual(o.hooks);     // verdict + witness byte-equal
  }
});

// A4 — Backward causal slice reconstructs from replay ledger.
test('A4 causal slice via replay', async () => {
  const replayed = await replay(session.sessionId);
  const slice = await causalSlice(replayed, /*ofDecision*/ 'P47');
  // Recompute commitment on the slice; must equal stored value.
  expect(hasher.hashCanonicalRows(slice)).toEqual(decision('P47').contextWindowCommitment);
});
```

The A9 determinism-conformance suite is the A2 test parameterized over the curated golden-session corpus.

## 11.9 Acceptance Signals

This spec is sufficient to write:

- **A2** (hermetic replay byte-identity) and **A9** (determinism conformance) — against the `ReplayDriver` interface and the oracle in §11.6, using the golden corpus.
- **§6.3 (Replay Equivalence)** invariant — directly against the oracle.
- **§6.8 (Bootstrap-Capture-Completeness)** in the replay path — against the preflight refusal in §11.7 condition 1.
- **§6.9 (Monotonic-Timestamps)** validation at the replay-source boundary — against preflight condition 5 (the invariant property test itself remains owned by §3).

Collaborator seams for component-tier mocking: `LedgerWindowReader` (TDD §3.1), `ReadSetHasher` (TDD §3.2), `CasStore` (this section), `AppendProtocol` (§3). No replay test requires a real LLM or a live tool runtime.

## 11.10 Reproducibility Honesty: Trace vs. Behavioral

Replay guarantees one specific, narrow, falsifiable property. It does **not** guarantee what a careless reader of "hermetic replay" might assume. The honesty discipline is mandatory; mis-stating it laundered-as-stronger is the single most consequential failure mode of this entire architecture.

**The LLM IS the I/O subsystem of agentic computation.** Crucible's substrate (the 5 primitives, the WAL, the hook bus, the projector, this replay protocol) is the deterministic CPU. Every LLM call, tool call, and external read is a memory-mapped peripheral whose response is non-deterministic at the source. Replay treats those responses as **oracle reads** — captured at first execution into `Observation` rows (§11.2), hashed into the CAS (§11.3), and re-fed (§11.4) instead of re-issued. This is exactly the `rr` / Pernosco pattern: a deterministic execution engine over a logged non-deterministic oracle, translated from process-level syscalls to agentic-level LLM/tool boundaries.

Two distinct properties follow, and conflating them is a category error:

- **Trace reproducibility — what Crucible guarantees.** Given the same source ledger prefix and the same captured oracle results in the CAS, replay produces a **byte-equivalent** replay ledger under the §11.6 oracle. The A1–A4 / A9 conformance assertions (§11.8) assert exactly this and nothing more. The proposition is: *the agent saw exactly this input, ran exactly these instructions (primitives in trace order), and committed exactly these Decisions, again.* **Prerequisite: plugin artifacts must remain available** in their original locations. If referenced artifacts are unpublished, evicted from cache, or accessible registries become unreachable, replay cannot complete the re-feed loop. The determinism guarantees degrade from hermetic to "works only while this machine still has the artifacts in its current configuration."

- **Behavioral reproducibility — what Crucible does NOT guarantee.** The same LLM, given the same context, may make a different choice on a fresh run because of: model weight updates (provider-side silent rollouts), sampling stochasticity (temperature, top-k, top-p, seed handling), decoding-stack differences (server version, batching, speculative decoding), tool / policy / prompt changes upstream of the call, external state drift (filesystem, network, time, repository), and context construction non-determinism (cache hits, truncation heuristics, retrieval order). None of these are observable from the replay ledger, and none of them invalidate trace reproducibility — they invalidate the assumption that re-prompting would produce the same Decision.

**What the replay invariant DOES prove:** the agent observed this exact byte sequence of inputs in this exact causal order, executed the primitive stream recorded on the ledger, and committed the Decisions present in the ledger with their context-window commitments intact. This is sufficient for post-hoc audit, blame assignment, causal-slice investigation (§13 `crucible why`), regression bisect against a captured timeline (§16.5 Bisect), and forward debugging of harness/projection/hook logic.

**What the replay invariant does NOT prove:** that the model would make the same Decision if re-prompted from scratch; that the Decision was correct; that the agent is safe under perturbed inputs; that a different model version, provider, sampler seed, or context-construction strategy would produce a compatible Decision; or that any property of the I/O subsystem (the LLM itself) holds. Those are separate test surfaces — behavioral-reproducibility tests, differential testing across providers, mutation testing on Observations, and fuzzing of context construction — and they live in §16 (Test Strategy), explicitly **not** in the replay-equivalence oracle of §11.6.

The discipline this section binds: never report a passing replay as evidence of agent correctness; never quote A2/A9 conformance as evidence of model behavior; never weaken the §11.6 oracle to "tolerate" behavioral drift, because tolerance at this seam is exactly the silent corruption §11.7 preflight exists to prevent. If a test wants to assert something about model behavior, it must live in the surfaces named in §16 and must not borrow the word "replay."

**Sister honesty doctrine: §18.4.1 known limits on PII/secret handling.** Replay completeness (capturing full boundary trace) and redaction (removing secrets from captured content) are in tension. v1 prioritizes replay fidelity; §18.4.1 documents the data-controller obligations this creates and the v1 mitigation toolkit (`crucible session delete --purge`, retention ceiling, operator hygiene). Both §11.10 and §18.4.1 are honesty disciplines — they name what the system does NOT guarantee and prevent over-claiming.

### 11.10.1 Boundary-Faithful vs. Prompt-Faithful Replay

Sections §11.10 and §11.2–§11.4 establish that replay captures and re-feeds Observation rows at the `SdkProvider` boundary — the L0/L1 contract surface (§2). This is **boundary-faithful replay**: the replay ledger reproduces exactly what crossed the `SdkProvider` interface, byte-for-byte, in causal order.

A stronger property — **prompt-faithful replay** — would require that the captured Observation also reflect the exact byte sequence the SDK transmitted to the upstream model endpoint. Crucible v1 does **not** guarantee prompt-faithful replay because the SDK may silently inject content between the L0 boundary and the model API call:

- **Hidden system prompts** — safety preambles, behavioral directives, or provider-injected role messages that the SDK prepends to the conversation before sending to the model.
- **Tool-schema rewrites** — the SDK may transform, filter, or augment tool definitions between what L0 declared via `BootstrapPayload.literalContext.toolDefinitions` and what the model receives.
- **Retrieval context injection** — provider-side RAG or grounding content that the SDK injects into the context window without surfacing it to the consumer.
- **Safety / content-filtering context** — classifier outputs, content-policy metadata, or guardrail annotations that travel with the request but are invisible at the boundary.

**What this means for the hermetic claim:** v1 replay proves that the agent's L1+ logic (WAL, hook bus, projectors, Router, Applier, generators) executed deterministically over the captured boundary trace. It does **not** prove that the model saw the same prompt on the original run as what the boundary trace implies — because the SDK is opaque below L0. The A2/A9 conformance assertions remain valid (they assert trace reproducibility over boundary data); they do not assert prompt reproducibility.

**Degradation statement:** if a future investigation requires prompt-faithful replay — e.g., to determine whether a Decision was influenced by an SDK-injected safety preamble — Crucible cannot provide it from boundary data alone. The investigation must obtain raw SDK request traces (API-level logs) and diff them against the captured Observation stream to measure the boundary-to-prompt gap.

**Validation plan (forward-compat, §12.7):** when the Copilot SDK or a future provider exposes raw request traces (outbound HTTP payloads, token-level prompt construction), Crucible should:
1. Capture the raw request trace as an additional CAS artifact alongside the boundary Observation.
2. Diff the boundary Observation against the raw trace to quantify injected content (hidden system tokens, rewritten tool schemas, retrieval context).
3. Surface the diff in Aperture as a `boundary_prompt_gap` metric, enabling operators to assess how much invisible context the SDK added.

Until that surface exists, any claim of "hermetic replay" must be qualified as **boundary-faithful** — faithful to the L0/L1 contract, not to the model's actual input. Alexander (§12 owner) authors the corresponding §12.7 paragraph documenting the SDK-side validation hook; this subsection is the replay-side complement. Operators relying on long-term replay should preserve plugin artifacts externally — tarball archives indexed by lockId, integrity verification via CAS digest, and resilience to registry churn.

## 11.10.2 Threat Model (PA)

**Hermetic replay security implications are governed by ADR-0011 (Observation as First-Class L1 Primitive + Declared Context-Window Commitment).** See `docs/adr/0011-observation-commitment.md` for full threat analysis. Key points:

- **Observation rows contain sensitive payloads:** Verbatim LLM responses and tool outputs. Same retention/exposure considerations as ADR-0002 (local-disk, single-user, `crucible session delete --purge` control primitive).
- **Context-window commitment as tamper-evidence:** `contextWindowCommitment` BLAKE3 hash proves what was committed, not who committed it. Detects divergence at replay time; does not prevent it. Multi-user attestation deferred to v1.5+.
- **Fallback path over-commits:** When `commitmentMethod: 'fallback'`, the hash covers the full ledger prefix (conservative). Weaker precision, but does not weaken correctness (§11.10.1).
- **Boundary-faithful vs prompt-faithful:** v1 replay guarantees trace reproducibility at the L0/L1 boundary; does NOT guarantee the model saw identical prompts (SDK may inject hidden content). Degradation acknowledged in §11.10.1.

**Cross-references:** §18.1 (single-user threat model), ADR-0011 §Security Implications, §11.10.1 (boundary-faithful honesty), §18.4.1 (Known Limits — PII/secret handling).

## 11.11 VETO Inputs Are Out of Scope for Replay

The §4.3.1 Ledger-layer pre-stage gate (Surface 1) can produce a `veto` verdict that causes `Ledger.append` to throw before any WAL byte is written. **Vetoed inputs never appear in the WAL.**

Replay implications:

- The re-feed loop (§11.4 step 3) iterates WAL rows only; it never encounters a vetoed input. No replay handling is needed for `veto`.
- The oracle (§11.6) compares WAL rows; vetoed inputs produce no WAL row and are therefore invisible to the oracle. This is correct by construction.
- The preflight checks (§11.7) do not surface a `veto`-specific refusal condition; absence of a vetoed-input row in the replay ledger is not a divergence — it matches the source ledger, which also has no such row.
- P3 (§4.7) — the closed WAL-verdict enum `{continue, observe, pause, null}` — is unaffected. `veto` is a Ledger-layer concept; the WAL-row `hookVerdict` field never carries it.

**Honesty note:** a session where many veto gates fired (inputs were rejected before append) is indistinguishable at the WAL level from a session where those inputs were never attempted. This is intentional: the WAL records what happened, not what was prevented. Aperture attention-tier events may surface veto telemetry out-of-band if a future veto-telemetry hook is registered as an `observe`-verdict predicate on subsequent rows; that is an opt-in observation, not a WAL invariant.
