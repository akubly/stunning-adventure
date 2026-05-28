/**
 * Shared git context helpers for hook entry points.
 *
 * Extracted to avoid duplication between preToolUse (sessionStart) and
 * postToolUse hooks.
 */

import { slugifyRepoKey } from '../config/repo.js';
import { execSync } from 'node:child_process';

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

/**
 * Resolve the worktree root for the given directory via `git rev-parse --show-toplevel`.
 * In a linked worktree this returns the worktree path, not the main checkout root —
 * which is exactly the isolation boundary we want for session identity.
 * Returns undefined on failure (non-git dirs, bare repos, git not on PATH).
 */
export function getWorkdir(cwd?: string): string | undefined {
  try {
    return (
      execSync('git rev-parse --show-toplevel', {
        cwd: cwd ?? process.cwd(),
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}
