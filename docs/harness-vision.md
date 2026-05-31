# Skillsmith Harness — Project Vision

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-23  
**Status:** Draft — Awaiting Aaron's review  

---

## 1. The One-Liner

A CLI shell for software engineers that learns from every session, prescribes improvements to prompts and agents, and builds trust by demonstrating awareness of its deficiencies and the ability to self-correct.

---

## 2. Why This, Why Now

Software engineers today face a trust gap with AI coding assistants. Claude Code and GitHub Copilot CLI offer powerful capabilities but operate as black boxes: they don't remember what worked, don't learn from mistakes, and can't explain why they're suggesting what they're suggesting. When a session goes wrong, the user has no audit trail. When the same failure pattern repeats across sessions, the tool has no mechanism to notice or correct.

**The gap Aaron is naming:** Existing tools treat every session as a fresh start. There's no memory, no learning loop, no systematic improvement, and—critically—no visibility into *why* a recommendation is being made or *what the system learned from past sessions*. This lack of transparency and self-awareness is the barrier to trust.

**What changes when the harness exists:** Engineers gain a partner that remembers context across sessions, proposes testable improvements to their workflows, and surfaces its reasoning. The harness doesn't just execute—it reflects, learns, and communicates its growth. Trust shifts from "I hope this works" to "I can see why the system believes this will work, based on evidence from the last 47 sessions." The harness becomes a co-pilot that earns credibility through demonstrated learning, not just raw capability.

---

## 3. North Star

At maturity (12-18 months), the Skillsmith Harness is a **self-improving CLI runtime that earns trust through observable learning**. A software engineer launches the harness, exchanges messages with their chosen model, and works normally—but behind the scenes, the harness is recording primitives (requests, artifacts, decisions, observations, questions), measuring what works, prescribing optimizations, and autonomously improving the prompts, skills, and agents the engineer relies on.

**What success looks like:**

- **Auditable decision ledger:** Every decision—human or agentic—is recorded with hash-linked provenance. Engineers can replay any session, trace how a decision was reached, and verify that the system's recommendations are grounded in real evidence.
- **Transparent learning loop:** The harness tells the engineer *what it learned* after each session. "I noticed token usage spiked when you invoke skill X with long context—I'm testing a context-pruning variant." The system doesn't just optimize silently; it narrates its hypotheses.
- **Genetic engineering of workflows:** Skills and agents aren't static. The harness measures performance (token spend, drift, convergence), generates variants (mutations), runs selection loops, and proposes upgrades. Engineers approve or reject changes—but the system does the exploration work.
- **Self-awareness of deficiencies:** The harness knows when it's guessing, when evidence is thin, and when a recommendation is based on incomplete data. It surfaces confidence scores, flags low-certainty suggestions, and admits gaps. "This optimization has only been tested on 3 sessions; I recommend more data before auto-applying."
- **Trust through reflection:** The Narrator chamber surfaces a digest at session end: what worked, what didn't, what the system is testing next, and where it's uncertain. Engineers see the harness improving in real time—not because it claims to be better, but because it *shows its work*.
- **Boring reliability:** The harness becomes the boring, predictable foundation engineers rely on daily. It doesn't chase novelty—it measures, learns, and compounds small improvements session after session. Engineers prefer it to alternatives not because it's flashy, but because it's dependable and honest about what it knows.

---

## 4. The Six Chambers

The harness is composed of six chambers—specialized subsystems that compose into a self-improving machine. Each chamber has a bounded responsibility; together they form the learning loop.

### 4.1 Harness (New)
The CLI shell itself. Presents a text input, routes messages to the selected model, executes slash commands, and orchestrates chamber interactions. Responsible for the session message loop, primitive recording (requests, artifacts, decisions, observations, questions), and model selection. The user-facing surface. **Status:** New (Wave A design).

