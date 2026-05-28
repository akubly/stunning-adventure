# Orchestration Log: Alexander (SDK/Runtime, sonnet-4.5)

**Date:** 2026-05-22T20-25-51 UTC  
**Agent:** Alexander (SDK/Runtime Dev)  
**Model:** claude-sonnet-4.5  
**Mode:** Background agent  

## Task

Evaluate whether `packages/brain/` holds in this monorepo given Aaron's expanded scope (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION). Prior position (2026-05-05) was monorepo—reconsider against Q1 (runtime), Q2 (user-tier distribution), Q3 (org-tier federation).

## Output

**File:** `.squad/decisions/inbox/alexander-brain-refined.md`

### Recommendation

**FLIPPED from monorepo to NEW REPO: `stunning-adventure-brain`**

This is a deliberation note capturing the analysis flip.

### Key Findings

1. **Q1: Runtime Coupling** — Brain is a Forge **sibling** (peer runtime), not a layer on Forge. Brain has its own execution loop (meditate, dream, etc.). This supports both monorepo and separate repo, but separate repo avoids architectural confusion.

2. **Q2: User-Tier Distribution** — CAN work from monorepo via npm publish, BUT separate repo enforces "no accidental Forge deps" → separate repo is safer. **Critical design: adapter separation** — core brain logic is repo-agnostic, Forge-specific bits live in adapters.

3. **Q3: Org-Tier Federation** — Wants Postgres + backend service (separate deployment unit). SQLite-locality model breaks for org tier. This is the decisive factor: if Brain will eventually need Postgres + Azure Functions deployment, it's a separate *system*, not just a separate *module*.

### Verdict

**NEW REPO `stunning-adventure-brain`**

**Why reversing:**
- Original scope (data layer for Forge) → monorepo makes sense
- Expanded scope (general-purpose cognitive infrastructure with multi-tier federation and runtime activities) → **system boundary shift**
- The 5-dimension expansion is **10x scope increase**

**Structure:**
```
stunning-adventure-brain/
  packages/
    brain/              # Core (Forge-agnostic)
    brain-forge-adapter/# Forge integration (optional)
    brain-backend/      # Org-tier sync service (Azure Functions or Nest.js)
```

**Dependencies:**
```
packages/brain/ → (no Forge deps, fully standalone)
packages/brain-forge-adapter/ → @akubly/forge + @akubly/types
packages/brain-backend/ → pg (Postgres client)
```

### Conviction Level

High. Q3 (backend service requirement) is the decisive factor. If org-tier federation needs Postgres + Azure Functions, it's a separate deployment unit → separate repo.

---

## Squad Impact

- **This repo:** Publish Forge + Types to npm (add `publishConfig`, GitHub Actions workflow)
- **New repo:** Create `stunning-adventure-brain` with dedicated squad
- **Integration:** Cairn becomes a Brain consumer (delegates learning logic to Brain)
- **Release cadence:** Brain repo has independent release schedule (Phase 0-4 timeline)

