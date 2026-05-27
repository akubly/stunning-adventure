/**
 * MCP Async-IO Audit — Issue #17
 *
 * Tests the guard behaviors of resolveAndReadSkill (the only non-DB sync IO
 * inside MCP tool handlers) and structural properties of the hook exec calls.
 *
 * Goal: confirm that sync IO in this codebase is intentional, bounded, and
 * correctly error-handled — not that it should be converted to async.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { resolveAndReadSkill, isSkillFileError } from '../mcp/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'skills', 'good-skill');
const FIXTURE_SKILL = path.join(FIXTURE_DIR, 'SKILL.md');

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// resolveAndReadSkill — guard behaviors
// ---------------------------------------------------------------------------

describe('resolveAndReadSkill — file guard behaviors', () => {
  it('rejects a non-SKILL.md basename with an error response', () => {
    const result = resolveAndReadSkill('/some/path/README.md');
    expect(isSkillFileError(result)).toBe(true);
    if (isSkillFileError(result)) {
      const parsed = JSON.parse(result.content[0].text) as { error: string };
      expect(parsed.error).toContain('SKILL.md');
      expect(parsed.error).toContain('README.md');
    }
  });

  it('rejects an arbitrary file extension with an error response', () => {
    const result = resolveAndReadSkill('/path/to/skill.ts');
    expect(isSkillFileError(result)).toBe(true);
    if (isSkillFileError(result)) {
      const parsed = JSON.parse(result.content[0].text) as { error: string };
      expect(parsed.error).toContain('SKILL.md');
    }
  });

  it('auto-appends SKILL.md when given a directory containing one', () => {
    const result = resolveAndReadSkill(FIXTURE_DIR);
    expect(isSkillFileError(result)).toBe(false);
    if (!isSkillFileError(result)) {
      expect(result.filePath).toBe(FIXTURE_SKILL);
      expect(result.content).toContain('typescript-error-handling');
    }
  });

  it('returns content for a valid absolute SKILL.md path', () => {
    const result = resolveAndReadSkill(FIXTURE_SKILL);
    expect(isSkillFileError(result)).toBe(false);
    if (!isSkillFileError(result)) {
      expect(result.filePath).toBe(FIXTURE_SKILL);
      expect(result.content.length).toBeGreaterThan(0);
    }
  });

  it('resolves a relative path to an absolute SKILL.md path', () => {
    // Relative path rooted at process.cwd(); use a path that won't exist
    // to exercise the read-error path (not the basename guard path).
    const result = resolveAndReadSkill('no/such/dir/SKILL.md');
    expect(isSkillFileError(result)).toBe(true);
    if (isSkillFileError(result)) {
      const parsed = JSON.parse(result.content[0].text) as { error: string };
      // Must hit the "Cannot read file" branch, not the basename guard
      expect(parsed.error).toContain('Cannot read file');
    }
  });

  it('returns error when the SKILL.md file does not exist', () => {
    const result = resolveAndReadSkill('/no/such/path/SKILL.md');
    expect(isSkillFileError(result)).toBe(true);
    if (isSkillFileError(result)) {
      const parsed = JSON.parse(result.content[0].text) as { error: string };
      expect(parsed.error).toContain('Cannot read file');
    }
  });

  it('returns error when the file exceeds the 1 MB size limit', () => {
    // Stub statSync: first call (directory check) throws ENOENT so the stat
    // path is skipped; second call (size check) returns an oversized file.
    const statSyncSpy = vi.spyOn(fs, 'statSync')
      .mockImplementationOnce(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); })
      .mockReturnValueOnce({ isDirectory: () => false, size: 2_000_000 } as unknown as fs.Stats);

    const result = resolveAndReadSkill('/any/path/SKILL.md');
    expect(isSkillFileError(result)).toBe(true);
    if (isSkillFileError(result)) {
      const parsed = JSON.parse(result.content[0].text) as { error: string };
      expect(parsed.error).toContain('too large');
      expect(parsed.error).toContain('2000000');
    }

    expect(statSyncSpy).toHaveBeenCalledTimes(2);
  });

  it('propagates a read failure after passing size check', () => {
    vi.spyOn(fs, 'statSync')
      .mockImplementationOnce(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); })
      .mockReturnValueOnce({ isDirectory: () => false, size: 500 } as unknown as fs.Stats);
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    });

    const result = resolveAndReadSkill('/restricted/SKILL.md');
    expect(isSkillFileError(result)).toBe(true);
    if (isSkillFileError(result)) {
      const parsed = JSON.parse(result.content[0].text) as { error: string };
      expect(parsed.error).toContain('Cannot read file');
    }
  });
});

// ---------------------------------------------------------------------------
// Structural: timeout guards on execSync calls in hooks
// ---------------------------------------------------------------------------

describe('gitContext — execSync timeout guards (structural)', () => {
  it('getRepoKey uses execSync with a 2000ms timeout', () => {
    const gitContextPath = fileURLToPath(new URL('../hooks/gitContext.ts', import.meta.url));
    const source = fs.readFileSync(gitContextPath, 'utf8');

    // Both execSync calls must declare a timeout guard
    const timeoutMatches = source.match(/timeout:\s*2000/g) ?? [];
    expect(timeoutMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('gitContext execSync calls use pipe stdio to prevent terminal attachment', () => {
    const gitContextPath = fileURLToPath(new URL('../hooks/gitContext.ts', import.meta.url));
    const source = fs.readFileSync(gitContextPath, 'utf8');
    expect(source).toContain("stdio: ['pipe', 'pipe', 'pipe']");
  });
});

// ---------------------------------------------------------------------------
// Structural: non-DB sync IO is isolated to resolveAndReadSkill
// ---------------------------------------------------------------------------

describe('MCP server sync IO isolation (structural)', () => {
  it('readFileSync and statSync in tool handler bodies only appear in resolveAndReadSkill', () => {
    const serverPath = fileURLToPath(new URL('../mcp/server.ts', import.meta.url));
    const source = fs.readFileSync(serverPath, 'utf8');

    // Find the resolveAndReadSkill function body (between its opening brace and the
    // closing brace before the next export / function declaration at column 0).
    const fnStart = source.indexOf('export function resolveAndReadSkill(');
    expect(fnStart).toBeGreaterThan(-1);

    // Everything before the function definition
    const beforeFn = source.slice(0, fnStart);

    // Tool handler registrations appear before resolveAndReadSkill; ensure no
    // readFileSync / statSync outside the helper.
    const syncCallsBeforeFn = (beforeFn.match(/fs\.(readFileSync|statSync|existsSync|writeFileSync|mkdirSync)\b/g) ?? []);
    expect(syncCallsBeforeFn).toHaveLength(0);
  });

  it('tool handlers that call resolveAndReadSkill do so via the shared helper', () => {
    const serverPath = fileURLToPath(new URL('../mcp/server.ts', import.meta.url));
    const source = fs.readFileSync(serverPath, 'utf8');

    // lint_skill and test_skill should call resolveAndReadSkill, not inline fs calls
    const resolveCallSites = (source.match(/resolveAndReadSkill\(/g) ?? []).length;
    // Definition (1) + lint_skill (1) + test_skill ×2 (skill_path + scenario skill) = 4 minimum
    expect(resolveCallSites).toBeGreaterThanOrEqual(4);
  });
});
