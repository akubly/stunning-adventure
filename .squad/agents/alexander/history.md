
**Critical integration gap: sweep lifecycle coupling.** Crucible owns authoritative session lifecycle (Cairn sessions.ended_at). If Crucible ends session but no one calls ureka.session.end() + sweep(), Eureka never sweeps. Mitigation: wire Crucible's session-end hook to call Eureka synchronously. v1.5 event-stream subscription deferred (adds coupling, violates Path D).

**Hermetic replay extends to Eureka if library-integrated.** Eureka calls recorded as L1 primitives; replay re-invokes deterministically (BM25 is deterministic, no LLM in v1). Snapshot contract required: both Cairn knowledge.db and Eureka gent.db must be snapshotted for full replay fidelity.

**Copilot SDK limitation found: no attention metadata.** SDK does not expose provider attention scores. v1 ships commitmentMethod: 'fallback' exclusively. Forward-compat door locked for future attention-aware providers (v1.5+).

**Wave 2 scope final:** autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2, ATTENUATION_FLOOR=0.1; CLI surface only (no MCP in Wave 2). Curator wiring deferred to Wave 3.

**R2 Decisions locked (6 total):** L0/L1 causalContextWindow contract (hybrid B-with-A-fallback), BootstrapPayload.literalContext extraction at session bootstrap, and others. Phase 2 fan-out now unblocked.

**Migration framework + circular dependency patterns:** Idempotent migration.up(db) with schema_version table; mirror pattern for Cairn↔Forge imports; lockout-routing for cross-assignment fixes.

---

**See history-archive.md for full session learnings, design ceremony notes, Wave 0/1/2/3 progression, Phase 4.6 work, and CTD review cycles.**

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe
- 2026-06-06 📌 scribe: OQ-2 LOCKED (FEDERATE) + Refactor 3 complete (real SQLite adapter, 14/14 green)
- 2026-06-05 📌 M3: Forge prescriber wired to HintDispositionProvider seam for disposition consumption (dismissed→suppress, resolved→boost). See .squad/decisions/inbox/graham-forge-m3-disposition-consumer.md.
- 2026-06-06 📌 M3: HintDispositionProvider seam finalized on squad/42-forge-m3-disposition (3 commits, 1563 tests green, READY TO SHIP). Constants coupling: shared hintStateTransitionConstants.ts owns event format (type, source, payload keys, resolution values). Wave 2 autoApplyEligible propagation depends on disposition seam stability — this finalization unblocks downstream integration work.

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
npm install restart. Doc-hygiene scope established for future improvements.

---

## Learnings

**2026-06-16 — S3 Phase 0.5 Skeleton T4: StubSdkProvider (SK-1)**

**StubSdkProvider deterministic contract:**
- File: `packages/crucible-core/src/skeleton/sdk-provider-stub.ts`
- Exported class: `StubSdkProvider`
- `id = 'stub-sdk@1'`, `sdkVersion = '0.0.0-stub'`, `schemaVersion = 1`
- Determinism mechanism: djb2 hash of the prompt string → stable 8-character hex (`promptHash`). No timestamps, no randomness anywhere in the output. Same prompt → byte-for-byte identical `TurnResult`. SK-5 replay holds unconditionally.
- `bootstrap(opts)` builds `BootstrapPayload` directly from opts fields; `memoryManifest` is always `[]` for the skeleton.
- `shutdown(reason)` is an idempotent no-op resolve.

**Exact PrimitiveInput shape used (from `packages/crucible-core/src/types.ts`):**
```ts
interface PrimitiveInput {
  primitiveKind: PrimitiveKind;   // 'observation' | 'decision' | ...
  primitivePayload: unknown;
  causalReadSet: string[];
  metadata?: EventMetadata;
}
```

**Observation row (primitives[0]):**
```ts
{
  primitiveKind: 'observation',
  primitivePayload: { source: 'stub-sdk', content: `stub-response:${promptHash}`, promptHash },
  causalReadSet: [],
}
```

**Decision row (primitives[1]):**
```ts
{
  primitiveKind: 'decision',
  primitivePayload: { source: 'stub-sdk', action: 'passthrough', rationale: `stub decision for prompt hash ${promptHash}` },
  causalReadSet: [promptHash],
}
```

Laura and Roger: `causalReadSet` on the Observation is `[]` (nothing read yet); on the Decision it is `[promptHash]` — the hash string is the logical causal reference. Both rows have no `metadata` field (optional, omitted). `primitiveKind` discriminators are lowercase: `'observation'` and `'decision'`.

Build result: `npx tsc --build` — clean (exit 0). `npx vitest run` — 192/192 tests green.
