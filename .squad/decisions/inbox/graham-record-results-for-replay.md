# Graham Decision Drop — Record Non-Recomputable Results for Replay

**Date:** 2026-05-31
**Author:** Graham (Lead / Architect)
**Scope:** Crucible replay determinism; parent-ledger fork Decisions

## Decision

When a recorded Decision chooses a path whose concrete result cannot be deterministically recomputed from ledger-stable inputs, the Decision payload MUST record the result itself.

For ADR-0019 fork collisions, `chosenOption='new'` is insufficient because the resulting `childSid` includes `created_at_ns` in its preimage. The parent-ledger fork Decision therefore records `resultingChildSid`, and replay consumes that value directly instead of recomputing timestamp-derived preimages.

## Rationale

Choices are replayable only if the chosen branch's outputs are derivable from recorded structural inputs. Timestamp-derived IDs are not derivable on later replay unless the exact timestamp preimage or final ID is recorded. Recording the final ID is smaller, simpler, and avoids re-hashing a historical result.

## Implication

Future replay-affecting Decision schemas should be reviewed for "choice/result separation." If the result depends on wall-clock time, random IDs, external allocation, or environment state, record the resulting identifier/value in the ledger Decision.
