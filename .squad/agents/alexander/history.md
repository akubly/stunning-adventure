📌 Team update (2026-06-02T06:14:32Z): **M8 storage milestone kicked off (Aaron, 2026-06-01).** Slices A→D planned. Aaron locked Q1=scaffold-A-write-B, Q2=cursor pagination, Q3=own eureka.db. Roger (Slice A impl SPAWNED) and Laura (contract audit SPAWNED) on branch eureka/m8-slice-a-sqlite-factreader. — Scribe

---

# Alexander — History

**Role:** Runtime Lead (SDK integration, Crucible-Eureka orchestration, session lifecycle)
**Status:** Crucible CTD (Comprehensive Technical Design) Phase 1 complete. Phase 2 (R2-1 causalContextWindow + R2-2 BootstrapPayload) in progress.
**Last update:** 2026-06-02

**Key milestones:**
- Eureka-Crucible runtime overlap analysis (session models, hermetic replay, sweep lifecycle)
- Crucible SDK integration findings (Copilot SDK does not expose attention metadata; v1 ships commitmentMethod: 'fallback' exclusively)
- Crucible CTD Phases 1–3 review cycles complete
- R2 Decisions locked (6 decisions via Aaron triage)
- Wave 0/Wave 2 scope finalized
- Phase 4.6 W1–3: Migration framework patterns, circular dependency resolution, lockout-routing practices

## Archived Learnings (Summarized from 127KB detailed entries)

**Eureka as library to Crucible is the lowest-cost integration shape.** Eureka is SDK-agnostic; receives SessionId as correlation token only. Out-of-process shapes (MCP server, daemon) break hermetic replay boundary. Library integration preserves Eureka state inside L1 WAL.

**Session model dual lenses:** Cairn = operational lifecycle (when, where, status); Eureka = epistemological (what was learned). Both reference same SessionId brand but storage/schema independent. No runtime cross-DB queries (Eureka FR-7.2 hard rule). Reconciliation is offline-only.

**Critical integration gap: sweep lifecycle coupling.** Crucible owns authoritative session lifecycle (Cairn sessions.ended_at). If Crucible ends session but no one calls ureka.session.end() + sweep(), Eureka never sweeps. Mitigation: wire Crucible's session-end hook to call Eureka synchronously. v1.5 event-stream subscription deferred (adds coupling, violates Path D).

**Hermetic replay extends to Eureka if library-integrated.** Eureka calls recorded as L1 primitives; replay re-invokes deterministically (BM25 is deterministic, no LLM in v1). Snapshot contract required: both Cairn knowledge.db and Eureka gent.db must be snapshotted for full replay fidelity.

**Copilot SDK limitation found: no attention metadata.** SDK does not expose provider attention scores. v1 ships commitmentMethod: 'fallback' exclusively. Forward-compat door locked for future attention-aware providers (v1.5+).

**Wave 2 scope final:** autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2, ATTENUATION_FLOOR=0.1; CLI surface only (no MCP in Wave 2). Curator wiring deferred to Wave 3.

**R2 Decisions locked (6 total):** L0/L1 causalContextWindow contract (hybrid B-with-A-fallback), BootstrapPayload.literalContext extraction at session bootstrap, and others. Phase 2 fan-out now unblocked.

**Migration framework + circular dependency patterns:** Idempotent migration.up(db) with schema_version table; mirror pattern for Cairn↔Forge imports; lockout-routing for cross-assignment fixes.

---

**See history-archive.md for full session learnings, design ceremony notes, Wave 0/1/2/3 progression, Phase 4.6 work, and CTD review cycles.**

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe
- 2026-06-05 📌 M3: Forge prescriber wired to HintDispositionProvider seam for disposition consumption (dismissed→suppress, resolved→boost). See .squad/decisions/inbox/graham-forge-m3-disposition-consumer.md.
