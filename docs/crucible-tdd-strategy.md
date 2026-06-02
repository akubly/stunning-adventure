# Crucible Test-Driven Development Strategy

**Status:** FINAL — 8 Open Questions Resolved 2026-05-27  
**Author:** Laura Bow (Tester)  
**Date:** 2026-05-27  
**Target:** London-school TDD discipline for agentic runtime with strict invariants

---

## Table of Contents

1. [Strategy Overview](#1-strategy-overview)
2. [Acceptance Test Surface](#2-acceptance-test-surface)
3. [Collaborator Contract Inventory](#3-collaborator-contract-inventory)
4. [Red/Green/Refactor Walkthroughs](#4-redgreenrefactor-walkthroughs)
5. [Test Layering](#5-test-layering)
6. [Invariant & Property Tests](#6-invariant--property-tests)
7. [Mock Drift Defenses](#7-mock-drift-defenses)
8. [Test-First Cadence](#8-test-first-cadence)
9. [Test Data & Fixture Strategy](#9-test-data--fixture-strategy)
10. [Coverage Discipline](#10-coverage-discipline)
11. [Open Questions](#11-open-questions)
12. [Anti-Goals](#12-anti-goals)

---

## 1. Strategy Overview

### 1.1 Why London-School TDD for Crucible

Crucible is a **greenfield 5-layer agentic runtime** with strict invariants governing determinism, hermetic replay, append-only durability, and per-row safety. The architecture follows a strict outside-in design:

- **L0 Bridge/Provider:** Bootstraps sessions from Copilot SDK
- **L1 Ledger (Cairn):** Append-only WAL with 8-field row schema, pre-commit hook bus, group-commit, causal read-set hashing
- **L2 Derived Query (Salsa-style):** Pure projections from ledger prefix
- **L3 Prescribers (Forge/etc.):** Pluggable generators emitting typed primitives
- **L4 Router:** Single policy choke-point for approval/quarantine/escalation
- **L5 Investigation (Sonny):** Debugger surface (bisect, causal slicing, breakpoints)

**London-school TDD fits this architecture naturally:**

1. **Strict layer boundaries prevent accidental coupling.** Outside-in development forces explicit interface design at each layer transition. A test-first "red" phase for L4 Router behavior must mock L1 append protocol—this immediately surfaces whether the L1 interface is sufficiently abstract.

2. **Tell-don't-ask design emerges from interaction testing.** Crucible's primitives (Request/Artifact/Observation/Decision/Question) are **immutable events**, not mutable entities. London-school interaction tests naturally validate command/event flows rather than state mutation, matching the ledger's append-only semantics.

3. **Invariants are enforced via collaborator contracts.** Determinism conformance (A1-A4), hermetic replay, per-row durability—these are **cross-cutting invariants** that every layer must honor. Contract tests on collaborator boundaries (e.g., does every L3 prescriber emit read-sets? does L2 projection remain pure?) become first-class test artifacts, not afterthoughts.

4. **Acceptance tests anchor the outside.** User-observable behaviors (session forking, counterfactual replay, policy escalation, bisect, Aperture notifications) define the acceptance surface. Inside-out TDD risks building a "perfect" L1 substrate that doesn't support the actual user workflows. Outside-in ensures every internal structure justifies its existence against a user story.

5. **Mock drift is a tractable risk in greenfield.** Classic London-school hazard: mocks diverge from real implementations. Crucible mitigates this via:
   - **Contract tests** validate collaborator boundaries (§7)
   - **Shared fixture builders** keep test data aligned with production schemas
   - **CI double-check runs** swap mocks for integration stubs on critical paths
   - **Hermetic replay as test oracle**: Production ledger snapshots become regression test inputs

6. **Structural commitment model and zero-tolerance mock-drift gate distinguish agentic development.** Unlike human teams where context-switch tax and resentment limit test discipline, agent-driven development inverts the cost function: mock drift compounds across many automated decisions (high opaque cost), while fixing drift is near-zero (spawn agent to address). This enables zero-tolerance contract-test policies impractical for human teams.

### 1.2 Acceptance-First Development Cadence

Every feature begins with an acceptance test:

1. **Red:** Write failing acceptance test exercising user-observable behavior (e.g., `crucible fork --at <event_id>` creates child session)
2. **Outside-in descent:** Mock next-layer-down collaborators, implement enough to push "red" one layer deeper
3. **Green at leaf:** Reach a layer with trivial implementation (e.g., L1 append), make it pass
4. **Green ascending:** Replace mocks layer-by-layer, refactoring as collaborator contracts clarify
5. **Refactor:** Extract shared patterns, harden invariant enforcement

This discipline ensures every line of code traces to a user story (US-V-*, US-S-*, US-A-*, etc.).

---

## 2. Acceptance Test Surface

These 12 acceptance scenarios anchor outside-in development. Each scenario maps to locked PRD user stories (US-*) and v1 commitments. Scenarios are **PRD-derived**—no implementation details from technical design documents.

### A1. Session Fork from Arbitrary Ledger Position

**Source:** US-E-2 (counterfactual replay), US-A-NEW-1 (branching sessions), Aaron locked decision 2a (L1-native branching)

**Given** a Crucible session with 47 committed primitives (event offsets 0-46)  
**And** the user previously rejected a Forge prescription at event offset 23  
**When** the user runs `crucible fork --at 23 --accept-instead`  
**Then** a new child session is created with `parent_session_id` = original session, `fork_point_event_id` = 23  
**And** the child session's ledger logically extends from the parent's prefix [0..23]  
**And** the child session replays from offset 24 with the originally-rejected prescription now accepted  
**And** the parent session remains unmodified

**Collaborators:** L1 Ledger (session metadata, fork lineage), L4 Router (replay with altered verdict)

---

### A2. Hermetic Replay Produces Identical Ledger

**Source:** US-G-NEW-2 (determinism contract), US-E-NEW-11 (hermetic replay boundary), v1 commitment #4 (hermetic replay boundary)

**Given** a Crucible session with 100 primitives, including 3 LLM calls and 12 tool executions  
**And** observations (LLM responses, tool outputs, extra-ledger context) are captured as first-class Observation primitives at tool-call boundaries  
**And** bootstrap context (system prompts, tool definitions) captured as Observation primitives at session offset 0 (Bootstrap-Capture-Completeness invariant)  
**When** the user runs `crucible replay <session_id>`  
**Then** replay reconstructs causal-context window from ledger prefix for each Decision  
**And** all Decision commitment hashes (Merkle hash over context window) match original  
**And** the resulting ledger is byte-identical to the original (excluding wall-clock timestamps)  
**And** all hook verdicts fire identically  
**And** replay completes in <10% of original wall-clock time

**Collaborators:** L1 Ledger (append protocol), L0 Bridge (observation capture as primitives), L4 Router (hook replay), ReadSetHasher (context-window commitment)

---

### A3. Pre-Commit Hook Veto Prevents Primitive Append

**Source:** L1 substrate lock (pre-commit hook bus), Router as single safety choke-point, Aaron's "real-time safety floor"

**Given** a Crucible session with an active Router policy: `DENY external-source prescriptions without user confirmation`  
**When** an external prescriber emits `OptimizationHint{source:'external', category:'code_change', …}`  
**And** the user has not pre-approved external code changes  
**Then** the L1 pre-commit hook fires with `(primitive, metadata)` payload  
**And** L4 Router evaluates policy, returns verdict `ESCALATE_USER_CONFIRMATION`  
**And** the primitive write is **paused** (not appended) until user responds  
**And** user confirmation prompt appears via Aperture (attention-tier notification)

**Collaborators:** L1 Ledger (hook bus), L4 Router (policy engine), L5 Aperture (notification surface)

---

### A4. Backward Causal Slice Traces Primitive Lineage

**Source:** US-S-3 (backward causal slice), Sonny's highest-priority invariant (read-set capture at L1)

**Given** a Crucible session where primitive P47 (`Decision{status:'accepted'}`) was emitted by L4 Router  
**And** P47's `causalContextWindow` = full ledger prefix [P0..P46] visible at decision time  
**And** P47's commitment hash is Merkle hash over that context window (all prior primitives, any type: Request, Artifact, Observation, Decision, Question)  
**When** the user runs `crucible why P47`  
**Then** the CLI displays the causal ancestry: full context window or traced subset depending on query mode  
**And** for each ancestor, shows: primitive kind, timestamp, producer layer, one-line summary  
**And** user can drill into any ancestor with `crucible show P23` to see full payload  
**And** the system can verify Decision P47's integrity by recomputing context-window hash and comparing to stored commitment

**Collaborators:** L1 Ledger (context-window storage, commitment hashes), L5 Investigation (causal slice engine), CLI (renderer), ReadSetHasher (Merkle verification)

---

### A5. Aperture Push Notification for Attention-Tier Events

**Source:** Round 2.3 Mirror→Aperture rename, notification policy (urgent/attention/notice/info), Rosella Sprint 5 delivery path

**Given** a Crucible session where L4 Router quarantines a plugin due to deny-list match  
**And** the event is classified as `level:'attention'` in `aperture_events` projection  
**When** the quarantine event is committed to L1  
**And** L2 Aperture projector materializes the event  
**Then** the CLI prompt badge increments unread count  
**And** the badge shows category icon (🔒 for quarantine events)  
**And** user can view notification with `crucible aperture watch` (tail live) or `crucible aperture show` (dashboard)

**Collaborators:** L1 Ledger (event source), L2 Aperture Projector, CLI (badge renderer)

---

### A6. Plugin Pinning at Session Fork

**Source:** v1 commitment #7 (plugin pinning at fork), US-Ro-NEW-2 (branching as plugin-safe)

**Given** a Crucible session using plugin `@akubly/skill-x` v1.2.3  
**And** `skill-x` has transitive dependencies: `@akubly/util-lib` v2.0.1, `lodash` v4.17.21  
**And** the session forks at event offset 50  
**When** the child session is created  
**Then** the child session inherits **resolved transitive dependency graph**: `skill-x@1.2.3`, `util-lib@2.0.1`, `lodash@4.17.21` (not just direct deps)  
**And** even if newer versions are installed globally, child session uses pinned transitive graph  
**And** transitive dependency graph is recorded in session metadata (`SessionMetadata.pluginVersions`)  
**And** replay of the child session uses the same transitive graph deterministically

**Collaborators:** L1 Ledger (session metadata with transitive graph), Plugin Registry (transitive resolution at install), L3 Prescribers (load-time version lock)

---

### A7. Curator Auto-Trigger on Session Start

**Source:** Wave 3 (Curator-driven orchestration), always-on bootstrap, `runSessionStartHook()`

**Given** Crucible installation with Forge prescribers configured  
**And** prior session with 5 applied hints for skill `@akubly/skill-y`  
**When** user starts new session with `crucible`  
**Then** Curator runs automatically at session bootstrap  
**And** Curator computes change vectors for `skill-y` from applied hint history  
**And** Forge prescribers generate 0-N new optimization hints  
**And** deduplication suppresses any hints semantically identical to active pending hints  
**And** new hints appear in `crucible prescriptions list`

**Collaborators:** L3 Curator (trigger logic), L3 Forge (prescriber orchestration), L1 Ledger (hint persistence), Cairn DB (applied hint history)

---

### A8. Pareto Fitness Contract Evaluation

**Source:** US-L-NEW-9 (Pareto fitness contract), v1 commitment #1 (Pareto fitness contract owned by Laura)

**Given** a skill with two competing prescriptions:  
  - Prescription A: `fitnessContract:{latency:-50ms, accuracy:+2%, tokensUsed:+500}`  
  - Prescription B: `fitnessContract:{latency:-20ms, accuracy:+5%, tokensUsed:+100}`  
**When** the Alchemist evaluates the Pareto frontier  
**Then** Prescription B **dominates** A (better on accuracy and tokens, slightly worse on latency but within acceptable trade-off)  
**And** A is marked as `dominated` and excluded from leaderboard  
**And** B appears in `crucible leaderboard` as non-dominated

**Collaborators:** L3 Alchemist (Pareto computation), L2 Query Layer (fitness history), L1 Ledger (prescription storage)

---

### A9. Determinism Conformance Suite Passes

**Source:** v1 commitment #2 (determinism conformance suite owned by Laura), A1-A4 determinism conformance

**Given** a Crucible session snapshot with 200 primitives  
**When** the determinism conformance suite runs with snapshot as input  
**Then** suite loads snapshot, replays session, compares resulting ledger  
**And** all primitives match byte-for-byte (modulo wall-clock timestamps)  
**And** all hook verdicts match  
**And** all read-set hashes match  
**And** suite reports `PASS: A1-A4 determinism conformance`

**Collaborators:** L1 Ledger (replay protocol), Conformance Runner (test harness), Observation Store (hermetic replay)

---

### A10. Router Policy Escalation for Structural Changes

**Source:** Rosella's dual-interface split (DataProposalGenerator vs StructuralProposalGenerator), Router as policy choke-point

**Given** a Router policy: `structural proposals require explicit user review`  
**When** Alchemist emits a `StructuralProposal{kind:'skill_schema_change', …}`  
**Then** Router classifies it as structural (not data-only)  
**And** Router verdict = `ESCALATE_USER_REVIEW` (not auto-approve)  
**And** proposal appears in user's review queue via Aperture  
**And** proposal is tagged `[structural]` in UI

**Collaborators:** L3 Alchemist (structural proposal emission), L4 Router (policy evaluation), L2 Aperture (review queue projection)

---

### A11. Bisect Identifies Regression-Introducing Primitive

**Source:** US-S-6 (cairn-bisect), US-Ga-NEW-12 (bisect tooling), agentic-debugger thesis

**Given** a Crucible session where test suite passed at event offset 50  
**And** test suite fails at event offset 100  
**When** user runs `crucible bisect --good 50 --bad 100 --test 'npm test'`  
**Then** bisect binary-searches the event range [50..100]  
**And** for each candidate offset, forks session, replays to offset, runs test command  
**And** bisect identifies first-failing event (e.g., offset 73: `Decision{id:'...', status:'accepted'}`)  
**And** user can inspect with `crucible show 73` and `crucible why 73`

**Collaborators:** L5 Investigation (bisect orchestrator), L1 Ledger (fork + replay), Shell Integration (test command execution)

---

### A12. Marketplace Extension Trust Gradient

**Source:** Round 2.3 (trust-tier vocabulary: builtin/adopted/community/external), Gabriel Sprint 6.5 (marketplace MVM), Rosella policy enforcement

**Given** Crucible with marketplace extensions enabled  
**And** user has one `adopted` extension (Aaron-vetted) and one `community` extension (auto-promoted after 30 days + 10 invocations + zero violations)  
**When** user installs a new `external` extension via `crucible market install <id>`  
**Then** extension starts in `external` tier (most restrictive policy)  
**And** Router applies sandbox policy (limited capabilities, elevated prompts)  
**And** after 30 days + 10 invocations + zero policy violations, extension auto-promotes to `community`  
**And** tier transitions are recorded as `Decision` primitives in ledger  
**And** revocation (if deny-list match) triggers immediate Aperture attention-tier notification

**Collaborators:** L4 Router (tier-based policy), L1 Ledger (tier transition decisions), L2 Aperture (revocation notifications), Plugin Registry (tier state)

---

### Summary: Coverage by PRD Cluster

| Scenario | PRD User Story | Layer Boundary Tested |
|---|---|---|
| A1 | US-E-2, US-A-NEW-1 | L1 (fork lineage) |
| A2 | US-G-NEW-2, US-E-NEW-11 | L0→L1 (observation capture) |
| A3 | Aaron's "real-time safety floor" | L1↔L4 (hook bus) |
| A4 | US-S-3 | L1→L5 (causal slice) |
| A5 | Aperture push notifications | L1→L2→CLI (Aperture projection) |
| A6 | v1 commitment #7 | L1 (plugin pinning metadata) |
| A7 | Wave 3 Curator orchestration | L3 Curator→Forge |
| A8 | US-L-NEW-9 | L3 Alchemist (Pareto fitness) |
| A9 | v1 commitment #2 | L1 (determinism conformance) |
| A10 | Rosella structural proposals | L3→L4 (policy escalation) |
| A11 | US-S-6 | L5 Investigation (bisect) |
| A12 | Sprint 6.5 marketplace MVM | L4 Router (trust gradient) |

All 12 scenarios are **PRD-derived** (no CTD references). Each scenario exercises 1-3 layer boundaries and maps to locked user stories or v1 commitments.

---

## 3. Collaborator Contract Inventory

London-school TDD relies on **abstract collaborator roles** that each layer interacts with. These contracts are **architectural boundaries**, not implementation classes. Early tests mock these roles; contract tests validate real implementations honor the mocked interfaces.

### 3.1 L0 Bridge Collaborators

#### `SessionBootstrapper`
**Contract:** Initializes session from external runtime (Copilot SDK)  
**Responsibilities:**
- Provides `BootstrapPayload{sessionId, initialContext, sdkVersion}`
- Exposes canonical `CrucibleEvent` stream from SDK events
- Does NOT leak `SessionEvent`, `ToolResultObject`, or SDK promise types above L0

**Test Doubles:**
- **Stub:** Returns hardcoded `BootstrapPayload` with fixed session ID
- **Spy:** Records SDK method calls for observation-capture verification
- **Fake:** In-memory event stream generator for replay tests

#### `LedgerWindowReader`
**Contract:** Provides read access to ledger prefix for context-window reconstruction  
**Responsibilities:**
- Accepts query `(sessionId, startOffset, endOffset)` → returns ledger row slice
- Returns all primitives in range (any type: Request, Artifact, Observation, Decision, Question) in canonical row order
- Supports efficient prefix queries (L5 Investigation causal-slice construction)
- Used by Decision commitment to reconstruct context window for Merkle hashing

**Test Doubles:**
- **Stub:** Returns fixed ledger prefix for known session/range
- **Fake:** In-memory row array for fast test execution
- **Spy:** Records all queries to verify context-window read patterns

---

### 3.2 L1 Ledger Collaborators

#### `AppendProtocol`
**Contract:** Atomic append of 8-field WAL row with group-commit  
**Responsibilities:**
- Accepts `{primitiveKind, primitivePayload, causalReadSet, hookVerdict, commitOffset, …}` row
- Appends atomically with ≤1ms p99 latency
- Returns `commitOffset` on success
- Supports group-commit (batches multiple appends into one fsync)

**Test Doubles:**
- **Mock:** Verifies row shape (all 8 fields present), returns monotonic offsets
- **Fake:** In-memory append-only array for fast unit tests
- **Stub:** Always returns `commitOffset = N+1` for offset N

#### `PreCommitHookBus`
**Contract:** Fires registered hooks before primitive commit, enforces ≤80µs predicate budget  
**Responsibilities:**
- Accepts hook registrations `(hookId, predicateFn, budget)`
- Fires hooks serially, aborts if any hook returns `VETO` verdict
- Enforces per-hook timeout (≤80µs); fails open on timeout
- Returns aggregated verdict: `COMMIT | PAUSE | VETO`

**Test Doubles:**
- **Mock:** Verifies hooks fire in registered order, returns canned verdicts
- **Spy:** Records all hook invocations with timing for budget validation
- **Fake:** In-memory hook registry with deterministic execution

#### `ReadSetHasher`
**Contract:** Deterministic hash of causal read-set (CBOR + BLAKE3)  
**Responsibilities:**
- Accepts `{primitiveIds: string[], projectionKeys: string[], externalInputs: string[]}`
- Returns 32-byte BLAKE3 hash of CBOR-dcbor serialization
- Deterministic (same read-set → same hash across machines/runs)

**Test Doubles:**
- **Stub:** Returns fixed hash `0x00...01` for any input (replay tests)
- **Fake:** Returns `sha256(JSON.stringify(input))` (slow but debuggable)
- **Real:** Always use real hasher in contract tests (validates CBOR determinism)

---

### 3.3 L2 Derived Query Collaborators

#### `LedgerProjector`
**Contract:** Pure function `(ledgerPrefix, pluginVersions) → ProjectionState`  
**Responsibilities:**
- Subscribes to L1 commit events via `onCommit(offset, rows[])`
- Materializes derived views (e.g., `aperture_events`, `prescriptions`)
- **Pure:** identical ledger prefix → identical projection (no hidden state)
- Supports retroactive projection (replay from offset 0 on demand)

**Test Doubles:**
- **Spy:** Records all `onCommit()` calls, verifies projection writes
- **Fake:** In-memory projection state (e.g., `Map<eventId, ApertureEvent>`)
- **Stub:** Returns empty projection for any ledger prefix (isolation tests)

#### `QueryExecutor`
**Contract:** Salsa-style demand-driven query evaluation  
**Responsibilities:**
- Accepts query `(ledgerPrefix, queryKey)` → returns cached or recomputed result
- Invalidates stale queries when ledger advances
- Tracks query dependencies for incremental recomputation

**Test Doubles:**
- **Fake:** Always recomputes (no caching); validates query purity
- **Spy:** Records cache hits/misses for performance tests
- **Mock:** Returns canned query results for layer-boundary isolation

---

### 3.4 L3 Prescriber Collaborators

#### `PrescriberOrchestrator`
**Contract:** Loads prescribers, invokes per skill, collects emitted primitives  
**Responsibilities:**
- Discovers prescribers from plugin registry
- Invokes `prescriber.run(skillId, context)` per skill
- Aggregates emitted `OptimizationHint[]`, `Observation[]`, `Decision[]`
- Fail-open: prescriber crash does NOT block other prescribers

**Test Doubles:**
- **Mock:** Verifies prescriber discovery order, invocation arguments
- **Spy:** Records emitted primitives per prescriber (attribution testing)
- **Stub:** Returns fixed hint set for known skills (Router policy tests)

#### `GenericL3AdapterContract`
**Contract:** Conformance suite for any L3 Generator adapter (Forge today, Eureka v1.5+, marketplace plugins)  
**Responsibilities:**
- Validates `PrescriberOrchestrator` interface compliance (discovery, invocation, aggregation)
- Validates fail-open behavior (adapter crash does not block session)
- Validates hint attribution (emitted primitives tagged with adapter ID)
- Validates lifecycle hooks (adapter init/shutdown, per-skill setup/teardown)
- Validates registration/discovery (adapter registers in plugin registry, discovered by orchestrator)

**Test Doubles:**
- **Stub:** Minimal adapter implementation (returns empty hint set, validates interface shape)
- **Mock:** Adapter that fails in controlled ways (crash on init, timeout on invocation, validates fail-open)
- **Spy:** Records all lifecycle hook invocations (validates hook call order)

**Usage:** Run conformance suite against Forge in v1 CI. Reuse suite for Eureka adapter in v1.5 (no new test infra needed).

#### `ChangeVectorProvider`
**Contract:** Supplies historical change vector summaries for skill  
**Responsibilities:**
- Accepts `(skillId, granularity, granularityKey)` → returns `ChangeVectorSummary[]`
- Summaries include `{category, meanNetImpact, vectorCount, confidenceBoost}`
- Filters zero-vector summaries (no historical signal)
- Fail-open: returns empty array on DB error

**Test Doubles:**
- **Stub:** Returns canned summaries (mature positive, mature negative, sparse)
- **Fake:** In-memory summary store populated from test fixtures
- **Spy:** Records all queries for cache-hit verification

#### `ParetoFitnessEvaluator`
**Contract:** Computes Pareto frontier over competing prescriptions  
**Responsibilities:**
- Accepts `Prescription[]` with `fitnessContract:{latency, accuracy, tokensUsed, …}`
- Returns `{dominated: Prescription[], nonDominated: Prescription[]}`
- Uses multi-objective dominance: P1 dominates P2 iff P1 ≥ P2 on all axes and P1 > P2 on ≥1 axis

**Test Doubles:**
- **Stub:** Returns all prescriptions as non-dominated (Router tests)
- **Fake:** Implements naive O(N²) dominance check (correctness baseline)
- **Mock:** Verifies fitness contract shape, fails on missing axes

---

### 3.5 L4 Router Collaborators

#### `PolicyEngine`
**Contract:** Evaluates policies against primitive + metadata, returns verdict  
**Responsibilities:**
- Accepts `(primitive, metadata:{source, tier, capabilities})` → returns `{verdict:'APPROVE'|'PAUSE'|'VETO'|'ESCALATE', reason}`
- Loads policies from configuration (builtin policies + user overrides)
- Enforces trust-tier gradient (external < community < adopted < builtin)
- Logs policy decisions for audit trail

**Test Doubles:**
- **Mock:** Verifies policy lookup order (tier-specific → category-specific → default)
- **Stub:** Returns fixed verdict (isolates Router logic from policy complexity)
- **Spy:** Records all policy evaluations for coverage analysis

#### `EscalationQueue`
**Contract:** Enqueues primitives awaiting user decision  
**Responsibilities:**
- Adds primitive to queue with `(queueId, primitive, deadline)`
- Supports priority (urgent > attention > notice)
- Dequeues on user action (`APPROVE | REJECT | DEFER`)
- Timeout handling (escalate to default-deny after N minutes)

**Test Doubles:**
- **Fake:** In-memory priority queue with deterministic dequeue order
- **Spy:** Records enqueue/dequeue events for notification tests
- **Mock:** Verifies timeout scheduling logic

---

### 3.6 L5 Investigation Collaborators

#### `CausalSliceEngine`
**Contract:** Traces primitive lineage via `causalReadSet` backward links  
**Responsibilities:**
- Accepts `primitiveId` → returns `{ancestors: PrimitiveId[], graph: DAG}`
- Walks `causalReadSet` recursively until reaching root primitives (no dependencies)
- Supports depth limit (avoid unbounded traversal)

**Test Doubles:**
- **Stub:** Returns fixed lineage `[P47, P44, P31, P23]` for known primitive
- **Fake:** In-memory graph with hardcoded edges (unit tests)
- **Spy:** Records traversal path for cycle-detection verification

#### `BisectOrchestrator`
**Contract:** Binary-searches event range to find regression-introducing primitive  
**Responsibilities:**
- Accepts `(goodOffset, badOffset, testCommand)` → returns first-failing offset
- Captures `process.env` + relevant config files at bisect start (env snapshot)
- For each candidate offset: forks session, replays to offset, executes test command with **fixed snapshot env** (not live env)
- Interprets exit code (0 = pass, non-zero = fail)
- Returns `{failingOffset, primitive, exitCode, stderr}`
- Internally consistent (all iterations use same env), not externally hermetic (re-run days later may differ)

**Test Doubles:**
- **Mock:** Verifies fork/replay invocations, env snapshot capture, returns canned failing offset
- **Fake:** In-memory test command simulator (deterministic pass/fail per offset, simulated env snapshot)
- **Stub:** Always returns `goodOffset + 1` (minimal bisect for fast tests)

---

### 3.7 Cross-Cutting Collaborators

#### `PluginRegistry`
**Contract:** Manages plugin discovery, versioning, trust tiers  
**Responsibilities:**
- Discovers plugins from `~/.crucible/plugins/`, project `.crucible/`, marketplace
- Resolves plugin version (pinned > local > marketplace latest)
- Tracks trust tier transitions (external → community → adopted)
- Enforces deny-list (quarantines revoked plugins)

**Test Doubles:**
- **Fake:** In-memory registry with hardcoded plugins (version v1.2.3, tier `adopted`)
- **Spy:** Records all version resolutions for pinning verification
- **Mock:** Verifies deny-list check occurs before plugin load

#### `CLIRenderer`
**Contract:** Presents ledger state, notifications, and query results to user  
**Responsibilities:**
- Renders Aperture notifications (badge, dashboard)
- Formats primitive payloads for `crucible show <id>`
- Syntax-highlights causal graphs for `crucible why <id>`

**Test Doubles:**
- **Spy:** Records all render calls (verifies notification delivery)
- **Stub:** Returns fixed formatted strings (isolates CLI logic)
- **Mock:** Verifies badge increment on attention-tier events

---

### 3.8 Contract Test Strategy

For each collaborator role, **contract tests** validate that real implementations honor the mocked interface:

1. **Shape tests:** Real implementation exports expected methods with correct signatures
2. **Behavior tests:** Real implementation produces expected outputs for canonical inputs (golden files)
3. **Invariant tests:** Real implementation enforces documented invariants (e.g., `AppendProtocol` returns monotonic offsets)
4. **Failure-mode tests:** Real implementation fails gracefully (e.g., `PrescriberOrchestrator` fail-open on prescriber crash)

Contract tests run in CI as a separate suite (`npm run test:contracts`). Failures indicate mock drift.

---

## 4. Red/Green/Refactor Walkthroughs

Three exemplar TDD cycles demonstrating outside-in development from acceptance test down to leaf implementation. Each walkthrough shows RED (failing test with mocked collaborators) → GREEN (minimal implementation) → REFACTOR (extract patterns, harden invariants).

### 4.1 Walkthrough A: Session Fork Creates Child with Inherited Ledger Prefix

**User Story:** US-A-NEW-1 (Branching Sessions)  
**Acceptance Scenario:** A1 (Session Fork from Arbitrary Ledger Position)

#### RED Phase: Write Failing Acceptance Test

```typescript
// packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts

describe('Session Fork', () => {
  it('creates child session inheriting parent ledger prefix', async () => {
    // Arrange: Parent session with 47 primitives
    const parentSession = await createSession();
    for (let i = 0; i < 47; i++) {
      await parentSession.append({
        primitiveKind: 'observation',
        primitivePayload: { content: `event-${i}` },
        causalReadSet: [],
      });
    }
    
    // Act: Fork at event offset 23
    const childSession = await fork(parentSession.id, { atOffset: 23 });
    
    // Assert: Child has correct lineage metadata
    expect(childSession.metadata.parentSessionId).toBe(parentSession.id);
    expect(childSession.metadata.forkPointEventId).toBe(23);
    
    // Assert: Child ledger contains parent prefix [0..23]
    const childEvents = await childSession.query({ range: [0, 23] });
    const parentEvents = await parentSession.query({ range: [0, 23] });
    expect(childEvents).toEqual(parentEvents); // Logical prefix, not physical copy
    
    // Assert: Parent unmodified
    const parentEventsAfter = await parentSession.query({ range: [0, 46] });
    expect(parentEventsAfter).toHaveLength(47);
  });
});
```

**Run test:** `npm test -- session-fork.test.ts`  
**Output:** `Error: fork is not defined`

#### GREEN Phase: Implement Minimal Fork Logic (Outside-In Descent)

**Step 1: Define CLI command (outermost layer)**

```typescript
// packages/crucible-cli/src/commands/fork.ts

export async function forkCommand(parentSessionId: string, options: ForkOptions): Promise<void> {
  const ledger = await getLedger(); // Mock in test
  const childSessionId = await ledger.forkSession(parentSessionId, options.atOffset);
  console.log(`Created child session ${childSessionId}`);
}
```

**Mock `Ledger` collaborator:**

```typescript
// packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts

const mockLedger = {
  forkSession: vi.fn().mockResolvedValue('child-session-id'),
  queryEvents: vi.fn().mockResolvedValue([/* mock events */]),
};

vi.mock('../../services/ledger', () => ({ getLedger: () => mockLedger }));
```

**Step 2: Implement `Ledger.forkSession` (one layer down)**

```typescript
// packages/crucible-core/src/ledger/session-manager.ts

export class SessionManager {
  async forkSession(parentId: string, forkOffset: number): Promise<string> {
    // Validate parent exists
    const parent = await this.db.getSession(parentId); // Mock DB collaborator
    if (!parent) throw new Error(`Parent session ${parentId} not found`);
    
    // Create child session metadata
    const childId = ulid();
    await this.db.insertSession({
      id: childId,
      parentSessionId: parentId,
      forkPointEventId: forkOffset,
      createdAt: Date.now(),
    });
    
    return childId;
  }
}
```

**Mock `DB` collaborator:**

```typescript
// packages/crucible-core/src/__tests__/unit/session-manager.test.ts

const mockDB = {
  getSession: vi.fn().mockResolvedValue({ id: 'parent-id' }),
  insertSession: vi.fn().mockResolvedValue(undefined),
  queryEvents: vi.fn().mockResolvedValue([]),
};

it('creates child with lineage metadata', async () => {
  const manager = new SessionManager(mockDB);
  const childId = await manager.forkSession('parent-id', 23);
  
  expect(mockDB.insertSession).toHaveBeenCalledWith({
    id: expect.any(String),
    parentSessionId: 'parent-id',
    forkPointEventId: 23,
    createdAt: expect.any(Number),
  });
});
```

**Step 3: Implement `DB.insertSession` (leaf layer)**

```typescript
// packages/crucible-core/src/db/sessions.ts

export function insertSession(db: Database, session: SessionMetadata): void {
  db.prepare(`
    INSERT INTO sessions (id, parent_session_id, fork_point_event_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(session.id, session.parentSessionId, session.forkPointEventId, session.createdAt);
}
```

**Run unit test:** `npm test -- session-manager.test.ts` → **PASSES**  
**Run acceptance test:** `npm test -- session-fork.test.ts` → **PASSES** (with mocks)

#### REFACTOR Phase: Extract Patterns, Harden Invariants

**Refactor 1: Extract `ForkLineage` value object**

```typescript
// packages/crucible-core/src/ledger/fork-lineage.ts

export class ForkLineage {
  constructor(
    public readonly parentSessionId: string,
    public readonly forkPointEventId: number
  ) {
    if (forkPointEventId < 0) {
      throw new Error('Fork point must be non-negative');
    }
  }
  
  static root(): ForkLineage {
    return new ForkLineage(null, 0); // Sentinel for root sessions
  }
  
  isRoot(): boolean {
    return this.parentSessionId === null;
  }
}
```

**Refactor 2: Add invariant test (fork point ≤ parent ledger size, transitive-dep-graph captured)**

```typescript
// packages/crucible-core/src/__tests__/unit/session-manager.test.ts

it('rejects fork beyond parent ledger size', async () => {
  mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 47 });
  mockDB.queryEvents.mockResolvedValue([/* 47 events */]);
  
  const manager = new SessionManager(mockDB);
  
  await expect(
    manager.forkSession('parent-id', 50) // 50 > 47
  ).rejects.toThrow('Fork point 50 exceeds parent ledger size 47');
});

it('child session inherits transitive dependency graph from parent', async () => {
  const parentPlugins = {
    '@akubly/skill-x': '1.2.3',
    '@akubly/util-lib': '2.0.1', // Transitive dep of skill-x
    'lodash': '4.17.21'           // Transitive dep of util-lib
  };
  
  mockDB.getSession.mockResolvedValue({
    id: 'parent-id',
    ledgerSize: 47,
    pluginVersions: parentPlugins
  });
  
  const manager = new SessionManager(mockDB);
  const childId = await manager.forkSession('parent-id', 23);
  
  expect(mockDB.insertSession).toHaveBeenCalledWith({
    id: expect.any(String),
    parentSessionId: 'parent-id',
    forkPointEventId: 23,
    pluginVersions: parentPlugins, // Full transitive graph inherited
    createdAt: expect.any(Number),
  });
});
```

**Refactor 3: Replace mocks with integration stubs**

```typescript
// packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts

it('creates child session with inherited prefix (real DB)', async () => {
  const db = createTestDatabase(); // Real SQLite :memory:
  const manager = new SessionManager(db);
  
  // Create parent with 47 events
  const parentId = await manager.createSession();
  for (let i = 0; i < 47; i++) {
    await manager.appendEvent(parentId, { kind: 'observation', payload: { content: `e-${i}` } });
  }
  
  // Fork at offset 23
  const childId = await manager.forkSession(parentId, 23);
  
  // Verify lineage
  const child = await manager.getSession(childId);
  expect(child.parentSessionId).toBe(parentId);
  expect(child.forkPointEventId).toBe(23);
  
  // Verify logical prefix (query parent [0..23] == child [0..23])
  const parentPrefix = await manager.queryEvents(parentId, { range: [0, 23] });
  const childPrefix = await manager.queryEvents(childId, { range: [0, 23] });
  expect(childPrefix).toEqual(parentPrefix);
});
```

**Final state:**  
✅ Acceptance test passes with real implementations  
✅ Unit tests cover edge cases (fork beyond ledger, negative offset)  
✅ Integration test validates DB schema correctness  
✅ Value object (`ForkLineage`) extracted, invariants enforced

---

### 4.2 Walkthrough B: Pre-Commit Hook Veto Prevents Primitive Append

**User Story:** Aaron's "real-time safety floor"  
**Acceptance Scenario:** A3 (Pre-Commit Hook Veto)

#### RED Phase: Write Failing Acceptance Test

```typescript
// packages/crucible-core/src/__tests__/acceptance/hook-veto.test.ts

describe('Pre-Commit Hook Veto', () => {
  it('prevents append when policy hook returns VETO', async () => {
    // Arrange: Ledger with registered hook
    const ledger = await createLedger();
    const vetoHook = vi.fn().mockResolvedValue({ verdict: 'VETO', reason: 'External source denied' });
    
    await ledger.registerHook('policy-gate', vetoHook, { budget: 50_000 }); // 50µs
    
    // Act: Attempt to append external-source primitive
    const appendPromise = ledger.append({
      primitiveKind: 'request',
      primitivePayload: { source: 'external', content: 'dangerous request' },
      causalReadSet: [],
    });
    
    // Assert: Append rejected
    await expect(appendPromise).rejects.toThrow('Append vetoed by hook: policy-gate');
    
    // Assert: Hook was invoked
    expect(vetoHook).toHaveBeenCalledWith({
      primitiveKind: 'request',
      primitivePayload: expect.objectContaining({ source: 'external' }),
      metadata: expect.any(Object),
    });
    
    // Assert: Ledger remains empty (no partial write)
    const events = await ledger.queryEvents({ range: [0, 100] });
    expect(events).toHaveLength(0);
  });
});
```

**Run test:** `npm test -- hook-veto.test.ts`  
**Output:** `Error: registerHook is not defined`

#### GREEN Phase: Implement Hook Bus (Outside-In)

**Step 1: Define `HookBus` interface**

```typescript
// packages/crucible-core/src/ledger/hook-bus.ts

export type HookVerdict = 'COMMIT' | 'PAUSE' | 'VETO';

export interface HookContext {
  primitiveKind: string;
  primitivePayload: unknown;
  metadata: { source: string; timestamp: number };
}

export interface Hook {
  id: string;
  predicate: (ctx: HookContext) => Promise<{ verdict: HookVerdict; reason?: string }>;
  budgetMicros: number;
}

export class HookBus {
  private hooks: Hook[] = [];
  
  registerHook(id: string, predicate: Hook['predicate'], opts: { budget: number }): void {
    this.hooks.push({ id, predicate, budgetMicros: opts.budget });
  }
  
  async fire(ctx: HookContext): Promise<{ verdict: HookVerdict; reason?: string }> {
    for (const hook of this.hooks) {
      const start = performance.now();
      const result = await hook.predicate(ctx);
      const elapsed = (performance.now() - start) * 1000; // Convert ms → µs
      
      if (elapsed > hook.budgetMicros) {
        console.warn(`Hook ${hook.id} exceeded budget: ${elapsed}µs > ${hook.budgetMicros}µs`);
        // Fail-open: log warning but don't veto
      }
      
      if (result.verdict === 'VETO') {
        return { verdict: 'VETO', reason: result.reason || `Vetoed by ${hook.id}` };
      }
    }
    
    return { verdict: 'COMMIT' };
  }
}
```

**Step 2: Integrate hook bus into `Ledger.append`**

```typescript
// packages/crucible-core/src/ledger/append.ts

export class Ledger {
  constructor(
    private db: Database,
    private hookBus: HookBus
  ) {}
  
  async append(primitive: PrimitiveInput): Promise<number> {
    // Fire pre-commit hooks
    const hookResult = await this.hookBus.fire({
      primitiveKind: primitive.primitiveKind,
      primitivePayload: primitive.primitivePayload,
      metadata: { source: primitive.source || 'unknown', timestamp: Date.now() },
    });
    
    if (hookResult.verdict === 'VETO') {
      throw new Error(`Append vetoed: ${hookResult.reason}`);
    }
    
    // Append to WAL
    const offset = this.db.appendWAL({
      primitiveKind: primitive.primitiveKind,
      primitivePayload: JSON.stringify(primitive.primitivePayload),
      causalReadSetHash: this.hashReadSet(primitive.causalReadSet),
      hookVerdict: hookResult.verdict,
      commitOffset: this.db.getNextOffset(),
    });
    
    return offset;
  }
}
```

**Run unit test:** `npm test -- hook-bus.test.ts` → **PASSES**  
**Run acceptance test:** `npm test -- hook-veto.test.ts` → **PASSES**

#### REFACTOR Phase: Harden Budget Enforcement

**Refactor 1: Add timeout wrapper for hook execution**

```typescript
// packages/crucible-core/src/ledger/hook-bus.ts

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMicros: number
): Promise<T | { timeout: true }> {
  const timeoutMs = timeoutMicros / 1000;
  
  return Promise.race([
    fn(),
    new Promise<{ timeout: true }>((resolve) =>
      setTimeout(() => resolve({ timeout: true }), timeoutMs)
    ),
  ]);
}

export class HookBus {
  async fire(ctx: HookContext): Promise<{ verdict: HookVerdict; reason?: string }> {
    for (const hook of this.hooks) {
      const result = await executeWithTimeout(
        () => hook.predicate(ctx),
        hook.budgetMicros
      );
      
      if ('timeout' in result) {
        console.warn(`Hook ${hook.id} timed out after ${hook.budgetMicros}µs`);
        // Fail-open: continue to next hook
        continue;
      }
      
      if (result.verdict === 'VETO') {
        return { verdict: 'VETO', reason: result.reason || `Vetoed by ${hook.id}` };
      }
    }
    
    return { verdict: 'COMMIT' };
  }
}
```

**Refactor 2: Add contract test for hook budget enforcement**

```typescript
// packages/crucible-core/src/__tests__/contracts/hook-bus.contract.ts

describe('HookBus Contract', () => {
  it('enforces hook budget via timeout', async () => {
    const bus = new HookBus();
    const slowHook = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms = 100,000µs
      return { verdict: 'VETO' as const };
    });
    
    bus.registerHook('slow-hook', slowHook, { budget: 50_000 }); // 50µs budget
    
    const result = await bus.fire({
      primitiveKind: 'test',
      primitivePayload: {},
      metadata: { source: 'test', timestamp: 0 },
    });
    
    // Hook times out, fail-open → COMMIT
    expect(result.verdict).toBe('COMMIT');
  });
});
```

**Final state:**  
✅ Hook veto prevents append (acceptance test passes)  
✅ Budget enforcement hardens via timeout wrapper  
✅ Fail-open behavior validated (timeout → continue, not crash)  
✅ Contract test ensures real hooks honor budget

---

### 4.3 Walkthrough C: Aperture Push Notification for Attention-Tier Events

**User Story:** Rosella Sprint 5 (Aperture push delivery path)  
**Acceptance Scenario:** A5 (Aperture Push Notification)

#### RED Phase: Write Failing Acceptance Test

```typescript
// packages/crucible-cli/src/__tests__/acceptance/aperture-push.test.ts

describe('Aperture Push Notifications', () => {
  it('increments badge when attention-tier event is committed', async () => {
    // Arrange: CLI with badge renderer
    const cli = await createCLI();
    const badgeRenderer = vi.fn();
    cli.setBadgeRenderer(badgeRenderer);
    
    // Arrange: Ledger with Aperture projector
    const ledger = await createLedger();
    const apertureProjector = new ApertureProjector(ledger);
    ledger.subscribe(apertureProjector);
    
    // Act: Commit attention-tier event (quarantine)
    await ledger.append({
      primitiveKind: 'observation',
      primitivePayload: {
        type: 'quarantine',
        pluginId: 'malicious-plugin',
        reason: 'Deny-list match',
      },
      metadata: { level: 'attention' },
    });
    
    // Assert: Aperture projector materializes event
    const events = await apertureProjector.queryEvents({ level: 'attention' });
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('system');
    expect(events[0].level).toBe('attention');
    
    // Assert: Badge renderer invoked
    expect(badgeRenderer).toHaveBeenCalledWith({
      unreadCount: 1,
      icon: '🔒', // quarantine icon
    });
  });
});
```

**Run test:** `npm test -- aperture-push.test.ts`  
**Output:** `Error: ApertureProjector is not defined`

#### GREEN Phase: Implement Aperture Projector (L2)

**Step 1: Define `ApertureProjector` subscriber**

```typescript
// packages/crucible-core/src/projectors/aperture.ts

export class ApertureProjector {
  constructor(
    private db: Database,
    private notifier: NotificationService // Collaborator to mock
  ) {}
  
  // L1Subscriber interface
  onCommit(offset: number, rows: WALRow[]): void {
    for (const row of rows) {
      if (this.shouldNotify(row)) {
        this.materializeEvent(row);
        this.notifier.push({ unreadCount: this.getUnreadCount(), icon: this.getIcon(row) });
      }
    }
  }
  
  private shouldNotify(row: WALRow): boolean {
    const level = row.metadata?.level;
    return level === 'attention' || level === 'urgent';
  }
  
  private materializeEvent(row: WALRow): void {
    this.db.prepare(`
      INSERT INTO aperture_events (id, category, level, title, body_markdown, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      ulid(),
      this.categorize(row),
      row.metadata.level,
      this.extractTitle(row),
      JSON.stringify(row.primitivePayload),
      Date.now()
    );
  }
  
  private categorize(row: WALRow): string {
    // Map primitive kind → Aperture category
    if (row.primitivePayload.type === 'quarantine') return 'system';
    if (row.primitiveKind === 'decision') return 'decision';
    return 'observation';
  }
}
```

**Step 2: Mock `NotificationService` collaborator**

```typescript
// packages/crucible-core/src/__tests__/unit/aperture-projector.test.ts

const mockNotifier = {
  push: vi.fn(),
};

it('materializes attention-tier events and pushes notification', () => {
  const db = createTestDatabase();
  const projector = new ApertureProjector(db, mockNotifier);
  
  projector.onCommit(0, [{
    primitiveKind: 'observation',
    primitivePayload: { type: 'quarantine', pluginId: 'bad-plugin' },
    metadata: { level: 'attention' },
  }]);
  
  // Assert: Event materialized in DB
  const events = db.prepare('SELECT * FROM aperture_events WHERE level = ?').all('attention');
  expect(events).toHaveLength(1);
  
  // Assert: Notifier invoked
  expect(mockNotifier.push).toHaveBeenCalledWith({
    unreadCount: 1,
    icon: '🔒',
  });
});
```

**Run unit test:** `npm test -- aperture-projector.test.ts` → **PASSES**  
**Run acceptance test:** `npm test -- aperture-push.test.ts` → **PASSES** (with mocks)

#### REFACTOR Phase: Extract Notification Policy

**Refactor 1: Extract `NotificationPolicy` value object**

```typescript
// packages/crucible-core/src/projectors/notification-policy.ts

export class NotificationPolicy {
  shouldPush(level: string): boolean {
    return level === 'attention' || level === 'urgent';
  }
  
  getIcon(category: string, payload: unknown): string {
    if (payload.type === 'quarantine') return '🔒';
    if (category === 'decision') return '✓';
    return 'ℹ️';
  }
  
  getPriority(level: string): number {
    const priorities = { urgent: 3, attention: 2, notice: 1, info: 0 };
    return priorities[level] || 0;
  }
}
```

**Refactor 2: Add contract test for projector purity**

```typescript
// packages/crucible-core/src/__tests__/contracts/aperture-projector.contract.ts

describe('ApertureProjector Contract', () => {
  it('is a pure projection (same input → same output)', () => {
    const db1 = createTestDatabase();
    const db2 = createTestDatabase();
    const projector1 = new ApertureProjector(db1, mockNotifier);
    const projector2 = new ApertureProjector(db2, mockNotifier);
    
    const input = [{ primitiveKind: 'observation', primitivePayload: { type: 'quarantine' }, metadata: { level: 'attention' } }];
    
    projector1.onCommit(0, input);
    projector2.onCommit(0, input);
    
    const events1 = db1.prepare('SELECT * FROM aperture_events').all();
    const events2 = db2.prepare('SELECT * FROM aperture_events').all();
    
    // Exclude ULID (time-based), compare rest
    expect(events1.map(e => ({ ...e, id: null }))).toEqual(events2.map(e => ({ ...e, id: null })));
  });
});
```

**Final state:**  
✅ Aperture projector materializes attention-tier events  
✅ Notification service pushes badge updates  
✅ Policy extracted into testable value object  
✅ Contract test validates projection purity (L2 requirement)

---

### 4.4 Summary: Outside-In Patterns Observed

Across all three walkthroughs, consistent patterns emerge:

1. **Acceptance test defines success criterion** (user-observable behavior)
2. **Mocks isolate layer boundaries** (fast unit tests, clear contracts)
3. **Minimal implementation satisfies "green"** (no speculative generalization)
4. **Refactor extracts domain concepts** (value objects, policies)
5. **Contract tests prevent mock drift** (real implementations honor mocked interfaces)
6. **Integration tests replace mocks gradually** (validates schema, wiring)

---

## 5. Test Layering

Crucible's 5-layer architecture demands **5 test tiers** plus cross-cutting conformance suites. Each tier has distinct purposes, speeds, and failure modes.

### 5.1 Test Pyramid Structure

```
                  ┌─────────────────┐
                  │  Acceptance     │  ~12 scenarios (from §2)
                  │  (E2E, slow)    │  Full CLI → Ledger → DB path
                  └─────────────────┘
                 ┌───────────────────┐
                 │  Integration      │  ~50-100 tests
                 │  (Layer boundaries)│  Real DB, mocked external I/O
                 └───────────────────┘
               ┌─────────────────────┐
               │  Component          │  ~200-400 tests
               │  (Per-layer logic)  │  Mocked collaborators
               └─────────────────────┘
             ┌───────────────────────┐
             │  Contract             │  ~30-60 tests
             │  (Interface validation)│  Real impl vs mocked interface
             └───────────────────────┘
           ┌──────────────────────────┐
           │  Unit                    │  ~500-1000 tests
           │  (Pure functions, utils) │  No I/O, sub-ms execution
           └──────────────────────────┘
```

**Ratio target:** 1 acceptance : 5 integration : 10 component : 3 contract : 50 unit

### 5.2 Tier Definitions

#### Tier 1: Unit Tests (Leaf Logic, No Collaborators)

**Scope:** Pure functions, value objects, algorithms  
**Dependencies:** None (or trivial stubs like `Date.now()`)  
**Speed:** <1ms per test  
**Examples:**
- `ForkLineage.isRoot()` returns true for root sessions
- `NotificationPolicy.getPriority('urgent')` returns 3
- `CBOR-dcbor` canonicalization produces identical output for `{b:2, a:1}` and `{a:1, b:2}`
- `ReadSetHasher` returns deterministic hash for same input

**Failure mode:** Logic bug in leaf function (fix immediately, no regressions expected)

#### Tier 2: Component Tests (Per-Layer Logic with Mocked Collaborators)

**Scope:** Single-layer classes/modules with collaborators mocked  
**Dependencies:** Mocks for next-layer-down (e.g., `SessionManager` tests mock `Database`)  
**Speed:** ~5-20ms per test  
**Examples:**
- `SessionManager.forkSession()` calls `db.insertSession()` with correct lineage metadata
- `HookBus.fire()` invokes hooks in registration order, stops on first VETO
- `ApertureProjector.onCommit()` materializes attention-tier events, skips info-tier
- `PrescriberOrchestrator.run()` fail-open when one prescriber throws

**Failure mode:** Incorrect collaborator invocation (wrong args, missing call, wrong order)

#### Tier 3: Contract Tests (Real Implementation vs Mocked Interface)

**Scope:** Validate that real collaborators honor the interface mocked in component tests  
**Dependencies:** Real implementation of one collaborator, rest mocked  
**Speed:** ~50-200ms per test (may touch DB/filesystem)  
**Examples:**
- Real `Database.insertSession()` accepts `{id, parentSessionId, forkPointEventId, pluginVersions, createdAt}` shape
- Real `AppendProtocol.append()` returns monotonically increasing offsets
- Real `ApertureProjector` produces same output for same input (projection purity)
- Real `PolicyEngine.evaluate()` returns `{verdict, reason}` shape for all test cases
- **Generic L3 Adapter conformance:** Any L3 Generator adapter (Forge, future Eureka v1.5+, marketplace plugins) passes interface compliance, fail-open, hint attribution, lifecycle hooks tests

**Failure mode:** Mock drift—component tests pass but real implementation has different interface

**CI Policy:** Single contract test failure **blocks all PRs** (zero-tolerance). Mock drift in agentic development has compounding cost (agent makes many decisions against drifted model), while fix cost is near-zero (spawn agent to address). This inverts the human-team trade-off where context-switch tax and resentment make zero-tolerance brittle.

#### Tier 4: Integration Tests (Layer Boundaries, Real Implementations)

**Scope:** Two or more layers working together with real implementations (DB, projectors, orchestrators)  
**Dependencies:** Real SQLite `:memory:`, real projectors, mocked external I/O (LLM calls, filesystem)  
**Speed:** ~100-500ms per test  
**Examples:**
- Fork session → query child ledger prefix → verify logical inheritance (real DB schema)
- Append primitive → hook bus fires → projector materializes → query derived view
- Curator triggers → Forge prescribers run → hints persisted → dedup suppresses duplicates
- Bisect orchestrator forks session → replays to offset → test command executes

**Failure mode:** Integration seam mismatch (layer A emits shape layer B doesn't expect)

#### Tier 5: Acceptance Tests (Full System, User-Observable Behavior)

**Scope:** End-to-end CLI commands exercising full stack  
**Dependencies:** Real DB (file-backed for fork tests), real CLI renderer, mocked LLM/tool I/O  
**Speed:** ~500ms-5s per test  
**Examples:**
- `crucible fork --at 23` creates child session, user can query both parent and child
- `crucible replay <session>` produces identical ledger (hermetic replay)
- `crucible why P47` displays causal ancestry graph
- `crucible aperture watch` shows quarantine notification after deny-list match

**Failure mode:** User story not satisfied (highest-priority fix—blocks release)

### 5.3 Conformance Suites (Cross-Cutting Invariants)

Beyond the pyramid, **conformance suites** validate architectural invariants across all layers.

#### Determinism Conformance Suite

**Purpose:** Validate A1-A4 determinism invariants (replay produces identical ledger)  
**Input:** Production ledger snapshots (golden files)  
**Execution:**
1. Load snapshot → extract session metadata + event sequence
2. Replay session: reconstruct context windows, recompute Decision commitment hashes
3. Compare resulting ledger byte-for-byte (exclude wall-clock timestamps via `normalizeTimestamps()` helper)
4. Assert: all primitives match, all hook verdicts match, all context-window commitment hashes match

**Failure:** Determinism regression (non-hermetic operation leaked into replay path)

#### Pareto Fitness Conformance Suite

**Purpose:** Validate fitness contract evaluation across all prescribers  
**Input:** Golden fitness datasets (competing prescriptions with known dominance relationships)  
**Execution:**
1. Load dataset → extract prescriptions with fitness contracts
2. Run Pareto frontier computation
3. Assert: non-dominated set matches expected
4. Handle incomparable prescriptions (non-overlapping axes): both remain in non-dominated set (no zero-fill, no partial dominance for v1)

**Failure:** Fitness computation regression (multi-objective dominance logic broken, or incomparable-handling regression)

#### Hook Budget Conformance Suite

**Purpose:** Validate pre-commit hook bus enforces ≤80µs predicate budget  
**Input:** Synthetic hooks with known execution times (10µs, 50µs, 100µs, 1ms)  
**Execution:**
1. Register hooks with budgets [10µs, 50µs, 80µs]
2. Fire hook bus with test primitive
3. Assert: 10µs hook completes, 50µs completes, 80µs completes, 100µs times out
4. Assert: timeout triggers fail-open (COMMIT verdict, not crash)

**Failure:** Budget enforcement regression (slow hooks block append)

### 5.4 Test Data Strategy per Tier

| Tier | Data Strategy | Persistence | Shared Fixtures? |
|---|---|---|---|
| Unit | Inline literals (`{a:1, b:2}`) | None | No (data trivial) |
| Component | Fixture builders (`buildSession({forkFrom: 'parent'})`) | None | Yes (builders in `test/fixtures/`) |
| Contract | Golden files (real DB snapshots) | Read-only | Yes (`test/golden/`) |
| Integration | Seeded `:memory:` DB | Per-test | Shared seed scripts |
| Acceptance | File-backed DB (`.test-sessions/`) | Per-scenario | Shared seed scripts |
| Conformance | Production snapshots (anonymized) | Read-only | Yes (`test/conformance-data/`) |

**Key principle:** Higher tiers use richer, more realistic data. Lower tiers use minimal, focused data.

---

## 6. Invariant & Property Tests

Crucible's architectural invariants (append-only, hash-chain, replay equivalence, determinism) demand **property-based testing** beyond example-driven unit tests. This section defines invariant test patterns using property testing (e.g., `fast-check`).

### 6.1 Append-Only Invariant

**Invariant:** Once committed to L1 WAL, a primitive is **immutable**. No UPDATE, no DELETE, only INSERT.

**Property Test:**

```typescript
// packages/crucible-core/src/__tests__/properties/append-only.property.ts

import fc from 'fast-check';

describe('Append-Only Invariant', () => {
  it('ledger grows monotonically, never shrinks or mutates', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          primitiveKind: fc.constantFrom('request', 'artifact', 'observation', 'decision', 'question'),
          primitivePayload: fc.object(),
          causalReadSet: fc.array(fc.integer({ min: 0, max: 100 })),
        }), { minLength: 10, maxLength: 100 }),
        async (primitives) => {
          const ledger = await createLedger();
          const snapshots: any[][] = [];
          
          // Append primitives one at a time, snapshot after each
          for (const primitive of primitives) {
            await ledger.append(primitive);
            const snapshot = await ledger.queryAll();
            snapshots.push(snapshot);
          }
          
          // Assert: Each snapshot is a prefix of the next
          for (let i = 0; i < snapshots.length - 1; i++) {
            const current = snapshots[i];
            const next = snapshots[i + 1];
            
            // Next snapshot has exactly one more event
            expect(next.length).toBe(current.length + 1);
            
            // All previous events are unchanged (deep equality)
            for (let j = 0; j < current.length; j++) {
              expect(next[j]).toEqual(current[j]);
            }
          }
        }
      ),
      { numRuns: 50 } // Run 50 random scenarios
    );
  });
});
```

**Failure mode:** Ledger UPDATE or DELETE detected (immutability broken)

### 6.2 Hash-Chain Integrity (Context-Window Commitment)

**Invariant:** Each Decision primitive's commitment hash is a **Merkle hash over its causal-context window**—every prior ledger row visible at decision time (any primitive type), in canonical row order.

**Property Test:**

```typescript
describe('Hash-Chain Integrity (Context-Window Commitment)', () => {
  it('identical context windows produce identical commitment hashes', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryPrimitive, { minLength: 5, maxLength: 50 }), // Ledger prefix
        async (ledgerPrefix) => {
          const hasher = new ContextWindowHasher();
          
          // Hash same ledger prefix twice (context window = full prefix)
          const hash1 = hasher.hashContextWindow(ledgerPrefix);
          const hash2 = hasher.hashContextWindow(ledgerPrefix);
          
          // Assert: Determinism (same input → same output)
          expect(hash1).toEqual(hash2);
          
          // Hash with one additional primitive (extended window)
          const extendedPrefix = [...ledgerPrefix, arbitraryPrimitive];
          const hash3 = hasher.hashContextWindow(extendedPrefix);
          
          // Assert: Different window → different hash
          expect(hash3).not.toEqual(hash1);
          
          // Hash with same prefix but different order (should not occur in practice, but validates ordering sensitivity)
          const shuffled = [...ledgerPrefix].sort(() => Math.random() - 0.5);
          const hash4 = hasher.hashContextWindow(shuffled);
          
          // Assert: Order sensitivity (unless ledgerPrefix was already [randomly] in shuffled order)
          if (JSON.stringify(ledgerPrefix) !== JSON.stringify(shuffled)) {
            expect(hash4).not.toEqual(hash1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  
  it('context window includes all primitive types in range', () => {
    const ledgerPrefix = [
      new PrimitiveBuilder().ofKind('request').build(),
      new PrimitiveBuilder().ofKind('artifact').build(),
      new PrimitiveBuilder().ofKind('observation').build(),
      new PrimitiveBuilder().ofKind('decision').build(),
      new PrimitiveBuilder().ofKind('question').build(),
    ];
    
    const hasher = new ContextWindowHasher();
    const hash = hasher.hashContextWindow(ledgerPrefix);
    
    // Hash must be computed over all 5 primitives (not just Observations or Decisions)
    expect(hash).not.toBeNull();
    expect(hash).toHaveLength(64); // BLAKE3 produces 32-byte hex string
  });
});
```

**Failure mode:** Non-deterministic hashing (CBOR serialization bug, BLAKE3 misuse, incorrect window bounds)

### 6.3 Replay Equivalence

**Invariant:** Replaying a session produces **byte-identical ledger** (modulo wall-clock timestamps, which are excluded from equality check via `normalizeTimestamps()` helper).

**Property Test:**

```typescript
describe('Replay Equivalence', () => {
  it('replay produces identical ledger for arbitrary primitive sequences', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          primitiveKind: fc.constantFrom('request', 'observation', 'decision'),
          primitivePayload: fc.object({ maxDepth: 2 }),
        }), { minLength: 5, maxLength: 50 }),
        async (primitives) => {
          // Original execution: primitives appended, context windows captured
          const ledger1 = await createLedger();
          
          for (const primitive of primitives) {
            await ledger1.append(primitive); // Observations captured as first-class primitives
          }
          
          const snapshot1 = await ledger1.queryAll();
          
          // Replay execution: reconstruct context windows from ledger, recompute hashes
          const ledger2 = await createLedger();
          for (const primitive of primitives) {
            await ledger2.append(primitive, { replayMode: true });
          }
          
          const snapshot2 = await ledger2.queryAll();
          
          // Assert: Byte-identical (exclude wall-clock timestamps)
          expect(normalizeTimestamps(snapshot1)).toEqual(normalizeTimestamps(snapshot2));
        }
      ),
      { numRuns: 30 }
    );
  });
});

function normalizeTimestamps(events: any[]): any[] {
  return events.map(e => ({ ...e, timestamp: 0 }));
}
```

**Failure mode:** Replay diverges from original (non-hermetic operation leaked, context-window reconstruction bug)

### 6.4 Fork Lineage Transitivity

**Invariant:** Fork relationships are transitive: if session C forks from B, and B forks from A, then C's lineage traces back to A.

**Property Test:**

```typescript
describe('Fork Lineage Transitivity', () => {
  it('multi-generation forks preserve ancestry', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }), // Number of fork generations
        async (generations) => {
          const ledger = await createLedger();
          
          // Create root session
          let currentSession = await ledger.createSession();
          await ledger.append(currentSession, { primitiveKind: 'observation', primitivePayload: { gen: 0 } });
          
          const lineage = [currentSession];
          
          // Create multi-generation forks
          for (let gen = 1; gen <= generations; gen++) {
            const parentSession = currentSession;
            const forkOffset = 0; // Always fork at offset 0 for simplicity
            
            currentSession = await ledger.forkSession(parentSession, forkOffset);
            lineage.push(currentSession);
            
            await ledger.append(currentSession, { primitiveKind: 'observation', primitivePayload: { gen } });
          }
          
          // Assert: Final session can trace lineage back to root
          const finalSession = lineage[lineage.length - 1];
          const ancestry = await ledger.getAncestry(finalSession);
          
          expect(ancestry.length).toBe(generations + 1); // Root + N generations
          expect(ancestry[0]).toBe(lineage[0]); // Root
          expect(ancestry[ancestry.length - 1]).toBe(finalSession); // Leaf
        }
      ),
      { numRuns: 20 }
    );
  });
});
```

**Failure mode:** Broken fork lineage chain (parent pointer corruption)

### 6.5 Hook Verdict Consistency

**Invariant:** For a given primitive and hook policy, hook verdict is **deterministic** (same input → same verdict).

**Property Test:**

```typescript
describe('Hook Verdict Consistency', () => {
  it('identical primitives produce identical hook verdicts', () => {
    fc.assert(
      fc.property(
        fc.record({
          primitiveKind: fc.constantFrom('request', 'observation', 'decision'),
          primitivePayload: fc.record({ source: fc.constantFrom('builtin', 'external'), content: fc.string() }),
        }),
        async (primitive) => {
          const hookBus = new HookBus();
          
          // Register deterministic policy hook
          const policyHook = (ctx: HookContext) => {
            if (ctx.primitivePayload.source === 'external') {
              return { verdict: 'VETO' as const, reason: 'External source denied' };
            }
            return { verdict: 'COMMIT' as const };
          };
          
          hookBus.registerHook('policy', policyHook, { budget: 50_000 });
          
          // Fire hook twice with identical input
          const result1 = await hookBus.fire({ ...primitive, metadata: { source: primitive.primitivePayload.source, timestamp: 0 } });
          const result2 = await hookBus.fire({ ...primitive, metadata: { source: primitive.primitivePayload.source, timestamp: 0 } });
          
          // Assert: Determinism
          expect(result1.verdict).toBe(result2.verdict);
          expect(result1.reason).toBe(result2.reason);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Failure mode:** Non-deterministic policy (e.g., time-based verdicts without explicit policy)

### 6.6 Projection Purity (L2 Invariant)

**Invariant:** L2 projections are **pure functions** of ledger prefix: `project(events[0..N]) = project(events[0..N])` always.

**Property Test:**

```typescript
describe('Projection Purity', () => {
  it('Aperture projector produces identical output for identical input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          primitiveKind: fc.constantFrom('observation', 'decision'),
          primitivePayload: fc.object({ maxDepth: 2 }),
          metadata: fc.record({ level: fc.constantFrom('info', 'notice', 'attention', 'urgent') }),
        }), { minLength: 10, maxLength: 50 }),
        async (events) => {
          // Project twice with same input
          const db1 = createTestDatabase();
          const db2 = createTestDatabase();
          
          const projector1 = new ApertureProjector(db1, mockNotifier);
          const projector2 = new ApertureProjector(db2, mockNotifier);
          
          projector1.onCommit(0, events);
          projector2.onCommit(0, events);
          
          // Query results
          const result1 = db1.prepare('SELECT * FROM aperture_events ORDER BY ts').all();
          const result2 = db2.prepare('SELECT * FROM aperture_events ORDER BY ts').all();
          
          // Assert: Identical (modulo ULIDs, which are time-based)
          expect(result1.map(normalizeId)).toEqual(result2.map(normalizeId));
        }
      ),
      { numRuns: 30 }
    );
  });
});

function normalizeId(event: any): any {
  return { ...event, id: '<ULID>' };
}
```

**Failure mode:** Projector has hidden state (e.g., global counter, timestamp-dependent logic)

### 6.7 Trust-Tier Monotonicity

**Invariant:** Trust-tier transitions are **monotonic upward** (external → community → adopted), never downward except for explicit revocation.

**Property Test:**

```typescript
describe('Trust-Tier Monotonicity', () => {
  it('auto-promotion never downgrades tier', () => {
    fc.assert(
      fc.property(
        fc.record({
          initialTier: fc.constantFrom('external', 'community'),
          daysElapsed: fc.integer({ min: 0, max: 60 }),
          invocationCount: fc.integer({ min: 0, max: 50 }),
          policyViolations: fc.integer({ min: 0, max: 5 }),
        }),
        async ({ initialTier, daysElapsed, invocationCount, policyViolations }) => {
          const registry = new PluginRegistry();
          const pluginId = 'test-plugin';
          
          // Register plugin at initial tier
          await registry.register(pluginId, { tier: initialTier });
          
          // Simulate time passage + invocations
          await registry.recordInvocations(pluginId, invocationCount);
          await registry.recordViolations(pluginId, policyViolations);
          await registry.advanceTime(daysElapsed);
          
          // Trigger auto-promotion check
          await registry.evaluateAutoPromotion(pluginId);
          
          const finalTier = await registry.getTier(pluginId);
          
          // Assert: Tier never downgrades (unless explicit revocation, not tested here)
          const tierRank = { external: 0, community: 1, adopted: 2 };
          expect(tierRank[finalTier]).toBeGreaterThanOrEqual(tierRank[initialTier]);
        }
      ),
      { numRuns: 50 }
    );
  });
});
```

**Failure mode:** Auto-promotion accidentally downgrades tier (regression in tier-transition logic)

---

### 6.8 Bootstrap-Capture-Completeness (Q1 New Invariant)

**Invariant:** Extra-ledger context (system prompts, tool definitions, cross-session memory) is captured as **Observation primitives at session offset 0**. Replay drifts if this invariant is violated.

**Property Test:**

```typescript
describe('Bootstrap-Capture-Completeness', () => {
  it('session bootstrap captures all extra-ledger context as offset-0 observations', async () => {
    // Arrange: Session bootstrap with system prompt, tool definitions, cross-session memory
    const bootstrapContext = {
      systemPrompt: 'You are a helpful assistant...',
      toolDefinitions: [
        { name: 'read_file', description: '...' },
        { name: 'edit_file', description: '...' },
      ],
      crossSessionMemory: { facts: ['User prefers TypeScript', 'Use 2-space indent'] },
    };
    
    const ledger = await createLedger();
    await ledger.bootstrap(bootstrapContext);
    
    // Act: Query ledger at offset 0
    const offset0Primitives = await ledger.queryEvents({ range: [0, 0] });
    
    // Assert: All extra-ledger context captured as Observation primitives
    const observations = offset0Primitives.filter(p => p.primitiveKind === 'observation');
    
    expect(observations.length).toBeGreaterThan(0);
    
    // Assert: System prompt captured
    const systemPromptObs = observations.find(o => o.primitivePayload.type === 'system_prompt');
    expect(systemPromptObs).toBeDefined();
    expect(systemPromptObs.primitivePayload.content).toContain('You are a helpful assistant');
    
    // Assert: Tool definitions captured
    const toolDefsObs = observations.find(o => o.primitivePayload.type === 'tool_definitions');
    expect(toolDefsObs).toBeDefined();
    expect(toolDefsObs.primitivePayload.tools).toHaveLength(2);
    
    // Assert: Cross-session memory captured
    const memoryObs = observations.find(o => o.primitivePayload.type === 'cross_session_memory');
    expect(memoryObs).toBeDefined();
    expect(memoryObs.primitivePayload.facts).toEqual(['User prefers TypeScript', 'Use 2-space indent']);
  });
  
  it('replay fails if bootstrap observations missing', async () => {
    // Original session with bootstrap
    const ledger1 = await createLedger();
    await ledger1.bootstrap({ systemPrompt: 'System prompt', toolDefinitions: [], crossSessionMemory: {} });
    await ledger1.append({ primitiveKind: 'decision', primitivePayload: { decision: 'test' } });
    
    const snapshot = await ledger1.queryAll();
    
    // Replay session WITHOUT bootstrap observations (simulate corrupted ledger)
    const ledger2 = await createLedger();
    const nonBootstrapPrimitives = snapshot.filter(p => p.commitOffset > 0); // Skip offset 0
    
    for (const primitive of nonBootstrapPrimitives) {
      await ledger2.append(primitive, { replayMode: true });
    }
    
    // Assert: Replay produces different output (context-window hashes don't match)
    const replaySnapshot = await ledger2.queryAll();
    const originalDecision = snapshot.find(p => p.primitiveKind === 'decision');
    const replayedDecision = replaySnapshot.find(p => p.primitiveKind === 'decision');
    
    expect(replayedDecision.commitmentHash).not.toEqual(originalDecision.commitmentHash);
  });
});
```

**Failure mode:** Bootstrap context not captured → replay context-window diverges from original

---

### 6.9 Monotonic-Timestamps-Within-Session (Q6 New Invariant)

**Invariant:** Every L1 row's timestamp ≥ previous row's timestamp. Independent of replay conformance (which excludes timestamps from equality check).

**Property Test:**

```typescript
describe('Monotonic-Timestamps-Within-Session', () => {
  it('ledger row timestamps never decrease within session', async () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryPrimitive, { minLength: 10, maxLength: 100 }),
        async (primitives) => {
          const ledger = await createLedger();
          
          for (const primitive of primitives) {
            await ledger.append(primitive);
            await new Promise(resolve => setTimeout(resolve, 1)); // Ensure time advances
          }
          
          const events = await ledger.queryAll();
          
          // Assert: Timestamps monotonically increase (or stay equal, if appended within same millisecond)
          for (let i = 1; i < events.length; i++) {
            expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
  
  it('detects manual tampering with timestamp order', async () => {
    const ledger = await createLedger();
    
    // Append two primitives
    await ledger.append({ primitiveKind: 'observation', primitivePayload: { a: 1 } });
    await new Promise(resolve => setTimeout(resolve, 10));
    await ledger.append({ primitiveKind: 'observation', primitivePayload: { b: 2 } });
    
    const events = await ledger.queryAll();
    
    // Manually tamper: swap timestamps
    const db = ledger._getDB(); // Test-only accessor
    db.prepare('UPDATE wal_records SET timestamp = ? WHERE offset = ?').run(events[0].timestamp, 1);
    db.prepare('UPDATE wal_records SET timestamp = ? WHERE offset = ?').run(events[1].timestamp, 0);
    
    // Run monotonicity check
    const tampered = await ledger.queryAll();
    
    // Assert: Monotonicity violation detected
    expect(tampered[1].timestamp).toBeLessThan(tampered[0].timestamp); // Violation
    
    // Invariant test suite should flag this
    expect(() => assertMonotonicTimestamps(tampered)).toThrow('Timestamp monotonicity violated');
  });
});

function assertMonotonicTimestamps(events: any[]): void {
  for (let i = 1; i < events.length; i++) {
    if (events[i].timestamp < events[i - 1].timestamp) {
      throw new Error(`Timestamp monotonicity violated at offset ${i}: ${events[i].timestamp} < ${events[i - 1].timestamp}`);
    }
  }
}
```

**Failure mode:** Clock skew, manual tampering, fork-time inheritance bug

---

### 6.10 Summary: Invariant Coverage

| Invariant | Property Test | Failure Detection |
|---|---|---|
| Append-only | Ledger snapshots are prefixes | UPDATE/DELETE leaked |
| Hash-chain (context-window commitment) | Same context window → same hash | CBOR, BLAKE3, or window-bounds bug |
| Replay equivalence | Replay = original (mod timestamps) | Non-hermetic operation, context-window reconstruction bug |
| Fork lineage transitivity | Multi-gen forks trace to root | Parent pointer corruption |
| Hook verdict determinism | Same input → same verdict | Time-based policy leak |
| Projection purity | Same input → same output | Hidden projector state |
| Trust-tier monotonicity | Tier never downgrades (except revocation) | Auto-promotion regression |
| **Bootstrap-Capture-Completeness (Q1)** | **Offset-0 observations capture all extra-ledger context** | **Bootstrap context missing → replay drift** |
| **Monotonic-Timestamps-Within-Session (Q6)** | **Every row timestamp ≥ previous** | **Clock skew, manual tampering, fork-time bug** |

**Test execution:** Property tests run in CI nightly (longer runtime than unit tests). Failures trigger bisect to find minimal counterexample.

---

## 7. Mock Drift Defenses

**Mock drift** is the London-school testing hazard: mocked interfaces diverge from real implementations, causing component tests to pass while integration/acceptance tests fail. Crucible mitigates this via **four defense layers**.

### 7.1 Defense Layer 1: Contract Tests (Zero-Tolerance Gate)

**Mechanism:** For every collaborator role mocked in component tests, a **contract test suite** validates that the real implementation honors the mocked interface.

**Example: `AppendProtocol` Contract Test**

```typescript
// packages/crucible-core/src/__tests__/contracts/append-protocol.contract.ts

describe('AppendProtocol Contract', () => {
  it('real implementation accepts 8-field WAL row shape', async () => {
    const realLedger = await createLedger(); // Real L1 implementation
    
    const row = {
      primitiveKind: 'observation',
      primitivePayload: { content: 'test' },
      causalReadSet: [1, 2, 3],
      causalReadSetHash: '0xabc123...',
      hookVerdict: 'COMMIT',
      commitOffset: 0,
      taskId: null,
      metadata: { source: 'test', timestamp: Date.now() },
    };
    
    // Real implementation must accept this shape (same as mock)
    const offset = await realLedger.append(row);
    
    expect(offset).toBe(0); // First append → offset 0
    expect(typeof offset).toBe('number');
  });
  
  it('real implementation returns monotonic offsets', async () => {
    const realLedger = await createLedger();
    
    const offsets = [];
    for (let i = 0; i < 10; i++) {
      const offset = await realLedger.append({
        primitiveKind: 'observation',
        primitivePayload: { i },
        causalReadSet: [],
        /* ... rest of row */
      });
      offsets.push(offset);
    }
    
    // Assert: Monotonicity (each offset > previous)
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });
});
```

**CI Policy:** **Single contract test failure blocks all PRs** (zero-tolerance).

**Why zero-tolerance for agentic development:**
- **Cost function inversion:** In human teams, zero-tolerance is brittle due to context-switch tax (developer pulled from feature work to fix mock) and resentment (developers disable tests for expediency). In agentic development, these failure modes don't apply:
  - **Context-switch tax = near-zero:** Spawn background agent to address contract test failure. Agent investigates, fixes mock or real implementation, commits. No human context switch.
  - **Resentment = non-existent:** Agents don't experience frustration or disable tests out of expediency.
  - **Drift cost = compounding:** Mock drift compounds across agent actions. An agent making 20 decisions per session against a drifted model produces cumulative correctness debt. Detection cost scales linearly with drift duration.
  - **Fix cost = near-zero:** Agent-driven fix (update mock, update component tests, validate contract) completes in minutes.

**Traditional human-team threshold (≥3 failures → mock audit)** is too permissive for agentic systems. Localized drift (one contract test) in an agentic context is immediate correctness risk, not acceptable iteration noise.

### 7.2 Defense Layer 2: Shared Fixture Builders

**Mechanism:** Test data is **generated via shared builders**, not inline literals. Builders enforce schema invariants and evolve with production schemas.

**Example: `SessionFixtureBuilder`**

```typescript
// packages/crucible-core/src/__tests__/fixtures/session-builder.ts

export class SessionFixtureBuilder {
  private session: Partial<SessionMetadata> = {
    id: ulid(),
    parentSessionId: null,
    forkPointEventId: 0,
    createdAt: Date.now(),
    ledgerSize: 0,
  };
  
  withFork(parentId: string, forkOffset: number): this {
    this.session.parentSessionId = parentId;
    this.session.forkPointEventId = forkOffset;
    return this;
  }
  
  withLedgerSize(size: number): this {
    this.session.ledgerSize = size;
    return this;
  }
  
  build(): SessionMetadata {
    // Validate invariants
    if (this.session.parentSessionId !== null && this.session.forkPointEventId < 0) {
      throw new Error('Fork point must be non-negative');
    }
    
    return this.session as SessionMetadata;
  }
}

// Usage in tests
const parentSession = new SessionFixtureBuilder()
  .withLedgerSize(47)
  .build();

const childSession = new SessionFixtureBuilder()
  .withFork(parentSession.id, 23)
  .build();
```

**Benefit:** When `SessionMetadata` schema changes (e.g., add `pluginVersions` field), builders centralize the update. All tests using builders adapt automatically.

### 7.3 Defense Layer 3: Golden File Regression Tests

**Mechanism:** Real production ledger snapshots (anonymized) become **golden test inputs**. Tests load golden files, replay, and assert output matches expected shape.

**Example: Determinism Golden Test**

```typescript
// packages/crucible-core/src/__tests__/golden/determinism.golden.ts

describe('Determinism Golden Tests', () => {
  it('replays production snapshot session-abc123 identically', async () => {
    // Load golden file (anonymized production ledger)
    const goldenSnapshot = await loadGoldenFile('session-abc123.json');
    
    const ledger = await createLedger();
    const observationStore = new ObservationCaptureStore();
    
    // Seed observation store with captured LLM/tool outputs
    for (const obs of goldenSnapshot.observations) {
      observationStore.store(obs.key, obs.value);
    }
    
    // Replay primitives
    for (const primitive of goldenSnapshot.primitives) {
      await ledger.append(primitive, { replayFrom: observationStore });
    }
    
    // Query final ledger state
    const replayedEvents = await ledger.queryAll();
    
    // Assert: Byte-identical to golden output (modulo timestamps)
    expect(normalizeTimestamps(replayedEvents)).toEqual(
      normalizeTimestamps(goldenSnapshot.expectedOutput)
    );
  });
});
```

**Golden File Management:**
- **Location:** `packages/crucible-core/src/__tests__/golden/snapshots/`
- **Anonymization:** PII scrubbed (user IDs → `user-<hash>`, code snippets → `<CODE_REDACTED>`)
- **Versioning:** Golden files tagged with schema version (e.g., `session-abc123.v14.json`)
- **Rotation:** Update golden files when schema migrations land (manual review required)

**CI Policy:** Golden tests run nightly (slower than unit tests). Failures trigger manual review—either test needs update or regression detected.

### 7.4 Defense Layer 4: CI Double-Check Runs (Swap Mocks for Real Implementations)

**Mechanism:** On critical paths, CI runs **duplicate test suites** with mocks swapped for real implementations (integration stubs).

**Example: Component Test with Mock Swap**

```typescript
// packages/crucible-core/src/__tests__/component/session-manager.test.ts

describe('SessionManager (Component Tests)', () => {
  const DB_MODE = process.env.CI_MOCK_SWAP === 'true' ? 'real' : 'mock';
  
  function getDB() {
    if (DB_MODE === 'real') {
      return createTestDatabase(); // Real SQLite :memory:
    } else {
      return createMockDB(); // Vi.fn() stubs
    }
  }
  
  it('creates child session with lineage metadata', async () => {
    const db = getDB();
    const manager = new SessionManager(db);
    
    const parentId = await manager.createSession();
    const childId = await manager.forkSession(parentId, 23);
    
    const child = await manager.getSession(childId);
    expect(child.parentSessionId).toBe(parentId);
    expect(child.forkPointEventId).toBe(23);
  });
});
```

**CI Configuration:**

```yaml
# .github/workflows/test.yml

jobs:
  test-component-mocked:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- --testPathPattern=component
    env:
      CI_MOCK_SWAP: 'false'  # Use mocks (fast)
  
  test-component-real:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- --testPathPattern=component
    env:
      CI_MOCK_SWAP: 'true'  # Use real implementations (slow, drift detection)
```

**Benefit:** Mock drift detected in component tests (which are faster to debug than acceptance tests). If `test-component-mocked` passes but `test-component-real` fails, mock has diverged.

### 7.5 Defense Layer 5: Interface Stability Tracking

**Mechanism:** Track **interface stability** via TypeScript type exports. Breaking changes to collaborator interfaces trigger CI warnings.

**Example: `api-extractor` Configuration**

```json
// packages/crucible-core/api-extractor.json
{
  "mainEntryPointFilePath": "./src/index.ts",
  "apiReport": {
    "enabled": true,
    "reportFolder": "./etc/api-reports/"
  },
  "publicApi": {
    "includeNonExported": false
  }
}
```

**CI Check:**

```bash
# .github/workflows/test.yml

- name: Check API surface stability
  run: npm run api-extract
  
- name: Detect API changes
  run: |
    if git diff --exit-code etc/api-reports/; then
      echo "API surface unchanged"
    else
      echo "⚠️  API surface changed. Review api-reports/ diff."
      exit 1
    fi
```

**Benefit:** When `AppendProtocol.append()` signature changes (e.g., add required parameter), CI flags the API change. Developers must update mocks explicitly (no silent drift).

### 7.6 Mock Drift Mitigation Summary

| Defense Layer | Mechanism | Detection Speed | Cost |
|---|---|---|---|
| Contract tests (zero-tolerance) | Real impl honors mocked interface | PR-time (immediate) | Low (30-60 tests, ~10s) |
| Shared fixture builders | Builders enforce schema invariants | Build-time (compile errors) | Low (one-time setup) |
| Golden file tests | Production snapshots as regression inputs | Nightly | Medium (slower tests) |
| CI double-check runs | Swap mocks for real impls on critical paths | PR-time (parallel job) | Medium (2× test time) |
| Interface stability tracking | TypeScript type exports + api-extractor | PR-time | Low (automated) |

**Combined effect:** Mock drift detected within **one PR cycle** (minutes to hours), not weeks later in production.

**Zero-tolerance rationale (Q7):** Agentic-development cost functions invert vs human teams. In human teams, ≥3-failure threshold balances iteration speed vs correctness (context-switch tax makes zero-tolerance brittle). In agentic teams, drift cost is high and opaque (compounds across many automated decisions), while fix cost is near-zero (spawn agent to address). This enables zero-tolerance policies impractical for human-only workflows.

### 7.7 When Mock Drift is Detected

**Triage Protocol:**

1. **Contract test fails:** Mock has diverged from real implementation.
   - **Fix (zero-tolerance):** Spawn background agent immediately. Agent updates mock to match real interface, updates component tests if needed, validates contract. No PR merge until fixed.
   - **Review:** Why did interface change? Was it documented? If undocumented breaking change, escalate to API design review.

2. **Golden test fails:** Real implementation behavior changed.
   - **Investigation:** Is this expected (new feature) or regression (bug)?
   - **Action:** If expected, update golden file (manual review). If regression, fix implementation.

3. **CI double-check fails:** Component test passes with mock, fails with real impl.
   - **Root cause:** Mock behavior != real behavior (not just interface).
   - **Fix:** Update mock to match real behavior semantics. Add contract test for the divergent behavior.

4. **API extractor fails:** Public interface changed.
   - **Review:** Is this a breaking change? Update major version if yes.
   - **Action:** Update mocks across all test suites. Document breaking change in CHANGELOG.

**Escalation (removed for agentic development):** In human teams, ≥3 simultaneous failures → mock audit sprint. In agentic teams, **single failure** triggers background agent spawn (no escalation delay needed).

---

## 8. Test-First Cadence

**Test-first discipline** is the heartbeat of London-school TDD. This section defines workflow rules, branch hygiene, and CI policies enforcing "red before green."

### 8.1 Red-First Workflow Rules

#### Rule 1: No Production Code Without a Failing Test

**Policy:** Every production code change MUST be preceded by a failing test demonstrating the need.

**Enforcement:**
- **Pre-commit hook:** Runs `git diff --cached` to detect new production files. If detected, checks `git log -1 --name-only` for corresponding test file in same commit.
- **PR template:** Checklist item "✓ All production changes have accompanying tests"
- **Code review:** Reviewers explicitly verify test-first pattern (test commit precedes implementation commit)

**Exception:** Bug fixes may reverse the order (fix first, then add regression test). Mark commits with `[bugfix]` prefix.

#### Rule 2: Test Describes Desired Behavior, Not Current Behavior

**Anti-pattern:**

```typescript
// BAD: Test written after implementation, documenting current behavior
it('SessionManager.forkSession returns session-123', async () => {
  const manager = new SessionManager(db);
  const childId = await manager.forkSession('parent', 23);
  expect(childId).toBe('session-123'); // Hardcoded current output
});
```

**Correct pattern:**

```typescript
// GOOD: Test describes desired contract (before implementation exists)
it('SessionManager.forkSession returns new session ID with fork lineage', async () => {
  const manager = new SessionManager(db);
  const parentId = 'parent-id';
  
  const childId = await manager.forkSession(parentId, 23);
  
  // Assert: Child ID is distinct from parent
  expect(childId).not.toBe(parentId);
  
  // Assert: Child has correct lineage
  const child = await manager.getSession(childId);
  expect(child.parentSessionId).toBe(parentId);
  expect(child.forkPointEventId).toBe(23);
});
```

**Review checklist:** Do assertions specify **contracts** (invariants, relationships) or **current outputs** (magic constants)?

#### Rule 3: Commit Cadence = Red → Green → Refactor (Three Commits)

**Workflow:**

1. **Commit 1 (Red):** Add failing test
   ```bash
   git add src/__tests__/unit/session-manager.test.ts
   git commit -m "RED: Test SessionManager.forkSession creates child with lineage"
   ```

2. **Commit 2 (Green):** Minimal implementation to pass test
   ```bash
   git add src/session-manager.ts
   git commit -m "GREEN: Implement SessionManager.forkSession"
   ```

3. **Commit 3 (Refactor):** Extract patterns, remove duplication
   ```bash
   git add src/session-manager.ts src/fork-lineage.ts
   git commit -m "REFACTOR: Extract ForkLineage value object"
   ```

**Benefit:** Git history becomes a **learning artifact**. New contributors can walk through TDD cycles commit-by-commit.

**Tooling:** Git alias to enforce three-commit pattern:

```bash
# .git/config or ~/.gitconfig
[alias]
  tdd-red = "!f() { git add $1 && git commit -m \"RED: $2\"; }; f"
  tdd-green = "!f() { git add $1 && git commit -m \"GREEN: $2\"; }; f"
  tdd-refactor = "!f() { git add $1 && git commit -m \"REFACTOR: $2\"; }; f"

# Usage:
# git tdd-red src/__tests__/unit/session-manager.test.ts "Test fork creates child"
# git tdd-green src/session-manager.ts "Implement forkSession"
# git tdd-refactor src/session-manager.ts "Extract ForkLineage"
```

### 8.2 Branch Hygiene

#### Short-Lived Feature Branches (≤2 Days)

**Policy:** Feature branches live ≤2 days (16 work-hours) before merging to trunk.

**Rationale:** London-school TDD produces many small commits (red/green/refactor cycles). Long-lived branches accumulate merge conflicts and stale mocks.

**Enforcement:**
- **CI check:** If branch age > 48 hours, CI warning (not block)
- **PR template:** "Branch age: ___ hours. If >48h, justify."

#### Trunk-Based Development

**Policy:** All work merges to `main` (trunk). No long-lived `dev` or `staging` branches.

**Feature flags:** Use feature flags for incomplete work, not branches.

```typescript
// Example: L5 Investigation surface in development
if (featureFlags.investigation) {
  await bisectOrchestrator.run(goodOffset, badOffset, testCommand);
}
```

**Rationale:** Trunk-based development prevents **integration hell** (10 feature branches, all with divergent mocks).

### 8.3 CI Policy: No Merge Without Green Tests

#### Required Checks (All Must Pass)

1. **Unit tests:** `npm test -- --testPathPattern=unit` (~500-1000 tests, <30s)
2. **Component tests:** `npm test -- --testPathPattern=component` (~200-400 tests, <2min)
3. **Contract tests:** `npm test -- --testPathPattern=contracts` (~30-60 tests, <1min)
4. **Integration tests:** `npm test -- --testPathPattern=integration` (~50-100 tests, <5min)
5. **Linting:** `npm run lint` (ESLint + TypeScript type check)
6. **API stability:** `npm run api-extract` (detect breaking changes)

**Total CI time:** ~10-15 minutes per PR

#### Conditional Checks (Run on Schedule or Manually)

1. **Acceptance tests:** `npm test -- --testPathPattern=acceptance` (~12 tests, ~1-5min, nightly)
2. **Property tests:** `npm test -- --testPathPattern=properties` (~100 runs per property, ~10min, nightly)
3. **Golden tests:** `npm test -- --testPathPattern=golden` (~10 tests, ~5min, nightly)
4. **Conformance suites:** `npm run test:conformance` (~30min, weekly)

**Rationale:** Fast feedback loop (PR checks <15min). Slow tests run nightly to catch drift without blocking development.

#### Test Failure Triage Protocol

**Failure category determines action:**

| Failure Type | Action | Timeline |
|---|---|---|
| Unit test | Fix immediately (regression in leaf logic) | <1 hour |
| Component test | Check mock vs real impl (contract test?) | <2 hours |
| Contract test | **Block all PRs** (mock drift detected) | <4 hours |
| Integration test | Investigate layer boundary mismatch | <1 day |
| Acceptance test | **Highest priority** (user story broken) | <4 hours |
| Property test | Minimize counterexample, investigate invariant | <1 day |
| Golden test | Manual review (expected change or regression?) | <1 day |

**Escalation:** If >5 tests fail simultaneously across multiple layers, declare **test infrastructure emergency** (block all PRs until root cause identified).

### 8.4 Test Coverage Targets (Per Layer)

**Coverage is a trailing indicator, not a leading one.** Test-first discipline produces high coverage naturally. Measure coverage to detect **untested edge cases**, not to enforce arbitrary thresholds.

| Layer | Statement Coverage Target | Branch Coverage Target |
|---|---|---|
| L0 Bridge | 80% | 70% |
| L1 Ledger | 95% | 90% |
| L2 Query | 90% | 85% |
| L3 Prescribers | 85% | 75% |
| L4 Router | 95% | 90% |
| L5 Investigation | 80% | 70% |

**Rationale:**
- **L1 and L4 are highest:** Ledger and Router are safety-critical (durability, policy enforcement)
- **L5 is lowest:** Investigation surface is UX-heavy (debugger, bisect), harder to test exhaustively

**CI enforcement:** Coverage must not **decrease** PR-over-PR. No absolute threshold blocks merge, but regression triggers warning.

### 8.5 Test Naming Conventions

**Template:** `[Layer] [Component] [Method/Scenario] [Expected Behavior]`

**Examples:**
- `L1 Ledger.append() rejects when hook returns VETO`
- `L3 PrescriberOrchestrator.run() fails open when one prescriber crashes`
- `L4 Router.evaluate() escalates structural proposals for user review`
- `Acceptance: Fork session creates child with inherited ledger prefix`

**Anti-patterns:**
- ❌ `test1`, `test2`, `test3` (meaningless names)
- ❌ `it works` (too vague)
- ❌ `SessionManager should fork sessions` (passive voice, not specific)

**Benefit:** Test failures are **self-documenting**. CI output shows: `FAIL L1 Ledger.append() rejects when hook returns VETO` (immediately actionable).

---

## 9. Test Data & Fixture Strategy

Test data quality determines test reliability. Crucible's test data strategy balances **realism** (data resembles production), **minimalism** (smallest data set that exercises behavior), and **maintainability** (data evolves with schemas).

### 9.1 Fixture Builder Pattern (Primary Strategy)

**Principle:** Generate test data via **builders**, not inline literals.

#### Builder Example: `PrimitiveBuilder`

```typescript
// packages/crucible-core/src/__tests__/fixtures/primitive-builder.ts

export class PrimitiveBuilder {
  private primitive: Partial<Primitive> = {
    primitiveKind: 'observation',
    primitivePayload: {},
    causalReadSet: [],
    metadata: { source: 'test', timestamp: Date.now() },
  };
  
  ofKind(kind: PrimitiveKind): this {
    this.primitive.primitiveKind = kind;
    return this;
  }
  
  withPayload(payload: object): this {
    this.primitive.primitivePayload = payload;
    return this;
  }
  
  withReadSet(primitiveIds: number[]): this {
    this.primitive.causalReadSet = primitiveIds;
    return this;
  }
  
  fromSource(source: 'builtin' | 'plugin' | 'user' | 'external'): this {
    this.primitive.metadata.source = source;
    return this;
  }
  
  build(): Primitive {
    // Validate invariants
    if (!this.primitive.primitiveKind) {
      throw new Error('Primitive must have a kind');
    }
    
    return {
      ...this.primitive,
      id: ulid(), // Generate unique ID
      commitOffset: -1, // Placeholder (assigned on append)
    } as Primitive;
  }
  
  buildMany(count: number): Primitive[] {
    return Array.from({ length: count }, (_, i) =>
      this.withPayload({ ...this.primitive.primitivePayload, index: i }).build()
    );
  }
}

// Usage in tests
const observation = new PrimitiveBuilder()
  .ofKind('observation')
  .withPayload({ type: 'quarantine', pluginId: 'bad-plugin' })
  .fromSource('external')
  .build();

const primitives = new PrimitiveBuilder()
  .ofKind('request')
  .buildMany(10); // Generate 10 requests
```

**Benefits:**
1. **Schema evolution:** When `Primitive` gains new required field (e.g., `schemaVersion`), update builder once. All tests adapt.
2. **Readability:** `new PrimitiveBuilder().ofKind('decision').fromSource('builtin')` is self-documenting.
3. **Invariant enforcement:** Builders validate constraints (e.g., `causalReadSet` cannot reference negative offsets).

---

#### Builder Example: `LedgerPrefixBuilder` (Q1 Context-Window Testing)

```typescript
// packages/crucible-core/src/__tests__/fixtures/ledger-prefix-builder.ts

export class LedgerPrefixBuilder {
  private primitives: Primitive[] = [];
  
  withBootstrapContext(context: {
    systemPrompt: string;
    toolDefinitions: any[];
    crossSessionMemory: any;
  }): this {
    // Offset 0: System prompt observation
    this.primitives.push(
      new PrimitiveBuilder()
        .ofKind('observation')
        .withPayload({ type: 'system_prompt', content: context.systemPrompt })
        .build()
    );
    
    // Offset 1: Tool definitions observation
    this.primitives.push(
      new PrimitiveBuilder()
        .ofKind('observation')
        .withPayload({ type: 'tool_definitions', tools: context.toolDefinitions })
        .build()
    );
    
    // Offset 2: Cross-session memory observation
    this.primitives.push(
      new PrimitiveBuilder()
        .ofKind('observation')
        .withPayload({ type: 'cross_session_memory', facts: context.crossSessionMemory })
        .build()
    );
    
    return this;
  }
  
  appendRequest(payload: object): this {
    this.primitives.push(
      new PrimitiveBuilder().ofKind('request').withPayload(payload).build()
    );
    return this;
  }
  
  appendArtifact(payload: object): this {
    this.primitives.push(
      new PrimitiveBuilder().ofKind('artifact').withPayload(payload).build()
    );
    return this;
  }
  
  appendObservation(payload: object): this {
    this.primitives.push(
      new PrimitiveBuilder().ofKind('observation').withPayload(payload).build()
    );
    return this;
  }
  
  appendDecision(contextWindowSize: number): this {
    // Decision commits over entire ledger prefix up to this point
    const contextWindow = this.primitives.slice(0, contextWindowSize);
    const commitmentHash = hashContextWindow(contextWindow);
    
    this.primitives.push(
      new PrimitiveBuilder()
        .ofKind('decision')
        .withPayload({ status: 'accepted', commitmentHash })
        .build()
    );
    return this;
  }
  
  build(): Primitive[] {
    // Assign commit offsets
    return this.primitives.map((p, i) => ({ ...p, commitOffset: i }));
  }
}

// Usage in context-window commitment tests
const ledgerPrefix = new LedgerPrefixBuilder()
  .withBootstrapContext({
    systemPrompt: 'You are a helpful assistant',
    toolDefinitions: [{ name: 'read_file' }],
    crossSessionMemory: { facts: ['Use TypeScript'] }
  })
  .appendRequest({ content: 'Read package.json' })
  .appendArtifact({ file: 'package.json', content: '...' })
  .appendDecision(5) // Decision over [0..4]
  .build();
```

**Use case:** Testing Bootstrap-Capture-Completeness invariant (Q1), context-window commitment correctness.

---

#### Builder Example: `TransitiveDepGraphBuilder` (Q4 Plugin Pinning)

```typescript
// packages/crucible-core/src/__tests__/fixtures/transitive-dep-graph-builder.ts

export class TransitiveDepGraphBuilder {
  private graph: Map<string, { version: string; deps: string[] }> = new Map();
  
  addPlugin(name: string, version: string, deps: string[] = []): this {
    this.graph.set(name, { version, deps });
    return this;
  }
  
  build(): Record<string, string> {
    // Resolve transitive dependency graph (BFS)
    const resolved: Record<string, string> = {};
    const queue: string[] = Array.from(this.graph.keys());
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      
      const node = this.graph.get(current);
      if (!node) continue;
      
      resolved[current] = node.version;
      
      for (const dep of node.deps) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }
    
    return resolved;
  }
}

// Usage in fork pinning tests
const transitiveGraph = new TransitiveDepGraphBuilder()
  .addPlugin('@akubly/skill-x', '1.2.3', ['@akubly/util-lib'])
  .addPlugin('@akubly/util-lib', '2.0.1', ['lodash'])
  .addPlugin('lodash', '4.17.21', [])
  .build();

// Result: { '@akubly/skill-x': '1.2.3', '@akubly/util-lib': '2.0.1', 'lodash': '4.17.21' }
```

**Use case:** Testing plugin pinning at session fork (Q4), validating transitive-dep-graph capture.

---

#### Builder Example: `EnvSnapshotBuilder` (Q5 Bisect Env Consistency)

```typescript
// packages/crucible-core/src/__tests__/fixtures/env-snapshot-builder.ts

export class EnvSnapshotBuilder {
  private env: Record<string, string> = {};
  private configFiles: Map<string, string> = new Map();
  
  withEnvVar(key: string, value: string): this {
    this.env[key] = value;
    return this;
  }
  
  withConfigFile(path: string, content: string): this {
    this.configFiles.set(path, content);
    return this;
  }
  
  withDefaults(): this {
    // Default env vars relevant to bisect
    this.env['NODE_ENV'] = 'test';
    this.env['PATH'] = process.env.PATH || '';
    this.env['HOME'] = process.env.HOME || '/home/user';
    return this;
  }
  
  build(): { env: Record<string, string>; configFiles: Map<string, string> } {
    return { env: this.env, configFiles: this.configFiles };
  }
}

// Usage in bisect tests
const envSnapshot = new EnvSnapshotBuilder()
  .withDefaults()
  .withEnvVar('CRUCIBLE_TEST_MODE', 'bisect')
  .withConfigFile('.crucible/config.json', '{ "debug": false }')
  .build();

// Bisect orchestrator uses fixed snapshot for all iterations (internal consistency)
```

**Use case:** Testing bisect env snapshot at start (Q5), validating internal consistency across iterations.

### 9.2 Golden Files (Production-Derived Data)

**Use case:** Regression testing with **real production data** (anonymized).

#### Golden File Structure

```
packages/crucible-core/src/__tests__/golden/
  ├── snapshots/
  │   ├── session-abc123.v14.json       # Anonymized session snapshot
  │   ├── session-def456.v14.json
  │   └── session-ghi789.v14.json
  ├── observations/
  │   ├── session-abc123-obs.json       # Captured LLM/tool outputs
  │   └── session-def456-obs.json
  └── expected-outputs/
      ├── session-abc123-replay.json    # Expected replay output
      └── session-def456-replay.json
```

#### Golden File Format

```json
{
  "schemaVersion": 14,
  "sessionId": "session-abc123",
  "metadata": {
    "parentSessionId": null,
    "forkPointEventId": 0,
    "pluginVersions": {
      "@akubly/skill-x": "1.2.3"
    }
  },
  "primitives": [
    {
      "primitiveKind": "observation",
      "primitivePayload": { "content": "<REDACTED>" },
      "causalReadSet": [],
      "commitOffset": 0,
      "timestamp": 1672531200000
    }
  ],
  "observations": [
    {
      "key": "llm-call-001",
      "value": { "response": "<REDACTED>" }
    }
  ]
}
```

**Anonymization Rules:**
- User IDs → `user-<hash>`
- Code snippets → `<CODE_REDACTED>`
- File paths → `/home/user/project/...` → `/PROJECT_ROOT/...`
- Secrets → `<SECRET_REDACTED>`

**Maintenance:** When schema migrations land (e.g., v14 → v15), run migration on golden files:

```bash
npm run migrate-golden-files --from=v14 --to=v15
```

### 9.3 Randomized Generators (Property Testing)

**Use case:** Generate **diverse test inputs** to explore edge cases.

#### Generator Example: Random Primitive Sequences

```typescript
// packages/crucible-core/src/__tests__/generators/primitive.generator.ts

import fc from 'fast-check';

export const arbitraryPrimitive = fc.record({
  primitiveKind: fc.constantFrom('request', 'artifact', 'observation', 'decision', 'question'),
  primitivePayload: fc.object({ maxDepth: 3 }),
  causalReadSet: fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 10 }),
  metadata: fc.record({
    source: fc.constantFrom('builtin', 'plugin', 'user', 'external'),
    timestamp: fc.integer({ min: 1600000000000, max: 1700000000000 }),
  }),
});

export const arbitraryPrimitiveSequence = fc.array(arbitraryPrimitive, {
  minLength: 5,
  maxLength: 50,
});

// Usage in property tests
fc.assert(
  fc.property(arbitraryPrimitiveSequence, async (primitives) => {
    const ledger = await createLedger();
    for (const primitive of primitives) {
      await ledger.append(primitive);
    }
    
    const events = await ledger.queryAll();
    expect(events).toHaveLength(primitives.length); // Append-only invariant
  }),
  { numRuns: 100 }
);
```

**Shrinking:** When property test fails, `fast-check` automatically **minimizes** the failing input. Example: Test fails on 50-primitive sequence → shrinks to minimal 3-primitive sequence that still fails.

### 9.4 Seeded Test Databases

**Use case:** Integration tests need realistic **relational data** (sessions, prescriptions, change vectors).

#### Seed Script Example

```typescript
// packages/crucible-core/src/__tests__/seeds/seed-fork-scenario.ts

export async function seedForkScenario(db: Database): Promise<{
  rootSession: string;
  childSession: string;
  grandchildSession: string;
}> {
  const rootId = ulid();
  
  // Insert root session
  db.prepare(`
    INSERT INTO sessions (id, parent_session_id, fork_point_event_id, created_at)
    VALUES (?, NULL, 0, ?)
  `).run(rootId, Date.now());
  
  // Append 50 primitives to root
  for (let i = 0; i < 50; i++) {
    db.prepare(`
      INSERT INTO wal_records (session_id, offset, primitive_kind, primitive_payload)
      VALUES (?, ?, 'observation', ?)
    `).run(rootId, i, JSON.stringify({ content: `event-${i}` }));
  }
  
  // Fork child at offset 25
  const childId = ulid();
  db.prepare(`
    INSERT INTO sessions (id, parent_session_id, fork_point_event_id, created_at)
    VALUES (?, ?, 25, ?)
  `).run(childId, rootId, Date.now());
  
  // Fork grandchild from child at offset 10
  const grandchildId = ulid();
  db.prepare(`
    INSERT INTO sessions (id, parent_session_id, fork_point_event_id, created_at)
    VALUES (?, ?, 10, ?)
  `).run(grandchildId, childId, Date.now());
  
  return { rootSession: rootId, childSession: childId, grandchildSession: grandchildId };
}

// Usage in integration tests
it('queries multi-generation fork lineage', async () => {
  const db = createTestDatabase();
  await runMigrations(db); // Apply schema
  
  const { rootSession, grandchildSession } = await seedForkScenario(db);
  
  const ancestry = await getAncestry(db, grandchildSession);
  expect(ancestry).toEqual([rootSession, '<child-id>', grandchildSession]);
});
```

**Seed Library:**
- `seed-fork-scenario.ts` — Multi-generation forks
- `seed-prescriber-history.ts` — Applied hints + execution profiles
- `seed-marketplace-tiers.ts` — Plugins at different trust tiers
- `seed-aperture-events.ts` — Notifications at various levels

### 9.5 Test Data Maintenance Strategy

#### Schema Migration Impact on Test Data

**Problem:** When DB schema changes (e.g., add `plugin_versions` column to `sessions`), existing test data becomes stale.

**Solution: Migration-Aware Test Fixtures**

```typescript
// packages/crucible-core/src/__tests__/fixtures/test-database.ts

export function createTestDatabase(): Database {
  const db = new Database(':memory:');
  
  // Apply all migrations (keeps test DB in sync with production schema)
  runMigrations(db, { toVersion: 'latest' });
  
  return db;
}

export function createTestDatabaseAtVersion(version: number): Database {
  const db = new Database(':memory:');
  runMigrations(db, { toVersion: version });
  return db;
}
```

**Benefit:** When migration 15 lands, all tests using `createTestDatabase()` automatically use v15 schema. No manual fixture updates.

#### Golden File Rotation Policy

**Problem:** Golden files become stale as schema evolves.

**Policy:**
1. **On minor schema change (additive):** Golden files remain valid (new fields have defaults). No rotation needed.
2. **On major schema change (breaking):** Rotate golden files. Run migration on snapshots, manually review.
3. **On quarterly basis:** Refresh golden files from recent production sessions (anonymize, snapshot, commit).

**Tooling:**

```bash
npm run rotate-golden-files --from-production --anonymize --target-schema=v15
```

**Output:** New `session-xyz.v15.json` files in `golden/snapshots/`, old v14 files archived to `golden/archive/v14/`.

---

## 10. Coverage Discipline

**Coverage metrics** (statement, branch, function) are **trailing indicators** of test quality, not goals. London-school TDD naturally produces high coverage via test-first discipline. This section defines what to measure, when to act, and which tools to use.

### 10.1 What to Measure

#### Primary Metric: Branch Coverage

**Definition:** Percentage of decision branches (if/else, switch cases, ternaries) executed by tests.

**Rationale:** Branch coverage detects **untested edge cases** better than statement coverage. Example:

```typescript
function evaluatePolicy(source: string): Verdict {
  if (source === 'external') {
    return 'VETO'; // Branch A
  }
  return 'COMMIT'; // Branch B
}
```

- **100% statement coverage:** One test calling `evaluatePolicy('external')` covers both lines.
- **50% branch coverage:** Only Branch A tested. Branch B (builtin/plugin sources) untested.

**Target:** 85% branch coverage (per layer targets in §8.4).

#### Secondary Metric: Mutation Score

**Definition:** Percentage of code **mutations** (injected bugs) that cause test failures.

**Rationale:** High coverage doesn't guarantee effective tests. Mutation testing validates **assertion quality**.

**Example:**

```typescript
// Original code
function append(primitive: Primitive): number {
  if (primitive.primitiveKind === 'request') {
    return db.insert(primitive);
  }
  throw new Error('Unsupported kind');
}

// Mutant 1: Change === to !==
if (primitive.primitiveKind !== 'request') {
  return db.insert(primitive);
}

// Mutant 2: Remove error throw
if (primitive.primitiveKind === 'request') {
  return db.insert(primitive);
}
// (No throw, falls through to undefined return)
```

**Mutation testing tools:** `stryker-mutator` (TypeScript/JavaScript)

**CI Policy:** Run mutation tests **weekly** (slow: ~30min for 1000 LOC). Mutation score target: **>70%**.

### 10.2 When to Act on Coverage Gaps

#### Coverage Regression (PR Decreases Coverage)

**Policy:** PR cannot decrease branch coverage by >2 percentage points without justification.

**Enforcement:**

```yaml
# .github/workflows/coverage.yml

- name: Check coverage regression
  run: |
    CURRENT=$(npm run coverage:json | jq '.total.branches.pct')
    BASELINE=$(cat coverage-baseline.json | jq '.total.branches.pct')
    DIFF=$(echo "$CURRENT - $BASELINE" | bc)
    
    if (( $(echo "$DIFF < -2" | bc -l) )); then
      echo "❌ Coverage dropped by ${DIFF}%. Justify in PR description."
      exit 1
    fi
```

**Justification examples (acceptable):**
- "Removed dead code path (feature flag removed)"
- "Refactored to use library function (coverage moves to library)"

#### Uncovered Critical Paths

**Policy:** L1 Ledger and L4 Router must have **>95% branch coverage** (safety-critical).

**Audit:** Quarterly review of uncovered branches in L1/L4. For each:
1. Is branch reachable in production? (If no → delete dead code)
2. Is branch a failure mode? (If yes → add failure-mode test)
3. Is branch deferred functionality? (If yes → add `// TODO: test when feature ships` comment)

### 10.3 Coverage Tooling

#### Tool: `c8` (Coverage Instrumentation)

**Installation:**

```bash
npm install --save-dev c8
```

**Configuration:**

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "coverage": "c8 --reporter=text --reporter=html npm test",
    "coverage:json": "c8 --reporter=json npm test"
  },
  "c8": {
    "include": ["src/**/*.ts"],
    "exclude": [
      "src/**/*.test.ts",
      "src/__tests__/**",
      "src/**/__mocks__/**"
    ],
    "branches": 85,
    "lines": 80,
    "functions": 80,
    "statements": 80
  }
}
```

**Output:**

```
File                | Branch % | Stmt % | Funcs % | Lines %
--------------------|----------|--------|---------|--------
src/ledger/append.ts|    95.00 |  97.50 |  100.00 |   97.50
src/ledger/fork.ts  |    88.00 |  90.00 |   95.00 |   90.00
src/router/policy.ts|    92.00 |  94.00 |  100.00 |   94.00
--------------------|----------|--------|---------|--------
All files           |    91.67 |  93.83 |   98.33 |   93.83
```

#### Tool: `stryker-mutator` (Mutation Testing)

**Installation:**

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
```

**Configuration:**

```json
// stryker.conf.json
{
  "packageManager": "npm",
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/**/*.ts",
    "!src/**/*.test.ts"
  ],
  "thresholds": { "high": 80, "low": 70, "break": 60 }
}
```

**Run:**

```bash
npm run test:mutation  # Weekly CI job
```

**Output:**

```
Mutant survived: Changed === to !== in src/ledger/append.ts:42
  → No test failed. Add test for non-request primitive kinds.
  
Mutant killed: Removed error throw in src/router/policy.ts:17
  → Test "L4 Router throws on unknown source" failed. ✓
```

### 10.4 Coverage Anti-Patterns (What NOT to Do)

#### Anti-Pattern 1: Writing Tests to Hit Coverage Targets

**Symptom:** Test calls function but makes no assertions.

```typescript
// BAD: Coverage without assertions
it('calls evaluatePolicy', () => {
  evaluatePolicy('external'); // Increases coverage, but useless test
});
```

**Fix:** Every test must have ≥1 meaningful assertion.

```typescript
// GOOD: Coverage + assertion
it('evaluatePolicy vetoes external sources', () => {
  const verdict = evaluatePolicy('external');
  expect(verdict).toBe('VETO');
});
```

#### Anti-Pattern 2: Ignoring Mutation Survivors

**Symptom:** Mutation testing shows mutants survived, but team ignores report.

**Impact:** Tests have high coverage but low assertion quality (mutations not detected).

**Fix:** Treat mutation survivors as **test debt**. Quarterly sprint to harden tests (kill ≥80% of survivors).

#### Anti-Pattern 3: Excluding Production Code from Coverage

**Symptom:** `c8` exclude list contains production files (not just tests/mocks).

**Impact:** Coverage metrics are artificially inflated.

**Fix:** Only exclude `**/*.test.ts`, `**/__tests__/**`, `**/__mocks__/**`. All production code must be measured.

### 10.5 Coverage Dashboard (CI Integration)

**Tool:** Codecov or Coveralls (coverage tracking over time)

**Setup:**

```yaml
# .github/workflows/coverage.yml

- name: Run coverage
  run: npm run coverage:json
  
- name: Upload to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
    flags: unittests
    name: codecov-umbrella
```

**Dashboard Features:**
- **Trend line:** Coverage over last 30 PRs (detect long-term drift)
- **PR diff:** Shows which lines in PR are uncovered (review feedback)
- **Sunburst chart:** Visualizes coverage per module (identifies weak spots)

**Review Policy:** Before releasing, check dashboard:
- L1 Ledger coverage ≥95%? ✓
- L4 Router coverage ≥95%? ✓
- No uncovered critical paths? ✓

**Failure mode:** If coverage < threshold, delay release. Schedule **test hardening sprint** (2-3 days to close gaps).

---

## 11. Open Questions

**Status:** ALL 8 QUESTIONS RESOLVED — 2026-05-27

All ambiguities from the initial draft have been locked via Decision-Point gate with Aaron Kubly. Resolutions integrated throughout this document. See `.squad/decisions/inbox/coordinator-crucible-tdd-q-resolutions.md` for full resolution rationale.

**Resolved decisions summary:**

| Q | Topic | Resolution |
|---|---|---|
| Q1 | Observation capture & primitive scale | **Refined Option E:** Decision commits Merkle hash over causal-context window (all prior ledger rows, any type). Observation = first-class primitive. Primitive scale = per-tool-call-boundary. M3: side-effect-only tool calls emit Artifact with synthetic output. Bootstrap-Capture-Completeness invariant added. |
| Q2 | Eureka prescriber integration in v1 tests | **Option C + generic L3 adapter suite:** Defer Eureka adapter to v1.5. ADD generic L3 Generator adapter conformance suite in v1 (applies to Forge today, Eureka v1.5+, marketplace plugins). |
| Q3 | Structural proposal approval UX | **Option B:** Aperture async notification + queue, default-not-applied until acked. |
| Q4 | Plugin pinning scope at fork | **Option B:** Transitive dependency graph pinned at fork (not just direct deps). |
| Q5 | Bisect test command execution | **Option D (coordinator refinement):** Env snapshot at bisect start + shell out with fixed env per iteration. Internally consistent, not externally hermetic. |
| Q6 | Timestamp normalization in conformance suite | **Option A + monotonicity invariant:** Exclude timestamps from byte-equality check. ADD separate property test: Monotonic-Timestamps-Within-Session. |
| Q7 | Mock-drift detection threshold | **Option A (zero-tolerance):** Single contract test failure blocks PRs. Agentic cost functions invert vs human teams (drift cost compounds; fix cost near-zero). |
| Q8 | Pareto fitness with non-overlapping axes | **Option A:** Incomparable prescriptions (non-overlapping axes) both remain in non-dominated set. No zero-fill, no partial dominance for v1. |

**New ambiguities discovered during resolution integration:** None. All 8 questions cleanly resolved with no cascading dependencies requiring further locks.

**Strategy doc sections revised to reflect resolutions:**
- §1: Added agentic-development test discipline distinctions (structural commitment, zero-tolerance gate)
- §2: A2 (hermetic replay) simplified per Q1; A4 (causal slice) enriched per Q1; A6 (plugin pinning) per Q4
- §3: Renamed `ObservationCaptureStore` → `LedgerWindowReader` per Q1; added `GenericL3AdapterContract` per Q2; refined `BisectOrchestrator` per Q5
- §4: Walkthrough A updated with transitive-dep-graph pinning (Q4)
- §5: Added generic L3 adapter conformance tier (Q2); updated contract-test policy to zero-tolerance (Q7)
- §6: Added Bootstrap-Capture-Completeness (Q1); added Monotonic-Timestamps (Q6); revised Hash-Chain Integrity for context-window commitment (Q1)
- §7: Replaced ≥3-failure policy with zero-tolerance + agentic-cost framing (Q7)
- §8: No change
- §9: Added `LedgerPrefixBuilder` (Q1), `EnvSnapshotBuilder` (Q5), `TransitiveDepGraphBuilder` (Q4)
- §10: No change
- §12: No change

## 12. Anti-Goals

Explicit **non-goals** for this test strategy. These are testing practices that London-school TDD explicitly **rejects** for Crucible.

### AG1: No "Test Everything" Mandate

**Anti-pattern:** Mandate 100% code coverage (statement, branch, function).

**Why rejected:** Coverage is a trailing indicator. Test-first discipline produces high coverage naturally. Chasing 100% leads to **coverage theater** (tests that execute code but make no assertions). Better: 85% branch coverage + 70% mutation score (§10).

**Acceptable gap:** Defensive error handling in leaf functions (e.g., `throw new Error('Unreachable')` in exhaustive switch) may remain untested. Mark with `// @coverage-ignore` comment.

---

### AG2: No Mocking Private Methods

**Anti-pattern:** Expose private methods for testing (`exportForTesting` hacks, `@VisibleForTesting` annotations).

**Why rejected:** Private methods are implementation details. Tests should exercise **public interfaces** only. If a private method is complex enough to need isolated testing, it should be **extracted as a separate module** with its own public interface.

**Example (BAD):**

```typescript
class SessionManager {
  private validateForkOffset(parentSize: number, forkOffset: number): void {
    if (forkOffset > parentSize) throw new Error('Invalid offset');
  }
  
  // Exposed for testing
  public __testonly_validateForkOffset = this.validateForkOffset;
}
```

**Example (GOOD):**

```typescript
// Extracted as module
export function validateForkOffset(parentSize: number, forkOffset: number): void {
  if (forkOffset > parentSize) throw new Error('Invalid offset');
}

// Tested directly
describe('validateForkOffset', () => {
  it('throws when offset > parent size', () => {
    expect(() => validateForkOffset(47, 50)).toThrow('Invalid offset');
  });
});
```

---

### AG3: No Integration Tests as Substitute for Unit Tests

**Anti-pattern:** Skip unit/component tests, rely solely on integration/acceptance tests ("tests are slow but comprehensive").

**Why rejected:** Integration tests are **slow** and provide **vague failure signals**. When integration test fails, root cause could be in any of 5 layers. Unit/component tests isolate failures to specific modules (fast debugging).

**Cost comparison:**
- Unit test failure → fix in <1 hour (clear failure signal)
- Integration test failure → 2-4 hours debugging (bisect across layers to find root cause)

**Policy:** Every integration test must have **corresponding unit tests** for each layer it exercises. Integration test validates **wiring**; unit tests validate **logic**.

---

### AG4: No Shared Mutable State in Tests

**Anti-pattern:** Tests share global fixtures, modify them, and rely on execution order.

**Example (BAD):**

```typescript
let sharedLedger: Ledger;

beforeAll(async () => {
  sharedLedger = await createLedger();
});

it('appends observation', async () => {
  await sharedLedger.append({ primitiveKind: 'observation', /* ... */ });
});

it('queries events', async () => {
  const events = await sharedLedger.queryAll();
  expect(events).toHaveLength(1); // FRAGILE: depends on previous test
});
```

**Why rejected:** Test order dependency is **non-deterministic** (Vitest parallelizes tests). Shared mutable state causes **flaky tests** (pass in isolation, fail in suite).

**Fix:** Each test creates its own fixtures (`beforeEach` or inline). Tests must be **independent** and **parallelizable**.

---

### AG5: No "Integration Test in Disguise" Component Tests

**Anti-pattern:** Component test reaches across 3 layers, touches real database, makes HTTP calls.

**Example (BAD):**

```typescript
// Labeled "component test" but actually integration test
describe('PrescriberOrchestrator (component)', () => {
  it('runs Forge prescribers', async () => {
    const realDB = await createRealDatabase(); // ❌ Real DB in component test
    const realLedger = new Ledger(realDB);
    const realOrchestrator = new PrescriberOrchestrator(realLedger);
    
    await realOrchestrator.run('skill-x'); // ❌ Real orchestration (slow)
    
    const hints = await realDB.query('SELECT * FROM optimization_hints');
    expect(hints).toHaveLength(5);
  });
});
```

**Why rejected:** Test is **slow** (real DB, real orchestration) and belongs in **integration tier** (§5), not component tier. Mislabeling hides slow tests in fast suite.

**Fix:** Mock collaborators (DB, Ledger) or move to integration test suite.

---

### AG6: No Flaky Tests Tolerated

**Anti-pattern:** Tests occasionally fail due to timing, randomness, or external dependencies. Team re-runs CI until it passes.

**Why rejected:** Flaky tests **erode trust**. Developers learn to ignore test failures ("probably just flaky"). Real regressions slip through.

**Policy:**
- **First flake:** Investigate immediately. Add `// FLAKY: <reason>` comment if root cause unclear.
- **Second flake (same test):** Quarantine test (skip in CI with `test.skip`), file issue.
- **Third flake:** Delete test (not providing value).

**Common flake sources:**
- **Timing:** Replace `setTimeout` with deterministic clock mocks
- **Randomness:** Seed random generators (`Math.random = () => 0.5` in test setup)
- **External dependencies:** Mock HTTP calls, filesystem, time

---

### AG7: No "Test Later" Mindset

**Anti-pattern:** Write production code first, write tests later ("I'll add tests before merging").

**Why rejected:** "Later" often means "never." Tests written after implementation are **documentation tests** (describe current behavior, not desired behavior). They miss edge cases and rarely fail.

**Enforcement:**
- Pre-commit hook checks for new production files without corresponding test files (§8.1)
- PR template checklist: "✓ Tests written before implementation"
- Code review: Reviewers verify red-green-refactor commit history

---

### AG8: No Manual Testing as Primary Validation

**Anti-pattern:** Developer manually runs CLI commands to verify feature ("works on my machine").

**Why rejected:** Manual testing is **non-repeatable** and **not scalable**. Regressions slip through when manual test steps are forgotten.

**Policy:** Every user-observable behavior must have an **acceptance test** (§2). Manual testing is **supplementary** (dogfooding, UX validation), not primary validation.

**Exception:** UX polish (e.g., CLI color scheme, badge icon choice) may rely on manual review. But **functional behavior** (does fork create child session?) requires automated test.

---

### AG9: No "Happy Path Only" Tests

**Anti-pattern:** Tests only validate success cases. Failure modes untested.

**Example:**

```typescript
// Only tests success
it('appends primitive', async () => {
  const offset = await ledger.append({ primitiveKind: 'observation', /* ... */ });
  expect(offset).toBe(0);
});

// Missing: What if primitiveKind is invalid? What if DB is read-only? What if hook vetoes?
```

**Why rejected:** Failure modes are where **bugs live**. Untested error paths are production incidents waiting to happen.

**Policy:** For every happy-path test, write ≥1 failure-mode test. Common failure modes:
- Invalid input (null, negative numbers, wrong type)
- Collaborator failures (DB error, network timeout, hook veto)
- Edge cases (empty arrays, boundary values, overflow)

---

### AG10: No Test Suites Without Ownership

**Anti-pattern:** Test file has no clear owner. When test fails, team asks "whose test is this?"

**Why rejected:** Unowned tests rot. When test fails, no one investigates ("not my code").

**Policy:**
- **File-level ownership:** `CODEOWNERS` maps test files to teams (e.g., `src/__tests__/unit/ledger/*.test.ts @crucible-team/ledger-owners`)
- **Test-level metadata:** Complex tests include `@owner` tag in docstring

**Example:**

```typescript
/**
 * @owner @crucible-team/ledger-owners
 * @testType integration
 * @description Validates multi-generation fork lineage transitivity
 */
describe('Fork Lineage Transitivity', () => {
  // ...
});
```

**Benefit:** When test fails, CI output shows owner. Slack notification auto-tags responsible team.

---

**End of Anti-Goals Section**

---

**Document Status:** FINAL — 8 Open Questions Resolved 2026-05-27

**Change Log:**
- **2026-05-27 (Initial Draft):** 12 sections, 8 open questions (Q1-Q8) requiring resolution
- **2026-05-27 (Final):** All 8 questions resolved via Aaron Decision-Point gate. Integrated throughout:
  - Q1: Context-window commitment model (§1, §2, §3, §6, §9)
  - Q2: Generic L3 adapter conformance suite (§3, §5)
  - Q3: Aperture async structural proposal queue (no doc change needed—§2 A10 already specified)
  - Q4: Transitive-dep-graph pinning (§2 A6, §4, §9)
  - Q5: Bisect env snapshot at start (§3, §9)
  - Q6: Timestamp normalization + monotonicity invariant (§5, §6)
  - Q7: Zero-tolerance mock-drift gate (§1, §5, §7)
  - Q8: Pareto incomparable → both non-dominated (§5)

**Next Steps:**
1. ~~Laura presents strategy to Aaron for review~~ ✓ COMPLETE (8 questions resolved via Decision-Point gate)
2. ~~Aaron provides feedback on Open Questions (§11)~~ ✓ COMPLETE (all 8 locked)
3. ~~Laura updates strategy based on feedback~~ ✓ COMPLETE (this revision)
4. Append learnings to `.squad/agents/laura/history.md`
5. Create decision record: `.squad/decisions/inbox/laura-crucible-tdd-strategy-revision.md`
6. Begin Sprint 0 (types lock, test infrastructure setup, first red/green/refactor cycle)
