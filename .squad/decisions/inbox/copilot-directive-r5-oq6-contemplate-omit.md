# R5 OQ-6 Directive: contemplate v1 Export Strategy

**Status:** Resolved by Aaron, R5 round 3.
**Confirms:** Cassima's v2 pushback.

## Decision

**Omit `contemplate` from v1 exports entirely.** Vocabulary is reserved in FR-10 table; no callable export, no type export, no stub.

## Rules

- `@packages/eureka` v1 surface does NOT export a `contemplate` function or type.
- FR-10 vocabulary table is the canonical reservation: "contemplate — narrow+deep reflection — ships v1.5."
- v1.5 will add the export as a purely additive feature; no caller code breaks.

## Rationale

1. **Throwing-stubs are an anti-pattern.** They make absence look like presence at the IDE/autocomplete layer, undermining the semantic clarity that motivated the vocabulary lock.
2. **Compile-time absence > runtime error.** A v1 caller writing `contemplate(...)` fails at typecheck, not in production.
3. **Vocabulary discoverability is solved by FR-10's locked-vocabulary contract table.** That is the right place to document "name reserved, ships v1.5" — code-exporting every verb is not.
4. **Re-export in v1.5 is feature-additive** — no v1 caller breaks when contemplate lands.
5. **No risk of competing names in v1.5** — FR-10 is canonical.

## FR-10 Update Required (Cassima v3)

- Confirm contemplate row reads: "Name reserved. Not exported in v1. Ships v1.5."
- Remove any implication that v1 ships a callable contemplate, even as stub.
