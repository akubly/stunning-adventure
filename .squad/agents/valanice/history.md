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
