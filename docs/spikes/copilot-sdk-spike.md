# Spike: Copilot SDK as Forge Runtime Foundation

**Author:** Graham (Lead / Architect)  
**Date:** 2026-04-07  
**Branch:** `squad/copilot-sdk-spike`  
**Status:** Scoped — awaiting execution

---

## Goal

Determine whether `@github/copilot-sdk` (Technical Preview) can serve as the
runtime foundation for Forge — the agentic execution harness that complements
Cairn's observability platform.

We need to learn the SDK's real capabilities, limitations, and integration
surface before chartering a sister squad or committing to a monorepo structure.
This is exploration, not production code.

---

## Questions to Answer

### Q1 — Session Management
Can we wrap `CopilotClient` and manage sessions programmatically?

- Can we create, resume, and terminate sessions via the API?
- What lifecycle hooks does the client expose?
- Is session state inspectable (tool history, message log, token counters)?

### Q2 — Tool Call Interception
Can we intercept/observe tool calls before and after execution?

- Does the SDK expose a middleware or observer pattern for tool invocations?
- Can we log tool name, arguments, duration, and result without modifying tool implementations?
- Is there a `beforeToolUse` / `afterToolUse` hook or equivalent?
- What's the interception granularity — per-call, per-batch, per-turn?

### Q3 — Decision Gates
Can we inject decision gates (human-in-the-loop checkpoints) into the execution flow?

- Can we pause execution before a tool call and wait for external approval?
- Does the SDK support a confirmation callback pattern?
- Can we implement "stop and ask Aaron" checkpoints without forking the SDK?
- What's the UX for approval — blocking prompt, async callback, event-based?

### Q4 — Event Taxonomy
What events does the SDK emit, and at what granularity?

- Roger already found `assistant.usage` events with model, tokens, latency, cache metrics, and billing multiplier. What else is in the event stream?
- Is there a typed event catalog, or do we need to discover events empirically?
- Do events include correlation IDs for request tracing?
- What's the event delivery guarantee — at-most-once, at-least-once, exactly-once?

### Q5 — Cairn Bridge
Can we bridge SDK events into Cairn's `event_log` with minimal code?

- What's the minimum adapter needed to map SDK events → Cairn event schema?
- Can we stream events in real-time, or is it batch/polling only?
- Does the event shape align with Cairn's `(session_id, type, payload, created_at)` model?
- Estimate: lines of bridge code? 50? 500?

### Q6 — Stability & Limitations
What are the SDK's actual limitations and stability guarantees?

- What does "Technical Preview" mean concretely — API churn frequency, breaking change policy, deprecation timeline?
- Are there known bugs, missing features, or "here be dragons" areas?
- What Node.js / runtime requirements does the SDK impose?
- Does it conflict with any of our existing dependencies (`better-sqlite3`, `@modelcontextprotocol/sdk`, etc.)?
- What authentication / GitHub token requirements exist?

### Q7 — Model Selection & Token Budgeting
How does the SDK handle model selection and token budgeting?

