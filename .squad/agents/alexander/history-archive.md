# Alexander — History Archive

Archived entries summarizing foundational work prior to Wave 5.

## Older Entries

- Wave 0: Foundation setup for Phase 4.6 architecture (A1–A4: migrations, schema, Curator sweep)
- Wave 1: ChangeVectorProvider contract migration, SqliteChangeVectorProvider in Cairn
- Wave 2: @akubly/types promotion, canonical ChangeVectorSummary reconciliation
- Wave 3: Lockout fixes (confidence → confidenceBoost), sort deduplication, advisory findings
- Wave 5 Integration: Pre-summarization snapshot of Wave 3/Wave 4 coordination

**Full details:** See commit history and individual decision documents in .squad/decisions.md

**Key pattern established:** Circular dependency management via ports (ChangeVectorProvider), not direct imports. SQLite schema versioning tied to migration filenames.
