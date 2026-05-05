---
name: "typescript-error-handling"
description: "Patterns for consistent error handling in TypeScript applications"
domain: "error-handling"
confidence: "high"
source: "earned"
tools:
  - name: "grep"
    description: "Search for error handling patterns across the codebase"
    when: "Auditing existing error boundaries or finding inconsistent patterns"
  - name: "view"
    description: "Read source files to inspect error handling implementation"
    when: "Reviewing a specific module's error handling approach"
  - name: "powershell"
    description: "Run TypeScript compiler to verify error type compatibility"
    when: "Validating that custom error classes compile without issues"
---

# TypeScript Error Handling

## Context

Apply this skill when writing or reviewing TypeScript code that throws, catches, or propagates errors. Use it in API handlers, service layers, and utility functions where failures must be reported to callers. Always prefer typed errors over raw strings or generic `Error` instances.

Use `grep` to audit existing error patterns before introducing new ones. Use `view` to inspect specific modules when reviewing pull requests for error handling compliance. Run `powershell` with `npx tsc --noEmit` to verify custom error classes compile cleanly.

## Patterns

Define a base `AppError` class in `src/errors/base.ts` that extends `Error`. Include a `code` field with a string union type and an optional `cause` field for error chaining. Never throw raw strings.

Create domain-specific error subclasses in `src/errors/` for each bounded context. Name them `{Domain}Error` — for example, `AuthError`, `ValidationError`, `NotFoundError`. Each subclass sets its own `code` union.

Wrap all async operations in try-catch at the service boundary. Catch specific error types first, then fall back to `AppError`. Log the original error with `cause` before rethrowing.

Use discriminated unions for error results in pure functions:

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
```

Never swallow errors silently. Every catch block must either rethrow, log, or return a typed error result.

## Examples

Base error class at `src/errors/base.ts`:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

Domain error at `src/errors/auth.ts`:

```typescript
export class AuthError extends AppError {
  constructor(
    message: string,
    code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'UNAUTHORIZED',
    cause?: Error,
  ) {
    super(message, code, cause);
  }
}
```

Service-layer catch pattern:

```typescript
async function getUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.findUser(id);
    if (!user) return { ok: false, error: new NotFoundError(`User ${id}`) };
    return { ok: true, value: user };
  } catch (err) {
    return { ok: false, error: new AppError('Failed to fetch user', 'DB_ERROR', err as Error) };
  }
}
```

## Anti-Patterns

Never throw plain strings: `throw "something went wrong"` loses stack traces and prevents typed catch blocks.

Never use `catch (e: any)` without narrowing. Always narrow with `instanceof` checks or use the `Result` pattern instead.

Never log and rethrow the same error without adding context. This creates duplicate log entries with no additional information.

Avoid `catch {}` empty blocks. Silent swallowing hides bugs and makes debugging impossible.

Never define error codes as bare strings inline. Always use the union type from the error class to get compile-time safety.