- Can we specify which model to use per-session or per-request?
- Does it expose token budget configuration (max input, max output)?
- Can we read actual token usage programmatically (building on Roger's `assistant.usage` finding)?
- Is there a cost estimation API, or do we calculate from usage events?

### Q8 — End-to-End Integration
Can we build a minimal "Forge" session that runs a simple task and feeds events to Cairn?

- Build a proof-of-concept: SDK session → executes a simple task (e.g., "read a file and summarize it") → events flow into Cairn's event_log → Cairn can query and display them.
- This is the integration smoke test. If this works, the architecture holds.
- If it doesn't, identify exactly where it breaks and what's missing.

---

## Success Criteria

The spike is **complete** when we can answer every question above with one of:

- ✅ **Yes** — with working code demonstrating the capability
- ⚠️ **Partially** — with clear documentation of what works and what doesn't
- ❌ **No** — with evidence of the limitation and a workaround assessment

### Deliverables

1. **Spike report** — Updated version of this document with answers, code
   snippets, and evidence for each question
2. **Proof-of-concept code** — In `src/spike/` (not production code, explicitly
   excluded from build). Demonstrates Q1–Q5 and Q8 at minimum
3. **Event taxonomy catalog** — List of all observed SDK events with their
   shapes, documented from Q4 investigation
4. **Integration assessment** — Go/no-go recommendation for using the SDK as
   Forge's foundation, with identified risks and mitigations
5. **Architecture sketch** — If go: proposed module boundaries for
   `@cairn/forge`, the shared types package `@cairn/types`, and integration
   seams with `@cairn/cairn`

---

## Out of Scope

These are explicitly **not** part of this spike:

- ❌ Production-quality code (this is throwaway exploration)
- ❌ Monorepo restructuring or package splitting
- ❌ Chartering the Forge sister squad
- ❌ Building the Decision Chain data model
- ❌ Modifying Cairn's existing event_log schema
- ❌ Publishing packages or updating distribution
- ❌ Performance benchmarking or load testing
- ❌ Full Forge feature set (orchestration, retries, scheduling)
- ❌ UI/UX design for Forge interactions

The spike produces *knowledge and a recommendation*, not *software*.

---

## Time Box

**3 working days** (approximately 6–8 focused sessions)

| Day | Focus | Questions |
|-----|-------|-----------|
| 1 | SDK setup, session management, event discovery | Q1, Q4, Q6 |
| 2 | Tool interception, decision gates, model/tokens | Q2, Q3, Q7 |
| 3 | Cairn bridge, end-to-end integration, write-up | Q5, Q8 |

**Circuit breaker:** If Day 1 reveals that the SDK cannot manage sessions
programmatically (Q1 = ❌), stop the spike early and reassess. Session
management is the load-bearing assumption.

---

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SDK is too immature for programmatic session control | Spike fails at Q1 — blocks entire Forge concept | Medium | Day 1 circuit breaker. Fallback: raw Copilot API + custom harness |
| "Technical Preview" means breaking changes mid-spike | Wasted work, need to restart investigation | Low | Pin exact SDK version, document against pinned version |
| SDK requires GitHub App auth we can't easily provision | Blocks local development | Medium | Check auth requirements on Day 1 before deep-diving features |
| Event stream is too coarse for Cairn integration | Q4/Q5 answers are "partially" — we'd need custom instrumentation | Medium | Roger's `assistant.usage` finding suggests decent granularity. Verify empirically |
| SDK conflicts with existing deps (Node version, native modules) | Build failures, fork decision | Low | Test in isolated spike directory first |
| Copilot SDK doesn't support tool call interception | Q2 = ❌ — we'd need to wrap tools ourselves | Medium | Acceptable fallback: tool wrapper pattern adds ~10 LOC per tool |

---

## Build Order

Suggested sequence of investigation steps. Each step builds on the prior one.

### Step 1 — Environment & Auth (Day 1, first hour)
- Install `@github/copilot-sdk` in the project (dev dependency only)
- Verify it builds alongside existing deps
- Determine auth requirements (PAT, GitHub App, OAuth)
- Document Node.js version requirements and compatibility

### Step 2 — Client Bootstrap (Day 1)
- Instantiate `CopilotClient` programmatically
- Create a session, send a simple message, receive a response
- Inspect the client object — what's on the prototype? What's configurable?
- **Answers Q1** (session management) and begins **Q6** (stability)

### Step 3 — Event Discovery (Day 1)
- Attach listeners to every event the client/session emits
- Catalog event types, shapes, and emission timing
- Confirm Roger's `assistant.usage` finding and look for additional events
- **Answers Q4** (event taxonomy)

### Step 4 — Tool Interception (Day 2)
- Register a simple tool with the SDK
- Attempt to observe tool calls via middleware, hooks, or wrapping
- Measure interception granularity (per-call vs. per-batch)
- **Answers Q2** (tool call interception)

### Step 5 — Decision Gates (Day 2)
- Attempt to pause execution mid-flow
- Test confirmation callback patterns
- Try injecting an approval step before a tool call
- **Answers Q3** (decision gates)

### Step 6 — Model & Token Control (Day 2)
- Test model selection APIs
- Read token usage from events and/or API
- Test budget configuration if available
- **Answers Q7** (model selection & token budgeting)

### Step 7 — Cairn Bridge (Day 3)
- Write a minimal adapter: SDK event → Cairn `event_log` row
- Test with real events from Steps 2–6
- Measure bridge complexity (lines of code, transformation difficulty)
- **Answers Q5** (Cairn bridge)

### Step 8 — End-to-End Smoke Test (Day 3)
- Wire Steps 2–7 together: SDK session → task → events → Cairn DB → MCP query
- Run a simple task ("read a file and summarize it")
- Query the results through Cairn's existing MCP tools
- **Answers Q8** (end-to-end integration)

### Step 9 — Write-Up (Day 3, final hours)
- Update this spike document with answers and evidence
- Write go/no-go recommendation
- If go: sketch `@cairn/forge` module boundaries
- Present findings to Aaron

---

## Decision Points

These decisions will need Aaron's input during the spike:

### DP1 — Auth Model
**When:** Step 1 (Day 1, first hour)  
**Question:** The SDK may require a GitHub App or specific token scopes. If auth
setup is non-trivial, do we invest the time or treat it as a risk factor in the
assessment?  
**Options:** (a) Set up full auth, (b) Use personal PAT with whatever scopes
work, (c) Flag as blocker if complex auth is required

### DP2 — Spike Code Location
**When:** Step 2 (Day 1)  
**Question:** Where does spike code live?  
**Recommendation:** `src/spike/` excluded from `tsconfig.json` build. Deleted
after spike concludes.  
**Alternative:** Separate branch with no merge intent (but we lose it)

### DP3 — Circuit Breaker
**When:** End of Day 1  
**Question:** If Q1 (session management) answers "No" — do we pivot to raw
Copilot REST API, or do we shelve Forge entirely?  
**Options:** (a) Pivot to REST API spike (extends time box by 2 days),
(b) Shelve Forge, focus on Cairn Phase 8+, (c) Reassess scope

### DP4 — Event Schema Alignment
**When:** Step 7 (Day 3)  
**Question:** If SDK events don't map cleanly to Cairn's event_log schema, do
we (a) extend Cairn's schema to accommodate, (b) transform events to fit the
existing schema, or (c) propose a new shared event contract (`@cairn/types`)?  
**Trade-offs:** (a) changes Cairn, (b) loses fidelity, (c) proper but more work

### DP5 — Go/No-Go Threshold
**When:** Step 9 (Day 3, write-up)  
**Question:** What's the minimum bar for "go"? All 8 questions green? Or is
partial coverage acceptable?  
**Recommendation:** Go if Q1 + Q2 + Q4 + Q5 = ✅ (core loop works). Q3 and Q7
can be ⚠️. Only Q1 = ❌ is a hard no-go.

---

## References

- **Architecture context:** `.squad/decisions/inbox/graham-compiler-debugger.md`
- **Brainstorm session:** `.squad/agents/graham/history.md` (2026-04-07 entries)
- **Roger's finding:** `assistant.usage` events with model, tokens, latency,
  cache metrics, billing multiplier — confirmed via SDK event observation
- **Copilot SDK docs:** `@github/copilot-sdk` Technical Preview documentation
- **Cairn event schema:** `src/db/events.ts`, `src/types/index.ts`
