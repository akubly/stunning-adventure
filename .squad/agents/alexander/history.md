
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