### 4.2 Cairn (Exists, needs refactor)
The typed primitive ledger and event store. Persists all primitives as an append-only log with hash-linked provenance. Provides queryable surfaces for change vectors, execution profiles, feedback signals, and decision history. Today Cairn stores telemetry and change vectors; refactor needed to support the full primitive taxonomy (artifacts, observations, decisions as first-class types). See `packages/cairn/src/db/schema.ts` for current data model. **Status:** Exists; refactor for primitive ledger.

### 4.3 Forge (Exists)
Observes execution profiles and prescribes optimization hints. Ingests telemetry (drift, token usage, convergence), change vectors (historical impact), and execution profiles (per-skill or global performance snapshots). Outputs `OptimizationHint` records with category, confidence, impact score, and recommendation. Currently focused on prompt/token optimization; genetic loop integration is Phase 5 expansion. See `packages/forge/src/prescribers/` for hint generation logic. **Status:** Exists; Wave 3 complete.

### 4.4 Geneticist (Phase 5)
Runs selection and mutation loops over change vectors to generate skill/agent/prompt variants. Takes a population of variants (skills with different parameters, agents with different system messages), measures fitness (convergence, token cost, drift), applies selection pressure, introduces mutations, and proposes the next generation for testing. Uses change vectors from Cairn as the fitness function input. Pure genetic algorithm executor—doesn't decide policy, just executes the loop. **Status:** Roadmap (Phase 5).

### 4.5 Curator (Exists, narrow today)
Autonomous trigger layer. Today Curator runs at session start, sweeps change vectors, and triggers Forge prescribers when new vectors are computed (see `packages/cairn/src/hooks/sessionStart.ts` and `docs/forge-phase4.6-wave3-scope.md`). In the harness vision, Curator expands to trigger Geneticist runs when fitness thresholds are met, recommend new skills when usage patterns suggest gaps, and surface staleness warnings when profiles are outdated. Autonomous but policy-driven—never overrides humans, only proposes. **Status:** Exists (Wave 3 wiring complete); expansion scope TBD.

### 4.6 Narrator (Doesn't exist)
Trust-building communication layer. After each session, Narrator compiles a digest: what the harness learned, which hypotheses are being tested, where confidence is low, what's improving, and what failed. Surfaces deficiency awareness: "I recommended prompt variant X but it increased drift—reverting and logging as a failed hypothesis." Narrator isn't an agent—it's a pure presenter that reads the ledger and formats insight for human consumption. The harness earns trust by *showing humility and growth*, not claiming perfection. **Status:** Doesn't exist; design needed.

---

## 5. Session Primitives

Aaron specified five typed primitives that form the ledger's vocabulary. Every session is a composition of these primitives. Two are top-level (requests, questions); three are reviewable artifacts (artifacts, observations, decisions).

### 5.1 Request
**Definition:** A message from the user to the model.  
**Who creates it:** Human user, via the Harness CLI input.  
**Who reviews it:** No formal review; logged for provenance and replay.  
**Why it matters:** Requests are the initiating action for every turn. Recording them enables session replay, audit trails, and pattern analysis (e.g., which request patterns correlate with high drift).

### 5.2 Artifact
**Definition:** A reviewable unit of content produced during a session—designs, code, documents, plans, commit messages, review comments.  
**Who creates it:** Model (assistant response), human (manual edits), or agents (autonomous output).  
**Who reviews it:** Humans review before approval; agents may generate review findings (observations).  
**Why it matters:** Artifacts are the work product. The ledger needs to know *what was produced* and *who approved it* to build trust and enable decision tracing. Observations and decisions are themselves artifacts (see below).

### 5.3 Observation
**Definition:** The *result* of reviewing an artifact—a finding, concern, suggestion, or approval signal. Observations are themselves reviewable artifacts.  
**Who creates it:** Agents (e.g., code-review agent, persona-review panel), humans (manual review comments), or automated quality gates.  
**Who reviews it:** Humans decide whether to accept or reject observations. Some observations trigger decisions (see below).  
**Why it matters:** Observations are the feedback loop input. The harness learns from which observations humans accept vs. reject. Over time, patterns emerge: "Observation type X from agent Y is accepted 90% of the time—high-confidence signal."

