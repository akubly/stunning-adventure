# Skill: Respect Gitignore Boundaries in Committed Docs

**Category:** Documentation Hygiene
**Discovered:** 2026-05-28 (Cassima — PR #26 post-merge alignment sweep)
**Applicable:** All Squad agents, all repos with gitignored working-memo directories

---

## Rule

**Committed documentation must not cite paths under gitignored directories.**

Broken links to gitignored files are invisible to the author (who has the local file) but broken for:
- Other contributors (file doesn't exist in their checkout)
- CI/CD pipelines (file not in repo)
- Future readers (file never committed)

---

## Context

`decision inbox drop-box` is gitignored in the `mem/` repo. It's a local-only working-memo directory where agents draft decision documents before they're merged into `.squad/decisions.md` (the committed, canonical team decision log).

During Eureka v1 design phase, several committed docs (ADRs, technical design) referenced `decision inbox drop cassima-*.md` files. These references worked for Cassima (who had the local files) but were broken for other contributors and CI.

Copilot's automated review on PR #26 flagged 3 instances:
1. `docs/eureka/technical-design.md` lines 164-165 — two inbox links
2. `docs/eureka/adrs/0002-shared-substrate-ownership.md` line 8 — one inbox link

All three were replaced with references to merged content in `.squad/decisions.md` (citing section heading + date).

---

## When to Apply

**Before committing any doc that references another file:**

1. Check if the referenced path is under a gitignored directory.
   - In `mem/` repo: `decision inbox drop-box` is gitignored.
   - Check `.gitignore` if unsure.

2. If yes, replace the reference with one of:
   - Merged content in a committed file (e.g., `.squad/decisions.md` with section heading + date)
   - A committed ADR (`docs/{project}/adrs/*.md`)
   - A committed PRD or spec (`.squad/decisions/{project}-prd-*.md`)

3. If the content hasn't been merged yet:
   - Option A: Merge it first, then reference the merged location.
   - Option B: Summarize the decision inline instead of linking.
   - Option C: Use a TODO marker: "See [decision pending merge]" and file an issue to fix it post-merge.

---

## Examples

### ❌ Bad (Broken for Other Contributors)

```markdown
**Tension Reference:** §70 T7, `decision inbox drop <memo-slug>.md`
```

**Why broken:** `decision inbox drop-box` is gitignored → file doesn't exist in other contributors' checkouts or CI.

### ✅ Good (Points to Merged Content)

```markdown
**Tension Reference:** §70 T7; merged substrate analysis in `.squad/decisions.md` "Narrower Substrate Freeze Proposal" (2026-05-27)
```

**Why better:** `.squad/decisions.md` is committed → resolves for all readers. Section heading + date make it findable.

---

### ❌ Bad (Broken Link in References Section)

```markdown
- **Crucible Impact Analysis:** [`decision inbox drop <memo-slug>.md`](decision inbox drop <memo-slug>.md)
```

**Why broken:** Link target is gitignored → 404 for other contributors.

### ✅ Good (Points to Merged Location)

```markdown
- **Crucible Impact Analysis:** See `.squad/decisions.md` § "Crucible ↔ Eureka Cross-Project Overlap" (2026-05-27)
```

**Why better:** Points to committed file with section locator. Readers can `grep` or search for the section heading.

---

## How to Find Violations

**Before committing:**

```bash
# In repo root
git diff --cached | grep 'inbox/'
```

If any committed docs reference `decision inbox drop-box`, replace with merged-content references.

**When sweeping for violations, search the ENTIRE repository** — not just `docs/`:
- `.squad/agents/*/history.md` (agent audit trails)
- Tracked `.squad/orchestration-log/*.md` (intentional historical archives)
- Tracked `.squad/log/*.md` (session logs)
- `.squad/handoffs/*.md` (cross-agent handoff records)
- All `docs/` subdirectories

**In PR review:**

Look for references to gitignored paths in changed files:
- `inbox/`
- Any path listed in `.gitignore`

---

## Why This Matters

**For contributors:** Broken links waste time ("Where's this document? Did I miss a file?").

**For CI:** Automated doc linters, link checkers, or validation scripts fail on broken references.

**For future readers:** Decisions cited in ADRs/design docs are load-bearing context. If the link is broken, the reasoning is lost.

---

## Exceptions

None. If a document is worth referencing, it's worth committing (or merging into a committed location).

Inbox memos are working drafts. Once decisions are locked, merge them into `.squad/decisions.md` or a committed ADR, then reference the committed location.

---

## Pitfalls

**Writing examples in skill docs:**
If you write examples in this skill that illustrate the rule, **lint those examples against the rule itself**. Examples that violate the rule undermine credibility. For instance, if this skill's "Learning Source" or "Deliverable" section cites an inbox path, that's a self-violation.

Use generic placeholders (e.g., `decision inbox drop <memo-slug>.md`) or wrap concrete paths in inline code that's clearly labeled as "what NOT to do" — not clickable markdown links to real files.

**Not sweeping broadly enough:**
When fixing violations, don't just fix the specific flagged lines. Search the entire repository (including `.squad/agents/`, `.squad/orchestration-log/`, `.squad/log/`, `.squad/handoffs/`) for the same pattern. Partial sweeps leave broken links that surface in later review cycles.

---

## Related

- **Inbox merge workflow:** `decision inbox drop *.md` → `.squad/decisions.md` (Scribe owns merge ceremony)
- **ADR template:** ADR headers have "Tension Reference" field — use merged decision locations, not inbox paths
- **Technical design References section:** All cited decisions must be in committed files

---

## Learning Source

**PR #26 post-merge alignment sweep (2026-05-28):**
Copilot automated review flagged 3 broken inbox references in committed Eureka docs. All replaced with merged-content references. Rule extracted to prevent recurrence.

**Cycle 1 Summary:** See `.squad/decisions.md` § "PR #26 — Copilot Review Doc Alignment (Cycle 1)" (2026-05-28) for full fix sweep documentation.


