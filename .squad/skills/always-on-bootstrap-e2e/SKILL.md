# Always-On Bootstrap E2E

**Pattern Name:** Always-On Bootstrap End-to-End Test  
**Context:** A runtime hook wires multiple packages together and closes the DB handle as part of fail-open cleanup.  
**Problem:** Pure unit tests verify the factory and Curator separately, but they miss regressions in the real session-start bootstrap path.  
**Solution:** Drive the actual hook entrypoint with a file-backed SQLite database, real seed data, and the production factory wiring.

---

## Recipe

1. Use a **file-backed SQLite DB** in the repo, not `:memory:`. Hook entrypoints like `runSessionStartHook()` may call `closeDb()` in `finally`, which destroys in-memory state before assertions can inspect it.
2. Seed **real prerequisite state** for the whole pipeline, not mocks:
   - applied optimization hints with before snapshots
   - qualifying execution profiles
   - any latent hints needed for a later Curator cycle
3. Feed the hook realistic stdin JSON (`{ toolName, cwd }`) by temporarily overriding `process.stdin` with `Readable.from([...])`.
4. Pass the **same factory production uses** (for Wave 3: `(db) => createPrescriberOrchestrationConfig({ db })`).
5. Spy on `curate()` to recover the real `CurateResult` while still exercising the outer hook path.
6. Reopen the SQLite file after the hook returns and assert persisted state directly (`optimization_hints`, `change_vectors`, etc.).

---

## Best Uses

- Always-on session-start or tool-start hooks
- Cross-package runtime composition checks
- Fail-open verification where the outer wrapper swallows exceptions
- Dedup/persistence flows that need real SQLite semantics

---

## Watch-outs

- A trigger-driven orchestrator may not re-run on unchanged state. If the product asks for rerun behavior, make sure the test seeds a later qualifying cycle or explicitly document the gap.
- If you need the inner result from a hook that returns `void`, use spies on the downstream orchestrator rather than replacing the hook with a test shim.
- Keep cleanup deterministic: close the DB and delete the test SQLite file in `afterEach`.

---

## Wave 3 Example

`packages/forge/src/__tests__/wave3-pipeline.test.ts` exercises:
- auto-trigger through the session-start hook
- later-cycle dedup through the same hook path
- fail-open for one skill while another succeeds
- missing-profile zero-count skip after vector computation
