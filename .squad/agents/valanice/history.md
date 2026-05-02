# Valanice — History

## Project Context
- **Project:** stunning-adventure — Industrial-grade agentic software engineering platform
- **User:** Aaron
- **Joined:** 2026-03-28 (Round 3 of brainstorm)
- **Universe:** Sierra On-Line Adventure Games

## Context from Brainstorm Rounds 1-2
- Platform has 8 subsystems across 3 tiers (Kernel, Core, Extension)
- Human-centric design is a core requirement — designing to get the BEST out of humans
- Key human challenges: short attention span, mental fatigue, impatience, laziness, corner-cutting, rubber-stamping
- Patterns proposed: attention budgets, adaptive review intensity, teach-back, canary questions (opt-in), engagement tracking
- First principle: agents are individuals, treated as human despite being tools
- Personalization is first-class: BYO plugins, interop with other systems
- Aaron's directive: "create the best output" as first principle, don't arbitrarily cap features

## Learnings

### 2026-04-02: Phase 5 Decision — MCP Tool Naming and Vocabulary Contracts

- **Phase 5 finalizes as MCP Server, not CLI.** Graham and Roger converged on MCP as the right shell for Cairn. Primary consumer is Copilot agent (where Aaron works), not terminal. One presentation layer avoids building throwaway code.
- **Tool naming convention: verb_noun, unprefixed.** Tools read as imperatives (get_status, list_insights, search_events). MCP host adds server prefix (cairn-). Natural language alignment improves LLM tool selection — agent sees verb matching user intent.
- **Vocabulary contracts drive agent behavior:** Each verb establishes semantic expectations. `get` signals "single result or none"; `list` signals "0+ results, can paginate"; `search` signals "exploration with optional filters"; `run` signals "side effect"; `check` signals "boolean". Consistent verbs enable agents to infer the right invocation pattern without explicit instructions.
- **Impact on UX:** Tool names become part of the conversation context. When agents see tool names that read naturally ("list insights" not "insights list"), they interact with tools more intuitively. This is especially important for knowledge tools where the agent is helping Aaron understand system state.
- **Phase 5 ships 6 tools:** get_status, list_insights, get_session, search_events, run_curate, check_event. Each answers one natural question. Verb choices consistent with taxonomy.

### 2026-04-03: README Refresh — Catching Documentation Up to Reality

- **README was two phases behind.** Roadmap still showed Phases 4–5 as planned with old labels, test count was 106 (now 136), and no mention of hooks or MCP server. Documentation drift is a real usability problem — a stale README tells contributors the project isn't maintained.
- **Added Hooks and MCP Server sections under "What's Built."** Hooks described by what they do (session catch-up, event recording), not implementation detail. MCP tools presented as a question-answer table — each row answers "what does this tool tell me?" This follows the verb–noun naming rationale from Phase 5 decisions.
- **Style principle reinforced: narrate work, not worker.** Hook descriptions say what happens ("recovers orphaned sessions," "logs tool use"), not who does it. The README should read like a system description, not a cast list.
- **Omitted speculative content.** Installation section states what works today and one sentence about Phase 6. No placeholder instructions for features that haven't shipped.

### 2026-04-02: Phase 6 Documentation — README Refresh Complete

**Task:** Update README.md to reflect actual Phases 4–5 work and Phase 6 roadmap.

**Corrections Made:**
- Test count: updated "106 tests" → "136 tests" (6 test files)
- Phase 4 label: corrected from "Compiler (validation + builder)" → "Session-start hook + crash recovery"
- Phase 5 label: corrected from "Distribution, CLI, Narrative UX" → "MCP Server (6 tools)"
- Version string: cli.ts should read from package.json (noted as future fix)

**New Sections Added:**
- "Hooks" — preToolUse (Curator) + postToolUse (Archivist), what they do, why they matter
- "MCP Server" — 6 tools documentation (get_status, list_insights, search_events, etc.)
- "Roadmap" — Phase 6 context (three options assessed, plugin packaging chosen)
- "Issue #11" — Worktree support (deferred to Phase 7, full design in decisions.md)

**Rationale:**
- Stale documentation signals unmaintained project — fixes like this have high ROI
- README should reflect what's *actually* shipped, not aspirational roadmap
- Tool descriptions follow verb–noun pattern established in Phase 5 — agents read verbs intuitively
- Phase 6 context helps next contributors understand roadmap and recent decisions

**Status:** README now reflects current state. Ready for distribution phase.

### 2026-04-05: Phase 6 Complete — Documentation Supports Plugin Distribution

