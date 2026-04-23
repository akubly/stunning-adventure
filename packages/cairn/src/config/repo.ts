/**
 * Slugify a Git remote URL (or org/repo shorthand) into an `org_repo` key.
 *
 * Handles:
 *   https://github.com/org/repo.git → org_repo
 *   git@github.com:org/repo.git     → org_repo
 *   ssh://git@github.com/org/repo   → org_repo
 *   org/repo                        → org_repo
 */
export function slugifyRepoKey(remote: string): string {
  let cleaned = remote.trim().replace(/\.git$/, '');

  // SSH shorthand: git@host:org/repo
  if (cleaned.includes('@') && cleaned.includes(':') && !cleaned.includes('://')) {
    cleaned = cleaned.slice(cleaned.indexOf(':') + 1);
  } else {
    // URL with protocol — strip scheme + host
    cleaned = cleaned.replace(/^[a-z+]+:\/\/[^/]+\//, '');
  }

  const segments = cleaned.split('/').filter(Boolean);
  if (segments.length >= 2) {
    return `${segments[segments.length - 2]}_${segments[segments.length - 1]}`;
  }

  return cleaned.replace(/\//g, '_');
}
