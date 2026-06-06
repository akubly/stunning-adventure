
*Hard-designed, Eureka/forge-adjacent (prescriber loop critical path):*
- `lastAccessedAt`/`accessCount` side effects in `recall` — §55 §2.6 spec, explicit "Not yet implemented" in recall.ts:154. M2 target in London-TDD cascade.
- Trust score updates from feedback — §30 §2.3 spec, M5 target. Requires commit activity + outcome-feedback loop.
- Per-call `trustFloor` in `RecallOptions` — exact change described in recall.ts:84 TODO, F12 deferral. S-size.

*Soft-designed (Phase 5 backlog):* GP/tournament selection, meta-optimization DBOM on prescriptions, per-user/per-model change vectors, event log compaction, I10 Curator system-event handling.

*Aspirational (no design):* sqlite-vec, knowledge graph, plugin bundles, Karpathy SKILL.md, auto-scheduler.

**Key finding:** Forge's Phase 4.6 designed surface is fully implemented. Everything remaining is Phase 5+ or Eureka v1.5+. The queue is not empty but it's all explicitly future-phased, not accidentally overlooked.

**Addendum (2026-05-30): Packaging / dogfood readiness audit**

Aaron's priority reset: defer Eureka moves; get forge installable and dogfoodable first.

*Current install/run shape:* Three binaries (`forge-prescribe`, `forge-metrics`, `forge-mcp`) defined in workspace packages. Cairn DB self-initializes on first `getDb()` call — no init command needed. The `curate.ps1` hook resolves to `skillsmith-runtime/dist/hooks/sessionStart.js` at session start, auto-running the forge prescriber (Windows only). Nothing is npm-published; install path is clone → build → use.

*Critical blockers found:*
1. **`forge-mcp` not registered anywhere** — `.github/plugin/.mcp.json` and `.copilot/mcp-config.json` both only list `cairn`. The `forge_prescribe` MCP tool is completely unreachable from Copilot. Highest-priority fix.
2. **No hint consumption surface** — `optimization_hints` table has no MCP tool reader. `list_prescriptions`/`get_prescription` operate on the OLD `prescriptions` table, not forge's output. `get_status` emits a proactive "N new suggestions" count but shows no content. Aaron can't act on forge's output without direct SQLite access.
3. **Hooks are PowerShell-only** — `curate.ps1` and `record.ps1`, no bash equivalent. Auto-prescribe never fires on macOS/Linux.

*Smoothness gaps:* README has zero forge documentation; no `--list-skills` discovery command; plugin.json and plugin metadata are all labeled "cairn" (plugin identity diverged from actual scope).

*Recommended sequence:* (1) Register `forge-mcp` in `.github/plugin/.mcp.json` + `.copilot/mcp-config.json` — S, Alexander; (2) Add `list_optimization_hints` + `resolve_optimization_hint` to cairn MCP — M, Alexander + Beatrix; (3) Bash hook equivalent — M, infrastructure; (4) README forge section — S, anyone, last (write after loop is testable).
Older detailed history (before 2026-05-30) archived to `history-archive.md`.
**For detailed history, see history-archive.md**


---

## Archive Summary

Earlier entries (209 lines) archived to history-archive.md on 2026-06-05.

---

