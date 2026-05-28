/**
 * Workdir path canonicalization utilities.
 *
 * `normalizeWorkdir` is the single source of truth for how worktree paths
 * are converted to their canonical form before DB storage or comparison.
 * Centralised here so hook entry points and MCP handlers share the same logic
 * without creating a cross-layer import dependency.
 */

/**
 * Normalize a worktree path to its canonical storage form.
 *
 * Transformations applied (in order):
 * 1. `null`, `undefined`, or whitespace-only input → `undefined` (invalid/empty path)
 * 2. Backslashes → forward slashes (Windows path support)
 * 3. Lowercase Windows drive letter → uppercase (`c:/` → `C:/`)
 * 4. Trailing slashes stripped
 * 5. Root paths preserved: `''` after strip → `'/'` (Unix root); `C:` after strip → `C:/` (Windows root)
 *
 * @example
 * normalizeWorkdir('/repos/project/')       // '/repos/project'
 * normalizeWorkdir('C:\\repos\\project\\')  // 'C:/repos/project'
 * normalizeWorkdir('c:/repos/project')      // 'C:/repos/project'
 * normalizeWorkdir('C:\\')                  // 'C:/'
 * normalizeWorkdir('/')                     // '/'
 * normalizeWorkdir('')                      // undefined
 * normalizeWorkdir(undefined)               // undefined
 *
 * @internal Not part of the public API surface — callers should always
 *   normalize before storage and use the same function for lookup comparison.
 */
export function normalizeWorkdir(input: string | undefined | null): string | undefined {
  if (input == null || !input.trim()) return undefined;
  // Backslashes → forward slashes
  let result = input.replace(/\\/g, '/');
  // Uppercase Windows drive letter
  result = result.replace(/^([a-z]):/, (_, d: string) => d.toUpperCase() + ':');
  // Strip trailing slashes
  result = result.replace(/\/+$/, '');
  // Preserve root paths
  if (result === '') return '/'; // Unix filesystem root (input was '/')
  if (/^[A-Z]:$/.test(result)) return result + '/'; // Windows drive root
  return result;
}
