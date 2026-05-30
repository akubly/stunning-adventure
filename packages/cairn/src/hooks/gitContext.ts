/**
 * Shared git context helpers for hook entry points.
 *
 * Extracted to avoid duplication between preToolUse (sessionStart) and
 * postToolUse hooks.
 */

import { slugifyRepoKey } from '../config/repo.js';
import { execSync } from 'node:child_process';
import { normalizeWorkdir } from '../utils/workdir.js';

/** Resolve the slugified repo key from a git working directory. */
export function getRepoKey(cwd?: string): string {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return slugifyRepoKey(remote);
  } catch {
    return 'unknown_repo';
  }
}

/** Resolve the current git branch, or undefined if detached / not a repo. */
export function getBranch(cwd?: string): string | undefined {
  try {
    return execSync('git branch --show-current', {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}

// Module-level cache: cwd key → normalized workdir (or undefined = not a git repo).
const workdirCache = new Map<string, string | undefined>();

/**
 * Resolve the worktree root for the given directory via `git rev-parse --show-toplevel`.
 * In a linked worktree this returns the worktree path, not the main checkout root —
 * which is exactly the isolation boundary we want for session identity.
 * Returns undefined on failure (non-git dirs, bare repos, git not on PATH).
 * Result is cached per cwd for the process lifetime.
 */
export function getWorkdir(cwd?: string): string | undefined {
  const key = cwd ?? process.cwd();
  if (workdirCache.has(key)) return workdirCache.get(key);
  try {
    const raw = execSync('git rev-parse --show-toplevel', {
      cwd: key,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const result = raw ? normalizeWorkdir(raw) : undefined;
    workdirCache.set(key, result);
    return result;
  } catch (err: unknown) {
    process.stderr.write(
      `[cairn] getWorkdir failed for '${key}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    workdirCache.set(key, undefined);
    return undefined;
  }
}

