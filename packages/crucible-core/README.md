# @akubly/crucible-core

The core in-memory runtime for Crucible: session creation, primitive appending, and session forking. Exposes `createSession` and `fork` behind the five-primitive vocabulary (`PrimitiveKind`) defined in §6 of the Crucible Technical Design. Sprint 0 implementation is fully in-memory; L1 WAL (Cairn) integration is deferred to a later sprint per OQ-2.
