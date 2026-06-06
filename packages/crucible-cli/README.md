# @akubly/crucible-cli

The `crucible-cli` package is the **Sprint 0 acceptance-test facade** for the Crucible agentic runtime. It has no `bin` entry or CLI commands yet; it re-exports `createSession` and `fork` from [`@akubly/crucible-core`](../crucible-core) so that integration tests can exercise the public surface of the runtime without depending on core directly. A real CLI entrypoint exposing user-facing commands (`fork`, `replay`, `bisect`, etc.) is planned for a future sprint. For the underlying runtime design see the [Crucible Technical Design](../../docs/crucible-technical-design/).
