# ADR-0003: SessionId as Shared Branded Primitive

**Status:** Proposed  
**Author:** Graham  
**Date:** 2026-05-27  
**Deciders:** Aaron, Graham, Genesta, Crispin, Edgar  
**PRD Reference:** FR-13, §7.4, R8 session-identity directive

---

## Context

Cairn's `Session` and Eureka's `kind=session` fact reference the **same underlying entity** — the Copilot CLI session. Aaron's R8 directive requires this shared identity to be honest at the type level, not opaque.

The question: How do we represent this shared identity without coupling the two systems?

## Decision Drivers

1. **Honest naming** — The session UUID IS shared; pretending otherwise is incidental complexity
2. **Type safety** — Prevent accidental confusion with FactId, DecisionId, arbitrary strings
3. **Runtime independence** — No cross-DB JOINs (FR-7.2 preserved)
4. **Serialization** — Must work naturally with SQLite TEXT, JSON, file paths, CLI args
5. **Zero runtime overhead** — No nominal class instantiation cost

## Considered Options

### Option A: Branded Primitive in @akubly/types (Recommended)

```typescript
export type SessionId = string & { readonly __brand: 'SessionId' };
export function isSessionId(value: unknown): value is SessionId { ... }
export function SessionId(value: string): SessionId { ... }
```

**Pros:**
- Compile-time safety (branded type prevents cross-assignment)
- Zero runtime overhead (values are still strings)
- Natural serialization (no `.toString()`, no `.valueOf()`)
- Same pattern as Trust/Confidence (precedent)

**Cons:**
- Requires discipline (validators at system boundaries)
- Not truly nominal (can be bypassed with `as SessionId`)

### Option B: Opaque Class

```typescript
export class SessionId {
  private readonly _value: string;
  constructor(value: string) { validate(value); this._value = value; }
  toString(): string { return this._value; }
}
```

**Pros:**
- True encapsulation (cannot be bypassed)
- Can add methods (formatting, validation)

**Cons:**
- Runtime overhead (`new SessionId(value)` everywhere)
- Serialization boilerplate (`.toString()` for SQLite, `.toJSON()` for JSON)
- Breaks pattern matching / destructuring
- Overkill for a scalar identifier wrapper

### Option C: Opaque Type Alias (No Validation)

```typescript
export type SessionId = string;
```

**Pros:**
- Simplest

**Cons:**
- No type safety at all
- Any string passes as SessionId
- Violates R8 directive (honest typing)

## Decision

**Option A: Branded Primitive in `@akubly/types`**.

## Rationale

A branded primitive provides compile-time safety with zero runtime overhead. The value is still a string under the hood, so it serializes naturally. The same pattern is established precedent for `Trust` and `Confidence` in this codebase.

The `as SessionId` bypass is acceptable because:
1. ESLint rule (FR-12 mechanism #8) catches most violations
2. Explicit bypass is visible in code review
3. Validators are called at system boundaries (deserialization, CLI input)

## Implementation

```typescript
// packages/types/src/session.ts (NEW)

/**
 * Session identifier shared across Cairn (operational lifecycle) and
 * Eureka (epistemological artifact). Represents the Copilot CLI session UUID.
 */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** Type guard — validates UUID v4 format (permissive on case). */
export function isSessionId(value: unknown): value is SessionId {
  return typeof value === 'string'
    && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
}

/** Constructor — validates and brands; throws on invalid input. */
export function SessionId(value: string): SessionId {
  if (!isSessionId(value)) throw new TypeError(`Invalid SessionId: expected UUID v4, got "${value}"`);
  return value as SessionId;
}
```

## Trade-offs Named

| Gain | Cost |
|------|------|
| Compile-time safety | Requires validators at boundaries |
| Zero runtime overhead | Bypass via `as SessionId` possible |
| Natural serialization | No method attachments (just a string) |
| Shared type, not shared interface | Discipline required to keep systems decoupled |

## Consequences

- `SessionId` exported from `@akubly/types`
- Cairn imports and uses for `sessions.id`
- Eureka imports and uses for `session_id` on facts
- ESLint rule (mechanism #8) guards against importing other session types across systems
- Bridge ledger uses `session_id: SessionId` (required, not nullable)
- Reconciliation CLI can JOIN on exact-match `session_id`

## Related Decisions

- FR-13 (Session Model)
- §7.4 (Substrate Overlap)
- Aaron R8 directive
- Graham R8 enforcement gate (ESLint guardrail)