### 5.4 Decision
**Definition:** A recorded choice made by a human or agent. Decisions are also reviewable artifacts. Examples: "Approve PR," "Reject optimization hint," "Select model Sonnet 4.6," "Commit code changes."  
**Who creates it:** Humans (explicit approval/rejection actions) or agents (autonomous choices within delegated authority). Every decision records *who decided* (human vs. agent ID), *what was decided*, and *why* (rationale or evidence link).  
**Who reviews it:** The ledger itself (for auditability). Decisions aren't "reviewed" in the same sense as artifacts—they're recorded as immutable facts. However, decision outcomes are measured (did the decision improve the metric it targeted?), and that measurement feeds back into trust scoring.  
**Why it matters:** Decisions are the trust anchor. When the harness prescribes an optimization, the user can trace *why*—which past decisions led to the current recommendation, what evidence supports it, and what confidence level the system assigns. The decision ledger is the provenance chain.

### 5.5 Question
**Definition:** A question posed by the model to the user, requiring explicit human input to proceed.  
**Who creates it:** Model or agent (when uncertain or blocked).  
**Who reviews it:** Human user answers the question; answer is recorded as a new request or decision.  
**Why it matters:** Questions are decision points. Recording them enables the harness to learn *when to ask* vs. *when to infer*. If the same question repeats across sessions, the harness should detect the pattern and propose a policy or default. Questions are also trust signals—"I don't know, so I'm asking" is more credible than guessing silently.

### Parent/Child Relationships
- **Observations ARE artifacts** (child of the artifact they review).
- **Decisions ARE artifacts** (may be triggered by observations or standalone).
- **Requests and questions** are top-level (not artifacts themselves, but initiate artifact creation).

---

## 6. The Auditable Decision Ledger

Aaron's "block-chain of decisions" is the core trust primitive. Every decision—human or agentic—is recorded with hash-linked provenance, forming an append-only, tamper-evident chain.

**Concretely:**
- **Hash-linked:** Each decision block includes the hash of the prior decision, forming a Merkle-chain-like structure. Modifying any historical decision breaks the chain—tampering is detectable.
- **Append-only:** Decisions are never deleted or edited. Corrections are new decisions that reference the prior decision. Example: "Decision D1 approved optimization hint H1. Decision D2 reverted H1 after drift increase—referencing D1 as parent."
- **Replayable:** Given a decision hash, the harness can reconstruct the full provenance chain: which requests led to which artifacts, which observations triggered the decision, and what prior decisions influenced it. Engineers can audit *why* a recommendation was made by tracing backward through the chain.
- **Who can decide:** Both humans and agents. Humans have ultimate authority (can override any agent decision). Agents operate within delegated authority scopes (e.g., Curator can accept optimization hints below a confidence threshold; above that threshold, human approval required). Every decision records the decider's identity (human user ID or agent ID).
- **Why this matters for trust:** The ledger is the receipts. When the harness says "I recommend X based on evidence Y," the engineer can verify Y by inspecting the ledger. The system can't fabricate evidence or hide failed experiments—the chain is immutable. Trust is earned through transparency: the ledger shows both successes *and* failures, with full provenance.

**Implementation note:** The decision ledger lives in Cairn (already an event store with append-only semantics). Refactor needed to add hash-chain linking and first-class decision/artifact/observation types (today Cairn stores telemetry and change vectors; decision types are net-new). See `packages/cairn/src/db/schema.ts` for current schema—a future migration will introduce decision ledger tables.

---

## 7. Genetic Engineering of Prompts/Skills/Agents

"Genetic engineering" means the harness systematically generates, tests, and evolves variants of prompts, skills, and agents using a selection-and-mutation loop. This isn't manual tweaking—it's automated exploration guided by measured fitness.

