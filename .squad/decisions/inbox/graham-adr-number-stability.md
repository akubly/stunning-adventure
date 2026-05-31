# Graham Decision: ADR Number Stability After Landing

**Date:** 2026-05-30
**Owner:** Graham
**Status:** Proposed for merge into team decisions

## Decision

Landed ADR files keep their assigned numbers. If a planned or pending ADR index row collides with a landed ADR file, renumber the planned row to the next free ADR number and update all live cross-references.

## Rationale

The landed file is the durable artifact already referenced by reviews, options docs, and implementation notes. Renumbering planned rows is cheaper and preserves external review continuity.

## Trade-off

This sacrifices perfect historical numbering continuity in the CTD index. The gain is artifact stability: file paths, review comments, and supersession banners remain valid.
