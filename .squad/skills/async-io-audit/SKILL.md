---
name: async-io-audit
description: Audit a Node.js codebase for sync IO in hot paths, classify by impact, and verify guard behaviors.
domain: async-correctness
confidence: earned
source: issue-17-sweep-2026-05-26
tools:
  - name: grep
    description: Search for sync IO patterns (readFileSync, statSync, execSync, etc.)
    when: Scanning for sync calls across a package
  - name: view
    description: Read source files to classify call sites by context (startup, hot path, rare)
    when: Determining impact category of a found sync call
  - name: powershell
    description: Run tests to verify guard behaviors
    when: Confirming sync IO error handling is correct
---

# Async IO Audit

## Context

Apply this skill when evaluating whether sync IO in an async Node.js codebase needs conversion. Most sync IO is safe and intentional — the goal is classification, not blanket conversion. This skill applies to any MCP server, hook process, or CLI tool built on Node.js.

Before auditing: understand the concurrency model. An MCP server using stdio transport processes one request at a time — sync IO cannot starve other requests. A long-running HTTP server with concurrent requests is a different case.

## Patterns

**Step 1 — Map the concurrency model first.**

Ask: can a second request arrive while the first is being handled? For stdio MCP servers: no. For HTTP servers: yes. This determines whether sync IO "matters" at all before you read a single line of code.

**Step 2 — Classify each sync IO call by category.**

Four categories, in priority order:
- `startup-only` — runs once on process init (mkdirSync for DB dir, chmodSync for permissions). Expected, leave as-is.
- `rare` — operator-triggered actions (file apply, rollback). Low frequency. Acceptable if bounded.
- `curator-path` — runs during periodic batch processing, not per-request. Acceptable if wrapped in error handlers.
- `hot-path` — runs on every request in a concurrent server. Needs async conversion.

**Step 3 — For each hot-path finding, check three guards:**

1. **Timeout guard** — `execSync` must have `timeout:` set. Without it, a hanging git process blocks forever.
2. **Size guard** — `readFileSync` on user-provided paths must check file size before reading. 1 MB is a reasonable limit.
3. **Error guard** — all sync calls inside tool handlers must be in try/catch that produces a valid error response (fail-open).

**Step 4 — Write tests for the guards, not for the sync-vs-async property.**

The right test is: "does the size guard reject a 2MB file with a correct error?" Not: "is this call async?" The guard is the invariant; the sync/async distinction is the implementation.

**Step 5 — Record structural baseline.**

Use source-reading tests to establish a baseline of where sync IO lives in the codebase. Future changes that add sync IO outside the expected locations will fail the test, providing a tripwire.

```typescript
it('readFileSync only appears in resolveAndReadSkill, not in other tool handlers', () => {
  const source = fs.readFileSync(serverPath, 'utf8');
  const fnStart = source.indexOf('function resolveAndReadSkill(');
  const beforeFn = source.slice(0, fnStart);
  const syncCalls = beforeFn.match(/fs\.(readFileSync|statSync)\b/g) ?? [];
  expect(syncCalls).toHaveLength(0);
});
```

**Step 6 — Identify the "leave as-is with rationale" cases.**

Document each accepted sync call with: what it does, why conversion is not justified, and what guard makes it safe. This prevents future developers from re-raising the same concern without new evidence.

## Examples

**Pattern: size guard test**

```typescript
it('returns error when the file exceeds the 1 MB size limit', () => {
  vi.spyOn(fs, 'statSync')
    .mockImplementationOnce(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); })
    .mockReturnValueOnce({ isDirectory: () => false, size: 2_000_000 } as unknown as fs.Stats);

  const result = resolveAndReadSkill('/any/path/SKILL.md');
  expect(isSkillFileError(result)).toBe(true);
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.error).toContain('too large');
});
```

**Pattern: timeout guard structural test**

```typescript
it('execSync calls are timeout-guarded', () => {
  const source = fs.readFileSync(gitContextPath, 'utf8');
  const timeouts = source.match(/timeout:\s*2000/g) ?? [];
  expect(timeouts.length).toBeGreaterThanOrEqual(2);
});
```

## Anti-Patterns

Never convert sync IO to async "for consistency" when the concurrency model does not require it. Adding `async` everywhere inflates the complexity budget for no practical benefit.

Never audit sync IO without first establishing the concurrency model. The same `readFileSync` call is fine in a startup script, acceptable in a serial MCP server, and problematic in a concurrent HTTP handler.

Never test "is this call async?" as a proxy for correctness. The guards (timeout, size limit, error handling) are what matter. Test those instead.

Never add `fs.readFileSync` inside an MCP tool handler directly. If file IO is needed, extract a helper with all three guards (name check, size check, read error) and test the helper in isolation. See `resolveAndReadSkill` as the reference implementation.
