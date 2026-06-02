# Erasmus — CTD Phase 2 Consultant Orchestration Log
**Timestamp:** 2026-05-28-115407-UTC  
**Agent:** erasmus-ctd-p2-consult (opus-4.7-1m-internal)

## Summary
Advisory review of §1 Architectural Overview and §6 Primitive Taxonomy through agentic-harness prior art lens (rr, Pernosco, Temporal, LangGraph, AutoGen).

## Verdict
**SOLID.** L1 WAL as central design bet is correct and rare. Content-addressing via BLAKE3 + CBOR is right call. L0 isolation discipline is unusually strong.

## Key Findings
- **Focus 1 — 5-layer stack:** L2 as pure projection layer is genuinely novel. L4 Router/Applier split is correct. Aperture L5-adjacent framing slightly fudged (suggest rename to "Projection Plane" or "Investigation Plane").
- **Missing layer between L3+L4:** No explicit Scheduler tier. When generators become async/parallel, "which runs now" is load-bearing. Suggest **US-E-13 Generator Scheduler.**
- **Focus 2 — L1 WAL:** Ledger-as-source-of-truth doctrine is correct. CBOR canonical pinning recommended (RFC 8949 §4.2 has floating-point ambiguities).
- **Focus 5 — SDK-shaped boundary:** L0/L1 seam implicitly Copilot-SDK-shaped. Multi-provider future architecturally permitted but not architecturally anticipated.
- **Focus 4 — Failure primitive missing:** 5-primitive taxonomy missing two kinds prior art needs (especially for scheduling/retry/recovery).

## Advisory Items (Non-Blocking)
- **US-E-13 — Generator Scheduler tier** (explicit policy: when/how-many generators run concurrently).
- **US-E-14 — Rename Aperture to numbered/clear name** (zero implementation cost).
- **US-E-15 — WAL schema evolution and projection versioning** (operational nightmare mitigation).

## Integration Notes
Erasmus findings are advisory only. Graham + Aaron decide which US items enter Phase 3/4 planning. Scheduler tier acknowledged as lower-priority given v1 scope lock.
