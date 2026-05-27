# Orchestration Log: Valanice (UX, sonnet-4.5)

**Date:** 2026-05-22T20-25-51 UTC  
**Agent:** Valanice (UX / Human Factors)  
**Model:** claude-sonnet-4.5  
**Mode:** Background agent  

## Task

Evaluate brain/memory/thinking/learning system from UX perspective. Assess user-memory tier (product vs dev tool), knowledge activities (silent vs observable), trust/plasticity/recency interfaces (CLI, GUI, MCP, config), and branding/positioning implications for repo placement.

## Output

**File:** `.squad/decisions/inbox/valanice-brain-ux.md`

### Recommendation

**NEW REPO** with phased extraction

**Initial verdict:** Build prototype in monorepo (`experiments/brain/` or `packages/brain/`), extract to separate repo once brain has:
- Its own CLI (`brain list`, `brain forget`, etc.)
- Its own MCP server (`brain_recall`, `brain_ideate`, etc.)
- Its own test suite
- A decision on branding (Synapse, Mneme, Cortex, etc.)

### Key Findings

1. **User-Memory Tier Identity** — BOTH product and dev tool. More like Git (portable substrate installed globally) than a feature of Cairn. Installation story determines discoverability.

2. **Knowledge Activities Model** — Invisible by default (meditate, integrate, explore run as background jobs), observable on demand (pull-based queries: "What patterns have I learned about error handling in React?").

3. **Interface Strategy:**
   - **Config files** (source of truth, versionable): `.brain/config.yml` (trust, recency, plasticity policies)
   - **MCP server** (agent consumption): `brain_recall`, `brain_ideate`, etc.
   - **CLI** (human curation): `brain list`, `brain search`, `brain forget`
   - **IDE plugin** (Phase N, only if usage patterns warrant)
   - **GUI** (Phase 10+, only if "dream" becomes visual)

4. **Mental Model Boundary** — Brain is **infrastructure** (like Git, Redis), not a feature of Cairn/Forge. Users install it globally, configure per-repo, it serves multiple tools.

5. **Branding/Positioning** — Brain needs standalone identity if it's infrastructure for any agentic system. Branding independence signals "this is infrastructure you can build on," not "this is part of Cairn."

### Verdict

**NEW REPO, with delayed extraction strategy**

- **MVP in monorepo:** Prototype code in `experiments/brain/` or `packages/brain/`
- **Extract when:** Brain has independent release cadence and changelog
- **Branding options:** Synapse, Mneme, Cortex, Engram

### Conviction Level

Medium-high with important open question flagged: **Is the brain Cairn/Forge-exclusive, or infrastructure for any agent?**

---

## Squad Impact

- **Installation model:** `npm install -g @akubly/brain` (or `@user/synapse`)
- **Per-repo config:** `.brain/config.yml` (like `.gitconfig` or `.prettierrc`)
- **Agent discovery:** Cairn/Forge detect brain via MCP server (no explicit linking)
- **UX Principle:** Tool boundaries should match mental model boundaries

---

## Open Questions for Aaron

1. **Is the brain Cairn/Forge-exclusive, or infrastructure for any agent?** (Determines branding strategy)
2. **What's the MVP scope?** (2 weeks prototype vs 2 months full system)
3. **Who is the primary user?** (Agents LX-first vs Humans UX-first)
4. **Does brain need visual interface (GUI)?** (Graph visualization for "dream" feature)