**Phase 6 Outcome:** ✅ COMPLETE

**Final Documentation State:**
- ✅ Phases section corrected (Phase 4: session-start hook, Phase 5: MCP server, Phase 6: plugin packaging)
- ✅ Test count accurate (136 tests across 6 files)
- ✅ "What's Built" section includes Hooks and MCP Server with use-case narratives
- ✅ Roadmap updated to reflect Phase 6 completion and Phase 7 preview
- ✅ No speculative content; forward guidance honest about next steps

**Documentation Patterns Reinforced:**
- Describe what the system DOES, not who built it (narrate work, not worker)
- Tool documentation follows verb–noun pattern (agent reads verbs intuitively)
- State what's actually shipped; one sentence on forward plan
- Omit placeholder instructions for unshipped features (stale docs signal unmaintained project)

**README as System Contract:**
- Contributors read README first; stale README signals project entropy
- Test counts, phase labels, and shipping status carry credibility weight
- Verb–noun naming (from Phase 5 decisions) deserves explanation in user-facing docs

**Phase 6 Specific Fixes:**
- Added "Hooks" section explaining preToolUse (Curator) and postToolUse (Archivist) lifecycle
- Added "MCP Server" section with each tool's purpose (structured as q/a: what does this tool tell me?)
- Corrected Phase 4 label from "Compiler" (aspirational) to "Session-start hook" (actual)
- Added Phase 6 roadmap context explaining plugin packaging decision vs alternatives

**Status:** Documentation now matches implementation reality. Supports Phase 7 onboarding for installation command development and distribution work.

### 2025-07-18: Prescriber UX Design — Interaction, Attention, and Growth

**Task:** Design the complete human-facing interaction model for the Prescriber component (insight → prescription → human disposition → applied change → growth tracking).

**Key Design Decisions:**

1. **Timing: After first success, not at the door.** preToolUse hook generates prescriptions in background; MCP tools expose them. Agent surfaces conversationally after first task success. Max 1 proactive per session. Rationale: session start is when humans are most dismissive — cognitive switching costs are highest at context boundaries.

2. **Rejection easier than acceptance.** Accept requires reading a preview (two-step). Reject/defer is one word. This ensures the path of least resistance for the inattentive human is the safe action (reject), not the risky one (uninformed accept). Rejection reasons are optional and freeform, not structured quizzes.

3. **Explicit prescription state machine.** States: pending → previewed → accepted/rejected/deferred/redirected → applied/dismissed/suppressed/resurfaced. No limbo states. Suppression is explicit and reversible. Prevents notification graveyard.

4. **Growth is pull-only, wins-first.** Growth tracking never surfaces proactively. Resolved patterns shown before active ones. No streaks (anxiety-inducing). Cumulative trends instead ("down 42% over 10 sessions").

5. **Four MCP tools, not six.** `list_prescriptions`, `preview_prescription`, `resolve_prescription`, `show_growth`. Explanation folded into preview (no separate "why" tool). Accept/reject unified under `resolve_prescription` with disposition parameter — cleaner state machine, unified telemetry.

6. **Anti-rubber-stamp via structural design, not friction.** Preview shows actual content changes (diffs), not abstract descriptions. No comprehension quizzes. Success measured by behavioral outcomes (does the pattern recur after acceptance?), not ceremony.

**Critic Feedback Incorporated:**
- Dropped session-start as primary surfacing trigger → natural pause timing instead
- Unified apply/dismiss into single `resolve_prescription` tool
- Made rejection one-step (was originally structured multi-choice → now freeform optional)
- Dropped streaks from growth tracking (backfire risk for perfectionists)
- Added explicit state machine (was implicit before)
- Redirect changed from top-level action to post-accept scope refinement

**Key Files:**
- `.squad/decisions/inbox/valanice-prescriber-ux.md` — full design document
- `src/hooks/sessionStart.ts` — where Prescriber trigger integrates (after Curator)
- `src/mcp/server.ts` — where 4 new MCP tools will be registered
- `src/db/preferences.ts` — preference cascade for all Prescriber config
- `src/types/index.ts` — will need Prescription type, PrescriptionDisposition type

**Open Questions Raised:**
- Artifact modification validation: do we need Compiler agent before applying changes?
- Plugin artifact discovery: how does Prescriber know what's installed?
- Conflicting prescription detection
- Growth tracking scope: repo-scoped or global?

### 2025-07-18: LX Brainstorm — Inverting UX for Language Model Interfaces

**Task:** React to Aaron's 9-point vision for agentic software engineering, centering on "LX" (Language Model Experience) — the idea that the harness/tool interface is UX for the LLM.

