# Cross-PRD Overlap Analysis

**Pattern Name:** Cross-PRD Overlap Analysis  
**Context:** Two or more PRDs target the same repository for simultaneous implementation.  
**Problem:** Without explicit overlap analysis, teams build duplicate substrate, conflicting schemas, and bridges to moving targets.  
**Solution:** Before design begins, systematically map overlap, conflict, and coupling risk across the PRDs.

---

## Core Insight

Two PRDs in one repo don't just share code — they share **contracts** (`@akubly/types`), **schemas** (database tables both depend on), **lifecycle assumptions** (who boots first, who owns the message loop), and **naming** (both may use "session", "decision", "sweep" to mean different things). The overlap analysis must enumerate these surfaces explicitly, not just wave at "they might overlap."

---

## Procedure

### Step 1 — Build a functional model of each PRD
For each PRD, extract:
- What it IS (3-5 bullets, in your words)
- What it OWNS (tables, types, CLI commands, lifecycle phases)
- What it OBSERVES but doesn't own (peer systems, bridges)
- What it ASSUMES is stable (schemas, types, APIs it depends on)

### Step 2 — Enumerate shared surfaces
Produce a table of every component that appears in both PRDs:

| Component | PRD-A position | PRD-B position | Relationship | Risk |

Relationship values:
- **Same** — both PRDs implement the same thing (duplicate risk)
- **Layered** — one depends on the other cleanly (low risk if dependency direction is clear)
- **Conflicting** — both PRDs make incompatible assumptions about the same component
- **Independent** — both mention it but don't interact

### Step 3 — Identify hard conflicts
Numbered list of things that WILL break if both ship as written. Cite specific PRD sections. A hard conflict has these properties:
- Both PRDs depend on the same artifact (type, table, package)
- At least one PRD changes that artifact in a way the other doesn't expect
- The change cannot be absorbed by forward-compatibility alone

### Step 4 — Identify shared-substrate candidates
Things that should be ONE implementation. Criteria:
- Both PRDs need it
- Building it twice would create drift risk
- A single implementation with two consumers is architecturally cleaner

### Step 5 — Identify scope-creep risk
Where does PRD-A quietly assume PRD-B's primitives, or vice versa? Look for:
- PRD-A referencing PRD-B's system as "stable" when PRD-B is restructuring it
- Both PRDs extending the same shared package without mentioning each other
- Lifecycle assumptions (who owns session start? who terminates whom?)

### Step 6 — Recommend coordination strategy
Four canonical options:
- **(a) Merge PRDs** — single source of truth, but may produce an unreadable mega-doc
- **(b) Hard-isolate with versioned contract** — independence, but high coordination cost if shared surface is large
- **(c) Shared substrate + thin upper layers** — correct long-term shape, but requires both PRDs to target the shared substrate
- **(d) Sequence one before the other** — avoids building bridges to moving targets, but delays the second PRD

Name the trade-offs of each. Recommend one with reasoning.

### Step 7 — Surface open questions
3-5 decisions only the product owner can make. These are the forks where the architect's judgment runs out and product direction is needed.

---

## Output Format

1. **Functional summary of each PRD** (3-5 bullets each)
2. **Overlap matrix** (table)
3. **Hard conflicts** (numbered list with PRD section citations)
4. **Shared-substrate candidates** (numbered list)
5. **Scope-creep risks** (prose)
6. **Recommendation** (one coordination strategy with trade-offs)
7. **Open questions** (3-5 max)

---

## Anti-Patterns

- **"They might overlap"** — useless. Name the specific component, cite the specific PRD section, classify the relationship.
- **Assuming both PRDs know about each other** — they usually don't. Each was authored in isolation. The overlap analysis is the first document that sees both.
- **Recommending "just coordinate"** — coordination is a cost, not a solution. Name what's being coordinated, who owns the coordination artifact, and what CI enforces.
- **Ignoring sequencing** — if PRD-A restructures a substrate PRD-B depends on, the order matters. "Ship simultaneously" is not a strategy; it's a wish.

---

## When to Use

- Before design begins on any two PRDs targeting the same repo
- When a new PRD is proposed for a repo that already has an active PRD
- During sprint planning when two feature tracks touch the same packages
