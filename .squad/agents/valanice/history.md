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