**What the user gets:**
- **Variant generation:** The harness takes a baseline skill (e.g., "code-review" agent with specific system message) and generates mutations: shorter system message, different examples, alternative phrasing. Each variant is a new candidate.
- **Fitness measurement:** The harness runs each variant across a sample of sessions (or simulates using historical data) and measures fitness: token cost, drift score, convergence turns, user acceptance rate. Fitness is domain-specific—cheap + accurate is high-fitness for token optimization; low-drift + fast-convergence is high-fitness for workflow stability.
- **Selection pressure:** Variants with higher fitness are retained; low-fitness variants are discarded. The harness doesn't keep every mutation—it prunes the population to the top performers.
- **Mutation and crossover:** Selected variants are mutated (small random changes) or crossed over (combine traits from two high-fitness variants) to generate the next generation. The loop repeats.
- **Proposed upgrades:** After N generations, the harness surfaces the winning variant to the user: "I tested 47 variants of the code-review agent over 200 sessions. Variant #12 reduced token usage by 18% with no drift increase. Approve upgrade?" The user reviews the evidence (fitness metrics, sample sessions) and decides.

**Tie to existing change_vectors data:** Cairn already records change vectors (`packages/cairn/src/db/schema.ts`, migration 012) that track historical impact of skill changes. Each change vector is a `(skillId, source, category, meanNetImpact, vectorCount, attenuation)` tuple—essentially a fitness measurement. The Geneticist uses these vectors as the selection function: if a skill change produced positive `meanNetImpact` over many sessions (`vectorCount` high), that trait is selected for propagation. If negative, it's pruned.

**Selection function:** `fitness = meanNetImpact * confidence`, where `confidence = vectorCount / (vectorCount + k)` (k = minimum session count for maturity). High-impact changes with many sessions score high; low-sample or negative-impact changes score low.

**Mutation function:** Stochastic perturbations to skill parameters—system message edits (shorten/lengthen/rephrase), example substitutions, parameter tuning (temperature, max tokens). Mutations are small and reversible.

**Fitness function:** Multi-objective: minimize token cost, minimize drift, maximize convergence rate, maximize user acceptance. Weighted by user-defined priorities. Fitness is measured post-session via telemetry (already captured by Forge; see `packages/forge/src/telemetry/`).

**No implementation proposed here—this is capability framing.** The Geneticist chamber (Phase 5) will execute the loop. The vision is that the harness *does the exploration work* so engineers don't have to manually A/B test prompt variants—they approve or reject the system's proposals based on evidence.

---

## 8. The Self-Improving Loop

End-to-end narrative of how the chambers compose:

**User runs a session** → Harness records primitives (requests, artifacts, decisions) to Cairn's ledger. Session ends; telemetry (token usage, drift, convergence) written to Cairn.

**Cairn aggregates** → At next session start, Cairn computes change vectors (did recent skill changes improve or degrade performance?) and updates execution profiles (drift trends, token costs, success rates). See `packages/cairn/src/hooks/sessionStart.ts` for current aggregation hook.

**Forge prescribes** → Curator detects new change vectors and triggers Forge prescribers (Wave 3 capability, see `docs/forge-phase4.6-wave3-scope.md`). Forge reads execution profiles + change vectors, generates `OptimizationHint` records (category, confidence, impact, recommendation), and writes to Cairn. Hints are deduplicated; duplicates are skipped. See `packages/forge/src/prescribers/` for hint generation logic.

**Curator triggers re-runs** (future) → When hints accumulate or staleness thresholds are met, Curator autonomously triggers Geneticist (Phase 5). Geneticist generates skill variants, measures fitness using change vectors, and proposes upgrades.

**Geneticist mutates** (Phase 5, roadmap) → Geneticist applies selection pressure (prune low-fitness variants), introduces mutations (perturb parameters), runs fitness evaluation (simulate or measure on real sessions), and outputs winning variant.

