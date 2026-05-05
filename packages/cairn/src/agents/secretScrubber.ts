/**
 * Scrub common secret patterns from an object before logging.
 * Recursively walks the object and replaces values that look like secrets.
 */

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'GitHub token', pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g },
  { name: 'GitHub OAuth', pattern: /gho_[A-Za-z0-9_]{36,}/g },
  { name: 'AWS key', pattern: /AKIA[0-9A-Z]{16}/g },
  {
    name: 'Generic API key',
    pattern:
      /(?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/gi,
  },
  { name: 'Bearer token', pattern: /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g },
  { name: 'Basic auth', pattern: /Basic\s+[A-Za-z0-9+/]+=*/g },
  {
    name: 'Private key',
    pattern: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)?\s*PRIVATE KEY-----/g,
  },
  { name: 'npm token', pattern: /npm_[A-Za-z0-9]{36,}/g },
  { name: 'Connection string password', pattern: /(?:password|pwd)\s*=\s*[^;\s]{8,}/gi },
];

export function scrubSecrets<T>(obj: T, _visited?: WeakSet<object>): T {
  if (typeof obj === 'string') {
    let scrubbed: string = obj;
    for (const { name, pattern } of SECRET_PATTERNS) {
      scrubbed = scrubbed.replace(pattern, `[REDACTED:${name}]`);
    }
    return scrubbed as unknown as T;
  }

  if (Array.isArray(obj)) {
    const visited = _visited ?? new WeakSet();
    return obj.map((item) => scrubSecrets(item, visited)) as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const visited = _visited ?? new WeakSet();
    if (visited.has(obj as object)) {
      return '[Circular Reference]' as unknown as T;
    }
    visited.add(obj as object);

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Redact values for keys that commonly hold secrets
      const sensitiveKey =
        /^(password|secret|token|api_key|apikey|private_key|access_key|auth)$/i.test(key);
      if (sensitiveKey && typeof value === 'string') {
        result[key] = '[REDACTED]';
      } else {
        result[key] = scrubSecrets(value, visited);
      }
    }
    return result as T;
  }

  return obj;
}
