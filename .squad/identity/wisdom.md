---
last_updated: 2026-04-09T00:00:00Z
session: copilot-sdk-spike + brainstorm
---

# Team Wisdom

Reusable patterns and heuristics learned through work. NOT transcripts — each entry is a distilled, actionable insight.

---

## 1. The Manifesto

> **Forge is a deterministic frame around a stochastic core, and Cairn is the nervous system that makes it learn.**

The full framing, as articulated across the brainstorm and spike sessions:

- **Source code** = human intent expressed as workflow definitions, decision rules, and constraints.
- **Compiler** = Forge + Cairn working together. Forge executes (the runtime), Cairn observes, analyzes, and prescribes (the instrumentation + feedback loop).
- **Object code** = portable artifacts — certified SKILL.md files with DBOM (Decision Bill of Materials) provenance metadata.
- **Target** = vanilla Copilot, everywhere. Corp environments, EMU tenants, other engineers' machines. The artifacts are portable. The development process that produced them is not.

**The positioning:** "Forge isn't 'a better way to run Copilot.' It's 'a way to develop certified workflow artifacts that make Copilot better everywhere.' Anyone can write a SKILL.md. Only Forge + Cairn can compile one through iterative validation with a provenance trail. The artifact is portable. The development process that produced it is not."

---

## 2. LX Design Principles — Language Model Experience