**Narrator reports growth to user** (future) → At session end, Narrator compiles a digest: "This session: token usage -12% vs. baseline. Active experiments: testing 3 prompt variants for code-review skill. Last week: 5 hints accepted, 2 rejected, 1 under test. Confidence in auto-apply: 87% (based on 47 sessions)." User sees the system learning—not just executing.

**One paragraph summary:** Sessions generate telemetry → Cairn computes change vectors → Forge prescribes hints → Curator triggers optimization loops → Geneticist evolves variants → Narrator surfaces learning → User approves or rejects → Decisions recorded to ledger → Next session benefits from prior learning. The loop is continuous, observable, and grounded in evidence.

---

## 9. Trust Model

The harness earns trust by **demonstrating awareness of its deficiencies and showing the ability to reflect, self-correct, and grow**. Trust isn't claimed—it's built through transparency, humility, and evidence.

### 9.1 Confidence Scoring on Every Recommendation
Every optimization hint includes a confidence score (0–1) based on sample size (how many sessions support this recommendation?) and consistency (do all sessions agree, or is evidence mixed?). Low-confidence hints are flagged: "This recommendation is based on 3 sessions—insufficient data for auto-apply. Approve manually or wait for more evidence."

### 9.2 Surfacing Failed Experiments
When a recommended optimization increases drift or degrades performance, the harness logs it as a failed hypothesis and surfaces the failure to the user. "I recommended prompt variant X; drift increased 15%. Reverting to baseline and marking X as low-fitness." The system doesn't hide mistakes—it shows them and explains the correction.

### 9.3 Explaining Reasoning with Provenance Links
Every recommendation links to the evidence: "This hint is based on change vectors from sessions [S1, S2, S3], where meanNetImpact = +0.42 over 12 sessions. View session logs: [link]." Engineers can audit the claim by inspecting the decision ledger and verifying that the cited sessions actually support the recommendation.

### 9.4 Admitting Uncertainty
When evidence is thin or conflicting, the harness says so. "Token usage decreased in 2 sessions but increased in 1—unclear signal. Recommend more data before deciding." The system doesn't guess—it flags ambiguity and asks for human judgment.

### 9.5 Narrator Digests After Each Session
At session end, Narrator presents a short digest: what the harness learned, what it's uncertain about, what's being tested, and what failed. Example: "Session complete. Learned: skill X benefits from shorter context (3/3 sessions). Uncertain: model selection for code-review (mixed results). Testing: prompt variant Y (2 sessions so far). Failed: auto-apply hint Z increased drift—rejected." The digest is scannable (< 10 lines) and actionable.

### 9.6 Boring, Predictable Improvements
The harness doesn't chase novelty or claim breakthrough results. It measures small deltas (token cost -8%, convergence -1 turn), accumulates evidence over many sessions, and proposes incremental upgrades. Trust comes from reliability: the system does what it says, admits when it's wrong, and compounds small wins session after session.

---

## 10. Non-Goals (v1)

Scope discipline: what we are explicitly NOT building.

1. **Not a model gateway** — The harness orchestrates sessions and records primitives, but it doesn't host models or route requests to providers. Engineers bring their own API keys (OpenAI, Anthropic, etc.). The harness is model-agnostic.