**Key Insight:** The parallel between UX and LX is structural, not metaphorical. Context window IS working memory (Miller's Law). Attention score decay IS recency bias. Tool selection ambiguity IS decision fatigue (Hick's Law). This enables us to port proven UX heuristics directly.

**Artifacts Produced:**
- `.squad/decisions/inbox/valanice-brainstorm-lx.md` — 10 LX Heuristics (parallel to Nielsen's 10), Decision Consequence Taxonomy, slop-as-upstream-LX-failure analysis, OOP mental model mapping, new LX vocabulary
- Proposed LX Heuristic Evaluation checklist as highest-leverage next action

**Key LX Principles Identified:**
- Context Budget: the LX analog of attention span — every token consumed is budget spent
- Signal Density: information value per token in tool output (Cairn's `confidenceToWords()` is a good example)
- Vocabulary Contracts: verb semantics (get/list/search/run/check) as the LX equivalent of consistent navigation
- Upstream Prevention: slop is a symptom of LX violations, not a standalone problem to police
- Idempotent Safety: the LLM equivalent of "undo" — safe to retry without side effects
- Decision Altitude: 4-tier consequence taxonomy (ambient → logged → flagged → gated)

**Connections to Existing Work:**
- Cairn's DP1–DP5 design principles are already LX heuristics in disguise
- The Prescriber's accept/reject/defer model exemplifies LX-3 (Freedom and Undo) and LX-5 (Error Prevention)
- The verb_noun naming convention from Phase 5 is a rigorous implementation of LX-2 and LX-4

### 2025-07-18: Shiproom Ceremony Design — Decision Defense as Agentic QA

**Task:** Design the Shiproom ceremony pattern for Squad, grounded in both UX (human-facing) and LX (LLM-facing) principles.

**Core Concept:** Shiproom is where agents "speak to" their decisions — presenting the decision chain for a completed task and defending it against domain challengers. Unlike code review (which evaluates artifacts), Shiproom evaluates *reasoning* — the decisions that produced the artifacts.

**Key Design Decisions:**

1. **Decision Record schema** — every defensible decision captured at decision time with: question, chosen option, alternatives (min 1, mandatory), evidence, confidence, altitude, parent linkage. The `alternatives` minimum prevents default-as-decision inertia. Content-addressable IDs make the chain tamper-evident (Aaron's "blockchain" analogy made structural).

2. **Facilitator: Graham (Lead), not a dedicated agent.** A ceremony-only agent would lack domain context. The Lead has the cross-cutting knowledge to smell when something is wrong. Role rotation handles conflict of interest — when Graham's own decisions are under review, Roger facilitates that specific decision.

3. **One probing question per challenger.** Prevents death-by-a-thousand-questions. This is attention rationing — the ceremony equivalent of "max 1 proactive hint per session" from Prescriber UX. Challengers are domain-routed by decision tags.

4. **Curator as unique non-domain challenger.** It doesn't have opinions — it has data. "The last three times a decision like this was made, the pattern recurred within 5 sessions." Evidence-based challenge, not subjective review.

5. **Decision Altitude filters what enters Shiproom.** Altitude 0–1: never individually examined. Altitude 2: examined, challenge optional. Altitude 3: full examination required, human notified. Progressive disclosure (Krug) applied to ceremony design.

6. **Human sees summary + escalations only (default).** The "newspaper test" — 30-second summary tells you exactly where attention is needed. Full ceremony browsable as opt-in pull interface. Asynchronous escalation resolution — human judges on their schedule.

7. **Confabulation prevention in "speak to" pattern.** Agents can only cite evidence already in the decision record — no post-hoc reasoning. Behavioral constraint first; structural verification (hash checking) deferred until confabulation rate is measurable via Curator patterns.

8. **LX-11: Ceremony Efficiency (new heuristic).** Metrics: challenge rate, amendment rate, escalation rate, token cost per decision. These feed back into the Curator → Prescriber loop for self-improvement.

**The Flywheel:** Shiproom generates structured signal about decision quality → Curator detects patterns in overturned/amended decisions → Prescriber suggests improvements → Future decisions improve → Fewer Shiproom amendments → Lower ceremony cost → More time building.

**Artifacts Produced:**
- `.squad/decisions/inbox/valanice-shiproom-ceremony.md` — full design specification

**Open Questions:**
- Auto-trigger threshold calibration (start at 3+ Altitude ≥ 2, adapt via amendment/overturn rates)
- Confabulation measurement methodology
- Ceremony cost budget in tokens