Valanice's key insight: the parallel between UX and LX is **structural, not metaphorical**. Context window IS working memory (Miller's Law). Attention score decay IS recency bias. Tool selection ambiguity IS decision fatigue (Hick's Law). This enables us to port proven UX heuristics directly.

### 10 LX Heuristics (Parallel to Nielsen's 10)

| # | Heuristic | LX Meaning |
|---|-----------|------------|
| LX-1 | System Status Visibility | Agent always knows where it is in the workflow |
| LX-2 | Match Between System and Agent's World | Tool names read as natural intent (verb_noun) |
| LX-3 | Freedom and Undo | Idempotent safety — safe to retry without side effects |
| LX-4 | Consistency and Standards | Vocabulary contracts: get/list/search/run/check have fixed semantics |
| LX-5 | Error Prevention | Upstream prevention beats downstream policing |
| LX-6 | Recognition Rather Than Recall | Progressive disclosure — lightweight refs, not full context dumps |
| LX-7 | Flexibility and Efficiency | **Composite tools reduce round-trips** — batch operations over chatty APIs |
| LX-8 | Aesthetic and Minimalist Design | **Minimize verbose output** — signal density per token |
| LX-9 | Help Users Recognize and Recover | **Error responses include suggestions** — not just "failed" but "try X" |
| LX-10 | Help and Documentation | Tool descriptions are the docs — make them LLM-readable |
| LX-11 | Ceremony Efficiency | **New heuristic** — measure: challenge rate, amendment rate, escalation rate, token cost per decision |

### New LX Vocabulary

- **Context Budget** — the LX analog of attention span. Every token consumed is budget spent. Finite, non-renewable within a session.
- **Signal Density** — information value per token in tool output. Cairn's `confidenceToWords()` is a good example of high signal density.
- **Stochastic Drift** — the tendency of LLMs to deviate from intended behavior across many turns. Forge's deterministic frame constrains this.
- **Decision Surface** — the space of choices available at a decision point. Reducing surface area reduces error probability.
- **Tool Affordance** — how obviously a tool's purpose is from its name and description. verb_noun naming maximizes affordance.
- **Decision Altitude** — 4-tier consequence taxonomy: ambient (0) → logged (1) → flagged (2) → gated (3). Higher altitude = more ceremony.

---

## 3. Shiproom Ceremony

Valanice's design for decision defense as agentic QA. **Evaluates reasoning, not artifacts.** Unlike code review (which evaluates what was built), Shiproom evaluates the decisions that produced what was built.

### Core Design

- **Decision Records** — captured at decision time. Schema: question, chosen option, alternatives (min 1, **mandatory**), evidence, confidence, altitude, parent linkage. Content-addressable IDs make the chain tamper-evident.
- **No post-hoc confabulation** — agents can only cite evidence already in the decision record. No "I chose X because..." reasoning after the fact.
- **Facilitator:** Graham (Lead). Has cross-cutting domain knowledge. Role rotates when Graham's own decisions are under review.
- **Challengers:** Domain-routed by decision tags, plus the Curator with pattern data. Curator is unique — it doesn't have opinions, it has data. "The last three times a decision like this was made, the pattern recurred within 5 sessions."
- **One probing question per challenger.** Attention rationing — the ceremony equivalent of "max 1 proactive per session."
- **Decision Altitude filters entry:** Altitude 0–1: never individually examined. Altitude 2+: examined, 3: human notified.
- **Human sees summary + escalations only** (default). Full ceremony is opt-in pull interface.

### The Flywheel

Shiproom → structured signal about decision quality → Curator detects patterns in overturned/amended decisions → Prescriber suggests improvements → future decisions improve → fewer Shiproom amendments → lower ceremony cost → more time building.

---

## 4. Slop = Upstream LX Failure

**Don't police slop downstream. Diagnose which LX principle was violated that CAUSED it. Fix the input, fix the output.**

Slop is a symptom, not a root cause. Every instance of AI slop can be traced back to a violated LX principle:

- Verbose output → LX-8 (minimize output) violation in tool design
- Wrong tool selection → LX-2 / LX-4 (naming/consistency) violation
- Repeated mistakes → LX-5 (error prevention) — no upstream constraint
- Meandering reasoning → LX-7 (efficiency) — too many round-trips without convergence signal

The correct response is not a slop detector. It's an LX audit of the tools and constraints that allowed the slop to emerge.

---

## 5. OOP Patterns Already Emergent

Rosella identified that Cairn already contains recognizable OOP patterns. The architecture needs them **named and formalized**, not invented:

| OOP Concept | Cairn Implementation |
|-------------|---------------------|
| Interface | SKILL.md format — declares capabilities without implementation |
| Factory | Prescriber — produces prescription instances from patterns |
| State Machine | Prescription lifecycle (generated → accepted → applied / rejected / deferred / expired / suppressed / failed) |
| Observer | Hooks — preToolUse, postToolUse observe without owning execution |
| Visitor | Linter — traverses SKILL.md AST, applies rules per node type |
| Linker | Resolution rules — first_found, additive, last_wins resolve artifact conflicts |

### Four Families of Agentic Primitives

1. **Knowledge** — skills, instructions, agents (interface, type, class)
2. **Actor** — agents, prescriber, curator (class, factory, profiler)
3. **Bridge** — tools, hooks, MCP servers (method, observer, adapter)
4. **Signal** — events, prescriptions, decisions (command, state, record)

### Compiler Metaphor Mapped

- Skills = types
- Resolution rules = linker
- Marketplace = package manager
- Event log = debug symbols
- Validator = type checker
- Prescriber = factory

---

## 6. Reference Projects — What They Validate and What They Lack

Two open-source projects were evaluated during the brainstorm:

### nanoboss
- **What it is:** Procedure-oriented runtime, ACP multi-agent, TypeScript.
- **What it validates:** Procedure-as-code execution model, multi-agent coordination via ACP.
- **What it lacks:** No learning, no convergence, no feedback loop. Procedures are static — they don't improve from outcomes. No license (cannot use directly).

### no-mistakes
- **What it is:** Git-level gate model, fixed pipeline, MIT license.
- **What it validates:** Git integration for quality gates, deterministic pipeline stages.
- **What it lacks:** Fixed pipeline can't adapt. No nervous system. No decision recording. No provenance.

### Key Takeaway
Both validate pieces of our vision but **lack the nervous system** — no learning, no convergence. Forge + Cairn's differentiator is the feedback loop: outcomes feed back into patterns, patterns feed into prescriptions, prescriptions feed into better decisions. The loop is the product.

---

## 7. ACP vs SDK — Depth Over Breadth

The team evaluated ACP (Agent Client Protocol) vs the Copilot SDK and chose **depth over breadth**:

- **SDK** gives 86 typed events, bidirectional hooks, session management, tool interception, decision gates, token cost tracking. It's the deep integration path.
- **ACP** is the future horizon adapter for multi-agent transport. It enables Forge to consume/expose agents across runtimes.
- **Multi-agent is additive, not a rewrite.** The event bridge abstraction (Cairn consumes `CairnEvent`, not SDK-specific types) means ACP is an additional adapter, not a replacement for the SDK integration.
- **Build order:** SDK first (core loop), ACP later (multi-agent transport).

---

## 8. Workflow Definition Gap

We need something that tells Forge **what to do**, not just constraints on decisions. Neither existing approach is our answer:

- **Procedures-as-TypeScript (nanoboss):** Too rigid. Procedures are static code, not adaptive.
- **Fixed pipeline (no-mistakes):** Too inflexible. Pipeline stages can't evolve.

**Our answer should emerge from the decision chain and Cairn's feedback loop.** Workflows are discovered, not prescribed. The Decision Chain captures what actually happened; the Prescriber detects which decisions consistently lead to good outcomes; the Export Pipeline crystallizes successful patterns into portable artifacts. The workflow definition is an emergent property of observed success patterns.

---

## 9. Portability / Export Pipeline

The export pipeline is how Forge artifacts reach the world:

- **Forge exports certified artifacts:** SKILL.md files with DBOM (Decision Bill of Materials) provenance metadata in YAML frontmatter.
- **DBOM** = content-addressable decision chain + provenance tiers + actor attribution + alternatives considered. The full audit trail of how and why an artifact was built.
- **Provenance Tiers:** Internal (debugging), Certification (DBOM), Deployment (PGO). Events are tagged at creation; DBOM filters to certification tier only.
- **The Prescriber is the prototype** for the export compiler — same observe → pattern → artifact pipeline, different output target.
- **Target environments:** Corp tenants, EMU environments, other engineers' machines. Anywhere vanilla Copilot runs.

---

## 10. PGO Telemetry — Profile-Guided Optimization

Deployed artifacts emit telemetry → Application Insights → feeds back to Cairn → continuous profile-guided optimization:

- **The loop:** Deploy → observe production behavior → ingest signals → Cairn detects production patterns → Prescriber suggests improvements → next compilation cycle improves the artifact.
- **Implementation:** Cairn needs a pluggable `TelemetrySink` interface + input adapter. SDK's built-in OpenTelemetry support (`telemetry: { otlpEndpoint }`) provides the export path.
- **Trust boundary:** Same as existing APM — aggregate signals, no PII. Production telemetry is statistical, not diagnostic.
- **Provenance tier:** `"deployment"` tier defined in the type system but not yet populated. This is the hook point for PGO data.

---

## 11. The Positioning (Elevator Pitch)

> "Forge isn't 'a better way to run Copilot.' It's 'a way to develop certified workflow artifacts that make Copilot better everywhere.'"

- **Anyone** can write a SKILL.md.
- **Only Forge + Cairn** can compile one through iterative validation with a provenance trail.
- **The artifact is portable.** The development process that produced it is not.
- The value proposition is the **certified development process**, not the runtime. The runtime is vanilla Copilot.

---

## Patterns

<!-- Legacy pattern entries below -->