2. **Not a cloud product** — The harness runs locally. Ledger storage is local SQLite (Cairn's current model; see `packages/cairn/src/db/schema.ts`). No cloud sync, no hosted service, no SaaS tier. Cloud PGO (Profile-Guided Optimization) is Phase 5 research—not v1 scope.

3. **Not a multi-tenant service** — Single-user, single-machine. The harness is a personal tool. Team collaboration (shared ledgers, multi-user decision approval) is out of scope.

4. **Not competing with Claude Code feature-for-feature** — The harness doesn't aim for parity with Claude Code's rich UI, inline editing, or context management. The harness is a CLI-first learning runtime. Engineers who want UI features use Claude Code; engineers who want auditable learning and self-improvement use the harness.

5. **Not a prompt library or marketplace** — The harness evolves *your* prompts, skills, and agents—not a public catalog. No sharing, no submission, no discovery layer. The genetic loop operates on your local workflows.

6. **Not a general-purpose agent framework** — The harness is specialized for software engineering workflows (code, docs, review, planning). It's not a platform for chatbots, customer service, or content generation.

7. **Not a model training platform** — The harness doesn't fine-tune or train models. It optimizes prompts, skills, and agent configurations—not model weights.

8. **Not a security/compliance audit tool** — The decision ledger provides provenance and replay, but it's not designed for SOC 2 compliance, access control, or enterprise audit trails. It's a learning tool, not a governance platform.

---

## 11. Phasing (Sketch Only)

High-level wave shape. Each wave is self-contained and testable; later waves build on earlier primitives.

**Wave A: Harness Skeleton**
- CLI shell with message loop (text input, model invocation, response rendering)
- Slash command parser (`/skill`, `/model`, `/help`)
- Agent selection (augment system message with agent definition)
- Primitive recording stub (write requests to Cairn ledger as `type: 'request'`)

**Wave B: Primitive Ledger**
- Refactor Cairn schema to support typed primitives (artifacts, observations, decisions, questions)
- Hash-linked decision chain (append-only, Merkle-style provenance)
- Replay capability (given decision hash, reconstruct provenance)

**Wave C: Artifact Review Integration**
- Artifact tagging (mark assistant output as artifact)
- Observation recording (agent review findings → ledger as `type: 'observation'`)
- Decision recording (human approval/rejection → ledger as `type: 'decision'`)

**Wave D: Narrator (Trust Layer)**
- Session digest generation (what learned, what uncertain, what failed)
- Confidence annotation on hints (sample size, consistency)
- Failed experiment surfacing (drift increase, token spike → narrative explanation)

**Wave E: Genetic Loop (Phase 5)**
- Variant generation (mutate skill parameters, system messages)
- Fitness measurement (use change vectors as selection function)
- Selection and crossover (retain high-fitness, prune low-fitness)

**Wave F: Autonomous Curator Expansion**
- Staleness detection (flag outdated profiles)
- Skill gap recommendations ("You invoke pattern X often—recommend new skill Y")
- Geneticist trigger (when fitness thresholds met)

---

## 12. Success Criteria

How do we know we're winning? Mix of quantitative (measurable) and qualitative (user-observed).

### Quantitative
1. **Decision replay fidelity: 100%** — Given any decision hash, the harness reconstructs full provenance chain with zero missing links. Tested on 1000+ decisions across 50+ sessions.
2. **Hint acceptance rate: >60%** — Users accept (apply or defer) more than 60% of optimization hints surfaced by Forge. Low acceptance rate signals poor prescriber quality.
3. **Confidence calibration: <10% error** — When the harness assigns 80% confidence to a hint, that hint succeeds (improves target metric) 70-90% of the time. Confidence scores are honest, not inflated.
4. **Token cost reduction: 15% within 30 sessions** — For users who enable auto-apply hints, median token cost per session decreases 15% within 30 sessions (baseline: first 10 sessions). Measures genetic loop effectiveness.

### Qualitative
5. **Aaron uses it daily and prefers it to Claude Code for audit-critical work** — Sessions where decision provenance matters (reviews, production changes, compliance-sensitive edits) default to the harness instead of Claude Code. Trust signal: Aaron chooses transparency over convenience.
6. **Narrator digests are read, not skipped** — User engagement metric: do users read session-end digests, or dismiss them immediately? Success = >80% of digests are read for >5 seconds (telemetry-measurable if we instrument engagement).
7. **Self-correction is observable within 10 sessions** — Users can point to at least one example within their first 10 harness sessions where the system detected a failed hypothesis, reverted a change, and communicated the correction. Trust is built when users *see* the system learning.

---

## 13. Open Questions

The hard unresolved questions the PRD will need to answer.

1. **How do we surface deficiency awareness without being annoying?** — Narrator digests must be informative, not nagging. What's the signal-to-noise threshold? How do we avoid alert fatigue?

2. **Do agents have voting rights on decisions, or only humans?** — Can an agent autonomously approve a decision (within delegated authority), or is every decision ultimately human-confirmed? What's the delegation model?

3. **Is the harness multi-user or single-user-only?** — V1 scoped as single-user, but future expansion? If multi-user, how do we handle conflicting decisions (User A approves hint, User B rejects)?

4. **What's the fitness function priority order for genetic loop?** — Token cost, drift, convergence, user acceptance—how do we weight these? User-configurable, or opinionated defaults?

5. **How do we prevent genetic loop from converging on local maxima?** — If selection pressure is too strong, the population loses diversity and gets stuck. What's the mutation rate? Do we inject random variants periodically?

6. **What's the UX for approving/rejecting hints in a CLI?** — Inline prompts? Separate review session? Slack/email notification? How do we avoid blocking the user's workflow?

7. **How do we handle version skew between ledger schema and harness code?** — If a user upgrades the harness, do we migrate the ledger? Backward-compat guarantee? Or fresh start each version?

8. **What's the privacy model for local ledger data?** — Ledger contains session history (potentially sensitive code, decisions, conversations). How do we communicate privacy guarantees? Encrypted at rest? Opt-in telemetry upload (for cloud PGO research)?

9. **How do we test genetic loop effectiveness without production users?** — Simulation using synthetic sessions? Replay historical Copilot CLI sessions? What's the validation dataset?

10. **What's the narrative voice for Narrator?** — Clinical/technical ("Drift increased 0.15 σ")? Conversational ("Things got a bit messy")? How do we match Aaron's communication style without sounding robotic?

---

## 14. Glossary

Brief term definitions for shared vocabulary.

**Harness** — The CLI shell that orchestrates sessions, records primitives, and coordinates chambers. User-facing surface.

**Chamber** — A specialized subsystem within the harness (Harness, Cairn, Forge, Geneticist, Curator, Narrator). Chambers compose to form the learning loop.

**Primitive** — Typed ledger entry: request, artifact, observation, decision, or question. Every session is a composition of primitives.

**Block** — A single hash-linked entry in the decision ledger. Each block contains a decision + hash of prior block (Merkle-chain-like structure).

**Ledger** — The append-only, hash-linked log of all primitives (decisions, artifacts, observations). Stored in Cairn. Immutable and replayable.

**Change Vector** — A summary of historical impact for a skill change: `(skillId, source, category, meanNetImpact, vectorCount, attenuation)`. Used as fitness signal in genetic loop. See `packages/cairn/src/db/schema.ts`, migration 012.

**Profile** — An execution profile: aggregated telemetry for a skill (drift, token usage, convergence, success rate). Granularity: per-skill or global. See `packages/forge/src/telemetry/` for profile computation.

**Hint** — An `OptimizationHint` generated by Forge prescribers: recommendation + category + confidence + impact score + evidence. See `packages/forge/src/prescribers/` for hint structure.

**Genetic Loop** — Selection-and-mutation cycle for evolving skill/agent/prompt variants. Measures fitness, prunes low-performers, mutates high-performers, repeats. Geneticist chamber (Phase 5).

**Curator** — Autonomous trigger layer. Detects conditions (new change vectors, staleness, fitness thresholds) and triggers optimization loops (prescribers, Geneticist). Never overrides humans—only proposes.

**Narrator** — Trust-building communication layer. Compiles session digests: what learned, what uncertain, what failed. Surfaces deficiency awareness and growth.

---

**END OF VISION DOC**

